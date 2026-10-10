import 'server-only'
// Lectura de los datos ya sincronizados (solo del usuario) y armado de las vistas. Los cálculos viven en src/domain: aquí solo se consulta y se junta.
import sql from '@/lib/db'
import { cruzar } from '@/domain/cruce.ts'
import { clasificarPedidos } from '@/domain/pedidos.ts'
import { diaVacio, resumirDias, netoDelDia } from '@/domain/porDia.ts'
import { hoyBogota, sumarDias } from '@/domain/fechas.ts'
import { recuperacion } from '@/domain/recuperacion.ts'
import { atribuir, resumenPorCampana } from '@/domain/campanas.ts'
import { seImporta } from '@/domain/estadoPedido.ts'
import { dentroDeOperacion } from '@/domain/ventana.ts'
import { combosVendidos } from '@/domain/combos.ts'
import { flujoPorDia } from '@/domain/billetera.ts'
import { OPERACION_INICIO } from '@/lib/dropi/config.mjs'
import { inicioOperacion } from '@/lib/inicio'

const num = (v) => Number(v) || 0
/** Fecha desde la que el usuario sincroniza Dropi (ajuste `op_from`; por defecto, el inicio de la operación). */
const inicioDe = inicioOperacion

/** Movimientos de la tarjeta con su clase tras el cruce con los cobros de Meta (por referencia de pago). */
export async function datosTarjeta(uid) {
  const inicio = await inicioDe(uid)
  const [rows, cobros] = await Promise.all([
    sql`SELECT id, tx_date::text AS d, amount::float8 AS amount, kind, status, description, pay_ref, manual_charge_id, decline_reason FROM card_transactions WHERE owner_id = ${uid} AND tx_date >= ${inicio} ORDER BY tx_date DESC, id DESC`,
    sql`SELECT id, charged_date::text AS d, amount::float8 AS amount, status, payment_ref FROM meta_charges WHERE owner_id = ${uid}`,
  ])
  const mov = rows.map((r) => ({ id: String(r.id), fecha: r.d, tipo: r.kind === 'refund' ? 'abono' : 'cargo', estado: r.status === 'approved' ? 'aprobado' : 'rechazado', monto: r.amount, refPago: r.pay_ref, cobroManualId: r.manual_charge_id ? String(r.manual_charge_id) : null }))
  const ch = cobros.map((c) => ({ id: String(c.id), fecha: c.d, refPago: c.payment_ref, monto: c.amount, estado: c.status === 'paid' ? 'pagado' : c.status === 'failed' ? 'fallido' : 'pendiente' }))
  const r = cruzar(mov, ch)
  const meta = new Set(r.meta.map((m) => m.id)), rep = new Set(r.repetidos.map((m) => m.id)), porMonto = new Set(r.porMonto.map((m) => m.id))
  const lista = rows.map((x) => {
    const id = String(x.id)
    const clase = x.status !== 'approved' ? 'rechazado' : x.kind === 'refund' ? 'recarga' : rep.has(id) ? 'repetido' : porMonto.has(id) ? 'meta_monto' : meta.has(id) ? 'meta' : 'otro'
    return { id, fecha: x.d, monto: x.amount, descripcion: x.description || '', refPago: x.pay_ref || '', clase, motivo: x.decline_reason || '' }
  })
  const suma = (f) => lista.filter(f).reduce((a, x) => a + x.monto, 0)
  const fechas = lista.map((x) => x.fecha).sort()
  const [aCard] = fechas.length ? await sql`SELECT COALESCE(SUM(amount), 0)::float8 AS s, COUNT(*)::int AS n FROM wallet_movements WHERE owner_id = ${uid} AND kind = 'to_card' AND tx_date >= ${fechas[0]}` : [{ s: 0, n: 0 }]
  return {
    tarjetaDropi: await datosTarjetaDropi(uid),
    inicio, desde: fechas[0] || null, hasta: fechas[fechas.length - 1] || null,
    deBilletera: { monto: aCard.s, n: aCard.n }, // lo que la billetera dice haber pasado a la tarjeta, en el mismo período
    lista, hayCobros: cobros.length > 0, cobrosSinTarjeta: r.cobrosSinTarjeta,
    totales: { recargas: suma((x) => x.clase === 'recarga'), meta: r.totalMeta, otros: r.totalOtros, rechazados: lista.filter((x) => x.clase === 'rechazado').length, repetidos: r.repetidos.length },
  }
}

