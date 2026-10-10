import 'server-only'
// Lectura de los datos ya sincronizados (solo del usuario) y armado de las vistas. Los cálculos viven en src/domain: aquí solo se consulta y se junta.
import sql from '@/lib/db'
import { cruzar } from '@/domain/cruce.ts'
import { clasificarPedidos } from '@/domain/pedidos.ts'
import { diaVacio, resumirDias, netoDelDia } from '@/domain/porDia.ts'
import { hoyBogota } from '@/domain/fechas.ts'
import { OPERACION_INICIO } from '@/lib/dropi/config.mjs'
import { getSetting } from '@/lib/settings'

const num = (v) => Number(v) || 0
/** Fecha desde la que el usuario sincroniza Dropi (ajuste `op_from`; por defecto, el inicio de la operación). */
const inicioDe = async (uid) => (await getSetting(uid, 'op_from')) || OPERACION_INICIO

/** Movimientos de la tarjeta con su clase tras el cruce con los cobros de Meta (por referencia de pago). */
export async function datosTarjeta(uid) {
  const [rows, cobros] = await Promise.all([
    sql`SELECT id, tx_date::text AS d, amount::float8 AS amount, kind, status, description, pay_ref, manual_charge_id, decline_reason FROM card_transactions WHERE owner_id = ${uid} ORDER BY tx_date DESC, id DESC`,
    sql`SELECT id, charged_date::text AS d, amount::float8 AS amount, status, payment_ref FROM meta_charges WHERE owner_id = ${uid}`,
  ])
  const mov = rows.map((r) => ({ id: String(r.id), tipo: r.kind === 'refund' ? 'abono' : 'cargo', estado: r.status === 'approved' ? 'aprobado' : 'rechazado', monto: r.amount, refPago: r.pay_ref, cobroManualId: r.manual_charge_id ? String(r.manual_charge_id) : null }))
  const ch = cobros.map((c) => ({ id: String(c.id), refPago: c.payment_ref, monto: c.amount, estado: c.status === 'paid' ? 'pagado' : c.status === 'failed' ? 'fallido' : 'pendiente' }))
  const r = cruzar(mov, ch)
  const meta = new Set(r.meta.map((m) => m.id)), rep = new Set(r.repetidos.map((m) => m.id))
  const lista = rows.map((x) => {
    const id = String(x.id)
    const clase = x.status !== 'approved' ? 'rechazado' : x.kind === 'refund' ? 'recarga' : rep.has(id) ? 'repetido' : meta.has(id) ? 'meta' : 'otro'
    return { id, fecha: x.d, monto: x.amount, descripcion: x.description || '', refPago: x.pay_ref || '', clase, motivo: x.decline_reason || '' }
  })
  const suma = (f) => lista.filter(f).reduce((a, x) => a + x.monto, 0)
  const fechas = lista.map((x) => x.fecha).sort()
  const [aCard] = fechas.length ? await sql`SELECT COALESCE(SUM(amount), 0)::float8 AS s, COUNT(*)::int AS n FROM wallet_movements WHERE owner_id = ${uid} AND kind = 'to_card' AND tx_date >= ${fechas[0]}` : [{ s: 0, n: 0 }]
  return {
    inicio: await inicioDe(uid), desde: fechas[0] || null, hasta: fechas[fechas.length - 1] || null,
    deBilletera: { monto: aCard.s, n: aCard.n }, // lo que la billetera dice haber pasado a la tarjeta, en el mismo período
    lista, hayCobros: cobros.length > 0, cobrosSinTarjeta: r.cobrosSinTarjeta,
    totales: { recargas: suma((x) => x.clase === 'recarga'), meta: r.totalMeta, otros: r.totalOtros, rechazados: lista.filter((x) => x.clase === 'rechazado').length, repetidos: r.repetidos.length },
  }
}

/** Billetera: últimos movimientos y totales por tipo. */
export async function datosBilletera(uid) {
  const [mov, tot, [ult]] = await Promise.all([
    sql`SELECT external_id, tx_date::text AS d, direction, amount::float8 AS amount, balance_before::float8 AS before, kind, description, order_ref FROM wallet_movements WHERE owner_id = ${uid} ORDER BY tx_at DESC LIMIT 200`,
    sql`SELECT kind, COUNT(*)::int AS n, SUM(amount)::float8 AS sum FROM wallet_movements WHERE owner_id = ${uid} GROUP BY kind`,
    sql`SELECT direction, amount::float8 AS amount, balance_before::float8 AS before FROM wallet_movements WHERE owner_id = ${uid} ORDER BY tx_at DESC LIMIT 1`,
  ])
  const [rg] = await sql`SELECT MIN(tx_date)::text AS desde, MAX(tx_date)::text AS hasta FROM wallet_movements WHERE owner_id = ${uid}`
  const saldo = ult && ult.before != null ? Math.round((ult.before + (ult.direction === 'in' ? ult.amount : -ult.amount)) * 100) / 100 : null
  return { inicio: await inicioDe(uid), desde: rg && rg.desde, hasta: rg && rg.hasta, mov, totales: Object.fromEntries(tot.map((t) => [t.kind, { n: t.n, sum: t.sum }])), saldo }
}

