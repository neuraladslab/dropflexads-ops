import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import Anthropic from '@anthropic-ai/sdk'
import { conversar } from './conversar.js'

const herr = (salidas = {}) => ({ defs: [{ name: 'obtener_salud_billetera', description: 'x', strict: true, input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false } }], llamadas: [], async ejecutar(n, i) { this.llamadas.push([n, i]); return salidas[n] ?? { fuente: n, retiroRecomendado: 149547.69, saldoBilletera: 808724.36, probabilidadDeGanarPct: 87.4 } } })
const uso = { input_tokens: 100, output_tokens: 20 }
const texto = (t) => ({ stop_reason: 'end_turn', usage: uso, content: [{ type: 'text', text: t }] })
const usoHerramienta = (id = 'tu1') => ({ stop_reason: 'tool_use', usage: uso, content: [{ type: 'thinking', thinking: '', signature: 'sig' }, { type: 'tool_use', id, name: 'obtener_salud_billetera', input: {} }] })
const falso = (...respuestas) => { const pedidos = []; return { pedidos, messages: { async create(p) { pedidos.push(JSON.parse(JSON.stringify(p))); const r = respuestas.shift(); assert.ok(r, 'el modelo se llamó más veces de las esperadas'); return typeof r === 'function' ? r(p) : r } } } }
const base = (client, h, extra = {}) => ({ client, modelo: 'claude-opus-5-5', sistema: 'sys', herramientas: h, mensajes: [{ role: 'user', content: '¿cuánto retiro?' }], ...extra })

