import sql from '@/lib/db'
import { guard, ok, bad, readBody, isId } from '@/lib/http'
import { logActivity } from '@/lib/activity'

export const runtime = 'nodejs'

const MAX_IDS = 500

/** POST {action:'ignore', ids:[…], ignored:boolean} → marca (o desmarca) movimientos de la tarjeta para que no cuenten en la contabilidad. No borra nada y la sincronización no deshace la marca. */
export const POST = guard(async (request, _ctx, session) => {
  const uid = session.ownerId, b = await readBody(request)
  if (!b || b.action !== 'ignore' || typeof b.ignored !== 'boolean') return bad('Acción no válida.')
  if (!Array.isArray(b.ids) || !b.ids.length || b.ids.length > MAX_IDS || !b.ids.every(isId)) return bad(`Indica entre 1 y ${MAX_IDS} movimientos.`)
  const ids = b.ids.map(Number)
  const rows = await sql`UPDATE card_transactions SET ignored = ${b.ignored} WHERE owner_id = ${uid} AND id = ANY(${ids}) AND ignored IS DISTINCT FROM ${b.ignored} RETURNING id`
  if (rows.length) await logActivity(uid, `${b.ignored ? 'Dejaste de contar' : 'Volviste a contar'} ${rows.length} ${rows.length === 1 ? 'movimiento' : 'movimientos'} de la tarjeta`)
  return ok({ updated: rows.length })
})
