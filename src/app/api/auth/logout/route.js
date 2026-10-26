import { NextResponse } from 'next/server'
import { guard } from '@/lib/http'
import { COOKIE_NAME } from '@/lib/auth/config.mjs'
import { verifySessionToken } from '@/lib/auth/token.mjs'
import { logAuthEvent, revokeSession } from '@/lib/auth/session'
import { escribirCuentas, promover } from '@/lib/auth/cuentas'

export const runtime = 'nodejs'

/**
 * Cierra la sesión de la cuenta activa: la revoca en BD (el JWT deja de servir de inmediato). Si hay otras cuentas abiertas en el navegador, la primera
 * pasa a ser la activa (`siguiente: true`) y no se borra nada más; si no, borra la cookie y limpia caché/almacenamiento del navegador.
 */
export const POST = guard(async (request) => {
  const token = request.cookies.get(COOKIE_NAME)?.value
  const p = token ? await verifySessionToken(token).catch(() => null) : null
  if (p) {
    await revokeSession(p.jti, 'logout')
    await logAuthEvent(request, 'logout', Number(p.sub) || null)
  }
  const otra = await promover(request)
  const res = NextResponse.json({ ok: true, siguiente: !!otra })
  if (otra) {
    escribirCuentas(res, otra.token, otra.resto)
    return res
  }
  escribirCuentas(res, null, [])
  // Sin "cookies": se borran solas las de sesión (escribirCuentas) y se conserva la de los dispositivos recordados (entrar con un clic la próxima vez).
  res.headers.set('Clear-Site-Data', '"cache", "storage"')
  return res
}, { auth: false })
