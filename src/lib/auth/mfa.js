import 'server-only'
// Verificación del segundo factor: código TOTP de la app autenticadora o un código de recuperación (de un solo uso).
import sql from '@/lib/db'
import { codeHash, decryptBound, encryptSecret } from './crypto.mjs'
import { normalizeRecovery, verifyTotp } from './totp.mjs'

/**
 * Comprueba `input` contra el 2FA del usuario. Devuelve { ok, kind: 'totp'|'recovery', left } o { ok:false }.
 * TOTP: el paso aceptado se anota de forma ATÓMICA (un código ya usado, o más viejo, no vale dos veces, ni en peticiones simultáneas).
 * Recuperación: se marca usado de forma atómica; cada código vale una sola vez.
 */
export async function checkSecondFactor(userId, input) {
  const [u] = await sql`SELECT totp_secret_enc, totp_enabled_at, totp_last_step FROM users WHERE id = ${userId} AND disabled_at IS NULL`
  if (!u || !u.totp_enabled_at || !u.totp_secret_enc) return { ok: false }
  const dec = decryptBound(u.totp_secret_enc, `user:${userId}:totp`)
  if (!dec) return { ok: false, broken: true }
  const secret = dec.value
  if (dec.legacy) await sql`UPDATE users SET totp_secret_enc = ${encryptSecret(secret, `user:${userId}:totp`)} WHERE id = ${userId}` // lo guardado antes se liga al usuario al usarlo // la clave de cifrado cambió: ver npm run auth:2fa-reset
  const recovery = normalizeRecovery(input)
  if (recovery) {
    const used = await sql`UPDATE recovery_codes SET used_at = NOW() WHERE user_id = ${userId} AND code_hash = ${codeHash(recovery)} AND used_at IS NULL RETURNING id`
    if (!used.length) return { ok: false }
    const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM recovery_codes WHERE user_id = ${userId} AND used_at IS NULL`
    return { ok: true, kind: 'recovery', left: n }
  }
  const step = verifyTotp(secret, input, { lastStep: u.totp_last_step })
  if (step === null) return { ok: false }
  const done = await sql`UPDATE users SET totp_last_step = ${step} WHERE id = ${userId} AND (totp_last_step IS NULL OR totp_last_step < ${step}) RETURNING id`
  return done.length ? { ok: true, kind: 'totp' } : { ok: false }
}
