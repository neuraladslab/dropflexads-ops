// Pide a Claude los 5 copies de un creativo y los revisa contra las normas de Meta. Sin base de datos ni red propia (recibe el cliente): se prueba con un cliente falso.
import { leerCopies, revisarTodos } from '../../domain/copies.ts'
import { SISTEMA_COPIES, mensajeCopies, mensajeCorreccion } from './sistemaCopies.js'

/** Rondas de corrección tras la primera tanda: el aviso de títulos/descripciones repetidos se insiste hasta que no quede ninguno. */
export const RONDAS_CORRECCION = 3
const textoDe = (content) => content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim()

/**
 * Hasta 6 llamadas: la primera; una segunda si la respuesta no se pudo leer; y hasta 3 de corrección mientras algún copy rompa una norma o repita título/descripción.
 * Devuelve { copies: [{formula, principal, titulo, descripcion, avisos}], llamadas, rechazada? }. Lo que siga con avisos tras la corrección se entrega marcado, no se oculta.
 */
export async function pedirCopies({ client, modelo, contexto, alUsar, antesDeLlamar }) {
  const msgs = [{ role: 'user', content: mensajeCopies(contexto) }]
  let llamadas = 0, ultimo = null
  const llamar = async () => {
    if (antesDeLlamar) await antesDeLlamar()
    const r = await client.messages.create({ model: modelo, max_tokens: 4000, system: SISTEMA_COPIES, thinking: { type: 'adaptive' }, output_config: { effort: 'medium' }, messages: msgs })
    llamadas++
    if (alUsar) alUsar(r.usage || {})
    if (r.stop_reason === 'refusal') return { rechazada: true }
    msgs.push({ role: 'assistant', content: r.content })
    return { texto: textoDe(r.content) }
  }
  for (let intento = 0; intento < 2; intento++) {
    const r = await llamar()
    if (r.rechazada) return { copies: [], llamadas, rechazada: true }
    const leido = leerCopies(r.texto)
    if (leido.ok) { ultimo = revisarTodos(leido.copies, contexto); break }
    msgs.push({ role: 'user', content: `Tu respuesta no se pudo usar (${leido.error}). Responde SOLO con el JSON pedido, con los 5 copies.` })
  }
  if (!ultimo) return { copies: [], llamadas, ilegible: true }
  const total = (l) => l.reduce((a, c) => a + c.avisos.length, 0)
  for (let ronda = 0; ronda < RONDAS_CORRECCION; ronda++) {
    const malos = ultimo.map((c, i) => ({ n: i + 1, avisos: c.avisos })).filter((p) => p.avisos.length)
    if (!malos.length) break
    msgs.push({ role: 'user', content: mensajeCorreccion(malos) })
    const r = await llamar()
    if (r.rechazada) break
    const leido = leerCopies(r.texto)
    if (leido.ok) { const nuevo = revisarTodos(leido.copies, contexto); if (total(nuevo) <= total(ultimo)) ultimo = nuevo }
  }
  return { copies: ultimo, llamadas }
}
