import { NextResponse } from 'next/server'
import { guard } from '@/lib/http'
import { COOKIE_NAME } from '@/lib/auth/config.mjs'
import { clearedCookieOptions, logAuthEvent, revokeAllForUser } from '@/lib/auth/session'

export const runtime = 'nodejs'

/** Cierra TODAS las sesiones del usuario (por ejemplo, si dejó abierta una en otro equipo). */
export const POST = guard(async (request, _ctx, session) => {
  await revokeAllForUser(session.userId, 'logout_all')
  await logAuthEvent(request, 'logout_all', session.userId)
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, '', clearedCookieOptions())
  res.headers.set('Clear-Site-Data', '"cache", "cookies", "storage"')
  return res
})
