import { NextResponse } from 'next/server'
import sql from '@/lib/db'
import { guard, bad, readBody } from '@/lib/http'
import { COOKIE_NAME, THROTTLE } from '@/lib/auth/config.mjs'
import { PASSWORD_MAX, validatePassword } from '@/lib/auth/policy.mjs'
import { BREACH_MESSAGE, breachCount } from '@/lib/auth/breach.mjs'
import { hashPassword, verifyPassword } from '@/lib/auth/password.mjs'
import { clearedCookieOptions, clearFailures, logAuthEvent, lockedSeconds, recordFailure, revokeAllForUser, throttleKey } from '@/lib/auth/session'

export const runtime = 'nodejs'

/** Cambia la contraseña: exige la actual, aplica la política y CIERRA TODAS las sesiones (también la actual) y olvida los dispositivos recordados. */
export const POST = guard(async (request, _ctx, session) => {
  const body = await readBody(request)
  const current = typeof body?.current === 'string' ? body.current : ''
  const next = typeof body?.next === 'string' ? body.next : ''
  if (!current || current.length > PASSWORD_MAX) return bad('Escribe tu contraseña actual.', 400)

  const key = throttleKey('pw', String(session.userId)) // por usuario autenticado: un tercero sin sesión no puede bloquearlo
  const wait = await lockedSeconds([key])
  if (wait > 0) return bad(`Demasiados intentos. Espera ${Math.ceil(wait / 60)} min.`, 429, 'locked')

  const [user] = await sql`SELECT id, email, password_hash FROM users WHERE id = ${session.userId} AND disabled_at IS NULL`
  if (!user || !(await verifyPassword(current, user.password_hash))) {
    await recordFailure(key, THROTTLE.maxPerPair)
    await logAuthEvent(request, 'password_fail', session.userId)
    return bad('La contraseña actual no es correcta.', 400)
  }
  const problem = validatePassword(next, user.email)
  if (problem) return bad(problem, 400)
  const breached = await breachCount(next)
  if (breached > 0) return bad(BREACH_MESSAGE(breached), 400)
  if (next === current) return bad('La contraseña nueva debe ser distinta de la actual.', 400)

  await sql`UPDATE users SET password_hash = ${await hashPassword(next)}, password_changed_at = NOW(), must_change_password = FALSE WHERE id = ${user.id}`
  await sql`DELETE FROM trusted_devices WHERE user_id = ${user.id}` // los dispositivos recordados dejan de valer con la contraseña anterior
  await clearFailures(key)
  await revokeAllForUser(user.id, 'password_change')
  await logAuthEvent(request, 'password_change', user.id)

  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, '', clearedCookieOptions())
  res.headers.set('Clear-Site-Data', '"cache", "cookies", "storage"')
  return res
})
