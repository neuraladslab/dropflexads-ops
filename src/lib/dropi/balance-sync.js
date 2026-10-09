import 'server-only'
// Lee el saldo DISPONIBLE de la tarjeta tal como lo informa Dropi (GET /api/credit-cards/balances/{tarjeta} → objects.saldo_disponible) y lo guarda con su hora.
// Es la fuente de verdad del disponible: la app ya no lo calcula a partir de los movimientos. Una sola petición, con la sesión que la sincronización ya usó.
import sql from '@/lib/db'
import { CARD_ID_RE } from './config.mjs'
import { DropiError, dropiRequest } from './client'
import { dec, getToken, recordReadFailure } from './session'

/** Respuesta de Dropi → número, o null si no trae un saldo válido. */
export function parseBalance(text) {
  let j
  try { j = JSON.parse(text) } catch { return null }
  const v = j && j.objects && j.objects.saldo_disponible
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isFinite(n) && Math.abs(n) < 1e12 ? Math.round(n * 100) / 100 : null
}

/** → { ok, amount?, readAt?, error? }. Nunca lanza por errores de Dropi. */
export async function syncCardBalance(uid, { ip = '' } = {}) {
  try {
    const [c] = await sql`SELECT card_id_enc FROM dropi_connections WHERE owner_id = ${uid}`
    const cardId = c && dec(uid, 'card', c.card_id_enc)
    if (!cardId || !CARD_ID_RE.test(cardId)) throw new DropiError('reauth', 'No se pudo leer el ID de la tarjeta guardado. Vuelve a conectar tu cuenta.')
    const token = await getToken(uid, { ip })
    const r = await dropiRequest('GET', `/api/credit-cards/balances/${cardId}`, { token })
    if (r.status === 401) throw new DropiError('blocked', 'Dropi no aceptó la sesión para leer el saldo.')
    if (r.status !== 200) throw new DropiError('unexpected', 'Dropi respondió algo inesperado al leer el saldo.', { status: r.status })
    const amount = parseBalance(r.text)
    if (amount == null) throw new DropiError('unexpected', 'Dropi no devolvió el saldo disponible.')
    const [row] = await sql`INSERT INTO dropi_balances (owner_id, account, amount) VALUES (${uid}, 'card', ${amount}) RETURNING read_at`
    return { ok: true, amount, readAt: new Date(row.read_at).getTime() }
  } catch (e) {
    if (e instanceof DropiError) { await recordReadFailure(uid, e); return { ok: false, error: { code: e.code, message: e.message } } }
    console.error('[dropi] saldo', e && (e.code || e.name))
    return { ok: false, error: { code: 'unexpected', message: 'No se pudo leer el saldo de la tarjeta.' } }
  }
}

/** Último saldo leído de Dropi: { amount, readAt (ms) } o null. */
export async function latestCardBalance(uid) {
  const [r] = await sql`SELECT amount::float8 AS amount, read_at FROM dropi_balances WHERE owner_id = ${uid} AND account = 'card' ORDER BY read_at DESC, id DESC LIMIT 1`
  return r ? { amount: r.amount, readAt: new Date(r.read_at).getTime() } : null
}
