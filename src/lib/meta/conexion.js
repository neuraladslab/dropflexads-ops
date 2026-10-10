import 'server-only'
import sql from '@/lib/db'
import { encryptSecret, decryptSecret } from '@/lib/auth/crypto.mjs'
import { metaGet } from './client'

const VERSION = 'v23.0'
const aad = (uid) => `meta:${uid}:token`

/** Estado de la conexión sin el token. */
export async function leerConexion(uid) {
  const [c] = await sql`SELECT ad_account_id, account_name, currency, timezone, token_hint, vat_pct::float8 AS vat, api_version, state, last_sync_at, last_sync_ok_at, last_error, (sync_started_at IS NOT NULL AND sync_started_at > NOW() - interval '2 minutes') AS syncing FROM meta_connections WHERE owner_id = ${uid}`
  return c || null
}
export async function tokenDe(uid) {
  const [c] = await sql`SELECT token_enc, api_version FROM meta_connections WHERE owner_id = ${uid}`
  return c ? { token: decryptSecret(c.token_enc, aad(uid)), version: c.api_version || VERSION } : null
}

/** Valida el token pidiendo los datos de la cuenta (solo lectura) y, si sirve, lo guarda cifrado. Lanza MetaError si Meta lo rechaza. */
export async function conectarMeta(uid, { cuenta, token, vatPct }) {
  const info = await metaGet(token, VERSION, cuenta, { fields: 'name,currency,account_status,timezone_name' })
  const hint = '…' + token.slice(-4)
  await sql`INSERT INTO meta_connections (owner_id, ad_account_id, account_name, currency, timezone, token_enc, token_hint, vat_pct, api_version, state, last_error)
            VALUES (${uid}, ${cuenta}, ${String(info.name || '').slice(0, 120) || null}, ${String(info.currency || '').slice(0, 8) || null}, ${String(info.timezone_name || '').slice(0, 60) || null},
                    ${encryptSecret(token, aad(uid))}, ${hint}, ${vatPct}, ${VERSION}, 'ok', NULL)
            ON CONFLICT (owner_id) DO UPDATE SET ad_account_id = EXCLUDED.ad_account_id, account_name = EXCLUDED.account_name, currency = EXCLUDED.currency, timezone = EXCLUDED.timezone,
              token_enc = EXCLUDED.token_enc, token_hint = EXCLUDED.token_hint, vat_pct = EXCLUDED.vat_pct, state = 'ok', last_error = NULL, sync_started_at = NULL, updated_at = NOW()`
  return { nombre: info.name || null, moneda: info.currency || null, estadoCuenta: info.account_status }
}

export const desconectarMeta = (uid) => sql`DELETE FROM meta_connections WHERE owner_id = ${uid} RETURNING owner_id`
export const guardarIva = (uid, pct) => sql`UPDATE meta_connections SET vat_pct = ${pct}, updated_at = NOW() WHERE owner_id = ${uid} RETURNING owner_id`
