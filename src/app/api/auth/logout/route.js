import { NextResponse } from 'next/server'
import { guard } from '@/lib/http'
import { COOKIE_NAME } from '@/lib/auth/config.mjs'
import { verifySessionToken } from '@/lib/auth/token.mjs'
import { clearedCookieOptions, logAuthEvent, revokeSession } from '@/lib/auth/session'

export const runtime = 'nodejs'

/** Cierra la sesión: la revoca en BD (el JWT deja de servir de inmediato), borra la cookie y limpia caché/almacenamiento del navegador. */
export const POST = guard(async (request) => {
  const token = request.cookies.get(COOKIE_NAME)?.value
  const p = token ? await verifySessionToken(token).catch(() => null) : null
  if (p) {
    await revokeSession(p.jti, 'logout')
    await logAuthEvent(request, 'logout', Number(p.sub) || null)
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, '', clearedCookieOptions())
  res.headers.set('Clear-Site-Data', '"cache", "cookies", "storage"')
  return res
}, { auth: false })