/** La tarjeta virtual de Dropi: saldo que informa Dropi (con su hora), últimos 4 dígitos o pista del ID, y el estado de la conexión. */
export async function datosTarjetaDropi(uid) {
  const [[b], [con], [l4]] = await Promise.all([
    sql`SELECT amount::float8 AS amount, read_at FROM dropi_balances WHERE owner_id = ${uid} AND account = 'card' ORDER BY read_at DESC, id DESC LIMIT 1`,
    sql`SELECT card_hint, state, last_sync_ok_at FROM dropi_connections WHERE owner_id = ${uid}`,
    sql`SELECT last4 FROM card_transactions WHERE owner_id = ${uid} AND last4 IS NOT NULL ORDER BY tx_date DESC, id DESC LIMIT 1`,
  ])
  return {
    saldo: b ? b.amount : null, leido: b ? new Date(b.read_at).getTime() : null, last4: l4 ? l4.last4 : null,
    hint: con ? con.card_hint : null, conectada: !!con, estado: con ? con.state : null, ultimaSync: con && con.last_sync_ok_at ? new Date(con.last_sync_ok_at).getTime() : null,
  }
}

/** Billetera: últimos movimientos y totales por tipo. */
export async function datosBilletera(uid) {
  const inicio = await inicioDe(uid)
  const [mov, tot, [ult]] = await Promise.all([
    sql`SELECT external_id, tx_date::text AS d, direction, amount::float8 AS amount, balance_before::float8 AS before, kind, description, order_ref FROM wallet_movements WHERE owner_id = ${uid} AND tx_date >= ${inicio} ORDER BY tx_at DESC LIMIT 3000`,
    sql`SELECT kind, COUNT(*)::int AS n, SUM(amount)::float8 AS sum FROM wallet_movements WHERE owner_id = ${uid} AND tx_date >= ${inicio} GROUP BY kind`,
    sql`SELECT direction, amount::float8 AS amount, balance_before::float8 AS before FROM wallet_movements WHERE owner_id = ${uid} ORDER BY tx_at DESC LIMIT 1`,
  ])
  const [rg] = await sql`SELECT MIN(tx_date)::text AS desde, MAX(tx_date)::text AS hasta FROM wallet_movements WHERE owner_id = ${uid} AND tx_date >= ${inicio}`
  const [flujo, serie, tarjeta, porTipo] = await Promise.all([
    sql`SELECT direction, SUM(amount)::float8 AS s FROM wallet_movements WHERE owner_id = ${uid} AND tx_date >= ${inicio} GROUP BY direction`,
    // Saldo al cierre de cada día (el último movimiento del día + lo que ese movimiento dejó).
    sql`SELECT DISTINCT ON (tx_date) tx_date::text AS dia, (balance_before + CASE direction WHEN 'in' THEN amount ELSE -amount END)::float8 AS saldo FROM wallet_movements WHERE owner_id = ${uid} AND tx_date >= ${inicio} AND balance_before IS NOT NULL ORDER BY tx_date, tx_at DESC`,
    datosTarjetaDropi(uid),
    sql`SELECT tx_date::text AS dia, kind, direction, SUM(amount)::float8 AS monto FROM wallet_movements WHERE owner_id = ${uid} AND tx_date >= ${inicio} GROUP BY tx_date, kind, direction`,
  ])
  const cierre = new Map(serie.map((x) => [x.dia, x.saldo]))
  const diasFlujo = flujoPorDia(porTipo).map((x) => ({ ...x, saldoCierre: cierre.get(x.dia) ?? null }))
  const saldo = ult && ult.before != null ? Math.round((ult.before + (ult.direction === 'in' ? ult.amount : -ult.amount)) * 100) / 100 : null
  const sumaDir = (d) => (flujo.find((x) => x.direction === d) || { s: 0 }).s
  return { inicio, desde: rg && rg.desde, hasta: rg && rg.hasta, entro: sumaDir('in'), salio: sumaDir('out'), serie, diasFlujo, tarjeta, mov, totales: Object.fromEntries(tot.map((t) => [t.kind, { n: t.n, sum: t.sum }])), saldo }
}

