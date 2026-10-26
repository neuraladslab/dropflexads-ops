import sql from '@/lib/db'
import { guard, ok, bad, readBody, isId, isDate, text } from '@/lib/http'
import { logActivity } from '@/lib/activity'
import { hoyBogota } from '@/domain/fechas.ts'
import { nombreCreativo, siguienteVersion, formatoValido, estadoValido, driveUrlLimpia, tramo } from '@/domain/creativos.ts'

export const runtime = 'nodejs'

/** POST {campanaId, angulo, formato, fecha?, estado?, driveUrl?, gancho?, notas?}. El nombre y la versión los calcula el servidor: así nunca hay dos iguales. */
export const POST = guard(async (request, _ctx, session) => {
  const b = (await readBody(request)) || {}
  if (!isId(b.campanaId)) return bad('Elige la campaña.')
  const angulo = text(b.angulo, 60)
  if (!angulo || !tramo(angulo, 30)) return bad('Escribe el ángulo (por ejemplo «dolor de cuello»).')
  if (!formatoValido(b.formato)) return bad('Elige si es video o imagen.')
  const fecha = b.fecha === undefined || b.fecha === '' ? hoyBogota() : b.fecha
  if (!isDate(fecha)) return bad('La fecha no es válida.')
  const estado = b.estado === undefined ? 'pausado' : b.estado
  if (!estadoValido(estado)) return bad('El estado no es válido.')
  let drive = null
  if (b.driveUrl !== undefined && b.driveUrl !== '') { drive = driveUrlLimpia(b.driveUrl); if (!drive) return bad('El enlace de Drive debe ser https://drive.google.com/… o https://docs.google.com/…') }
  const gancho = b.gancho ? text(b.gancho, 600) : null, notas = b.notas ? text(b.notas, 1000) : null
  if ((b.gancho && !gancho) || (b.notas && !notas)) return bad('El gancho o las notas son demasiado largos.')
  const [camp] = await sql`SELECT id, name FROM campaigns WHERE id = ${Number(b.campanaId)} AND owner_id = ${session.ownerId}`
  if (!camp) return bad('No encontré esa campaña.', 404)

  // La versión sigue por campaña + ángulo + formato. Si dos personas crean a la vez, el índice único lo detecta y se reintenta con la siguiente versión.
  for (let intento = 0; intento < 3; intento++) {
    const previos = await sql`SELECT campaign_label AS campana, angle AS angulo, format AS formato, version FROM creatives WHERE owner_id = ${session.ownerId}`
    const version = siguienteVersion(previos, { campana: camp.name, angulo, formato: b.formato })
    const nombre = nombreCreativo({ campana: camp.name, angulo, formato: b.formato, version, fecha })
    if (!nombre) return bad('No se pudo armar el nombre: revisa la campaña y el ángulo.')
    try {
      const [r] = await sql`INSERT INTO creatives (owner_id, campaign_id, campaign_label, angle, format, version, made_on, name, status, drive_url, hook, notes)
                            VALUES (${session.ownerId}, ${camp.id}, ${camp.name}, ${angulo}, ${b.formato}, ${version}, ${fecha}, ${nombre}, ${estado}, ${drive}, ${gancho}, ${notas}) RETURNING id, name`
      await logActivity(session.ownerId, `Creaste el creativo ${r.name}`)
      return ok({ id: String(r.id), nombre: r.name }, 201)
    } catch (e) { if (!(e && e.code === '23505')) throw e }
  }
  return bad('Ya existe un creativo con ese nombre. Intenta de nuevo.', 409)
})
