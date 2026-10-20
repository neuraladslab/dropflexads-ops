import 'server-only'
// Lectura de los datos ya sincronizados (solo del usuario) y armado de las vistas. Los cálculos viven en src/domain: aquí solo se consulta y se junta.
import sql from '@/lib/db'
import { cruzar } from '@/domain/cruce.ts'
import { clasificarPedidos } from '@/domain/pedidos.ts'
import { diaVacio, resumirDias, netoDelDia, repartoDeCostos, costosDelDia } from '@/domain/porDia.ts'
import { hoyBogota, sumarDias } from '@/domain/fechas.ts'
import { recuperacion } from '@/domain/recuperacion.ts'
import { atribuir, resumenPorCampana } from '@/domain/campanas.ts'
import { seImporta } from '@/domain/estadoPedido.ts'
import { dentroDeOperacion } from '@/domain/ventana.ts'
import { acumuladoPorDia, serieMeta, resumenMeta } from '@/domain/series.ts'
import { gananciaPorVenta, costoPorVentaReal } from '@/domain/porVenta.ts'
import { proyectarRecuperacion } from '@/domain/proyeccion.ts'
import { evaluarEscalado } from '@/domain/escalar.ts'
import { combosVendidos } from '@/domain/combos.ts'
import { flujoPorDia } from '@/domain/billetera.ts'
import { OPERACION_INICIO } from '@/lib/dropi/config.mjs'
import { corteDesde } from '@/lib/corte'
import { listarPeriodos, resumenPorPeriodo, flujoPorPeriodo, pedidosPorPeriodo, ventasPorPeriodo, tasaDevolucionReal, resolverPeriodo } from '@/domain/periodos.ts'
import { estimarPendientes, DEVOLUCION_POR_DEFECTO } from '@/domain/estimacion.ts'
import { evaluarSalud } from '@/domain/salud.ts'
import { repartirUtilidad } from '@/domain/reparto.ts'
import { ritmoPauta, deudaMeta } from '@/domain/pauta.ts'
import { cambiosDesdeCierre, chequear } from '@/domain/cierre.ts'
import { repartoDesde } from '@/lib/reparto'

const num = (v) => Number(v) || 0
/** Memoria de UNA visita: lo que ya se calculó en esta carga de pantalla se reutiliza en vez de volver a consultarse (no se guarda entre visitas: los datos nunca quedan viejos). */
const memo = (m, k, f) => { if (!m) return f(); if (!m.has(k)) m.set(k, f()); return m.get(k) }
/** Fecha desde la que el usuario sincroniza Dropi (ajuste `op_from`; por defecto, el inicio de la operación). */
/** Todos los ajustes del usuario con UNA consulta por visita (inicio de la operación, día de corte, reparto…). */
const ajustesDe = (uid, m) => memo(m, 'ajustes', async () => Object.fromEntries((await sql`SELECT key, value FROM app_settings WHERE owner_id = ${uid}`).map((r) => [r.key, r.value])))
const inicioDe = async (uid, m) => (await ajustesDe(uid, m)).op_from || OPERACION_INICIO
/** Conexiones y herramientas: se leen una sola vez por visita aunque las pidan varias pantallas. */
const conexionDropi = (uid, m) => memo(m, 'cDropi', () => sql`SELECT card_hint, state, last_sync_ok_at FROM dropi_connections WHERE owner_id = ${uid}`)
const conexionMeta = (uid, m) => memo(m, 'cMeta', () => sql`SELECT ad_account_id, account_name, currency, vat_pct::float8 AS vat, state, last_sync_ok_at, last_error FROM meta_connections WHERE owner_id = ${uid}`)
const herramientasMes = (uid, m) => memo(m, 'herrMes', () => sql`SELECT COALESCE(SUM(monthly_amount), 0)::float8 AS m FROM fixed_costs WHERE owner_id = ${uid} AND active`)

/** Movimientos de la tarjeta con su clase tras el cruce con los cobros de Meta (por referencia de pago). */
export const datosTarjeta = (uid, m = new Map()) => memo(m, 'tarjeta', () => _datosTarjeta(uid, m))
async function _datosTarjeta(uid, m) {
  const inicio = await inicioDe(uid, m)
  const [rows, cobros] = await Promise.all([
    sql`SELECT id, tx_date::text AS d, amount::float8 AS amount, kind, status, description, pay_ref, manual_charge_id, decline_reason, ignored FROM card_transactions WHERE owner_id = ${uid} AND tx_date >= ${inicio} ORDER BY tx_date DESC, id DESC`,
    sql`SELECT id, charged_date::text AS d, amount::float8 AS amount, status, payment_ref FROM meta_charges WHERE owner_id = ${uid}`,
  ])
  const mov = rows.filter((r) => !r.ignored).map((r) => ({ id: String(r.id), fecha: r.d, tipo: r.kind === 'refund' ? 'abono' : 'cargo', estado: r.status === 'approved' ? 'aprobado' : 'rechazado', monto: r.amount, refPago: r.pay_ref, cobroManualId: r.manual_charge_id ? String(r.manual_charge_id) : null }))
  const ch = cobros.map((c) => ({ id: String(c.id), fecha: c.d, refPago: c.payment_ref, monto: c.amount, estado: c.status === 'paid' ? 'pagado' : c.status === 'failed' ? 'fallido' : 'pendiente' }))
  const r = cruzar(mov, ch)
  const meta = new Set(r.meta.map((m) => m.id)), rep = new Set(r.repetidos.map((m) => m.id)), porMonto = new Set(r.porMonto.map((m) => m.id))
  const lista = rows.map((x) => {
    const id = String(x.id)
    const clase = x.ignored ? 'ignorado' : x.status !== 'approved' ? 'rechazado' : x.kind === 'refund' ? 'recarga' : rep.has(id) ? 'repetido' : porMonto.has(id) ? 'meta_monto' : meta.has(id) ? 'meta' : 'otro'
    return { id, fecha: x.d, monto: x.amount, descripcion: x.description || '', refPago: x.pay_ref || '', clase, motivo: x.decline_reason || '' }
  })
  const suma = (f) => lista.filter(f).reduce((a, x) => a + x.monto, 0)
  const fechas = lista.map((x) => x.fecha).sort()
  const [aCard] = fechas.length ? await sql`SELECT COALESCE(SUM(amount), 0)::float8 AS s, COUNT(*)::int AS n FROM wallet_movements WHERE owner_id = ${uid} AND kind = 'to_card' AND tx_date >= ${fechas[0]}` : [{ s: 0, n: 0 }]
  return {
    tarjetaDropi: await datosTarjetaDropi(uid, m),
    inicio, desde: fechas[0] || null, hasta: fechas[fechas.length - 1] || null,
    deBilletera: { monto: aCard.s, n: aCard.n }, // lo que la billetera dice haber pasado a la tarjeta, en el mismo período
    lista, hayCobros: cobros.length > 0, cobrosSinTarjeta: r.cobrosSinTarjeta,
    totales: { recargas: suma((x) => x.clase === 'recarga'), meta: r.totalMeta, otros: r.totalOtros, rechazados: lista.filter((x) => x.clase === 'rechazado').length, ignorados: lista.filter((x) => x.clase === 'ignorado').length, repetidos: r.repetidos.length },
  }
}