test('IA: llama a la herramienta, devuelve los bloques tal cual y entrega una respuesta con cifras verificadas', async () => {
  const h = herr(), c = falso(usoHerramienta(), texto('Puedes retirar $149.548 hoy (saldo $808.724). Fuentes: obtener_salud_billetera'))
  const usos = [], r = await conversar(base(c, h, { alUsar: (u) => usos.push(u) }))
  assert.equal(r.texto.startsWith('Puedes retirar'), true); assert.deepEqual(r.noVerificadas, []); assert.deepEqual(r.fuentes, ['obtener_salud_billetera']); assert.equal(r.llamadas, 2); assert.equal(usos.length, 2)
  const p1 = c.pedidos[0], p2 = c.pedidos[1]
  assert.equal(p1.model, 'claude-opus-5-5'); assert.deepEqual(p1.thinking, { type: 'adaptive' }); assert.deepEqual(p1.output_config, { effort: 'medium' }); assert.deepEqual(p1.tool_choice, { type: 'auto' })
  for (const prohibido of ['temperature', 'top_p', 'top_k', 'budget_tokens']) assert.equal(JSON.stringify(p1).includes(prohibido), false, 'Opus 5.5 rechaza ' + prohibido) // 400 en la API
  assert.equal(p1.tools[0].strict, true)
  const asistente = p2.messages[1], resultado = p2.messages[2]
  assert.equal(asistente.role, 'assistant'); assert.equal(asistente.content[0].type, 'thinking'); assert.equal(asistente.content[1].id, 'tu1') // el razonamiento y la llamada vuelven intactos
  assert.equal(resultado.role, 'user'); assert.equal(resultado.content[0].type, 'tool_result'); assert.equal(resultado.content[0].tool_use_id, 'tu1'); assert.equal(JSON.parse(resultado.content[0].content).retiroRecomendado, 149547.69)
})
test('IA: varias herramientas en un turno se devuelven TODAS juntas en un solo mensaje', async () => {
  const dos = { stop_reason: 'tool_use', usage: uso, content: [{ type: 'tool_use', id: 'a', name: 'obtener_salud_billetera', input: {} }, { type: 'tool_use', id: 'b', name: 'obtener_salud_billetera', input: {} }] }
  const c = falso(dos, texto('Saldo $808.724.')); await conversar(base(c, herr()))
  const ult = c.pedidos[1].messages.at(-1); assert.equal(ult.role, 'user'); assert.deepEqual(ult.content.map((x) => x.tool_use_id), ['a', 'b'])
})
test('IA: una cifra inventada dispara UNA revisión automática y la versión corregida queda limpia', async () => {
  const c = falso(usoHerramienta(), texto('Puedes retirar $152.300.'), texto('Puedes retirar $149.548.')), r = await conversar(base(c, herr()))
  assert.equal(r.revisiones, 1); assert.deepEqual(r.noVerificadas, []); assert.equal(r.texto, 'Puedes retirar $149.548.')
  assert.match(c.pedidos[2].messages.at(-1).content, /\$152\.300/) // la revisión nombra exactamente la cifra dudosa
})
test('IA: si insiste en una cifra inventada, la respuesta sale marcada con lo no verificado (no se esconde)', async () => {
  const c = falso(usoHerramienta(), texto('Retiro $152.300.'), texto('Retiro $152.300 seguro.')), r = await conversar(base(c, herr()))
  assert.equal(r.revisiones, 1); assert.deepEqual(r.noVerificadas, ['$152.300']); assert.equal(r.cifras.verificadas, 0)
})
test('IA: las cifras que escribió la persona en su pregunta valen como datos', async () => {
  const c = falso(texto('Mencionas $99.000: no tengo ese dato en el sistema.')), r = await conversar(base(c, herr(), { cifrasDeLaPersona: [99000] }))
  assert.deepEqual(r.noVerificadas, [])
})
test('IA: un error de herramienta se informa como error y el tope mensual corta la conversación', async () => {
  const h = herr({ obtener_salud_billetera: { error: 'no se pudo obtener ese dato' } }), c = falso(usoHerramienta(), texto('No tengo ese dato en el sistema.'))
  const r = await conversar(base(c, h)); assert.equal(c.pedidos[1].messages.at(-1).content[0].is_error, true); assert.equal(r.texto, 'No tengo ese dato en el sistema.')
  let n = 0; const corte = falso(usoHerramienta(), texto('x'))
  await assert.rejects(conversar(base(corte, herr(), { antesDeLlamar: () => { if (++n > 1) throw Object.assign(new Error('tope'), { tope: true }) } })), (e) => e.tope === true)
})
test('IA: un rechazo del modelo no se trata como respuesta y un bucle infinito de herramientas se corta', async () => {
  const r = await conversar(base(falso({ stop_reason: 'refusal', usage: uso, content: [] }), herr())); assert.equal(r.rechazada, true); assert.equal(r.texto, '')
  let n = 0; const c = { messages: { async create() { n++; return usoHerramienta('z') } } }
  const t = await conversar(base(c, herr())); assert.ok(n <= 8, `llamadas: ${n}`); assert.equal(typeof t.texto, 'string')
})
test('IA: el SDK real arma la petición con la forma correcta (cabeceras y cuerpo) contra un servidor falso', async () => {
  let visto = null
  const srv = http.createServer((req, res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => { visto = { url: req.url, headers: req.headers, body: JSON.parse(b) }; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 5, output_tokens: 3 }, content: [{ type: 'text', text: 'Saldo $808.724.' }] })) }) })
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok))
  try {
    const client = new Anthropic({ apiKey: 'sk-ant-test-000000000000000000000', baseURL: `http://127.0.0.1:${srv.address().port}`, maxRetries: 0 })
    const h = herr(), r = await conversar(base(client, h, { sistema: 'SISTEMA' }))
    assert.equal(visto.url, '/v1/messages'); assert.equal(visto.headers['x-api-key'], 'sk-ant-test-000000000000000000000'); assert.ok(visto.headers['anthropic-version'])
    assert.equal(visto.body.model, 'claude-opus-5-5'); assert.equal(visto.body.system, 'SISTEMA'); assert.deepEqual(visto.body.thinking, { type: 'adaptive' }); assert.deepEqual(visto.body.output_config, { effort: 'medium' })
    assert.equal(visto.body.tools[0].name, 'obtener_salud_billetera'); assert.equal(visto.body.max_tokens, 4000); assert.equal('temperature' in visto.body, false)
    assert.equal(r.texto, 'Saldo $808.724.') // sin herramientas, la cifra no se puede verificar: queda marcada
    assert.deepEqual(r.noVerificadas, ['$808.724'])
  } finally { srv.close() }
})

import { pedirCopies } from './copiasIA.js'

