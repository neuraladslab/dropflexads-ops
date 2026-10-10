import 'server-only'
// Sincroniza los movimientos de la BILLETERA de Dropi (GET /api/historywallet), con la misma sesión que acaba de usar la tarjeta: sin un inicio de sesión
// extra. Misma ventana (7 días antes de hoy hasta hoy), una petición a la vez y con pausa. Sin duplicados: cada movimiento se reconoce por su id en Dropi.
import sql from '@/lib/db'
import { parseWalletJson } from './parse/billetera.mjs'
import { logActivity } from '@/lib/activity'
import { PAGE_DELAY_MS } from './config.mjs'
import { DropiError, dropiRequest, inesperado } from './client'
import { getToken, recordReadFailure } from './session'
import { syncWindow } from './sync'

const WALLET_PAGE = 20, MAX_WALLET_PAGES = 15, MAX_ROWS = 2000
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const jitter = () => PAGE_DELAY_MS[0] + Math.random() * (PAGE_DELAY_MS[1] - PAGE_DELAY_MS[0])
const EMPTY = /"objects"\s*:\s*\[\s*\]/
const userIdOf = (jwt) => { try { const s = JSON.parse(Buffer.from(String(jwt).split('.')[1], 'base64url').toString('utf8')).sub; return /^\d{1,12}$/.test(String(s)) ? String(s) : '' } catch { return '' } }

/** Guarda movimientos de la billetera ya leídos. Se reconocen por su id en Dropi: los nuevos se agregan y los que Dropi cambió se actualizan. → { inserted, updated, unchanged } */
export async function importWalletRows(uid, rows, { batch = crypto.randomUUID() } = {}) {
  const data = rows.slice(0, MAX_ROWS).map((r) => ({
    owner_id: uid, external_id: r.externalId, tx_at: r.at, tx_date: r.date, direction: r.dir, amount: r.amount, balance_before: r.before, kind: r.kind,
    description: r.description || null, order_ref: r.orderRef || null, guide: r.guide || null, code: r.code || null, reverses: r.reverses || null, batch_id: batch,
  }))
  if (!data.length) return { inserted: 0, updated: 0, unchanged: 0 }
  let inserted = 0, updated = 0
  await sql.begin(async (tx) => {
    for (let i = 0; i < data.length; i += 500) {
      const out = await tx`INSERT INTO wallet_movements ${tx(data.slice(i, i + 500), 'owner_id', 'external_id', 'tx_at', 'tx_date', 'direction', 'amount', 'balance_before', 'kind', 'description', 'order_ref', 'guide', 'code', 'reverses', 'batch_id')}
        ON CONFLICT (owner_id, external_id) DO UPDATE SET tx_at = EXCLUDED.tx_at, tx_date = EXCLUDED.tx_date, direction = EXCLUDED.direction, amount = EXCLUDED.amount,
          balance_before = EXCLUDED.balance_before, kind = EXCLUDED.kind, description = EXCLUDED.description, order_ref = EXCLUDED.order_ref, guide = EXCLUDED.guide,
          code = EXCLUDED.code, reverses = EXCLUDED.reverses, batch_id = EXCLUDED.batch_id
        WHERE (wallet_movements.tx_at, wallet_movements.direction, wallet_movements.amount, wallet_movements.balance_before, wallet_movements.kind, wallet_movements.description,
               wallet_movements.order_ref, wallet_movements.guide, wallet_movements.code, wallet_movements.reverses)
              IS DISTINCT FROM (EXCLUDED.tx_at, EXCLUDED.direction, EXCLUDED.amount, EXCLUDED.balance_before, EXCLUDED.kind, EXCLUDED.description,
               EXCLUDED.order_ref, EXCLUDED.guide, EXCLUDED.code, EXCLUDED.reverses)
        RETURNING (xmax = 0) AS fresh`
      for (const o of out) o.fresh ? inserted++ : updated++
    }
  })
  return { inserted, updated, unchanged: data.length - inserted - updated }
}

/**
 * Lee la billetera de un RANGO de fechas (más atrás de la ventana normal de 7 días) con un token ya obtenido y la guarda. Lanza DropiError si algo falla;
 * quien llama decide. Se usa para verificar pedidos entregados hace más tiempo del que cubre la billetera sincronizada.
 */
