import sql from '@/lib/db'
import { guard, ok, bad, readBody, text, num } from '@/lib/http'
import { logActivity } from '@/lib/activity'
import { limpiarProductos } from '@/lib/campanas'

export const runtime = 'nodejs'

export const POST = guard(async (request, _ctx, session) => {
  const b = await readBody(request)
  const nombre = text(b && b.nombre, 120), productIds = limpiarProductos(b && b.productIds)
  if (!nombre) return bad('Escribe el nombre de la campaña.')
  if (!productIds || !productIds.length) return bad('Elige al menos un producto.')
  const dev = b && b.devolucionPct != null ? num(b.devolucionPct, { min: 0, max: 100 }) : undefined
  if (b && b.devolucionPct != null && dev == null) return bad('El % de devolución debe estar entre 0 y 100.')
  const [r] = await sql`INSERT INTO campaigns (owner_id, name, product_ids) VALUES (${session.userId}, ${nombre}, ${productIds}) RETURNING id`
  if (dev !== undefined) await sql`UPDATE campaigns SET return_pct = ${dev} WHERE id = ${r.id} AND owner_id = ${session.userId}`
  await logActivity(session.userId, `Creaste la campaña «${nombre}»`)
  return ok({ id: String(r.id) }, 201)
})
