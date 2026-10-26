import { guard, ok, bad, readBody } from '@/lib/http'
import { getSetting, setSetting } from '@/lib/settings'
import { logActivity } from '@/lib/activity'
import { leerConfigEscalado, validarConfigEscalado } from '@/domain/escalado.ts'

export const runtime = 'nodejs'

/** Configuración de «Escalar»: presupuesto diario confirmado por campaña y tolerancia al riesgo. Cambiarla solo cambia el análisis: no toca Meta ni ningún dato. */
export const GET = guard(async (_req, _ctx, session) => ok(leerConfigEscalado(await getSetting(session.ownerId, 'esc_cfg'))))

export const PUT = guard(async (request, _ctx, session) => {
  const b = await readBody(request)
  const actual = leerConfigEscalado(await getSetting(session.ownerId, 'esc_cfg'))
  const r = validarConfigEscalado(b, actual)
  if (!r.ok) return bad(r.error)
  await setSetting(session.ownerId, 'esc_cfg', JSON.stringify(r.valor))
  await logActivity(session.ownerId, 'Cambiaste la configuración de «Escalar» (presupuesto o tolerancia al riesgo)')
  return ok(r.valor)
})
