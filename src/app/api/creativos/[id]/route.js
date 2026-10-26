import sql from '@/lib/db'
import { guard, ok, bad, readBody, isId } from '@/lib/http'
import { logActivity } from '@/lib/activity'
import { estadoValido, driveUrlLimpia } from '@/domain/creativos.ts'

export const runtime = 'nodejs'

/** PATCH {estado?, driveUrl?, gancho?, notas?, metaAdId?}. El nombre, el ángulo, el formato y la versión no se editan (el nombre es la llave con Meta y Drive).
 *  No hay DELETE: lo que ya no se usa se archiva, y el historial queda. */
export const PATCH = guard(async (request, ctx, session) => {
  const { id } = await ctx.params
  if (!isId(id)) return bad('Creativo no válido.', 404)
  const b = (await readBody(request)) || {}
  const [act] = await sql`SELECT id, name, status FROM creatives WHERE id = ${Number(id)} AND owner_id = ${session.ownerId}`
  if (!act) return bad('No encontré ese creativo.', 404)
  const campos = []
  let estado = null
  if (b.estado !== undefined) { if (!estadoValido(b.estado)) return bad('El estado no es válido.'); estado = b.estado; campos.push('estado') }
  let drive
  if (b.driveUrl !== undefined) { if (b.driveUrl === '' || b.driveUrl === null) drive = null; else { drive = driveUrlLimpia(b.driveUrl); if (!drive) return bad('El enlace de Drive debe ser https://drive.google.com/… o https://docs.google.com/…') } campos.push('drive') }
  const largo = (v, max) => (v === '' || v === null ? null : typeof v === 'string' && v.trim().length <= max ? v.trim() : undefined)
  const gancho = b.gancho !== undefined ? largo(b.gancho, 600) : undefined, notas = b.notas !== undefined ? largo(b.notas, 1000) : undefined
  if (gancho === undefined && b.gancho !== undefined) return bad('El gancho es demasiado largo (máximo 600 letras).')
  if (notas === undefined && b.notas !== undefined) return bad('Las notas son demasiado largas (máximo 1.000 letras).')
  if (b.gancho !== undefined) campos.push('gancho'); if (b.notas !== undefined) campos.push('notas')
  let adId
  if (b.metaAdId !== undefined) { if (b.metaAdId === '' || b.metaAdId === null) adId = null; else if (/^\d{5,40}$/.test(String(b.metaAdId))) adId = String(b.metaAdId); else return bad('El anuncio de Meta no es válido.'); campos.push('anuncio') }
  if (!campos.length) return bad('No hay nada que cambiar.')
  // Un anuncio de Meta solo se enlaza si existe en el gasto sincronizado de este usuario.
  if (adId) { const [e] = await sql`SELECT 1 AS x FROM meta_ad_spend_daily WHERE owner_id = ${session.ownerId} AND meta_ad_id = ${adId} LIMIT 1`; if (!e) return bad('Ese anuncio no aparece en el gasto sincronizado de Meta.') }
  await sql`UPDATE creatives SET
              status = COALESCE(${estado}, status),
              status_changed_at = CASE WHEN ${estado}::text IS NOT NULL AND ${estado}::text <> status THEN NOW() ELSE status_changed_at END,
              drive_url = CASE WHEN ${drive !== undefined} THEN ${drive ?? null} ELSE drive_url END,
              hook = CASE WHEN ${gancho !== undefined} THEN ${gancho ?? null} ELSE hook END,
              notes = CASE WHEN ${notas !== undefined} THEN ${notas ?? null} ELSE notes END,
              meta_ad_id = CASE WHEN ${adId !== undefined} THEN ${adId ?? null} ELSE meta_ad_id END,
              updated_at = NOW()
            WHERE id = ${Number(id)} AND owner_id = ${session.ownerId}`
  await logActivity(session.ownerId, `Cambiaste el creativo ${act.name}${estado && estado !== act.status ? `: de ${act.status} a ${estado}` : ` (${campos.join(', ')})`}`)
  return ok({ ok: true })
})
