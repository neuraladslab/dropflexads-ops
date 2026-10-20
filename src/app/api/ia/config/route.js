import { guard, ok, bad, readBody } from '@/lib/http'
import { estadoIA, guardarClave, borrarClave, guardarConfig, guardarWorkspace } from '@/lib/ia/asistente'

export const runtime = 'nodejs'

/** La clave NUNCA vuelve al navegador: solo si existe y sus últimos 4 caracteres. */
export const GET = guard(async (_req, _ctx, session) => ok(await estadoIA(session.userId)))

/** PUT { clave?, modelo?, topeUsd? } */
export const PUT = guard(async (request, _ctx, session) => {
  const b = (await readBody(request)) || {}
  if (b.clave !== undefined) { const r = await guardarClave(session.userId, b.clave); if (!r.ok) return bad(r.error) }
  if (b.workspaceId !== undefined) { const r = await guardarWorkspace(session.userId, b.workspaceId); if (!r.ok) return bad(r.error) }
  if (b.modelo !== undefined || b.topeUsd !== undefined) { const act = (await estadoIA(session.userId)).config; const r = await guardarConfig(session.userId, { modelo: b.modelo ?? act.modelo, topeUsd: b.topeUsd ?? act.topeUsd }); if (!r.ok) return bad(r.error) }
  return ok(await estadoIA(session.userId))
})

export const DELETE = guard(async (_req, _ctx, session) => { await borrarClave(session.userId); return ok(await estadoIA(session.userId)) })
