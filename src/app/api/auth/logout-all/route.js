import { NextResponse } from 'next/server'
import { guard } from '@/lib/http'
import { logAuthEvent, revokeAllForUser } from '@/lib/auth/session'
import { escribirCuentas, promover } from '@/lib/auth/cuentas'

export const runtime = 'nodejs'

/** Cierra TODAS las sesiones de este usuario (por ejemplo, si dejó abierta una en otro equipo). Las cuentas de otras personas abiertas en este navegador siguen. */
export const POST = guard(async (request, _ctx, session) => {
  await revokeAllForUser(session.userId, 'logout_all')
  await logAuthEvent(request, 'logout_all', session.userId)
  const otra = await promover(request, { excepto: session.userId })
  const res = NextResponse.json({ ok: true, siguiente: !!otra })
  if (otra) {
    escribirCuentas(res, otra.token, otra.resto)
    return res
  }
  escribirCuentas(res, null, [])
  // Sin "cookies": se borran solas las de sesión (escribirCuentas) y se conserva la de los dispositivos recordados (entrar con un clic la próxima vez).
  res.headers.set('Clear-Site-Data', '"cache", "storage"')
  return res
})
