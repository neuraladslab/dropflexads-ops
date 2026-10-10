import 'server-only'
// Cada campaña de Meta queda asignada a una campaña de Ops: si ya hay una con el mismo nombre se une a ella; si no, se crea (sin productos, para que los asignes después).
import sql from '@/lib/db'
import { hoyBogota, sumarDias } from '@/domain/fechas.ts'

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

/** → { unidas, creadas }. Idempotente. La campaña nueva queda activa solo si Meta gastó en ella en los últimos 3 días. */
export async function vincularCampanasMeta(uid) {
  const metas = await sql`SELECT meta_campaign_id AS id, (array_agg(campaign_name ORDER BY day DESC))[1] AS nombre, max(day)::text AS ultimo FROM meta_spend_daily WHERE owner_id = ${uid} GROUP BY 1`
  const camps = await sql`SELECT id, name, meta_campaign_id FROM campaigns WHERE owner_id = ${uid} ORDER BY created_at, id`
  const usadas = new Set(camps.filter((c) => c.meta_campaign_id).map((c) => c.meta_campaign_id))
  const libres = camps.filter((c) => !c.meta_campaign_id)
  const activaDesde = sumarDias(hoyBogota(), -3)
  let unidas = 0, creadas = 0
  for (const m of metas) {
    if (usadas.has(m.id)) continue
    const nombre = String(m.nombre || '').trim() || 'Campaña ' + m.id
    const i = libres.findIndex((c) => norm(c.name) === norm(nombre))
    if (i >= 0) { const [c] = libres.splice(i, 1); await sql`UPDATE campaigns SET meta_campaign_id = ${m.id} WHERE id = ${c.id} AND owner_id = ${uid}`; unidas++ }
    else { await sql`INSERT INTO campaigns (owner_id, name, active, meta_campaign_id) VALUES (${uid}, ${nombre.slice(0, 120)}, ${m.ultimo >= activaDesde}, ${m.id})`; creadas++ }
  }
  return { unidas, creadas }
}
