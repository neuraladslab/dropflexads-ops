import 'server-only'
// Genera (y guarda) los 5 copies de Meta Ads de un creativo con la IA de la persona: misma clave cifrada, mismo tope mensual y mismo límite por hora que el asistente.
import sql from '@/lib/db'
import { setSetting } from '@/lib/settings'
import { logActivity } from '@/lib/activity'
import { lockedSeconds, recordFailure, throttleKey } from '@/lib/auth/session'
import { sumarUso, topeAlcanzado, mesDe, costoUsd } from '@/domain/ia.ts'
import { estadoIA, clienteDe, explicarError } from './asistente'
import { pedirCopies } from './copiasIA'

const SIN_TABLA = '42P01'

/** Los copies guardados de un creativo (de la persona dueña). null si falta la migración. */
export async function copiesDe(uid, creativoId) {
  try {
    const rows = await sql`SELECT position, formula, primary_text, headline, description, warnings, model, created_at FROM creative_copies WHERE owner_id = ${uid} AND creative_id = ${creativoId} ORDER BY position`
    return rows.map((r) => ({ n: r.position, formula: r.formula, principal: r.primary_text, titulo: r.headline, descripcion: r.description, avisos: r.warnings || [], modelo: r.model, creado: r.created_at }))
  } catch (e) { if (e && e.code === SIN_TABLA) return null; throw e }
}

/** Contexto que se le da al modelo: campaña, productos (nombres que ya trajo Dropi), ángulo, formato y gancho. Nada de datos personales ni de dinero. */
async function contextoDe(uid, c) {
  const [camp] = c.campaign_id ? await sql`SELECT name, product_ids FROM campaigns WHERE id = ${c.campaign_id} AND owner_id = ${uid}` : []
  const ids = (camp && camp.product_ids) || [], nombres = new Map()
  if (ids.length) {
    for (const r of await sql`SELECT product_ids, product_names FROM dropi_orders WHERE owner_id = ${uid} AND product_ids && ${ids}::text[] LIMIT 300`) (r.product_ids || []).forEach((id, i) => { if (ids.includes(id) && (r.product_names || [])[i]) nombres.set(id, r.product_names[i]) })
    for (const r of await sql`SELECT product_id, name FROM dropi_products WHERE owner_id = ${uid} AND product_id = ANY(${ids})`.catch(() => [])) if (!nombres.has(r.product_id)) nombres.set(r.product_id, r.name)
  }
  return { campana: (camp && camp.name) || c.campaign_label, productos: [...nombres.values()].slice(0, 6), angulo: c.angle, formato: c.format, gancho: c.hook }
}

/** → { ok, copies, avisos, costoUsd } | { ok:false, codigo, error }. Nunca lanza por la IA; reemplaza los copies anteriores solo si la nueva tanda llegó completa. */
export async function generarCopies(uid, creativoId) {
  const [c] = await sql`SELECT id, campaign_id, campaign_label, angle, format, hook FROM creatives WHERE id = ${creativoId} AND owner_id = ${uid}`
  if (!c) return { ok: false, codigo: 'datos', error: 'No encontré ese creativo.' }
  const mes = mesDe(), est = await estadoIA(uid), cfg = est.config
  if (!est.tieneClave) return { ok: false, codigo: 'sin_clave', error: 'Falta la clave de Anthropic. Agrégala en Configuración → Inteligencia artificial.' }
  if (topeAlcanzado(est.uso, mes, cfg.topeUsd)) return { ok: false, codigo: 'tope', error: `Llegaste al tope mensual de US$ ${cfg.topeUsd}. Súbelo en Configuración → Inteligencia artificial si quieres seguir.` }
  const llave = throttleKey('iacopies', uid)
  if ((await lockedSeconds([llave])) > 0) return { ok: false, codigo: 'limite', error: 'Generaste muchos copies seguidos. Espera unos minutos.' }
  await recordFailure(llave, 30, { windowSeconds: 3600, lockSeconds: 900 }) // 30 tandas por hora
  const client = await clienteDe(uid)
  if (!client) return { ok: false, codigo: 'sin_clave', error: 'No se pudo leer la clave guardada. Vuelve a guardarla en Configuración → Inteligencia artificial.' }

  const contexto = await contextoDe(uid, c), usos = [], gastado = () => usos.reduce((a, u) => a + costoUsd(cfg.modelo, u), 0)
  const guardarUso = async () => { let uso = est.uso; for (const u of usos) uso = sumarUso(uso, mes, cfg.modelo, u); if (usos.length) await setSetting(uid, 'ia_uso', JSON.stringify(uso)).catch(() => {}); return uso }
  try {
    const r = await pedirCopies({ client, modelo: cfg.modelo, contexto, alUsar: (u) => usos.push(u), antesDeLlamar: () => { if (est.uso.usd + gastado() >= cfg.topeUsd) throw Object.assign(new Error('tope'), { tope: true }) } })
    const uso = await guardarUso(), costo = Math.round(gastado() * 10000) / 10000
    if (r.rechazada) return { ok: false, codigo: 'rechazo', error: 'El modelo no pudo escribir copies para este creativo. Cambia el ángulo o el gancho y vuelve a intentar.', costoUsd: costo }
    if (r.ilegible || r.copies.length < 5) return { ok: false, codigo: 'vacio', error: 'La IA no devolvió los 5 copies en el formato esperado. Intenta de nuevo.', costoUsd: costo }
    await sql.begin(async (tx) => {
      await tx`DELETE FROM creative_copies WHERE creative_id = ${c.id} AND owner_id = ${uid}`
      for (const [i, k] of r.copies.entries()) await tx`INSERT INTO creative_copies (creative_id, position, owner_id, formula, primary_text, headline, description, warnings, model) VALUES (${c.id}, ${i + 1}, ${uid}, ${k.formula}, ${k.principal}, ${k.titulo}, ${k.descripcion}, ${k.avisos}, ${cfg.modelo})`
    })
    await logActivity(uid, `Generaste 5 copies de Meta Ads para el creativo ${c.id}`)
    return { ok: true, copies: await copiesDe(uid, c.id), costoUsd: costo, usoMes: { usd: uso.usd, topeUsd: cfg.topeUsd }, llamadas: r.llamadas }
  } catch (e) {
    await guardarUso()
    if (e && e.tope) return { ok: false, codigo: 'tope', error: `Se alcanzó el tope mensual de US$ ${cfg.topeUsd} durante la generación.` }
    if (e && e.code === SIN_TABLA) return { ok: false, codigo: 'migracion', error: 'Falta preparar la base de datos: ejecuta «npm run db:migrate» y vuelve a intentar.' }
    console.error('[ia] copies', e && (e.status || e.code || e.name), String((e && e.message) || '').slice(0, 200))
    return { ok: false, codigo: 'api', error: explicarError(e) }
  }
}