/** La tarjeta virtual de Dropi: saldo que informa Dropi (con su hora), últimos 4 dígitos o pista del ID, y el estado de la conexión. */
export const datosTarjetaDropi = (uid, m = new Map()) => memo(m, 'tarjetaDropi', () => _datosTarjetaDropi(uid, m))
async function _datosTarjetaDropi(uid, m) {
  const [[b], [con], [l4]] = await Promise.all([
    sql`SELECT amount::float8 AS amount, read_at FROM dropi_balances WHERE owner_id = ${uid} AND account = 'card' ORDER BY read_at DESC, id DESC LIMIT 1`,
    conexionDropi(uid, m),
    sql`SELECT last4 FROM card_transactions WHERE owner_id = ${uid} AND last4 IS NOT NULL ORDER BY tx_date DESC, id DESC LIMIT 1`,
  ])
  return {
    saldo: b ? b.amount : null, leido: b ? new Date(b.read_at).getTime() : null, last4: l4 ? l4.last4 : null,
    hint: con ? con.card_hint : null, conectada: !!con, estado: con ? con.state : null, ultimaSync: con && con.last_sync_ok_at ? new Date(con.last_sync_ok_at).getTime() : null,
  }
}

/**
 * Dropi puede registrar varios movimientos con la MISMA hora exacta (p. ej. un pase a la tarjeta y su comisión). El último de ellos es el que cierra la cadena de saldos:
 * aquel cuyo saldo resultante no es el saldo de partida de otro movimiento de la misma hora. Sin esto, el «saldo actual» dependía del azar del orden.
 */
const finDeCadena = sql`NOT EXISTS (SELECT 1 FROM wallet_movements n WHERE n.owner_id = w.owner_id AND n.tx_at = w.tx_at AND n.id <> w.id AND n.balance_before = w.balance_before + CASE w.direction WHEN 'in' THEN w.amount ELSE -w.amount END)`

/** Billetera: últimos movimientos y totales por tipo. */
export const datosBilletera = (uid, m = new Map()) => memo(m, 'billetera', () => _datosBilletera(uid, m))
async function _datosBilletera(uid, m) {
  const inicio = await inicioDe(uid, m)
  const [mov, [ult], serie, tarjeta, porTipo] = await Promise.all([
    sql`SELECT external_id, tx_date::text AS d, direction, amount::float8 AS amount, balance_before::float8 AS before, kind, description, order_ref FROM wallet_movements WHERE owner_id = ${uid} AND tx_date >= ${inicio} ORDER BY tx_at DESC LIMIT 3000`,
    sql`SELECT direction, amount::float8 AS amount, balance_before::float8 AS before FROM wallet_movements w WHERE owner_id = ${uid} AND ${finDeCadena} ORDER BY tx_at DESC, id DESC LIMIT 1`,
    // Saldo al cierre de cada día (el último movimiento del día + lo que ese movimiento dejó).
    sql`SELECT DISTINCT ON (tx_date) tx_date::text AS dia, (balance_before + CASE direction WHEN 'in' THEN amount ELSE -amount END)::float8 AS saldo FROM wallet_movements w WHERE owner_id = ${uid} AND tx_date >= ${inicio} AND balance_before IS NOT NULL AND ${finDeCadena} ORDER BY tx_date, tx_at DESC, id DESC`,
    datosTarjetaDropi(uid, m),
    sql`SELECT tx_date::text AS dia, kind, direction, SUM(amount)::float8 AS monto, COUNT(*)::int AS n FROM wallet_movements WHERE owner_id = ${uid} AND tx_date >= ${inicio} GROUP BY tx_date, kind, direction`,
  ])
  // Totales por tipo, rango de fechas y entradas/salidas se derivan de esta misma agrupación (antes eran tres consultas más): mismo resultado, menos viajes a la base.
  const r2 = (n) => Math.round(n * 100) / 100, tot = {}
  let desde = null, hasta = null, entro = 0, salio = 0
  for (const x of porTipo) {
    const t = tot[x.kind] || (tot[x.kind] = { n: 0, sum: 0 })
    t.n += x.n; t.sum += x.monto
    if (desde === null || x.dia < desde) desde = x.dia
    if (hasta === null || x.dia > hasta) hasta = x.dia
    if (x.direction === 'in') entro += x.monto; else salio += x.monto
  }
  const cierre = new Map(serie.map((x) => [x.dia, x.saldo]))
  const diasFlujo = flujoPorDia(porTipo).map((x) => ({ ...x, saldoCierre: cierre.get(x.dia) ?? null }))
  const saldo = ult && ult.before != null ? Math.round((ult.before + (ult.direction === 'in' ? ult.amount : -ult.amount)) * 100) / 100 : null
  return { inicio, desde, hasta, entro: r2(entro), salio: r2(salio), serie, diasFlujo, tarjeta, mov, totales: Object.fromEntries(Object.entries(tot).map(([k, t]) => [k, { n: t.n, sum: r2(t.sum) }])), saldo }
}

/** Pedidos de Dropi con su estado contable (cruzando con la billetera por ID de pedido o guía). */
export const datosPedidos = (uid, m = new Map()) => memo(m, 'pedidos', () => _datosPedidos(uid, m))
async function _datosPedidos(uid, m) {
  const inicio = await inicioDe(uid, m)
  const [todos, ganancias, devs, [cov], anticipados] = await Promise.all([
    sql`SELECT order_id, guide, status, status_group, product, product_ids, units, total::float8 AS total, created_date::text AS created, delivered_date::text AS delivered, returned_date::text AS returned FROM dropi_orders WHERE owner_id = ${uid} ORDER BY created_date DESC NULLS LAST, id DESC`,
    sql`SELECT w.order_ref, w.guide, w.tx_date::text AS d FROM wallet_movements w WHERE w.owner_id = ${uid} AND w.kind = 'profit' AND NOT EXISTS (SELECT 1 FROM wallet_movements r WHERE r.owner_id = w.owner_id AND r.reverses = w.external_id)`,
    sql`SELECT order_ref, guide, tx_date::text AS d FROM wallet_movements WHERE owner_id = ${uid} AND kind = 'return_fee' AND tx_date >= ${inicio}`,
    sql`SELECT MIN(tx_date)::text AS desde FROM wallet_movements WHERE owner_id = ${uid} AND tx_date >= ${inicio}`,
    sql`SELECT DISTINCT order_ref FROM wallet_movements WHERE owner_id = ${uid} AND kind = 'order_payment' AND direction = 'out' AND order_ref IS NOT NULL AND order_ref <> ''`, // pedidos pagados por anticipo desde la billetera
  ])
  const pedidos = todos.filter((p) => seImporta(p.status) && dentroDeOperacion(p.created, inicio)) // todos los estados salvo cancelados, desde el inicio de la operación
  const entrada = pedidos.map((p) => ({ idPedido: p.order_id, guia: p.guide, estado: p.status, entregadoDia: p.delivered, total: p.total, producto: p.product || '', productIds: p.product_ids || [], unidades: p.units, creado: p.created, devuelto: p.returned }))
  const lista = clasificarPedidos(entrada, ganancias.map((g) => ({ idPedido: g.order_ref, guia: g.guide })), devs.map((g) => ({ idPedido: g.order_ref, guia: g.guide })), cov && cov.desde, hoyBogota(), anticipados.map((x) => x.order_ref))
  // Fecha en que la billetera registró el pago (ganancia) o el cobro de la devolución de cada pedido, por ID de pedido o por guía.
  const diaDe = (xs) => { const m = new Map(); for (const x of xs) for (const k of [x.order_ref, x.guide]) if (k && (!m.has(k) || x.d < m.get(k))) m.set(k, x.d); return m }
  const pagos = diaDe(ganancias), cobros = diaDe(devs)
  for (const p of lista) { p.pagadoDia = pagos.get(p.idPedido) || (p.guia && pagos.get(p.guia)) || null; p.cobradoDia = cobros.get(p.idPedido) || (p.guia && cobros.get(p.guia)) || null }
  const cuenta = {}
  for (const p of lista) cuenta[p.contable] = (cuenta[p.contable] || 0) + 1
  const camps = await sql`SELECT id, name, product_ids FROM campaigns WHERE owner_id = ${uid} ORDER BY created_at, id`
  const asig = atribuir(lista, camps.map((c) => ({ id: String(c.id), productIds: c.product_ids || [] })))
  const nombreDe = new Map(camps.map((c) => [String(c.id), c.name]))
  for (const p of lista) { p.campanaId = asig.get(p.idPedido) || null; p.campana = nombreDe.get(p.campanaId) || '' }
  const hoy = hoyBogota()
  return { lista, cuenta, asig, hoy: lista.filter((p) => p.creado === hoy).length, billeteraDesde: cov && cov.desde }
}