/** Pedidos de Dropi con su estado contable (cruzando con la billetera por ID de pedido o guía). */
export async function datosPedidos(uid) {
  const inicio = await inicioDe(uid)
  const [todos, ganancias, devs, [cov]] = await Promise.all([
    sql`SELECT order_id, guide, status, status_group, product, product_ids, units, total::float8 AS total, created_date::text AS created, delivered_date::text AS delivered, returned_date::text AS returned FROM dropi_orders WHERE owner_id = ${uid} ORDER BY created_date DESC NULLS LAST, id DESC`,
    sql`SELECT w.order_ref, w.guide FROM wallet_movements w WHERE w.owner_id = ${uid} AND w.kind = 'profit' AND NOT EXISTS (SELECT 1 FROM wallet_movements r WHERE r.owner_id = w.owner_id AND r.reverses = w.external_id)`,
    sql`SELECT order_ref, guide FROM wallet_movements WHERE owner_id = ${uid} AND kind = 'return_fee' AND tx_date >= ${inicio}`,
    sql`SELECT MIN(tx_date)::text AS desde FROM wallet_movements WHERE owner_id = ${uid} AND tx_date >= ${inicio}`,
  ])
  const pedidos = todos.filter((p) => seImporta(p.status) && dentroDeOperacion(p.created, inicio)) // todos los estados salvo cancelados, desde el inicio de la operación
  const entrada = pedidos.map((p) => ({ idPedido: p.order_id, guia: p.guide, estado: p.status, entregadoDia: p.delivered, total: p.total, producto: p.product || '', productIds: p.product_ids || [], unidades: p.units, creado: p.created, devuelto: p.returned }))
  const lista = clasificarPedidos(entrada, ganancias.map((g) => ({ idPedido: g.order_ref, guia: g.guide })), devs.map((g) => ({ idPedido: g.order_ref, guia: g.guide })), cov && cov.desde, hoyBogota())
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
export async function datosGananciaPorDia(uid) {
  const inicio = await inicioDe(uid)
  const [wal, tarjeta, herr] = await Promise.all([
    sql`SELECT tx_date::text AS d, kind, SUM(amount)::float8 AS sum, COUNT(*)::int AS n FROM wallet_movements w WHERE owner_id = ${uid} AND tx_date >= ${inicio} AND kind IN ('profit', 'return_fee', 'card_fee', 'recharge_fee', 'other_out', 'transfer_out') AND NOT EXISTS (SELECT 1 FROM wallet_movements r WHERE r.owner_id = w.owner_id AND r.reverses = w.external_id) GROUP BY tx_date, kind`,
    datosTarjeta(uid),
    sql`SELECT COALESCE(SUM(monthly_amount), 0)::float8 AS m FROM fixed_costs WHERE owner_id = ${uid} AND active`.catch(() => [{ m: 0 }]),
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

/** Herramientas de operación (costos fijos mensuales) del usuario. */
export async function datosHerramientas(uid) {
  const rows = await sql`SELECT id, name, monthly_amount::float8 AS monthly, active FROM fixed_costs WHERE owner_id = ${uid} ORDER BY created_at, id`
  return rows.map((r) => ({ id: String(r.id), nombre: r.name, mensual: r.monthly, activa: r.active }))
}

/** Todo lo que necesita el Dashboard, con las mismas funciones (y por tanto las mismas cifras) que las demás pantallas. */
export async function datosDashboard(uid) {
  const [g, p, caja, t, [c]] = await Promise.all([
    datosGananciaPorDia(uid), datosPedidos(uid), datosCaja(uid), datosTarjeta(uid),
    sql`SELECT last_sync_ok_at, state FROM dropi_connections WHERE owner_id = ${uid}`.catch(() => [null]),
  ])
  const horas = c && c.last_sync_ok_at ? (Date.now() - new Date(c.last_sync_ok_at).getTime()) / 3600e3 : null
  const aviso = []
  if (!c) aviso.push({ tono: 'blue', texto: 'Conecta Dropi para traer tus movimientos y pedidos.', href: '/cuentas', ir: 'Conectar Dropi' })
  else if (horas == null || horas > 24) aviso.push({ tono: 'warn', texto: horas == null ? 'Aún no has sincronizado Dropi.' : `Tus datos de Dropi tienen ${Math.round(horas)} horas.`, href: '/cuentas', ir: 'Sincronizar' })
  if (t.totales.repetidos > 0) aviso.push({ tono: 'bad', texto: `${t.totales.repetidos} ${t.totales.repetidos === 1 ? 'cargo repite' : 'cargos repiten'} la referencia de un cobro de Meta: posible cobro doble.`, href: '/cuentas/dropi-tarjeta', ir: 'Ver cargos' })
  if (t.cobrosSinTarjeta.length > 0) aviso.push({ tono: 'warn', texto: `${t.cobrosSinTarjeta.length} ${t.cobrosSinTarjeta.length === 1 ? 'cobro de Meta no aparece' : 'cobros de Meta no aparecen'} en tu tarjeta.`, href: '/cuentas/dropi-tarjeta', ir: 'Revisar' })
  if ((p.cuenta.sin_pagar || 0) > 0) aviso.push({ tono: 'warn', texto: `${p.cuenta.sin_pagar} ${p.cuenta.sin_pagar === 1 ? 'pedido entregado que Dropi aún no te paga' : 'pedidos entregados que Dropi aún no te paga'}.`, href: '/contabilidad/cuando-recupero', ir: 'Ver pedidos' })
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
  return { ganancia: g, pedidos: p, caja, hayCobros: g.hayCobros, aviso, rec, enCamino: { n: enCamino.length, valor: enCamino.reduce((a, x) => a + (x.total || 0), 0) } }
}

/** Campañas con su resultado real (pedidos atribuidos por producto, ganancia de la billetera, devoluciones) y los productos disponibles para armarlas. */
export async function datosCampanas(uid) {
  const inicio = await inicioDe(uid)
  const [p, camps, gan, devs, prods] = await Promise.all([
    datosPedidos(uid),
    sql`SELECT id, name, product_ids, active FROM campaigns WHERE owner_id = ${uid} ORDER BY created_at, id`,
    sql`SELECT w.order_ref, w.guide, w.amount::float8 AS amount FROM wallet_movements w WHERE w.owner_id = ${uid} AND w.kind = 'profit' AND NOT EXISTS (SELECT 1 FROM wallet_movements r WHERE r.owner_id = w.owner_id AND r.reverses = w.external_id)`,
    sql`SELECT order_ref, guide, amount::float8 AS amount FROM wallet_movements WHERE owner_id = ${uid} AND kind = 'return_fee'`,
    sql`SELECT status, created_date::text AS creado, product_ids, product_names FROM dropi_orders WHERE owner_id = ${uid}`,
  ])
  // Lo real de la billetera por pedido: por ID de pedido o, si no lo trae, por guía.
  const porGuia = new Map(p.lista.filter((x) => x.guia).map((x) => [x.guia, x.idPedido]))
  const porPedido = (rows) => { const m = new Map(); for (const r of rows) { const id = r.order_ref || porGuia.get(r.guide); if (id) m.set(id, (m.get(id) || 0) + r.amount) } return m }
  const gananciaPorPedido = porPedido(gan)
  const resumen = resumenPorCampana(p.lista, p.asig, gananciaPorPedido, porPedido(devs))
  // Productos de los pedidos que se importan (todos los estados menos cancelados), con cuántos pedidos tiene cada uno.
  const cuenta = new Map()
  for (const r of prods) {
    if (!seImporta(r.status) || !dentroDeOperacion(r.creado, inicio)) continue
    ;(r.product_ids || []).forEach((id, i) => { const c = cuenta.get(id) || { pid: id, nombre: (r.product_names || [])[i] || 'Producto ' + id, n: 0 }; c.n++; cuenta.set(id, c) })
  }
  const productosOrden = [...cuenta.values()].sort((a, b) => b.n - a.n || a.pid.localeCompare(b.pid))
  const nombreProd = new Map(productosOrden.map((x) => [x.pid, x.nombre]))
  const defs = camps.map((c) => ({ id: String(c.id), nombre: c.name, activa: c.active, productIds: c.product_ids || [] }))
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

const cuentaDe = (lista) => { const c = {}; for (const p of lista) c[p.contable] = (c[p.contable] || 0) + 1; return c }

/**
 * Una campaña con sus pedidos. `clave`: id de campaña · 'sin' (pedidos de productos sin campaña) · 'todos' (todos los pedidos). Devuelve null si no existe.
 * `pedidos` trae la misma forma que datosPedidos (lista, cuenta, hoy, billeteraDesde) para reutilizar la vista.
 */
export async function datosCampana(uid, clave) {
  const [d, p] = await Promise.all([datosCampanas(uid), datosPedidos(uid)])
  const armar = (lista) => ({ lista, cuenta: cuentaDe(lista), hoy: lista.filter((x) => x.creado === hoyBogota()).length, billeteraDesde: p.billeteraDesde })
  const combos = (lista) => combosVendidos(lista, d.gananciaPorPedido) // lo vendido por combo (pedidos entregados) con la ganancia real de la billetera
  if (clave === 'todos') return { clave, nombre: 'Todos los pedidos', conTabs: false, productos: [], r: null, pedidos: armar(p.lista), combos: combos(p.lista) }
  if (clave === 'sin') return { clave, nombre: 'Sin campaña', conTabs: false, productos: [], r: d.sinCampana, pedidos: armar(p.lista.filter((x) => !x.campanaId)), combos: combos(p.lista.filter((x) => !x.campanaId)) }
  const c = d.campanas.find((x) => x.id === clave)
  if (!c) return null
  const suyos = p.lista.filter((x) => x.campanaId === c.id)
  return { ...c, clave, conTabs: true, pedidos: armar(suyos), combos: combos(suyos) }
}

/** Meta Ads: estado de la conexión, gasto diario por campaña (sin IVA) y cobros (con IVA) con su cruce contra la tarjeta. Todo desde la fecha de inicio de la operación. */
export async function datosMeta(uid) {
  const inicio = await inicioDe(uid)
  const [[con], filas, cobros, tj] = await Promise.all([
    sql`SELECT ad_account_id, account_name, currency, vat_pct::float8 AS vat, state, last_sync_ok_at, last_error FROM meta_connections WHERE owner_id = ${uid}`,
    sql`SELECT day::text AS d, meta_campaign_id AS id, campaign_name AS nombre, spend::float8 AS spend, impressions::float8 AS imp, clicks::float8 AS clicks, purchases, purchase_value::float8 AS pv FROM meta_spend_daily WHERE owner_id = ${uid} AND day >= ${inicio} ORDER BY day DESC, spend DESC`,
    sql`SELECT id, charged_date::text AS d, amount::float8 AS amount, status, payment_ref, source FROM meta_charges WHERE owner_id = ${uid} AND charged_date >= ${inicio} ORDER BY charged_date DESC, id DESC`,
    datosTarjeta(uid),
  ])
  const vat = con ? con.vat : 19
  const sum = (f) => filas.reduce((a, x) => a + f(x), 0)
  const spend = sum((x) => x.spend)
  const sinTarjeta = new Set(tj.cobrosSinTarjeta.map((c) => String(c.id)))
  const lista = cobros.map((c) => ({ id: String(c.id), fecha: c.d, monto: c.amount, ref: c.payment_ref || '', origen: c.source, estado: c.status === 'failed' ? 'fallido' : c.status === 'pending' ? 'pendiente' : sinTarjeta.has(String(c.id)) ? 'sin_tarjeta' : 'cruza' }))
  const cobrado = lista.filter((c) => c.estado === 'cruza' || c.estado === 'sin_tarjeta').reduce((a, c) => a + c.monto, 0)
  return {
    conectado: !!con, con: con ? { cuenta: con.ad_account_id, nombre: con.account_name, estado: con.state, ultimaSync: con.last_sync_ok_at ? new Date(con.last_sync_ok_at).getTime() : null, error: con.last_error } : null,
    vat, inicio, filas: filas.map((x) => ({ ...x, spend: x.spend, conIva: Math.round(x.spend * (1 + vat / 100)) })),
    tot: { spend: Math.round(spend), conIva: Math.round(spend * (1 + vat / 100)), imp: sum((x) => x.imp), clicks: sum((x) => x.clicks), compras: sum((x) => x.purchases), valorCompras: Math.round(sum((x) => x.pv)), dias: new Set(filas.map((x) => x.d)).size },
    cobros: lista, cobrado: Math.round(cobrado), sinTarjeta: lista.filter((c) => c.estado === 'sin_tarjeta').length,
  }
}
