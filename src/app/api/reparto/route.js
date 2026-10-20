import { guard, ok, bad, readBody } from '@/lib/http'
import { setSetting } from '@/lib/settings'
import { logActivity } from '@/lib/activity'
import { repartoDe } from '@/lib/reparto'
import { validarReparto } from '@/domain/reparto.ts'

export const runtime = 'nodejs'

/** Plan de reparto de la utilidad de cada corte (destinos con su %). Cambiarlo solo cambia el reparto SUGERIDO de ahora en adelante: los cortes sellados conservan el suyo. */
export const GET = guard(async (_req, _ctx, session) => ok(await repartoDe(session.userId)))

export const PUT = guard(async (request, _ctx, session) => {
  const b = await readBody(request)
  const destinos = b && Array.isArray(b.destinos) ? b.destinos.map((d) => ({ id: d && d.id, nombre: d && typeof d.nombre === 'string' ? d.nombre.trim() : d && d.nombre, pct: d && Number(d.pct), tipo: d && d.tipo })) : null
  const err = validarReparto(destinos)
  if (err) return bad(err)
  await setSetting(session.userId, 'reparto', JSON.stringify(destinos))
  await logActivity(session.userId, 'Cambiaste el reparto de la utilidad de los cortes')
  return ok({ destinos })
})
