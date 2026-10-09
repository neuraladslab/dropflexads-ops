import { NextResponse } from 'next/server'
import { guard, bad, readBody } from '@/lib/http'
import { COOKIE_NAME, MFA_THROTTLE } from '@/lib/auth/config.mjs'
import { verifyMfaTicket } from '@/lib/auth/token.mjs'
import { checkSecondFactor } from '@/lib/auth/mfa'
import { clearFailures, clientIp, cookieOptions, createSession, isKnownIp, lockedSeconds, logAuthEvent, recordFailure, rememberIp, throttleKey } from '@/lib/auth/session'
import sql from '@/lib/db'

export const runtime = 'nodejs'

const tooMany = (s) => {
  const res = bad(`Demasiados intentos. Espera ${Math.ceil(s / 60)} min e inténtalo de nuevo.`, 429, 'locked')
  res.headers.set('Retry-After', String(s))
  return res
}

/** Segundo paso del inicio de sesión: {ticket, code}. El ticket lo entrega /api/auth/login tras acertar la contraseña. */
export const POST = guard(async (request) => {
  const body = await readBody(request)
  const code = typeof body?.code === 'string' ? body.code.trim() : ''
  if (!code || code.length > 40) return bad('Escribe el código de 6 dígitos de tu app (o un código de recuperación).', 400)
  const uid = await verifyMfaTicket(body?.ticket)
  if (!uid) return bad('Tu verificación venció. Vuelve a escribir tu contraseña.', 401, 'mfa_expired')

  const ip = clientIp(request) || 'unknown'
  const pairKey = throttleKey('mfapair', uid + '|' + ip), acctKey = throttleKey('mfa', String(uid))
  const wait = await lockedSeconds([pairKey])
  if (wait > 0) { await logAuthEvent(request, 'mfa_locked', uid); return tooMany(wait) }
  // Ataque distribuido al segundo paso (alguien que ya tiene la contraseña): las IP nuevas esperan; las que ya iniciaron sesión, no.
  const suspect = await lockedSeconds([acctKey])
  if (suspect > 0) {
    const [u] = await sql`SELECT email FROM users WHERE id = ${uid}`
    if (!u || !(await isKnownIp(u.email.toLowerCase(), ip))) { await logAuthEvent(request, 'mfa_locked', uid); return tooMany(suspect) }
  }

  const r = await checkSecondFactor(uid, code)
  if (!r.ok) {
    await recordFailure(pairKey, MFA_THROTTLE.maxPerPair, MFA_THROTTLE)
    await recordFailure(acctKey, MFA_THROTTLE.suspect, MFA_THROTTLE)
    await logAuthEvent(request, 'mfa_fail', uid)
    if (r.broken) return bad('No se pudo leer el segundo paso guardado (el dato está dañado o la clave de cifrado cambió). Si cambiaste DATA_ENCRYPTION_KEY, migra los secretos con «npm run data:rekey»; solo como último recurso: npm run auth:2fa-reset.', 503)
    return bad('Código incorrecto o vencido. Revisa que la hora de tu teléfono sea automática.', 401)
  }
  // Contraseña (paso 1) y segundo paso (paso 2) correctos: ahora sí se abre la sesión.
  await clearFailures(pairKey)
  const [me] = await sql`SELECT email FROM users WHERE id = ${uid}`
  if (me) await clearFailures(throttleKey('pair', me.email.toLowerCase() + '|' + ip)) // también el contador de contraseña de esta IP
  await rememberIp(uid, ip)
  const { token, maxAge } = await createSession(uid, request.headers.get('user-agent') || '')
  await logAuthEvent(request, r.kind === 'recovery' ? 'login_ok_recovery' : 'login_ok', uid)
  const res = NextResponse.json({ ok: true, expiresAt: Date.now() + maxAge * 1000, recoveryLeft: r.kind === 'recovery' ? r.left : undefined })
  res.cookies.set(COOKIE_NAME, token, cookieOptions(maxAge))
  return res
}, { auth: false })