/** Pedidos de Dropi con su estado contable (cruzando con la billetera por ID de pedido o guía). */
export async function datosPedidos(uid) {
  const [pedidos, ganancias, devs, [cov]] = await Promise.all([
    sql`SELECT order_id, guide, status, status_group, product, total::float8 AS total, created_date::text AS created, delivered_date::text AS delivered, returned_date::text AS returned FROM dropi_orders WHERE owner_id = ${uid} ORDER BY created_date DESC NULLS LAST, id DESC`,
    sql`SELECT w.order_ref, w.guide FROM wallet_movements w WHERE w.owner_id = ${uid} AND w.kind = 'profit' AND NOT EXISTS (SELECT 1 FROM wallet_movements r WHERE r.owner_id = w.owner_id AND r.reverses = w.external_id)`,
    sql`SELECT order_ref, guide FROM wallet_movements WHERE owner_id = ${uid} AND kind = 'return_fee'`,
    sql`SELECT MIN(tx_date)::text AS desde FROM wallet_movements WHERE owner_id = ${uid}`,
  ])
  const entrada = pedidos.map((p) => ({ idPedido: p.order_id, guia: p.guide, estado: p.status, entregadoDia: p.delivered, total: p.total, producto: p.product || '', creado: p.created, devuelto: p.returned }))
  const lista = clasificarPedidos(entrada, ganancias.map((g) => ({ idPedido: g.order_ref, guia: g.guide })), devs.map((g) => ({ idPedido: g.order_ref, guia: g.guide })), cov && cov.desde, hoyBogota())
  const cuenta = {}
  for (const p of lista) cuenta[p.contable] = (cuenta[p.contable] || 0) + 1
  const hoy = hoyBogota()
  return { lista, cuenta, hoy: lista.filter((p) => p.creado === hoy).length, billeteraDesde: cov && cov.desde }
}

/** Ganancia por día (Bogotá): billetera + tarjeta cruzada con Meta. */
export async function datosGananciaPorDia(uid) {
  const [wal, tarjeta, herr] = await Promise.all([
    sql`SELECT tx_date::text AS d, kind, SUM(amount)::float8 AS sum FROM wallet_movements WHERE owner_id = ${uid} AND kind IN ('profit', 'return_fee', 'card_fee', 'recharge_fee', 'other_out') GROUP BY tx_date, kind`,
    datosTarjeta(uid),
    sql`SELECT COALESCE(SUM(monthly_amount), 0)::float8 AS m FROM fixed_costs WHERE owner_id = ${uid} AND active`.catch(() => [{ m: 0 }]),
  ])
  const dias = new Map()
  const dia = (d) => { if (!dias.has(d)) dias.set(d, diaVacio(d)); return dias.get(d) }
  for (const w of wal) {
    const d = dia(w.d)
    if (w.kind === 'profit') d.ganancia += w.sum
    else if (w.kind === 'return_fee') d.devoluciones += w.sum
    else if (w.kind === 'card_fee' || w.kind === 'recharge_fee') d.comisiones += w.sum
    else d.otrosDescuentos += w.sum
  }
  for (const x of tarjeta.lista) {
    if (x.clase === 'meta' || x.clase === 'repetido') dia(x.fecha).meta += x.monto
    else if (x.clase === 'otro') dia(x.fecha).otrosGastos += x.monto
  }
  const lista = [...dias.values()].sort((a, b) => (a.dia < b.dia ? 1 : -1))
  const herramientasPorDia = num(herr[0] && herr[0].m) / 30
  return { dias: lista.map((d) => ({ ...d, ...netoDelDia(d) })), resumen: resumirDias(lista, herramientasPorDia), hayCobros: tarjeta.hayCobros, herramientasPorDia }
}

/** Caja: lo que Dropi dice que hay (tarjeta) y el saldo de la billetera según su último movimiento. */
export async function datosCaja(uid) {
  const [[t], b] = await Promise.all([
    sql`SELECT amount::float8 AS amount, read_at FROM dropi_balances WHERE owner_id = ${uid} AND account = 'card' ORDER BY read_at DESC, id DESC LIMIT 1`,
    datosBilletera(uid),
  ])
  const [pend] = await sql`SELECT COUNT(*)::int AS n, COALESCE(SUM(total), 0)::float8 AS valor FROM dropi_orders WHERE owner_id = ${uid} AND status_group = 'entregado'`
  return { tarjeta: t ? { monto: t.amount, leido: new Date(t.read_at).getTime() } : null, billetera: b.saldo, entregados: pend }
}