/** Ganancia por día (Bogotá): billetera + tarjeta cruzada con Meta. */
export const datosGananciaPorDia = (uid, m = new Map()) => memo(m, 'ganancia', () => _datosGananciaPorDia(uid, m))
async function _datosGananciaPorDia(uid, m) {
  const inicio = await inicioDe(uid, m)
  const [wal, tarjeta, herr, camp, ped, gastoMeta, [conMeta]] = await Promise.all([
    sql`SELECT tx_date::text AS d, kind, SUM(amount)::float8 AS sum, COUNT(*)::int AS n FROM wallet_movements w WHERE owner_id = ${uid} AND tx_date >= ${inicio} AND kind IN ('profit', 'return_fee', 'card_fee', 'recharge_fee', 'other_out', 'transfer_out') AND NOT EXISTS (SELECT 1 FROM wallet_movements r WHERE r.owner_id = w.owner_id AND r.reverses = w.external_id) GROUP BY tx_date, kind`,
    datosTarjeta(uid, m),
    herramientasMes(uid, m).catch(() => [{ m: 0 }]),
    datosCampanas(uid, m), datosPedidos(uid, m),
    sql`SELECT day::text AS d, SUM(spend)::float8 AS spend FROM meta_spend_daily WHERE owner_id = ${uid} AND day >= ${inicio} GROUP BY day`,
    conexionMeta(uid, m),
  ])
  const dias = new Map()
  const dia = (d) => { if (!dias.has(d)) dias.set(d, diaVacio(d)); return dias.get(d) }
  for (const w of wal) {
    const d = dia(w.d)
    if (w.kind === 'profit') { d.ganancia += w.sum; d.entregas += w.n }
    else if (w.kind === 'return_fee') d.devoluciones += w.sum
    else if (w.kind === 'card_fee' || w.kind === 'recharge_fee') d.comisiones += w.sum
    else if (w.kind === 'transfer_out') d.pagosHerramientas += w.sum // pago a una herramienta desde la billetera
    else d.otrosDescuentos += w.sum
  }
  for (const x of tarjeta.lista) {
    if (x.clase === 'meta' || x.clase === 'meta_monto' || x.clase === 'repetido') dia(x.fecha).meta += x.monto
    else if (x.clase === 'otro') dia(x.fecha).otrosGastos += x.monto
  }
  const lista = [...dias.values()].sort((a, b) => (a.dia < b.dia ? 1 : -1))
  const herramientasPorDia = num(herr[0] && herr[0].m) / 30
  const primero = lista.length ? lista[lista.length - 1].dia : hoyBogota()
  // Vista «por día de venta»: la ganancia de cada pedido en el día en que se vendió y la publicidad en el día en que Meta la gastó (con IVA).
  const ES_PUB = /facebk|facebook|meta\s*ads|fb\.?me/i, vat = conMeta ? conMeta.vat : 19
  const meta = new Map(gastoMeta.map((x) => [x.d, x.spend * (1 + vat / 100)])), primerMeta = gastoMeta.length ? gastoMeta.map((x) => x.d).sort()[0] : null
  const pubTarjeta = new Map(), otrosTarjeta = new Map(), suma = (m, k, v) => m.set(k, (m.get(k) || 0) + v)
  for (const x of tarjeta.lista) {
    if (x.clase === 'meta' || x.clase === 'meta_monto' || x.clase === 'repetido' || (x.clase === 'otro' && ES_PUB.test(x.descripcion))) suma(pubTarjeta, x.fecha, x.monto)
    else if (x.clase === 'otro') suma(otrosTarjeta, x.fecha, x.monto)
  }
  const costoDias = new Set([...lista.map((x) => x.dia), ...meta.keys(), ...pubTarjeta.keys(), ...otrosTarjeta.keys()])
  const costos = [...costoDias].map((dia) => {
    const d = dias.get(dia) || diaVacio(dia), usaMeta = primerMeta && dia >= primerMeta
    return { dia, publicidad: usaMeta ? meta.get(dia) || 0 : pubTarjeta.get(dia) || 0, otros: d.devoluciones + d.comisiones + d.otrosDescuentos + d.pagosHerramientas + herramientasPorDia + (otrosTarjeta.get(dia) || 0) }
  })
  const pedidosV = ped.lista.map((x) => ({ creado: x.creado, contable: x.contable, ganancia: camp.gananciaPorPedido.get(x.idPedido) || 0 }))
  const desdeV = [primero, ...pedidosV.map((x) => x.creado).filter(Boolean)].sort()[0]
  const serieVenta = gananciaPorVenta(pedidosV.filter((x) => x.creado), costos, desdeV, hoyBogota())
  const venta = { serie: serieVenta, costo: costoPorVentaReal(serieVenta), usaMeta: !!primerMeta }
  return { venta, dias: lista.map((d) => ({ ...d, ...netoDelDia(d) })), resumen: resumirDias(lista, herramientasPorDia), hayCobros: tarjeta.hayCobros, herramientasPorDia, serie: acumuladoPorDia(lista, herramientasPorDia, primero, hoyBogota()) }
}

/** Caja: lo que Dropi dice que hay (tarjeta) y el saldo de la billetera según su último movimiento. */
export const datosCaja = (uid, m = new Map()) => memo(m, 'caja', () => _datosCaja(uid, m))
async function _datosCaja(uid, m) {
  const [[t], b] = await Promise.all([
    sql`SELECT amount::float8 AS amount, read_at FROM dropi_balances WHERE owner_id = ${uid} AND account = 'card' ORDER BY read_at DESC, id DESC LIMIT 1`,
    datosBilletera(uid, m),
  ])
  const [pend] = await sql`SELECT COUNT(*)::int AS n, COALESCE(SUM(total), 0)::float8 AS valor FROM dropi_orders WHERE owner_id = ${uid} AND status_group = 'entregado'`
  return { tarjeta: t ? { monto: t.amount, leido: new Date(t.read_at).getTime() } : null, billetera: b.saldo, entregados: pend }
}

