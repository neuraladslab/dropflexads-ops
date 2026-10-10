import sql from '@/lib/db'
import { guard, ok, bad, readBody, text, num } from '@/lib/http'
import { logActivity } from '@/lib/activity'

export const runtime = 'nodejs'

/** Herramientas de operación: costos fijos mensuales (ChatePro, API de WhatsApp, IA…). Se reparten por día en la contabilidad. */
export const GET = guard(async (_req, _ctx, session) => {
  const rows = await sql`SELECT id, name, monthly_amount::float8 AS monthly, active FROM fixed_costs WHERE owner_id = ${session.userId} ORDER BY created_at, id`
  return ok(rows.map((r) => ({ id: String(r.id), nombre: r.name, mensual: r.monthly, activa: r.active })))
})

export const POST = guard(async (request, _ctx, session) => {
  const b = await readBody(request)
  const nombre = text(b && b.nombre, 80), mensual = num(b && b.mensual, { min: 0, max: 1_000_000_000 })
  if (!nombre) return bad('Escribe el nombre de la herramienta.')
  if (mensual == null) return bad('El valor mensual no es válido.')
  const [r] = await sql`INSERT INTO fixed_costs (owner_id, name, monthly_amount) VALUES (${session.userId}, ${nombre}, ${mensual}) RETURNING id`
  await logActivity(session.userId, `Agregaste la herramienta «${nombre}»`)
  return ok({ id: String(r.id) }, 201)
})
