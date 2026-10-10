import 'server-only'
// Sincroniza los pedidos de Dropi de TODOS los estados, menos los CANCELADOS y los anteriores al inicio de la operación (GET /api/orders/myorders/v2) con la misma sesión que ya usa la tarjeta: sin un inicio de sesión extra.
// El estado real (entregado, devolución, en tránsito…) viene de Dropi: es lo que decide cuándo hay ganancia. Una petición a la vez y con pausa.
// De cada pedido solo se guarda lo mínimo (orden, guía, estado, producto, valor, fechas):
// nada del cliente (nombre, teléfono, dirección) ni las facturas en PDF que Dropi manda dentro de la respuesta.
import sql from '@/lib/db'
import { parseOrdersJson, ordersPath } from './parse/pedidos.mjs'
import { grupoEstado, esCancelado, seImporta } from '@/domain/estadoPedido.ts'
import { logActivity } from '@/lib/activity'
import { hoyBogota, sumarDias } from '@/domain/fechas.ts'
import { calcularVentana, dentroDeOperacion } from '@/domain/ventana.ts'
import { inicioOperacion } from '@/lib/inicio'
import { PAGE_DELAY_MS } from './config.mjs'
import { DropiError, dropiRequest, inesperado } from './client'
import { getToken, recordReadFailure } from './session'
import { syncWalletRange } from './wallet-sync'

const BUDGET_MS = 40_000 // deja margen bajo los 60 s de la función
const ORDERS_PAGE = 25, MAX_ORDER_PAGES = 12 // la ventana es por fecha de CREACIÓN del pedido y parte del inicio de la operación: lo anterior no cuenta
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const jitter = () => PAGE_DELAY_MS[0] + Math.random() * (PAGE_DELAY_MS[1] - PAGE_DELAY_MS[0])
const EMPTY = /"objects"\s*:\s*\[\s*\]/
const userIdOf = (jwt) => { try { const s = JSON.parse(Buffer.from(String(jwt).split('.')[1], 'base64url').toString('utf8')).sub; return /^\d{1,12}$/.test(String(s)) ? String(s) : '' } catch { return '' } }
const coDay = (offset = 0) => sumarDias(hoyBogota(), offset)

export async function importOrderRows(uid, rows) {
  const data = rows.map((r) => ({ owner_id: uid, order_id: r.orderId, guide: r.guide || null, status: r.status, status_group: grupoEstado(r.status), product: r.product || null, product_ids: r.productIds || [], product_names: r.productNames || [], units: r.units ?? null, total: r.total, created_date: r.created, delivered_date: r.delivered, returned_date: r.returned }))
  if (!data.length) return { inserted: 0, updated: 0 }
  let inserted = 0, updated = 0
  await sql.begin(async (tx) => {
    for (let i = 0; i < data.length; i += 200) {
      const out = await tx`INSERT INTO dropi_orders ${tx(data.slice(i, i + 200), 'owner_id', 'order_id', 'guide', 'status', 'status_group', 'product', 'product_ids', 'product_names', 'units', 'total', 'created_date', 'delivered_date', 'returned_date')}
        ON CONFLICT (owner_id, order_id) DO UPDATE SET guide = EXCLUDED.guide, status = EXCLUDED.status, status_group = EXCLUDED.status_group, product = EXCLUDED.product, product_ids = EXCLUDED.product_ids, product_names = EXCLUDED.product_names, units = EXCLUDED.units, total = EXCLUDED.total,
          created_date = EXCLUDED.created_date, delivered_date = COALESCE(EXCLUDED.delivered_date, dropi_orders.delivered_date), returned_date = COALESCE(EXCLUDED.returned_date, dropi_orders.returned_date), synced_at = NOW()
        RETURNING (xmax = 0) AS fresh`
      for (const o of out) o.fresh ? inserted++ : updated++
    }
  })
  return { inserted, updated }
}

