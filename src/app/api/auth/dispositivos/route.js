import { NextResponse } from 'next/server'
import { guard, ok, bad, readBody } from '@/lib/http'
import { confirmIdentity } from '@/lib/auth/reauth'
import sql from '@/lib/db'
import { logAuthEvent } from '@/lib/auth/session'
import { conEntrada, escribirCookie, leerCookie, listar, olvidar, olvidarTodos, recordar } from '@/lib/auth/dispositivos'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Dispositivos recordados de la persona; `actual` = el de este navegador. */
export const GET = guard(async (request, _ctx, session) => {
  const aqui = new Set(leerCookie(request).map((e) => e.id))
  const lista = await listar(session.userId)
  return ok({ dispositivos: lista.map((d) => ({ ...d, actual: aqui.has(d.id) })) })
}, { passive: true })

/**
 * POST {action}
 *  · remember {appPassword, appCode?} → recuerda ESTE navegador (pide tu contraseña; no se puede con una contraseña inicial sin cambiar).
 *  · forget {id}                      → elimina un dispositivo.
 *  · forget_all                       → elimina todos.
 */
export const POST = guard(async (request, _ctx, session) => {
  const b = (await readBody(request)) || {}
  const lista = leerCookie(request)

  if (b.action === 'remember') {
    if (session.mustChange) return bad('Primero cambia tu contraseña.', 403, 'must_change')
    const id = await confirmIdentity(session.userId, b)
    if (id) return bad(id.error, id.status)
    const nuevo = await recordar(session.userId, session.role, request.headers.get('user-agent') || '')
    await logAuthEvent(request, 'device_remember', session.userId)
    const res = NextResponse.json({ ok: true })
    escribirCookie(res, await conEntrada(lista, nuevo, session.userId))
    return res
  }
  if (b.action === 'forget' && typeof b.id === 'string') {
    await olvidar(session.userId, b.id)
    await logAuthEvent(request, 'device_forget', session.userId)
    const res = NextResponse.json({ ok: true })
    escribirCookie(res, lista.filter((e) => e.id !== b.id.toLowerCase()))
    return res
  }
  if (b.action === 'forget_all') {
    await olvidarTodos(session.userId)
    await logAuthEvent(request, 'device_forget_all', session.userId)
    const res = NextResponse.json({ ok: true })
    const quedan = await sql`SELECT id FROM trusted_devices WHERE id = ANY(${lista.map((e) => e.id)})`
    const vivos = new Set(quedan.map((r) => r.id))
    escribirCookie(res, lista.filter((e) => vivos.has(e.id)))
    return res
  }
  return bad('Acción no válida.')
})