/** Herramientas de operación (costos fijos mensuales) del usuario. */
export async function datosHerramientas(uid) {
  const rows = await sql`SELECT id, name, monthly_amount::float8 AS monthly, active FROM fixed_costs WHERE owner_id = ${uid} ORDER BY created_at, id`
  return rows.map((r) => ({ id: String(r.id), nombre: r.name, mensual: r.monthly, activa: r.active }))
}

/** Todo lo que necesita el Dashboard, con las mismas funciones (y por tanto las mismas cifras) que las demás pantallas. */
export async function datosDashboard(uid, m = new Map()) {
  const [g, p, caja, t, [c], cortes] = await Promise.all([
    datosGananciaPorDia(uid, m), datosPedidos(uid, m), datosCaja(uid, m), datosTarjeta(uid, m),
    conexionDropi(uid, m).catch(() => [null]), datosCortes(uid, m),
  ])
  const horas = c && c.last_sync_ok_at ? (Date.now() - new Date(c.last_sync_ok_at).getTime()) / 3600e3 : null
  const aviso = []
  if (!c) aviso.push({ tono: 'blue', texto: 'Conecta Dropi para traer tus movimientos y pedidos.', href: '/cuentas', ir: 'Conectar Dropi' })
  else if (horas == null || horas > 24) aviso.push({ tono: 'warn', texto: horas == null ? 'Aún no has sincronizado Dropi.' : `Tus datos de Dropi tienen ${Math.round(horas)} horas.`, href: '/cuentas', ir: 'Sincronizar' })
  if (t.totales.repetidos > 0) aviso.push({ tono: 'bad', texto: `${t.totales.repetidos} ${t.totales.repetidos === 1 ? 'cargo repite' : 'cargos repiten'} la referencia de un cobro de Meta: posible cobro doble.`, href: '/cuentas/dropi-tarjeta', ir: 'Ver cargos' })
  if (t.cobrosSinTarjeta.length > 0) aviso.push({ tono: 'warn', texto: `${t.cobrosSinTarjeta.length} ${t.cobrosSinTarjeta.length === 1 ? 'cobro de Meta no aparece' : 'cobros de Meta no aparecen'} en tu tarjeta.`, href: '/cuentas/dropi-tarjeta', ir: 'Revisar' })
  if ((p.cuenta.sin_pagar || 0) > 0) aviso.push({ tono: 'warn', texto: `${p.cuenta.sin_pagar} ${p.cuenta.sin_pagar === 1 ? 'pedido entregado que Dropi aún no te paga' : 'pedidos entregados que Dropi aún no te paga'}.`, href: '/contabilidad/recuperacion', ir: 'Ver pedidos' })
  const dev = (p.cuenta.devuelto || 0) + (p.cuenta.devuelto_cobrado || 0)
  if (dev > 0) aviso.push({ tono: 'idle', texto: `${dev} ${dev === 1 ? 'pedido devuelto' : 'pedidos devueltos'} en total.`, href: '/campanas/todos', ir: 'Ver pedidos' })
  // Recuperación de la inversión: lo invertido = todos los costos desde el primer día con datos hasta hoy (las herramientas, por cada día calendario).
  const hoy = hoyBogota(), r = g.resumen
  const primero = g.dias.length ? g.dias[g.dias.length - 1].dia : hoy // los días vienen del más nuevo al más viejo
  const diasCal = Math.max(1, Math.round((Date.parse(hoy + 'T12:00:00Z') - Date.parse(primero + 'T12:00:00Z')) / 864e5) + 1)
  const invertido = Math.round((r.costos - r.herramientas + g.herramientasPorDia * diasCal) * 100) / 100
  const ult7 = new Set(Array.from({ length: 7 }, (_, i) => sumarDias(hoy, i - 6)))
  const netoUlt7 = g.dias.filter((x) => ult7.has(x.dia)).reduce((a, x) => a + x.neto, 0)
  const ritmo = (netoUlt7 - g.herramientasPorDia * 7) / 7 // lo que te queda por día tras TODOS los costos, en la última semana
  const enCamino = p.lista.filter((x) => x.contable === 'en_curso')
  const rec = { invertido, recuperado: r.total.ganancia, ritmo, desde: primero, ...recuperacion(invertido, r.total.ganancia, ritmo, hoy) }
  return { cortes, ganancia: g, pedidos: p, caja, hayCobros: g.hayCobros, aviso, rec, enCamino: { n: enCamino.length, valor: enCamino.reduce((a, x) => a + (x.total || 0), 0) } }
}

/** Campañas con su resultado real (pedidos atribuidos por producto, ganancia de la billetera, devoluciones) y los productos disponibles para armarlas. */
/** `rango` ({desde, hasta}) limita las campañas a los pedidos CREADOS en ese periodo y a su gasto de Meta en esos días; sin rango, todo el tiempo (como siempre). */
export const datosCampanas = (uid, m = new Map(), rango = null) => memo(m, rango ? `campanas:${rango.desde}:${rango.hasta}` : 'campanas', () => _datosCampanas(uid, m, rango))
const enRango = (rango, f) => !rango || (!!f && f >= rango.desde && f <= rango.hasta)
async function _datosCampanas(uid, m, rango) {
  const inicio = await inicioDe(uid, m)
  const [p, camps, gan, devs, prods, gastos, [con]] = await Promise.all([
    datosPedidos(uid, m),
    sql`SELECT id, name, product_ids, active, meta_campaign_id FROM campaigns WHERE owner_id = ${uid} ORDER BY created_at, id`,
    sql`SELECT w.order_ref, w.guide, w.amount::float8 AS amount FROM wallet_movements w WHERE w.owner_id = ${uid} AND w.kind = 'profit' AND NOT EXISTS (SELECT 1 FROM wallet_movements r WHERE r.owner_id = w.owner_id AND r.reverses = w.external_id)`,
    sql`SELECT order_ref, guide, amount::float8 AS amount FROM wallet_movements WHERE owner_id = ${uid} AND kind = 'return_fee'`,
    sql`SELECT status, created_date::text AS creado, product_ids, product_names FROM dropi_orders WHERE owner_id = ${uid}`,
    sql`SELECT meta_campaign_id AS id, sum(spend)::float8 AS spend FROM meta_spend_daily WHERE owner_id = ${uid} AND day >= ${rango && rango.desde > inicio ? rango.desde : inicio} AND day <= ${rango ? rango.hasta : '9999-12-31'} GROUP BY 1`,
    conexionMeta(uid, m),
  ])
  const vat = con ? con.vat : 19
  const gastoMeta = new Map(gastos.map((g) => [g.id, g.spend]))
  // Lo real de la billetera por pedido: por ID de pedido o, si no lo trae, por guía.
  const porGuia = new Map(p.lista.filter((x) => x.guia).map((x) => [x.guia, x.idPedido]))
  const porPedido = (rows) => { const m = new Map(); for (const r of rows) { const id = r.order_ref || porGuia.get(r.guide); if (id) m.set(id, (m.get(id) || 0) + r.amount) } return m }
  const gananciaPorPedido = porPedido(gan)
  const resumen = resumenPorCampana(rango ? p.lista.filter((x) => enRango(rango, x.creado)) : p.lista, p.asig, gananciaPorPedido, porPedido(devs))
  // Productos de los pedidos que se importan (todos los estados menos cancelados), con cuántos pedidos tiene cada uno.
  const cuenta = new Map()
  for (const r of prods) {
    if (!seImporta(r.status) || !dentroDeOperacion(r.creado, inicio)) continue
    ;(r.product_ids || []).forEach((id, i) => { const c = cuenta.get(id) || { pid: id, nombre: (r.product_names || [])[i] || 'Producto ' + id, n: 0 }; c.n++; cuenta.set(id, c) })
  }
  const productosOrden = [...cuenta.values()].sort((a, b) => b.n - a.n || a.pid.localeCompare(b.pid))
  const nombreProd = new Map(productosOrden.map((x) => [x.pid, x.nombre]))
  const pctDev = new Map((await sql`SELECT id, return_pct::float8 AS p FROM campaigns WHERE owner_id = ${uid}`.catch(() => [])).map((r) => [String(r.id), r.p])) // la columna llega con la migración
  const defs = camps.map((c) => ({ id: String(c.id), nombre: c.name, activa: c.active, devolucionPct: pctDev.has(String(c.id)) ? pctDev.get(String(c.id)) : DEVOLUCION_POR_DEFECTO, productIds: c.product_ids || [], metaId: c.meta_campaign_id || null, gasto: c.meta_campaign_id ? { sinIva: Math.round(gastoMeta.get(c.meta_campaign_id) || 0), conIva: Math.round((gastoMeta.get(c.meta_campaign_id) || 0) * (1 + vat / 100)) } : null }))
  const dueno = new Map() // producto → campaña que se lo queda (la más antigua)
  for (const c of defs) for (const id of c.productIds) if (!dueno.has(id)) dueno.set(id, c.nombre)
  return {
    campanas: defs.map((c) => ({ ...c, productos: c.productIds.map((id) => ({ id, nombre: nombreProd.get(id) || 'Producto ' + id })), r: resumen.get(c.id) || null })),
    sinCampana: resumen.get('sin') || null,
    productos: productosOrden.map((x) => ({ id: x.pid, nombre: x.nombre, pedidos: x.n, campana: dueno.get(x.pid) || null })),
    hayPedidos: p.lista.length > 0,
    gananciaPorPedido,
  }
}

