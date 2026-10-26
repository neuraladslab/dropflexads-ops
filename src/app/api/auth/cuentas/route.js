import { NextResponse } from 'next/server'
import { guard, ok, bad, readBody } from '@/lib/http'
import { COOKIE_NAME } from '@/lib/auth/config.mjs'
import { logAuthEvent, revokeSession } from '@/lib/auth/session'
import { escribirCuentas, listarOtras } from '@/lib/auth/cuentas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const visible = (c) => ({ id: c.id, email: c.email, esSuperadmin: c.esSuperadmin, empresa: c.empresa })

/** Las cuentas abiertas en este navegador: la activa y las demás. Nunca devuelve tokens. */
export const GET = guard(async (request, _ctx, session) => {
  const otras = await listarOtras(request)
  return ok({
    activa: { id: session.sessionId, email: session.email, esSuperadmin: session.esSuperadmin, empresa: session.empresa ? session.empresa.nombre : null },
    otras: otras.map(visible),
  })
}, { passive: true })

/**
 * POST {action}
 *  · switch {id}  → la cuenta `id` pasa a ser la activa (la actual queda guardada). Recarga completa en el cliente.
 *  · remove {id}  → cierra la sesión de esa cuenta guardada y la quita de la lista.
 */
export const POST = guard(async (request) => {
  const b = (await readBody(request)) || {}
  if (!['switch', 'remove'].includes(b.action) || typeof b.id !== 'string' || !UUID.test(b.id)) return bad('Acción no válida.')
  const otras = await listarOtras(request)
  const destino = otras.find((c) => c.id === b.id)
  if (!destino) return bad('Esa cuenta ya no está abierta. Inicia sesión de nuevo.', 404)
  const resto = otras.filter((c) => c.id !== b.id).map((c) => c.token)
  const res = NextResponse.json({ ok: true })

  if (b.action === 'remove') {
    await revokeSession(destino.id, 'logout')
    await logAuthEvent(request, 'account_remove', destino.userId)
    escribirCuentas(res, request.cookies.get(COOKIE_NAME)?.value, resto)
    return res
  }
  // La cuenta actual pasa a la lista y la elegida queda activa.
  escribirCuentas(res, destino.token, [request.cookies.get(COOKIE_NAME)?.value, ...resto].filter(Boolean))
  await logAuthEvent(request, 'account_switch', destino.userId)
  return res
})