/** → { ok, pages, read, inserted, updated, window, error? }. Nunca lanza por errores de Dropi. */
export async function syncOrders(uid, { ip = '', win: ventana = null } = {}) {
  const inicio = await inicioOperacion(uid)
  const win = ventana || calcularVentana({ hoy: coDay(0), inicioOperacion: inicio, hayDatos: false }), rows = [], seen = new Set(), omitidas = new Set(), canceladas = new Set()
  let pages = 0, read = 0
  const t0 = Date.now()
  try {
    const token = await getToken(uid, { ip })
    const userId = userIdOf(token)
    if (!userId) throw new DropiError('unexpected', 'No pude identificar tu usuario de Dropi para leer los pedidos. Vuelve a conectar la cuenta.')
    for (let start = 0, n = 0; n < MAX_ORDER_PAGES && Date.now() - t0 < BUDGET_MS; start += ORDERS_PAGE, n++) {
      await sleep(jitter())
      const path = ordersPath({ userId, start, from: win.from, until: win.to, size: ORDERS_PAGE })
      const r = await dropiRequest('GET', path, { token })
      if (r.status === 401) throw new DropiError('blocked', 'Dropi no aceptó la sesión para leer los pedidos. Vuelve a sincronizar.')
      if (r.status !== 200) throw inesperado('los pedidos', r)
      if (EMPTY.test(r.text)) break
      const p = parseOrdersJson(r.text)
      if (p.error) throw new DropiError('unexpected', 'No se pudo leer la lista de pedidos.')
      pages++; read += p.total
      for (const x of p.rows) {
        if (seen.has(x.orderId)) continue
        seen.add(x.orderId)
        if (!dentroDeOperacion(x.created, inicio)) { omitidas.add(x.orderId); continue } // creado antes de empezar la operación
        if (!seImporta(x.status)) { omitidas.add(x.orderId); if (esCancelado(x.status)) canceladas.add(x.orderId); continue } // los cancelados no se traen
        rows.push(x)
      }
      if (p.total < ORDERS_PAGE) break
    }
    const imp = await importOrderRows(uid, rows)
    // Si un pedido que ya teníamos se canceló después, se quita. Los anteriores a la fecha de sincronización NO se tocan: las pantallas ya filtran por el inicio de la operación.
    const guardados = await sql`SELECT order_id, status FROM dropi_orders WHERE owner_id = ${uid}`
    const quitar = [...new Set([...canceladas, ...guardados.filter((g) => !seImporta(g.status)).map((g) => g.order_id)])]
    if (quitar.length) await sql`DELETE FROM dropi_orders WHERE owner_id = ${uid} AND order_id = ANY(${quitar})`
    // Si hay pedidos entregados ANTES de lo que cubre la billetera sincronizada, se lee la billetera de ese rango: así se sabe si los pagaron (y no se queda en «no verificable»).
    let backfill = null
    const [cov] = await sql`SELECT (SELECT MIN(delivered_date)::text FROM dropi_orders WHERE owner_id = ${uid} AND status = 'ENTREGADO') AS oldest, (SELECT MIN(tx_date)::text FROM wallet_movements WHERE owner_id = ${uid}) AS wfrom`
    if (cov.oldest && (!cov.wfrom || cov.oldest < cov.wfrom) && Date.now() - t0 < BUDGET_MS - 10_000) {
      const to = cov.wfrom || coDay(0), earliest = coDay(-90), from = cov.oldest < earliest ? earliest : cov.oldest
      try {
        backfill = { from, to, ...(await syncWalletRange(uid, token, from, to)) }
        // Lo consultado sin error cuenta como cubierto aunque ese rango no tuviera movimientos: se guarda hasta dónde llega la cobertura.
        await sql`INSERT INTO app_settings (owner_id, key, value) VALUES (${uid}, 'wallet_cover_from', ${from}) ON CONFLICT (owner_id, key) DO UPDATE SET value = LEAST(app_settings.value, EXCLUDED.value)`
      } catch (e) { backfill = { from, to, error: e instanceof DropiError ? e.message : 'No se pudo leer la billetera de ese rango.' } }
    }
    if (imp.inserted) await logActivity(uid, `Trajiste ${imp.inserted} pedidos nuevos de Dropi`)
    // Diagnóstico: cuántos pedidos hay por estado crudo de Dropi (para ver si algún estado nuevo cae en «otro»).
    const estados = {}
    for (const x of rows) estados[x.status] = (estados[x.status] || 0) + 1
    return { ok: true, pages, read, inserted: imp.inserted, updated: imp.updated, window: win, backfill, estados, omitidos: omitidas.size, canceladas: canceladas.size }
  } catch (e) {
    if (e instanceof DropiError) {
      // Una respuesta «inesperada» a la consulta de pedidos es un problema de la consulta, no abuso: no se pone la conexión en pausa (bloquearía la tarjeta y la billetera).
      if (e.code !== 'unexpected') await recordReadFailure(uid, e)
      else console.error('[dropi] pedidos', e.status || '')
      return { ok: false, pages, read, inserted: 0, updated: 0, window: win, error: { code: e.code, message: e.message } }
    }
    console.error('[dropi] pedidos', e && (e.code || e.name))
    return { ok: false, pages, read, inserted: 0, updated: 0, window: win, error: { code: 'unexpected', message: 'No se pudieron traer los pedidos.' } }
  }
}