/** Informe por día: pedidos vendidos (Dropi), entregados, en camino, devueltos, publicidad de Meta (con IVA) y ganancia cobrada de esas ventas. */
function informeDe(lista, gananciaPorPedido, gastoPorDia, vat) {
  const ped = lista.filter((x) => x.creado).map((x) => ({ creado: x.creado, contable: x.contable, ganancia: gananciaPorPedido.get(x.idPedido) || 0 }))
  const costos = [...gastoPorDia].map(([dia, spend]) => ({ dia, publicidad: spend * (1 + vat / 100), otros: 0 }))
  const dias = [...ped.map((x) => x.creado), ...costos.map((x) => x.dia)].sort()
  return dias.length ? gananciaPorVenta(ped, costos, dias[0], hoyBogota()) : []
}

const cuentaDe = (lista) => { const c = {}; for (const p of lista) c[p.contable] = (c[p.contable] || 0) + 1; return c }

/**
 * Una campaña con sus pedidos. `clave`: id de campaña · 'sin' (pedidos de productos sin campaña) · 'todos' (todos los pedidos). Devuelve null si no existe.
 * `pedidos` trae la misma forma que datosPedidos (lista, cuenta, hoy, billeteraDesde) para reutilizar la vista.
 */
export async function datosCampana(uid, clave, m = new Map(), rango = null) {
  const [d, p] = await Promise.all([datosCampanas(uid, m, rango), datosPedidos(uid, m)])
  const lista0 = rango ? p.lista.filter((x) => enRango(rango, x.creado)) : p.lista // los pedidos del periodo elegido (todos, sin periodo)
  const armar = (lista) => ({ lista, cuenta: cuentaDe(lista), hoy: lista.filter((x) => x.creado === hoyBogota()).length, billeteraDesde: p.billeteraDesde })
  const combos = (lista) => combosVendidos(lista, d.gananciaPorPedido) // lo vendido por combo (pedidos entregados) con la ganancia real de la billetera
  if (clave === 'todos') {
    const inicioT = await inicioDe(uid, m)
    const [gastos, [conT]] = await Promise.all([sql`SELECT day::text AS d, SUM(spend)::float8 AS spend FROM meta_spend_daily WHERE owner_id = ${uid} AND day >= ${rango && rango.desde > inicioT ? rango.desde : inicioT} AND day <= ${rango ? rango.hasta : '9999-12-31'} GROUP BY day`, conexionMeta(uid, m)])
    return { clave, nombre: 'Todos los pedidos', conTabs: false, productos: [], r: null, pedidos: armar(lista0), combos: combos(lista0), informe: informeDe(lista0, d.gananciaPorPedido, new Map(gastos.map((x) => [x.d, x.spend])), conT ? conT.vat : 19).filter((x) => !rango || (x.dia >= rango.desde && x.dia <= rango.hasta)) }
  }
  if (clave === 'sin') return { clave, nombre: 'Sin campaña', conTabs: false, productos: [], r: d.sinCampana, pedidos: armar(lista0.filter((x) => !x.campanaId)), combos: combos(lista0.filter((x) => !x.campanaId)) }
  const c = d.campanas.find((x) => x.id === clave)
  if (!c) return null
  const suyos = p.lista.filter((x) => x.campanaId === c.id) // todos sus pedidos: «cuándo escalar» siempre mira los últimos días, sin importar el periodo elegido
  const suyosVista = lista0.filter((x) => x.campanaId === c.id)
  const inicio = await inicioDe(uid, m)
  const [[con], gasto] = await Promise.all([
    conexionMeta(uid, m),
    c.metaId ? sql`SELECT day::text AS d, spend::float8 AS spend, impressions::float8 AS imp, clicks::float8 AS clicks, purchases FROM meta_spend_daily WHERE owner_id = ${uid} AND meta_campaign_id = ${c.metaId} AND day >= ${inicio} ORDER BY day DESC` : [],
  ])
  const vat = con ? con.vat : 19
  const primeroMeta = gasto.length ? gasto[gasto.length - 1].d : hoyBogota() // las filas vienen del día más nuevo al más viejo
  const meta = { vinculada: !!c.metaId, vat, filas: gasto.map((x) => ({ ...x, conIva: Math.round(x.spend * (1 + vat / 100)) })), serie: serieMeta(gasto, primeroMeta, hoyBogota()), resumen: resumenMeta(gasto) }
  // ¿Cuándo escalar?: últimos 7 días con gasto de Meta, con las ventas (pedidos) de la campaña de cada día y lo que de verdad deja cada pedido pagado.
  const ventasDia = new Map()
  for (const x of suyos) ventasDia.set(x.creado, (ventasDia.get(x.creado) || 0) + 1)
  const diasEsc = meta.serie.filter((x) => x.gasto > 0).map((x) => ({ dia: x.dia, gasto: x.gasto, ventas: ventasDia.get(x.dia) || 0 }))
  const margen = c.r && c.r.pagados > 0 ? (c.r.ganancia - c.r.costoDevoluciones) / c.r.pagados : null
  const escalar = c.metaId ? evaluarEscalado({ dias: diasEsc, margen, vat }) : null
  const gastoVista = rango ? gasto.filter((x) => enRango(rango, x.d)) : gasto, primeroVista = gastoVista.length ? gastoVista[gastoVista.length - 1].d : hoyBogota()
  const metaVista = rango ? { ...meta, filas: gastoVista.map((x) => ({ ...x, conIva: Math.round(x.spend * (1 + vat / 100)) })), serie: serieMeta(gastoVista, primeroVista, rango.hasta < hoyBogota() ? rango.hasta : hoyBogota()), resumen: resumenMeta(gastoVista) } : meta // lo que se MUESTRA sigue el periodo; «escalar» usa la serie completa
  const informe = informeDe(suyosVista, d.gananciaPorPedido, new Map(gastoVista.map((x) => [x.d, x.spend])), vat).filter((x) => !rango || (x.dia >= rango.desde && x.dia <= rango.hasta))
  return { ...c, clave, conTabs: true, pedidos: armar(suyosVista), combos: combos(suyosVista), meta: metaVista, inicio, escalar, informe }
}

