import sql from '@/lib/db'
import { guard, ok, bad, readBody, isId, num } from '@/lib/http'

export const runtime = 'nodejs'

/** PATCH {mensual?, activa?} · DELETE. Solo toca herramientas del propio usuario. */
export const PATCH = guard(async (request, ctx, session) => {
  const { id } = await ctx.params
  if (!isId(id)) return bad('Herramienta no válida.', 404)
  const b = await readBody(request)
  const mensual = b && b.mensual !== undefined ? num(b.mensual, { min: 0, max: 1_000_000_000 }) : undefined
  if (b && b.mensual !== undefined && mensual == null) return bad('El valor mensual no es válido.')
  const activa = b && typeof b.activa === 'boolean' ? b.activa : undefined
  if (mensual === undefined && activa === undefined) return bad('No hay nada que cambiar.')
  const r = await sql`UPDATE fixed_costs SET monthly_amount = COALESCE(${mensual ?? null}, monthly_amount), active = COALESCE(${activa ?? null}, active)
                      WHERE id = ${Number(id)} AND owner_id = ${session.ownerId} RETURNING id`
  return r.length ? ok({ ok: true }) : bad('No encontré esa herramienta.', 404)
})

export const DELETE = guard(async (_req, ctx, session) => {
  const { id } = await ctx.params
  if (!isId(id)) return bad('Herramienta no válida.', 404)
  const r = await sql`DELETE FROM fixed_costs WHERE id = ${Number(id)} AND owner_id = ${session.ownerId} RETURNING id`
  return r.length ? ok({ ok: true }) : bad('No encontré esa herramienta.', 404)
})