const copy = (i, principal, f = 'AIDA') => ({ formula: f, texto_principal: principal, titulo: ['Colágeno con 12 vitaminas', 'Más soltura cada día', 'Tu rutina, más simple', 'Cuida tu movilidad', 'Bienestar para tu día'][i - 1], descripcion: 'Pídelo hoy 🚚' })
const tanda = (principales) => texto(JSON.stringify({ copies: principales.map((p, i) => copy(i + 1, p, i < 3 ? 'AIDA' : 'PAS')) }))
const ctxCopies = { campana: 'CLAGEN | Colageno | v1', productos: ['Colágeno hidrolizado 12 vitaminas'], angulo: 'Movilidad y articulaciones', formato: 'video', gancho: null }
const limpios = ['✨ Más soltura para tu día. Colágeno con 12 vitaminas 💪 Pídelo hoy.', '🌿 Una rutina simple con 12 vitaminas. Conoce más 👇', '💪 Acompaña tu movimiento diario. Escríbenos y pídelo.', '✨ Un día largo pide buen soporte. Colágeno con 12 vitaminas 🚚', '🌟 Para quienes cuidan su movilidad. Pídelo hoy 💪']

test('copies IA: una tanda limpia se entrega con una sola llamada, con la instrucción de normas y sin parámetros que Opus 5.5 rechaza', async () => {
  const c = falso(tanda(limpios)), usos = []
  const r = await pedirCopies({ client: c, modelo: 'claude-opus-5-5', contexto: ctxCopies, alUsar: (u) => usos.push(u) })
  assert.equal(r.copies.length, 5); assert.equal(r.llamadas, 1); assert.equal(usos.length, 1)
  assert.deepEqual(r.copies.map((x) => x.avisos.length), [0, 0, 0, 0, 0])
  const p = c.pedidos[0]
  assert.match(p.system, /ATRIBUTOS PERSONALES/); assert.match(p.system, /AIDA/); assert.match(p.system, /PAS/)
  assert.match(p.messages[0].content, /<angulo>Movilidad y articulaciones<\/angulo>/)
  for (const prohibido of ['temperature', 'top_p', 'top_k', 'budget_tokens', 'tool_choice']) assert.equal(JSON.stringify(p).includes(prohibido), false, 'Opus 5.5 rechaza ' + prohibido)
})

test('copies IA: si un copy rompe una norma de Meta, se pide la corrección una sola vez y se entrega la versión mejorada', async () => {
  const malos = [...limpios]; malos[1] = '¿Sufres de dolor en las articulaciones? 💪 Esto cura la artritis.'
  const c = falso(tanda(malos), tanda(limpios))
  const r = await pedirCopies({ client: c, modelo: 'claude-opus-5-5', contexto: ctxCopies })
  assert.equal(r.llamadas, 2); assert.deepEqual(r.copies.map((x) => x.avisos.length), [0, 0, 0, 0, 0])
  assert.match(c.pedidos[1].messages.at(-1).content, /Copy 2:/) // le dice cuál y por qué
})

test('copies IA: si tras la corrección sigue mal, se entrega MARCADO con avisos (no se oculta ni se reintenta sin fin)', async () => {
  const malos = [...limpios]; malos[0] = 'Esto cura la artritis 💪'
  const c = falso(tanda(malos), tanda(malos))
  const r = await pedirCopies({ client: c, modelo: 'claude-opus-5-5', contexto: ctxCopies })
  assert.equal(r.llamadas, 2); assert.ok(r.copies[0].avisos.length > 0)
})

test('copies IA: una respuesta ilegible se reintenta una vez; si sigue mal, avisa; un rechazo del modelo se reporta', async () => {
  const c1 = falso(texto('no sé'), tanda(limpios))
  assert.equal((await pedirCopies({ client: c1, modelo: 'claude-opus-5-5', contexto: ctxCopies })).copies.length, 5)
  const c2 = falso(texto('no sé'), texto('tampoco'))
  const r2 = await pedirCopies({ client: c2, modelo: 'claude-opus-5-5', contexto: ctxCopies })
  assert.equal(r2.ilegible, true); assert.equal(r2.llamadas, 2)
  const c3 = falso({ stop_reason: 'refusal', usage: uso, content: [] })
  assert.equal((await pedirCopies({ client: c3, modelo: 'claude-opus-5-5', contexto: ctxCopies })).rechazada, true)
})