/** Meta Ads: estado de la conexión, gasto diario por campaña (sin IVA) y cobros (con IVA) con su cruce contra la tarjeta. Todo desde la fecha de inicio de la operación. */
export async function datosMeta(uid, m = new Map()) {
  const inicio = await inicioDe(uid, m)
  const [[con], filas, cobros, tj] = await Promise.all([
    conexionMeta(uid, m),
    sql`SELECT day::text AS d, meta_campaign_id AS id, campaign_name AS nombre, spend::float8 AS spend, impressions::float8 AS imp, clicks::float8 AS clicks, purchases, purchase_value::float8 AS pv FROM meta_spend_daily WHERE owner_id = ${uid} AND day >= ${inicio} ORDER BY day DESC, spend DESC`,
    sql`SELECT id, charged_date::text AS d, amount::float8 AS amount, status, payment_ref, reference, notes, source FROM meta_charges WHERE owner_id = ${uid} AND charged_date >= ${inicio} ORDER BY charged_date DESC, id DESC`,
    datosTarjeta(uid, m),
  ])
  const vat = con ? con.vat : 19
  const sum = (f) => filas.reduce((a, x) => a + f(x), 0)
  const spend = sum((x) => x.spend)
  const sinTarjeta = new Set(tj.cobrosSinTarjeta.map((c) => String(c.id)))
  const lista = cobros.map((c) => ({ id: String(c.id), fecha: c.d, monto: c.amount, ref: c.payment_ref || '', transaccion: c.reference || '', notas: c.notes || '', origen: c.source, estado: c.status === 'failed' ? 'fallido' : c.status === 'pending' ? 'pendiente' : sinTarjeta.has(String(c.id)) ? 'sin_tarjeta' : 'cruza' }))
  const cobrado = lista.filter((c) => c.estado === 'cruza' || c.estado === 'sin_tarjeta').reduce((a, c) => a + c.monto, 0)
  return {
    conectado: !!con, con: con ? { cuenta: con.ad_account_id, nombre: con.account_name, estado: con.state, ultimaSync: con.last_sync_ok_at ? new Date(con.last_sync_ok_at).getTime() : null, error: con.last_error } : null,
    vat, inicio, filas: filas.map((x) => ({ ...x, spend: x.spend, conIva: Math.round(x.spend * (1 + vat / 100)) })),
    tot: { spend: Math.round(spend), conIva: Math.round(spend * (1 + vat / 100)), imp: sum((x) => x.imp), clicks: sum((x) => x.clicks), compras: sum((x) => x.purchases), valorCompras: Math.round(sum((x) => x.pv)), dias: new Set(filas.map((x) => x.d)).size },
    cobros: lista, cobrado: Math.round(cobrado), sinTarjeta: lista.filter((c) => c.estado === 'sin_tarjeta').length,
  }
}

/** ¿Cuándo recupero?: lo que falta, lo que ya está vendido y pendiente de pago, y la fecha estimada con 60 / 80 / 100 % de entrega. */
export async function datosRecuperacion(uid, m = new Map()) {
  const [dash, [lag]] = await Promise.all([
    datosDashboard(uid, m),
    sql`SELECT AVG(w.tx_date - o.created_date)::float8 AS dias, COUNT(*)::int AS n FROM wallet_movements w JOIN dropi_orders o ON o.owner_id = w.owner_id AND ((w.order_ref IS NOT NULL AND o.order_id = w.order_ref) OR (w.guide IS NOT NULL AND w.guide <> '' AND o.guide = w.guide)) WHERE w.owner_id = ${uid} AND w.kind = 'profit' AND o.created_date IS NOT NULL`,
  ])
  const gpp = dash.ganancia.venta.costo.gananciaPorPedido, hay = lag && lag.n > 0, lagDias = hay ? lag.dias : 7
  const proy = dash.rec.faltan > 0 ? proyectarRecuperacion({ faltan: dash.rec.faltan, gananciaPorPedido: gpp, lagDias, pendientes: dash.pedidos.lista.map((x) => ({ creado: x.creado, contable: x.contable })), hoy: hoyBogota(), tasaBase: 0.6 }) : null // la base es prudente: entre los «en camino» hay pedidos con novedad que pueden terminar devueltos
  return { rec: dash.rec, proy, lagDias: Math.round(lagDias), lagN: hay ? lag.n : 0, gananciaPorPedido: gpp, pedidos: dash.pedidos, enCamino: dash.enCamino }
}

/** Foto plana de un corte (lo que se sella y lo que se compara después). */
const fotoDe = (c) => ({
  v: 2, desde: c.desde, hasta: c.hasta, ganancia: c.total.ganancia, publicidad: c.total.meta, otrosGastos: c.total.otrosGastos, devoluciones: c.total.devoluciones, comisiones: c.total.comisiones,
  otrosDescuentos: c.total.otrosDescuentos, herramientas: Math.round((c.herramientas + c.total.pagosHerramientas) * 100) / 100, costos: c.costos, neto: c.neto, pagados: c.total.entregas, saldoApertura: c.flujo.saldoApertura, saldoCierre: c.flujo.saldoCierre,
  entro: c.flujo.totalEntra, salio: c.flujo.totalSale, retiros: c.flujo.retiros, vendidos: c.pedidos.vendidos.n, pendientesN: c.pedidos.pendientes.n, pendientesValor: c.pedidos.pendientes.valor,
  gananciaEsperada: c.estimacion.gananciaEsperada, costoDevolucionesEsperado: c.estimacion.costoDevoluciones, base: c.reparto.base, retiroSeguro: c.billetera.retiroSeguro,
  reparto: c.reparto.filas.map((f) => ({ id: f.id, nombre: f.nombre, pct: f.pct, monto: f.monto })),
})
export { fotoDe }

