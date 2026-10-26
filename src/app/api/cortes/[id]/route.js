import sql from '@/lib/db'
import { guard, ok, bad, readBody } from '@/lib/http'
import { logActivity } from '@/lib/activity'
import { datosCortes, fotoDe } from '@/lib/datos'

export const runtime = 'nodejs'

/**
 * POST {nota?} → sella el corte que cierra el día `id`: guarda una foto de sus cifras. Lo sellado nunca se modifica ni se borra: volver a sellar crea una versión nueva.
 * Las cifras las calcula el servidor (no se aceptan del navegador). Solo se puede sellar un corte que ya terminó.
 */
export const POST = guard(async (request, ctx, session) => {
  const { id } = await ctx.params
  if (!/^\d{4}-\d{2}-\d{2}$/.test(id)) return bad('Corte no válido.', 404)
  const b = (await readBody(request)) || {}
  const nota = typeof b.nota === 'string' ? b.nota.trim().slice(0, 300) || null : null
  const d = await datosCortes(session.ownerId)
  const c = d.cortes.find((x) => x.id === id)
  if (!c) return bad('No encontré ese corte.', 404)
  if (c.abierto) return bad('Este corte todavía no termina: se puede sellar después de su último día.')
  if (!d.cierresListos) return bad('Falta aplicar la actualización de la base de datos (npm run db:migrate) para poder sellar cortes.', 409)
  const foto = fotoDe(c)
  // La versión se calcula como MAX+1; si dos sellados llegan a la vez la restricción única lo detecta (23505) y se reintenta una vez en vez de responder con un error.
  const insertar = () => sql`
    INSERT INTO cut_closures (owner_id, period_start, period_end, version, snapshot, note)
    VALUES (${session.ownerId}, ${c.desde}, ${c.hasta}, COALESCE((SELECT MAX(version) FROM cut_closures WHERE owner_id = ${session.ownerId} AND period_end = ${c.hasta}), 0) + 1, ${sql.json(foto)}, ${nota})
    RETURNING version`
  let r
  try { [r] = await insertar() } catch (e) { if (e && e.code === '23505') [r] = await insertar(); else throw e }
  await logActivity(session.ownerId, `Sellaste el corte ${c.desde} → ${c.hasta} (versión ${r.version})`)
  return ok({ version: r.version }, 201)
})
