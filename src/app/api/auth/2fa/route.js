import qrcode from 'qrcode-generator'
import sql from '@/lib/db'
import { guard, ok, bad, readBody } from '@/lib/http'
import { THROTTLE } from '@/lib/auth/config.mjs'
import { PASSWORD_MAX } from '@/lib/auth/policy.mjs'
import { verifyPassword } from '@/lib/auth/password.mjs'
import { codeHash, decryptBound, encryptSecret } from '@/lib/auth/crypto.mjs'
import { generateRecoveryCodes, generateSecret, otpauthUri, verifyTotp } from '@/lib/auth/totp.mjs'
import { checkSecondFactor } from '@/lib/auth/mfa'
import { clearFailures, logAuthEvent, lockedSeconds, recordFailure, revokeOthers, throttleKey } from '@/lib/auth/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const qrSvg = (text) => {
  const q = qrcode(0, 'M'); q.addData(text); q.make()
  return q.createSvgTag({ cellSize: 6, margin: 2, scalable: true })
}

/** Estado de la verificación en dos pasos del usuario. */
export const GET = guard(async (_request, _ctx, session) => {
  const [u] = await sql`SELECT totp_enabled_at FROM users WHERE id = ${session.userId}`
  const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM recovery_codes WHERE user_id = ${session.userId} AND used_at IS NULL`
  return ok({ enabled: !!u?.totp_enabled_at, enabledAt: u?.totp_enabled_at ? new Date(u.totp_enabled_at).getTime() : null, recoveryLeft: u?.totp_enabled_at ? n : 0 })
})

async function newRecoveryCodes(tx, userId) {
  const codes = generateRecoveryCodes(10)
  await tx`DELETE FROM recovery_codes WHERE user_id = ${userId}`
  for (const c of codes) await tx`INSERT INTO recovery_codes (user_id, code_hash) VALUES (${userId}, ${codeHash(c)})`
  return codes
}

/**
 * POST {action, …}
 *  · setup {password}           → crea un secreto PENDIENTE y devuelve el QR y la clave para la app (aún no protege nada).
 *  · enable {code}              → comprueba el primer código, activa el segundo paso y entrega los códigos de recuperación (una sola vez).
 *  · disable {password, code}   → lo desactiva (exige contraseña Y un código válido).
 *  · recovery {password, code}  → genera códigos de recuperación nuevos (los anteriores dejan de valer).
 * Todo exige sesión; las acciones sensibles piden además la contraseña (un cookie robado no basta). Se limitan los intentos por usuario.
 */
export const POST = guard(async (request, _ctx, session) => {
  const uid = session.userId
  const b = await readBody(request)
  const action = b?.action
  if (!['setup', 'enable', 'disable', 'recovery'].includes(action)) return bad('Acción no válida.')
  const key = throttleKey('mfaman', String(uid))
  const wait = await lockedSeconds([key])
  if (wait > 0) return bad(`Demasiados intentos. Espera ${Math.ceil(wait / 60)} min.`, 429, 'locked')
  const fail = async (msg, status = 400) => { await recordFailure(key, THROTTLE.maxPerPair); await logAuthEvent(request, '2fa_fail', uid); return bad(msg, status) }

  const [u] = await sql`SELECT id, email, password_hash, totp_enabled_at, totp_pending_enc, totp_secret_enc FROM users WHERE id = ${uid} AND disabled_at IS NULL`
  if (!u) return bad('Usuario no encontrado.', 404)
  const needPassword = async () => {
    const pw = typeof b.password === 'string' ? b.password : ''
    return pw && pw.length <= PASSWORD_MAX && (await verifyPassword(pw, u.password_hash))
  }

  if (action === 'setup') {
    if (u.totp_enabled_at) return bad('La verificación en dos pasos ya está activa.', 409)
    if (!(await needPassword())) return fail('La contraseña no es correcta.')
    const secret = generateSecret()
    await sql`UPDATE users SET totp_pending_enc = ${encryptSecret(secret, `user:${uid}:totp`)} WHERE id = ${uid}`
    const uri = otpauthUri(u.email, secret)
    return ok({ secret, uri, qr: qrSvg(uri) })
  }

  if (action === 'enable') {
    if (u.totp_enabled_at) return bad('La verificación en dos pasos ya está activa.', 409)
    const pend = u.totp_pending_enc ? decryptBound(u.totp_pending_enc, `user:${uid}:totp`) : null
    const secret = pend ? pend.value : null
    if (!secret) return bad('Empieza de nuevo: genera el código QR otra vez.', 409)
    const step = verifyTotp(secret, b.code)
    if (step === null) return fail('Ese código no coincide. Revisa que la hora de tu teléfono sea automática y escribe el código actual.')
    const codes = await sql.begin(async (tx) => {
      await tx`UPDATE users SET totp_secret_enc = ${encryptSecret(secret, `user:${uid}:totp`)}, totp_pending_enc = NULL, totp_enabled_at = NOW(), totp_last_step = ${step} WHERE id = ${uid}`
      return newRecoveryCodes(tx, uid)
    })
    await revokeOthers(uid, session.sessionId, '2fa_enabled') // las demás sesiones se abrieron sin segundo paso
    await clearFailures(key)
    await logAuthEvent(request, '2fa_enabled', uid)
    return ok({ enabled: true, recoveryCodes: codes })
  }

  // disable / recovery: requieren el segundo paso activo, la contraseña y un código válido.
  if (!u.totp_enabled_at) return bad('La verificación en dos pasos no está activa.', 409)
  if (!(await needPassword())) return fail('La contraseña no es correcta.')
  const r = await checkSecondFactor(uid, typeof b.code === 'string' ? b.code.trim() : '')
  if (!r.ok) return fail('Ese código no es correcto o ya se usó. Espera al siguiente código de tu app.')

  if (action === 'disable') {
    await sql.begin(async (tx) => {
      await tx`UPDATE users SET totp_secret_enc = NULL, totp_pending_enc = NULL, totp_enabled_at = NULL, totp_last_step = NULL WHERE id = ${uid}`
      await tx`DELETE FROM recovery_codes WHERE user_id = ${uid}`
    })
    await revokeOthers(uid, session.sessionId, '2fa_disabled')
    await clearFailures(key)
    await logAuthEvent(request, '2fa_disabled', uid)
    return ok({ enabled: false })
  }
  const codes = await sql.begin((tx) => newRecoveryCodes(tx, uid))
  await clearFailures(key)
  await logAuthEvent(request, '2fa_recovery_regenerated', uid)
  return ok({ recoveryCodes: codes })
})