/**
 * Cortes: la ganancia, los gastos y el flujo de la billetera agrupados por periodo (cierra cada mes el día de corte). Del más nuevo al más viejo.
 * El número oficial es el de CAJA (lo que entró y salió de verdad). Cada corte trae además: rendimiento de sus ventas, lo que se espera de lo pendiente (estimación con el
 * % de devolución de cada campaña), el reparto sugerido, los chequeos de cuadre y su cierre sellado (si lo hay) con lo que cambió desde entonces.
 */
export async function datosCortes(uid, m = new Map()) {
  const aj = await ajustesDe(uid, m)
  const corte = corteDesde(aj.cut_day), inicio = aj.op_from || OPERACION_INICIO, rep = repartoDesde(aj.reparto)
  const [g, b, ped, camp, tar, herr, [cd], [cm]] = await Promise.all([
    datosGananciaPorDia(uid, m), datosBilletera(uid, m), datosPedidos(uid, m), datosCampanas(uid, m), datosTarjeta(uid, m),
    herramientasMes(uid, m).catch(() => [{ m: 0 }]),
    conexionDropi(uid, m).catch(() => [null]),
    conexionMeta(uid, m).catch(() => [null]),
  ])
  const [[fl], cierresRows, sinContar, spendRows, cobrosRows] = await Promise.all([
    sql`SELECT COALESCE(SUM(amount) / NULLIF(COUNT(DISTINCT COALESCE(NULLIF(order_ref, ''), external_id)), 0), 0)::float8 AS flete FROM wallet_movements WHERE owner_id = ${uid} AND kind = 'return_fee' AND tx_date >= ${inicio}`,
    sql`SELECT period_end::text AS fin, version, snapshot, note, closed_at FROM cut_closures WHERE owner_id = ${uid} ORDER BY period_end, version DESC`.catch(() => null), // null = la tabla llega con la migración
    sql`SELECT tx_date::text AS d, COUNT(*)::int AS n, SUM(amount)::float8 AS s FROM wallet_movements WHERE owner_id = ${uid} AND kind = 'order_payment' AND direction = 'out' AND tx_date >= ${inicio} GROUP BY tx_date`, // anticipos de pedidos («salida por nueva orden»): no son gasto, se recuperan al pagarse el pedido
    sql`SELECT day::text AS d, SUM(spend)::float8 AS s FROM meta_spend_daily WHERE owner_id = ${uid} GROUP BY day`, // gasto de Meta por día, SIN IVA (todo el histórico: la deuda con Meta se mide desde el primer día)
    sql`SELECT charged_date::text AS d, amount::float8 AS a FROM meta_charges WHERE owner_id = ${uid} AND status = 'paid'`, // cobros de Meta registrados en «Mis cuentas → Meta»
  ])
  const tablaCierres = cierresRows !== null
  // Publicidad real (con IVA): del gasto de Meta si está conectado; si no, de lo que ya usa «Ganancia por día». Es la base del ritmo de pauta y de la deuda con Meta.
  const vatMeta = cm && cm.vat != null ? cm.vat : 19
  const gastosMeta = spendRows.map((x) => ({ dia: x.d, gasto: x.s * (1 + vatMeta / 100) }))
  const gastosPauta = gastosMeta.length ? gastosMeta : g.venta.serie.map((x) => ({ dia: x.dia, gasto: x.publicidad }))
  const cobrosMeta = cobrosRows.map((x) => ({ dia: x.d, monto: x.a }))
  const hoy = hoyBogota(), periodos = listarPeriodos(inicio, hoy, corte)
  const res = resumenPorPeriodo(g.dias, periodos, g.herramientasPorDia, hoy)
  const flujo = flujoPorPeriodo(b.diasFlujo, periodos, b.saldo), pedidos = pedidosPorPeriodo(ped.lista, periodos), ventas = ventasPorPeriodo(g.venta.serie, periodos)

  // Ganancia media real por pedido pagado (por campaña y global) y % de devolución esperado por campaña: base de la estimación de lo pendiente.
  const sumas = new Map(); let tot = 0, n = 0
  for (const x of ped.lista) if (x.contable === 'pagado') {
    const gp = camp.gananciaPorPedido.get(x.idPedido); if (!gp) continue
    const k = x.campanaId || 'sin', a = sumas.get(k) || { s: 0, n: 0 }; a.s += gp; a.n++; sumas.set(k, a); tot += gp; n++
  }
  const paramsEst = {
    gananciaMedia: new Map([...sumas].map(([k, a]) => [k, a.s / a.n])), gananciaGlobal: n ? tot / n : null,
    pctDevolucion: new Map(camp.campanas.map((c) => [c.id, c.devolucionPct])), fleteDevolucion: fl && fl.flete > 0 ? fl.flete : null,
  }
  m.set('paramsEst', paramsEst) // para que «datosPeriodo» estime lo pendiente de cualquier rango con los mismos supuestos
  const estim = estimarPendientes(ped.lista, periodos, paramsEst)
  const pctEsperado = (() => { const v = camp.campanas.filter((c) => c.activa).map((c) => c.devolucionPct); return v.length ? Math.round(v.reduce((a, x) => a + x, 0) / v.length) : DEVOLUCION_POR_DEFECTO })()

  // Cierres sellados: la última versión de cada corte (las anteriores se conservan).
  const cierres = new Map()
  for (const r of cierresRows || []) { const a = cierres.get(r.fin) || []; a.push({ version: r.version, foto: r.snapshot, nota: r.note, cerradoEn: new Date(r.closed_at).getTime() }); cierres.set(r.fin, a) }

  const horas = (x) => (x && x.last_sync_ok_at ? (Date.now() - new Date(x.last_sync_ok_at).getTime()) / 3600e3 : null)
  const sumaCortes = res.reduce((a, r) => a + r.total.ganancia, 0)
  const viejo = (x) => { const h = horas(x); return h == null || h > 36 }
  const diasMedios = (l) => (l.length ? l.reduce((a, x) => a + (Date.parse(x.pagadoDia + 'T12:00:00Z') - Date.parse(x.creado + 'T12:00:00Z')) / 864e5, 0) / l.length : null)
  const diasPagoGlobal = diasMedios(ped.lista.filter((x) => x.pagadoDia && x.creado)) // un solo promedio de días hasta el pago para todo: así «hoy» da lo mismo en cada pantalla
  let acumulado = 0, retirado = 0, repartibleAntes = 0, gananciaPend = 0, devPend = 0
  const cortes = res.map((r, i) => {
    acumulado = Math.round((acumulado + r.neto) * 100) / 100
    retirado += flujo[i].retiros; gananciaPend += estim.get(r.id).gananciaEsperada; devPend += estim.get(r.id).costoDevoluciones
    const c = { ...r, dias: r.dias.map((x) => ({ ...x, ...netoDelDia(x) })), flujo: flujo[i], pedidos: pedidos[i], ventas: ventas[i], estimacion: estim.get(r.id), tasaDevolucion: tasaDevolucionReal(pedidos[i]), acumulado }
    const pagadosDelCorte = ped.lista.filter((x) => x.pagadoDia && x.creado && x.creado >= c.desde && x.creado <= c.hasta)
    c.diasPago = pagadosDelCorte.length ? Math.round(diasMedios(pagadosDelCorte) * 10) / 10 : null // días medios de la venta al pago
    c.chequeos = chequear({
      abierto: c.abierto, saldoApertura: c.flujo.saldoApertura, entro: c.flujo.totalEntra, salio: c.flujo.totalSale, saldoCierre: c.flujo.saldoCierre,
      herramientasMensual: herr[0] ? herr[0].m : 0, pagosHerramientas: c.total.pagosHerramientas,
      anticipos: sinContar.filter((x) => x.d >= c.desde && x.d <= c.hasta).reduce((a, x) => ({ n: a.n + x.n, monto: a.monto + x.s }), { n: 0, monto: 0 }),
      horasDropi: horas(cd), horasMeta: horas(cm), noVerificables: c.pedidos.estado.no_verificable.n,
      cobrosMetaSinTarjeta: tar.cobrosSinTarjeta.length, cargosRepetidos: tar.totales.repetidos, devolucionReal: c.tasaDevolucion, devolucionEsperada: pctEsperado,
      sinReferencia: c.estimacion.sinReferencia, sumaCortes, totalDias: g.resumen.total.ganancia,
    })
    // Lo que este corte aporta al reparto: el aumento de la utilidad acumulada (nunca negativa: las pérdidas se recuperan primero). Sumados, los cortes dan toda la utilidad.
    const repartibleAhora = Math.max(0, acumulado), base = Math.max(0, Math.round((repartibleAhora - repartibleAntes) * 100) / 100)
    repartibleAntes = repartibleAhora
    c.reparto = { base, filas: repartirUtilidad(rep.destinos, base) }
    // Billetera de ESTE corte al cerrar: piso de liquidez, lo que se queda y cuánto se podía retirar (con lo pendiente acumulado hasta aquí).
    const finPauta = c.abierto ? sumarDias(hoy, -1) : c.hasta // un día completo: hoy aún está gastando
    c.billetera = evaluarSalud({
      saldoBilletera: c.flujo.saldoCierre, saldoTarjeta: c.abierto ? tar.tarjetaDropi.saldo ?? null : null, utilidadAcumulada: acumulado, retirado,
      ritmoPauta: ritmoPauta(gastosPauta, finPauta).ritmo, deudaMeta: deudaMeta(gastosPauta, cobrosMeta, c.abierto ? hoy : c.hasta),
      costoDevolucionesEsperado: devPend, gananciaEsperada: gananciaPend, diasPago: diasPagoGlobal, hoy: c.abierto ? hoy : c.hasta,
      destinos: rep.destinos, cuadreMalo: c.chequeos.some((x) => x.tono === 'bad'), datosViejos: c.abierto && (viejo(cd) || viejo(cm)),
    })
    c.foto = fotoDe(c)
    const versiones = cierres.get(c.id) || [], ultimo = versiones[0] || null
    c.cierre = ultimo ? { ...ultimo, versiones: versiones.length, cambios: cambiosDesdeCierre(ultimo.foto, c.foto) } : null
    return c
  })
  // Salud de HOY: toda la billetera, con todo lo pendiente y el ritmo real de Meta.
  const hoyC = cortes[cortes.length - 1], ayer = sumarDias(hoy, -1)
  const pauta = ritmoPauta(gastosPauta, ayer)
  const salud = evaluarSalud({
    saldoBilletera: b.saldo, saldoTarjeta: tar.tarjetaDropi.saldo ?? null, utilidadAcumulada: acumulado, retirado,
    ritmoPauta: pauta.ritmo, deudaMeta: deudaMeta(gastosPauta, cobrosMeta, hoy), costoDevolucionesEsperado: devPend, gananciaEsperada: gananciaPend,
    diasPago: diasPagoGlobal, hoy, destinos: rep.destinos, cuadreMalo: hoyC.chequeos.some((x) => x.tono === 'bad'), datosViejos: viejo(cd) || viejo(cm),
  })
  cortes.reverse()
  return { generado: Date.now(), corte, inicio, hoy, cortes, salud, ritmoPauta: pauta, retiradoTotal: Math.round(retirado * 100) / 100, utilidadRetenida: Math.max(0, Math.round((acumulado - retirado) * 100) / 100), saldoBilletera: b.saldo, saldoTarjeta: tar.tarjetaDropi ? tar.tarjetaDropi.saldo : null, herramientasPorDia: g.herramientasPorDia, reparto: { destinos: rep.destinos, propio: rep.propio }, pctDevolucion: pctEsperado, cierresListos: tablaCierres }
}

