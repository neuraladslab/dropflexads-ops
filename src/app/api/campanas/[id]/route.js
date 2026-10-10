import sql from '@/lib/db'
import { guard, ok, bad, readBody, isId, text } from '@/lib/http'
import { logActivity } from '@/lib/activity'
import { limpiarProductos } from '@/lib/campanas'

export const runtime = 'nodejs'

/** PATCH {nombre?, activa?, productIds?} · DELETE. Solo toca campañas del propio usuario. */
export const PATCH = guard(async (request, ctx, session) => {
  const { id } = await ctx.params
  if (!isId(id)) return bad('Campaña no válida.', 404)
  const b = (await readBody(request)) || {}
  const nombre = b.nombre !== undefined ? text(b.nombre, 120) : undefined
  const productIds = b.productIds !== undefined ? limpiarProductos(b.productIds) : undefined
  const activa = typeof b.activa === 'boolean' ? b.activa : undefined
  if (b.nombre !== undefined && !nombre) return bad('Escribe el nombre de la campaña.')
  if (b.productIds !== undefined && (!productIds || !productIds.length)) return bad('Elige al menos un producto.')
  if (nombre === undefined && productIds === undefined && activa === undefined) return bad('No hay nada que cambiar.')
  const r = await sql`UPDATE campaigns SET name = COALESCE(${nombre ?? null}, name), product_ids = COALESCE(${productIds ?? null}, product_ids), active = COALESCE(${activa ?? null}, active)
                      WHERE id = ${Number(id)} AND owner_id = ${session.userId} RETURNING name`
  if (!r.length) return bad('No encontré esa campaña.', 404)
  await logActivity(session.userId, `Cambiaste la campaña «${r[0].name}»`)
  return ok({ ok: true })
})

export const DELETE = guard(async (_req, ctx, session) => {
  const { id } = await ctx.params
  if (!isId(id)) return bad('Campaña no válida.', 404)
  const r = await sql`DELETE FROM campaigns WHERE id = ${Number(id)} AND owner_id = ${session.userId} RETURNING name`
  if (!r.length) return bad('No encontré esa campaña.', 404)
  await logActivity(session.userId, `Eliminaste la campaña «${r[0].name}»`)
  return ok({ ok: true })
})
