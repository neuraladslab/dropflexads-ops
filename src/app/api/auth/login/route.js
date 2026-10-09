import { NextResponse } from 'next/server'
import sql from '@/lib/db'
import { guard, bad, readBody } from '@/lib/http'
import { COOKIE_NAME, GLOBAL_THROTTLE, MAX_CONCURRENT_VERIFY, THROTTLE } from '@/lib/auth/config.mjs'
import { PASSWORD_MAX } from '@/lib/auth/policy.mjs'
import { hashPassword, needsRehash, verifyPassword, burnVerification } from '@/lib/auth/password.mjs'
import { signMfaTicket } from '@/lib/auth/token.mjs'
import { clearFailures, clientIp, cookieOptions, createSession, isKnownIp, lockedSeconds, logAuthEvent, pruneAuthTables, recordFailure, rememberIp, throttleKey } from '@/lib/auth/session'

export const runtime = 'nodejs'

const GENERIC = 'Correo o contraseña incorrectos.'

function tooMany(seconds) {
  const res = bad(`Demasiados intentos. Espera ${Math.ceil(seconds / 60)} min e inténtalo de nuevo.`, 429, 'locked')
  res.headers.set('Retry-After', String(seconds))
  return res
}

// Verificaciones de contraseña en curso en esta instancia (cada una usa ≈128 MB y ≈250 ms de CPU).
let verifying = 0

export const POST = guard(async (request) => {
  const body = await readBody(request)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  if (!email || email.length > 254 || !password || password.length > PASSWORD_MAX) return bad('Escribe tu correo y tu contraseña.', 400)

  const ip = clientIp(request) || 'unknown'
  const ipKey = throttleKey('ip', ip)
  const pairKey = throttleKey('pair', email + '|' + ip) // esta cuenta desde esta IP
  const acctKey = throttleKey('acct', email) // contador de la cuenta sumando todas las IP: solo detecta un ataque distribuido
  const wait = await lockedSeconds([ipKey, pairKey, GLOBAL_THROTTLE.key]) // por IP, por cuenta+IP y el freno global
  if (wait > 0) {
    await logAuthEvent(request, 'login_locked')
    return tooMany(wait)
  }
  // Ataque distribuido contra esta cuenta: las IP nuevas esperan, pero el dueño sigue entrando desde donde ya inició sesión antes.
  const suspect = await lockedSeconds([acctKey])
  if (suspect > 0 && !(await isKnownIp(email, ip))) {
    await logAuthEvent(request, 'login_locked')
    return tooMany(suspect)
  }

  // Tope de verificaciones simultáneas: lo que pase de ahí recibe 429 al instante, sin gastar CPU ni memoria.
  if (verifying >= MAX_CONCURRENT_VERIFY) {
    const res = bad('El servidor está ocupado. Inténtalo de nuevo en unos segundos.', 429, 'busy')
    res.headers.set('Retry-After', '3')
    return res
  }
  verifying++
  let user, valid = false
  try {
    ;[user] = await sql`SELECT id, password_hash, totp_enabled_at FROM users WHERE lower(email) = ${email} AND disabled_at IS NULL`
    if (user) valid = await verifyPassword(password, user.password_hash)
    else await burnVerification(password) // mismo costo si la cuenta no existe: no se puede enumerar usuarios por tiempos
  } finally {
    verifying--
  }

  if (!valid) {
    await recordFailure(pairKey, THROTTLE.maxPerPair)
    await recordFailure(acctKey, THROTTLE.suspectAccount)
    await recordFailure(ipKey, THROTTLE.maxPerIp)
    await recordFailure(GLOBAL_THROTTLE.key, GLOBAL_THROTTLE.max, GLOBAL_THROTTLE)
    await pruneAuthTables()
    await logAuthEvent(request, 'login_fail', user?.id ?? null)
    return bad(GENERIC, 401)
  }

  if (needsRehash(user.password_hash)) {
    await sql`UPDATE users SET password_hash = ${await hashPassword(password)} WHERE id = ${user.id}`
  }
  // Con verificación en dos pasos activa NO se crea sesión: solo un ticket de 5 minutos para el segundo paso.
  if (user.totp_enabled_at) {
    await logAuthEvent(request, 'login_pw_ok_mfa', user.id)
    return NextResponse.json({ twoFactor: true, ticket: await signMfaTicket(user.id) })
  }
  await clearFailures(pairKey) // el contador de la cuenta NO se borra: si la están atacando, un acierto no debe reabrir la puerta
  await rememberIp(user.id, ip)
  const { token, maxAge } = await createSession(user.id, request.headers.get('user-agent') || '')
  await logAuthEvent(request, 'login_ok', user.id)

  const res = NextResponse.json({ ok: true, expiresAt: Date.now() + maxAge * 1000 })
  res.cookies.set(COOKIE_NAME, token, cookieOptions(maxAge))
  return res
}, { auth: false })
