import 'server-only'
// Confirmación de identidad para acciones delicadas (conectar o desconectar Dropi): contraseña de la app y, si el usuario tiene
// la verificación en dos pasos activa, un código vigente. Un cookie de sesión robado no basta. Los fallos se limitan por usuario.
import sql from '@/lib/db'
import { THROTTLE } from '@/lib/auth/config.mjs'
import { PASSWORD_MAX } from '@/lib/auth/policy.mjs'
import { verifyPassword } from '@/lib/auth/password.mjs'
import { checkSecondFactor } from '@/lib/auth/mfa'
import { lockedSeconds, recordFailure, clearFailures, throttleKey } from '@/lib/auth/session'

/** → null si confirmó su identidad, o { error, status } */
export async function confirmIdentity(uid, b) {
  const key = throttleKey('confirm', String(uid))
  const wait = await lockedSeconds([key])
  if (wait > 0) return { error: `Demasiados intentos. Espera ${Math.ceil(wait / 60)} min.`, status: 429 }
  const [u] = await sql`SELECT password_hash, totp_enabled_at FROM users WHERE id = ${uid} AND disabled_at IS NULL`
  const pw = typeof b?.appPassword === 'string' ? b.appPassword : ''
  const fail = async (error) => { await recordFailure(key, THROTTLE.maxPerPair); return { error, status: 400 } }
  if (!u || !pw || pw.length > PASSWORD_MAX || !(await verifyPassword(pw, u.password_hash))) return fail('Tu contraseña de la app no es correcta.')
  if (u.totp_enabled_at) {
    const r = await checkSecondFactor(uid, typeof b?.appCode === 'string' ? b.appCode.trim() : '')
    if (!r.ok) return fail('El código de tu app autenticadora no es correcto o ya se usó. Espera al siguiente.')
  }
  await clearFailures(key)
  return null
}