/**
 * El periodo que pidió la pantalla: corte actual, anterior, uno cualquiera, todo el tiempo o un rango libre (`param`, ver resolverPeriodo). Siempre trae lo mismo para dibujarlo:
 * resumen, a dónde va la plata, costo por venta, días, pedidos y billetera. Los cortes reales traen además reparto, cuadre y sellado; un rango libre no (no es un cierre).
 */
export async function datosPeriodo(uid, param, m = new Map()) {
  const base = await datosCortes(uid, m)
  const asc = [...base.cortes].reverse().map(({ id, desde, hasta, abierto }) => ({ id, desde, hasta, abierto }))
  const per = resolverPeriodo(param, asc, base.hoy, base.inicio)
  const [g, b, ped, caja] = await Promise.all([datosGananciaPorDia(uid, m), datosBilletera(uid, m), datosPedidos(uid, m), datosCaja(uid, m)])
  let c
  if (per.tipo === 'corte') c = base.cortes.find((x) => x.id === per.id)
  else {
    const p = { id: per.id, desde: per.desde, hasta: per.hasta, abierto: per.abierto }
    const r = resumenPorPeriodo(g.dias, [p], g.herramientasPorDia, base.hoy)[0], pedidos = pedidosPorPeriodo(ped.lista, [p])[0]
    c = {
      ...r, dias: r.dias.map((x) => ({ ...x, ...netoDelDia(x) })), flujo: flujoPorPeriodo(b.diasFlujo, [p], per.hasta >= base.hoy ? b.saldo : null)[0], pedidos,
      ventas: ventasPorPeriodo(g.venta.serie, [p])[0], estimacion: estimarPendientes(ped.lista, [p], m.get('paramsEst')).get(p.id), tasaDevolucion: tasaDevolucionReal(pedidos),
      reparto: null, billetera: null, chequeos: [], cierre: null,
    }
  }
  const dentro = (x) => x.dia >= per.desde && x.dia <= per.hasta
  return {
    per, c, base, caja, hayCobros: g.hayCobros, herramientasPorDia: g.herramientasPorDia,
    desglose: repartoDeCostos(costosDelDia(c.total, c.herramientas), c.total.ganancia),
    costoVenta: costoPorVentaReal(g.venta.serie.filter(dentro)),
    vistas: { venta: g.venta.serie.filter(dentro), pago: g.serie.filter(dentro), herr: g.herramientasPorDia },
  }
}

/** El periodo de la URL (?p=) sin cargar todo Cortes: solo necesita el inicio de la operación y el día de corte. Los cortes salen del más nuevo al más viejo. */
export async function periodoElegido(uid, param, m = new Map()) {
  const aj = await ajustesDe(uid, m), inicio = aj.op_from || OPERACION_INICIO, hoy = hoyBogota()
  const periodos = listarPeriodos(inicio, hoy, corteDesde(aj.cut_day))
  return { per: resolverPeriodo(param, periodos, hoy, inicio), cortes: [...periodos].reverse(), hoy, inicio }
}
