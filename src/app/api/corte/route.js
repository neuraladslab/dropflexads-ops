import { guard, ok, bad, readBody } from '@/lib/http'
import { getSetting, setSetting } from '@/lib/settings'
import { logActivity } from '@/lib/activity'
import { corteDia } from '@/lib/corte'
import { diaCorteValido } from '@/domain/periodos.ts'

export const runtime = 'nodejs'

/** Día de corte del mes. Cambiarlo solo cambia cómo se agrupan los días en periodos: no toca ningún dato. */
export const GET = guard(async (_req, _ctx, session) => ok({ dia: await corteDia(session.userId) }))

export const PUT = guard(async (request, _ctx, session) => {
  const b = await readBody(request)
  const dia = Number(b && b.dia)
  if (!diaCorteValido(dia)) return bad('El día de corte debe ser del 1 al 28 o «último día del mes».')
  const antes = await getSetting(session.userId, 'cut_day')
  await setSetting(session.userId, 'cut_day', dia)
  await logActivity(session.userId, `Cambiaste el día de corte del mes${antes ? ` (de ${antes} a ${dia})` : `: ${dia}`}`)
  return ok({ dia })
})
