// El bucle de la conversación con Claude, sin base de datos ni red propia: recibe el cliente y las herramientas (así se prueba con un cliente falso, sin gastar un peso).
// Sigue la guía oficial: tool use con `auto`, bloques de la respuesta devueltos tal cual (incluido el razonamiento), todos los `tool_result` juntos en un solo mensaje.
import { recolectarHechos, verificarCifras, extraerCifras } from '../../domain/ia.ts'

const MAX_ITER = 6
const textoDe = (content) => content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim()

/**
 * @param {object} p
 * @param {{messages:{create:Function}}} p.client  cliente del SDK (o uno falso en pruebas)
 * @param {string} p.modelo @param {string} p.sistema @param {{defs:any[], ejecutar:Function}} p.herramientas
 * @param {{role:string, content:any}[]} p.mensajes  conversación previa + la pregunta nueva
 * @param {() => void|Promise<void>} [p.antesDeLlamar]  lanza si no se debe seguir (tope mensual alcanzado)
 * @param {(uso:object) => void} [p.alUsar] se llama con el `usage` de cada respuesta
 * @param {number[]} [p.cifrasDeLaPersona]  números que la propia persona escribió (valen como «dato»)
 */
export async function conversar({ client, modelo, sistema, herramientas, mensajes, antesDeLlamar, alUsar, cifrasDeLaPersona = [], esfuerzo = 'medium' }) {
  const msgs = [...mensajes], hechos = [], fuentes = new Set()
  let texto = '', stopReason = null, revisiones = 0, llamadas = 0
  for (let it = 0; it < MAX_ITER + 2; it++) {
    if (antesDeLlamar) await antesDeLlamar()
    const r = await client.messages.create({
      model: modelo, max_tokens: 4000, system: sistema, tools: herramientas.defs, tool_choice: { type: 'auto' },
      thinking: { type: 'adaptive' }, output_config: { effort: esfuerzo }, messages: msgs,
    })
    llamadas++
    if (alUsar) alUsar(r.usage || {})
    stopReason = r.stop_reason
    if (stopReason === 'refusal') return { texto: '', hechos, fuentes: [...fuentes], stopReason, llamadas, rechazada: true, noVerificadas: [], cifras: { total: 0, verificadas: 0 } }
    msgs.push({ role: 'assistant', content: r.content }) // se devuelve TAL CUAL, con su razonamiento: la API lo necesita para seguir
    if (stopReason === 'tool_use') {
      if (llamadas > MAX_ITER) { texto = textoDe(r.content); break }
      const usos = r.content.filter((b) => b.type === 'tool_use'), resultados = []
      for (const u of usos) {
        const salida = await herramientas.ejecutar(u.name, u.input)
        fuentes.add(u.name); recolectarHechos(salida, hechos)
        resultados.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(salida), ...(salida && salida.error ? { is_error: true } : {}) })
      }
      msgs.push({ role: 'user', content: resultados }) // todos los resultados juntos, en un solo mensaje
      continue
    }
    if (stopReason === 'pause_turn') continue
    texto = textoDe(r.content)
    // Revisión automática: una sola vez, si hay cifras que no salen de las herramientas, se le pide que corrija con datos (o que diga que no los tiene).
    const v = verificarCifras(texto, hechos, cifrasDeLaPersona)
    if (v.noVerificadas.length && revisiones < 1 && llamadas < MAX_ITER) {
      revisiones++
      msgs.push({ role: 'user', content: `Revisión automática: estas cifras de tu respuesta no aparecen en los resultados de las herramientas: ${v.noVerificadas.join(', ')}. Reescribe la respuesta usando SOLO cifras que vengan de las herramientas (si necesitas más datos, llámalas) o di «No tengo ese dato en el sistema».` })
      continue
    }
    break
  }
  const v = verificarCifras(texto, hechos, cifrasDeLaPersona)
  return { texto, hechos, fuentes: [...fuentes], stopReason, llamadas, revisiones, rechazada: false, noVerificadas: v.noVerificadas, cifras: { total: v.total, verificadas: v.verificadas } }
}
export { extraerCifras }
