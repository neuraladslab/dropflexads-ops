import sql from '@/lib/db'
import { guard, ok, bad, readBody, text } from '@/lib/http'
import { logActivity } from '@/lib/activity'
import { limpiarProductos } from '@/lib/campanas'

export const runtime = 'nodejs'

export const POST = guard(async (request, _ctx, session) => {
  const b = await readBody(request)
  const nombre = text(b && b.nombre, 120), productIds = limpiarProductos(b && b.productIds)
  if (!nombre) return bad('Escribe el nombre de la campaña.')
  if (!productIds || !productIds.length) return bad('Elige al menos un producto.')
  const [r] = await sql`INSERT INTO campaigns (owner_id, name, product_ids) VALUES (${session.userId}, ${nombre}, ${productIds}) RETURNING id`
  await logActivity(session.userId, `Creaste la campaña «${nombre}»`)
  return ok({ id: String(r.id) }, 201)
})
