import { guard, ok, bad, readBody } from '@/lib/http'
import { preguntar } from '@/lib/ia/asistente'

export const runtime = 'nodejs'
export const maxDuration = 120 // la IA consulta varias herramientas y piensa: puede tardar más de lo normal

const CODIGOS = { sin_clave: 400, datos: 400, tope: 402, limite: 429 }
/** POST { tipo: 'pregunta' | 'escalar', pregunta?, historial?, campanaId?, presupuesto?, forzar? } → { texto, fuentes, noVerificadas, cifras, costoUsd, usoMes }. */
export const POST = guard(async (request, _ctx, session) => {
  const b = (await readBody(request)) || {}
  if (b.tipo !== undefined && b.tipo !== 'pregunta' && b.tipo !== 'escalar') return bad('Tipo de consulta no válido.')
  const r = await preguntar(session.userId, { tipo: b.tipo || 'pregunta', pregunta: b.pregunta, historial: b.historial, pantalla: b.pantalla, campanaId: b.campanaId, presupuesto: b.presupuesto, forzar: b.forzar === true })
  return r.ok ? ok(r) : Response.json(r, { status: CODIGOS[r.codigo] || 502 })
})
