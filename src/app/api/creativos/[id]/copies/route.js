import { guard, ok, bad, isId } from '@/lib/http'
import { copiesDe, generarCopies } from '@/lib/ia/copies'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const HTTP = { sin_clave: 409, tope: 429, limite: 429, datos: 404, rechazo: 422, vacio: 502, api: 502, migracion: 409 }

/** Los copies guardados de un creativo. */
export const GET = guard(async (_request, { params }, session) => {
  const { id } = await params
  if (!isId(id)) return bad('Creativo no válido.')
  const copies = await copiesDe(session.ownerId, Number(id))
  if (copies === null) return bad('Falta preparar la base de datos: ejecuta «npm run db:migrate».', 409, 'migracion')
  return ok({ copies })
})

/** Genera 5 copies nuevos (reemplazan los anteriores) con la IA de la persona. */
export const POST = guard(async (_request, { params }, session) => {
  const { id } = await params
  if (!isId(id)) return bad('Creativo no válido.')
  const r = await generarCopies(session.ownerId, Number(id))
  return r.ok ? ok(r) : Response.json({ error: r.error, code: r.codigo }, { status: HTTP[r.codigo] || 502 })
})