export async function syncWalletRange(uid, token, from, to) {
  const userId = userIdOf(token)
  if (!userId) throw new DropiError('unexpected', 'No pude identificar tu usuario de Dropi para leer la billetera.')
  const rows = [], seen = new Set()
  for (let start = 0, n = 0; n < MAX_WALLET_PAGES; start += WALLET_PAGE, n++) {
    await sleep(jitter())
    const r = await dropiRequest('GET', `/api/historywallet?orderBy=id&orderDirection=desc&result_number=${WALLET_PAGE}&start=${start}&textToSearch=&type=null&id=null&identification_code=null&user_id=${userId}&from=${from}&until=${to}&wallet_id=0`, { token })
    if (r.status === 401) throw new DropiError('blocked', 'Dropi no aceptó la sesión para leer la billetera. Vuelve a sincronizar.')
    if (r.status !== 200) throw inesperado('la billetera', r)
    if (EMPTY.test(r.text)) break
    const p = parseWalletJson(r.text)
    if (p.error) throw new DropiError('unexpected', 'No se pudo leer la lista de movimientos de la billetera.')
    for (const x of p.rows) if (!seen.has(x.externalId)) { seen.add(x.externalId); rows.push(x) }
    if (p.total < WALLET_PAGE) break
  }
  const imp = await importWalletRows(uid, rows)
  return { read: rows.length, inserted: imp.inserted, updated: imp.updated }
}

/** → { ok, pages, read, inserted, unchanged, window, error? }. Nunca lanza por errores de Dropi. */
export async function syncWalletMovements(uid, { ip = '', win: ventana = null } = {}) {
  const win = ventana || await syncWindow(uid), rows = [], seen = new Set()
  let pages = 0, read = 0, skipped = 0
  try {
    const token = await getToken(uid, { ip })
    const userId = userIdOf(token)
    if (!userId) throw new DropiError('unexpected', 'No pude identificar tu usuario de Dropi para leer la billetera. Vuelve a conectar la cuenta.')
    for (let start = 0, n = 0; n < MAX_WALLET_PAGES; start += WALLET_PAGE, n++) {
      await sleep(jitter()) // también antes de la primera: viene justo después de la última página de la tarjeta
      const path = `/api/historywallet?orderBy=id&orderDirection=desc&result_number=${WALLET_PAGE}&start=${start}&textToSearch=&type=null&id=null&identification_code=null&user_id=${userId}&from=${win.from}&until=${win.to}&wallet_id=0`
      const r = await dropiRequest('GET', path, { token })
      if (r.status === 401) throw new DropiError('blocked', 'Dropi no aceptó la sesión para leer la billetera. Vuelve a sincronizar.')
      if (r.status !== 200) throw inesperado('la billetera', r)
      if (EMPTY.test(r.text)) break
      const p = parseWalletJson(r.text)
      if (p.error) throw new DropiError('unexpected', 'No se pudo leer la lista de movimientos de la billetera.')
      pages++; read += p.total; skipped += p.errors.length
      for (const x of p.rows) if (!seen.has(x.externalId)) { seen.add(x.externalId); rows.push(x) }
      if (p.total < WALLET_PAGE) break
    }
    const imp = await importWalletRows(uid, rows)
    if (imp.inserted || imp.updated) await logActivity(uid, `Sincronizaste la billetera de Dropi: ${imp.inserted} movimientos nuevos` + (imp.updated ? `, ${imp.updated} actualizados` : ''))
    return { ok: true, pages, read, skipped, inserted: imp.inserted, updated: imp.updated, unchanged: imp.unchanged, window: win }
  } catch (e) {
    if (e instanceof DropiError) { await recordReadFailure(uid, e); return { ok: false, pages, read, inserted: 0, window: win, error: { code: e.code, message: e.message } } }
    console.error('[dropi] billetera', e && (e.code || e.name))
    return { ok: false, pages, read, inserted: 0, window: win, error: { code: 'unexpected', message: 'No se pudo sincronizar la billetera.' } }
  }
}
