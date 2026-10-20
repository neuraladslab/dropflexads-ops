import 'server-only'
// Orquestación del asistente de IA: clave cifrada, tope mensual, límite de uso, caché corta y registro de lo gastado. La conversación en sí vive en conversar.js (sin base de datos).
import Anthropic from '@anthropic-ai/sdk'
import sql from '@/lib/db'
import { getSetting, setSetting } from '@/lib/settings'
import { encryptSecret, decryptSecret } from '@/lib/auth/crypto.mjs'
import { logActivity } from '@/lib/activity'
import { lockedSeconds, recordFailure, throttleKey } from '@/lib/auth/session'
import { leerConfigIA, validarConfigIA, sumarUso, topeAlcanzado, mesDe, costoUsd, limpiarEntrada, claveConForma, extraerCifras } from '@/domain/ia.ts'
import { crearHerramientas } from './herramientas'
import { crearSistema } from './sistema'
import { conversar } from './conversar'

const aad = (uid) => `ia:${uid}:key`
const leerUso = async (uid) => { try { return JSON.parse((await getSetting(uid, 'ia_uso')) || 'null') } catch { return null } }
const cache = new Map() // respuestas de «segunda opinión» de los últimos 30 min (por instancia del servidor)
const TTL = 30 * 60e3

/** Lo que la pantalla necesita saber: nunca la clave, solo si hay una y sus últimos 4 caracteres. */
export async function estadoIA(uid) {
  const [blob, pista, cfg, uso, ws] = await Promise.all([getSetting(uid, 'ia_key'), getSetting(uid, 'ia_pista'), getSetting(uid, 'ia_cfg'), leerUso(uid), getSetting(uid, 'ia_ws')])
  const config = leerConfigIA(cfg), mes = mesDe()
  return { tieneClave: !!blob, pista: pista || null, workspaceId: ws || '', config, uso: uso && uso.mes === mes ? uso : { mes, usd: 0, llamadas: 0, tokensEntrada: 0, tokensSalida: 0 } }
}
export async function guardarClave(uid, clave) {
  if (!claveConForma(clave)) return { ok: false, error: 'La clave no tiene la forma de una clave de Anthropic (empieza por sk-ant-).' }
  const k = clave.trim()
  await setSetting(uid, 'ia_key', encryptSecret(k, aad(uid)))
  await setSetting(uid, 'ia_pista', '…' + k.slice(-4))
  await logActivity(uid, 'Guardaste la clave de Anthropic (cifrada)')
  return { ok: true }
}
/** El identificador del espacio de trabajo (wrkspc_…) no es secreto; vacío = no se envía. */
export async function guardarWorkspace(uid, id) {
  const v = typeof id === 'string' ? id.trim() : ''
  if (v && !/^wrkspc_[A-Za-z0-9]{8,60}$/.test(v)) return { ok: false, error: 'El identificador del workspace empieza por «wrkspc_» (cópialo de console.anthropic.com).' }
  await setSetting(uid, 'ia_ws', v)
  return { ok: true }
}
export async function borrarClave(uid) {
  await sql`DELETE FROM app_settings WHERE owner_id = ${uid} AND key IN ('ia_key', 'ia_pista')`
  await logActivity(uid, 'Borraste la clave de Anthropic')
}
export async function guardarConfig(uid, v) {
  const r = validarConfigIA(v)
  if (!r.ok) return r
  await setSetting(uid, 'ia_cfg', JSON.stringify(r.valor))
  await logActivity(uid, `Configuraste la IA: ${r.valor.modelo}, tope mensual US$ ${r.valor.topeUsd}`)
  return { ok: true, valor: r.valor }
}

const clienteDe = async (uid) => {
  const blob = await getSetting(uid, 'ia_key'), clave = blob ? decryptSecret(blob, aad(uid)) : null, ws = await getSetting(uid, 'ia_ws')
  // Las claves que no pertenecen a un espacio de trabajo (workspace) exigen indicar cuál usar.
  return clave ? new Anthropic({ apiKey: clave, maxRetries: 2, timeout: 120_000, ...(ws ? { defaultHeaders: { 'anthropic-workspace-id': ws } } : {}) }) : null
}

/** Mensaje claro (sin detalles internos) para cada tipo de fallo del SDK. */
export function explicarError(e) {
  if (e instanceof Anthropic.AuthenticationError) return 'La clave de Anthropic no es válida o fue revocada. Actualízala en Configuración → Inteligencia artificial.'
  if (e instanceof Anthropic.PermissionDeniedError) return 'La clave de Anthropic no tiene permiso para usar este modelo.'
  if (e instanceof Anthropic.RateLimitError) return 'Anthropic está limitando las consultas en este momento. Intenta de nuevo en un minuto.'
  if (e instanceof Anthropic.BadRequestError) return /credit|balance|billing/i.test(String(e.message)) ? 'La cuenta de Anthropic no tiene saldo. Recárgala en console.anthropic.com.' : 'Anthropic no pudo procesar la consulta.'
  if (e instanceof Anthropic.APIConnectionError) return 'No se pudo conectar con Anthropic. Revisa la conexión e intenta de nuevo.'
  if (e instanceof Anthropic.APIError && e.status >= 500) return 'Anthropic tuvo un problema temporal. Intenta de nuevo en unos minutos.'
  return 'No se pudo completar la consulta.'
}

/**
 * Una consulta a la IA. `tipo`: 'pregunta' (libre) o 'escalar' (segunda opinión sobre una campaña). Devuelve { ok, ... } y nunca lanza.
 * Las cifras de la respuesta se verifican contra lo que devolvieron las herramientas; lo que no aparece sale en `noVerificadas`.
 */
export async function preguntar(uid, { tipo = 'pregunta', pregunta, historial, pantalla, campanaId, presupuesto, forzar = false }) {
  const mes = mesDe(), est = await estadoIA(uid), cfg = est.config
  if (!est.tieneClave) return { ok: false, codigo: 'sin_clave', error: 'Falta la clave de Anthropic. Agrégala en Configuración → Inteligencia artificial.' }
  if (topeAlcanzado(est.uso, mes, cfg.topeUsd)) return { ok: false, codigo: 'tope', error: `Llegaste al tope mensual de US$ ${cfg.topeUsd}. Súbelo en Configuración → Inteligencia artificial si quieres seguir.` }
  let texto, entradaPersona = [], mensajes
  if (tipo === 'escalar') {
    if (!/^\d{1,9}$/.test(String(campanaId))) return { ok: false, codigo: 'datos', error: 'Campaña no válida.' }
    const p = Number(presupuesto) >= 5000 && Number(presupuesto) <= 5_000_000 ? Math.round(Number(presupuesto)) : 0
    texto = `<tarea>segunda_opinion_escalar</tarea>\n<campana_id>${campanaId}</campana_id>\n<presupuesto_a_comparar>${p}</presupuesto_a_comparar>`
    mensajes = [{ role: 'user', content: texto }]
    const clave = `${uid}|${campanaId}|${p}|${cfg.modelo}`, previo = cache.get(clave)
    if (!forzar && previo && Date.now() - previo.ts < TTL) return { ...previo.r, desdeCache: true, hace: Math.round((Date.now() - previo.ts) / 60e3) }
  } else {
    const e = limpiarEntrada({ pregunta, historial, pantalla })
    if (!e.ok) return { ok: false, codigo: 'datos', error: e.error }
    entradaPersona = [e.pregunta, ...e.historial.map((t) => t.texto)]
    const hoy = new Date().toISOString().slice(0, 10)
    mensajes = [...e.historial.map((t) => ({ role: t.rol, content: t.texto })), { role: 'user', content: `<fecha_actual>${hoy}</fecha_actual>${e.pantalla ? `\n<pantalla_actual>${e.pantalla}</pantalla_actual>` : ''}\n<pregunta>${e.pregunta}</pregunta>` }]
  }
  const llave = throttleKey('ia', uid)
  if ((await lockedSeconds([llave])) > 0) return { ok: false, codigo: 'limite', error: 'Hiciste muchas consultas seguidas. Espera unos minutos.' }
  await recordFailure(llave, 40, { windowSeconds: 3600, lockSeconds: 900 }) // 40 consultas por hora
  const client = await clienteDe(uid)
  if (!client) return { ok: false, codigo: 'sin_clave', error: 'No se pudo leer la clave guardada. Vuelve a guardarla en Configuración → Inteligencia artificial.' }

  const usos = [], m = new Map(), gastado = () => usos.reduce((a, u) => a + costoUsd(cfg.modelo, u), 0)
  try {
    const r = await conversar({
      client, modelo: cfg.modelo, sistema: crearSistema(tipo), herramientas: crearHerramientas(uid, m), mensajes,
      cifrasDeLaPersona: entradaPersona.flatMap((t) => extraerCifras(t).map((c) => c.valor)),
      alUsar: (u) => usos.push(u),
      antesDeLlamar: () => { if (est.uso.usd + gastado() >= cfg.topeUsd) throw Object.assign(new Error('tope'), { tope: true }) },
    })
    const costo = Math.round(gastado() * 10000) / 10000
    let uso = est.uso; for (const u of usos) uso = sumarUso(uso, mes, cfg.modelo, u)
    await setSetting(uid, 'ia_uso', JSON.stringify(uso))
    if (r.rechazada) return { ok: false, codigo: 'rechazo', error: 'El modelo no pudo responder esa consulta. Reformúlala.', costoUsd: costo }
    if (!r.texto) return { ok: false, codigo: 'vacio', error: 'La IA no devolvió una respuesta. Intenta de nuevo.', costoUsd: costo }
    const res = { ok: true, texto: r.texto, fuentes: r.fuentes, noVerificadas: r.noVerificadas, cifras: r.cifras, modelo: cfg.modelo, costoUsd: costo, usoMes: { usd: uso.usd, topeUsd: cfg.topeUsd, llamadas: uso.llamadas }, revisiones: r.revisiones || 0 }
    if (tipo === 'escalar') cache.set(`${uid}|${campanaId}|${Number(presupuesto) >= 5000 ? Math.round(Number(presupuesto)) : 0}|${cfg.modelo}`, { ts: Date.now(), r: res })
    return res
  } catch (e) {
    let uso = est.uso; for (const u of usos) uso = sumarUso(uso, mes, cfg.modelo, u)
    if (usos.length) await setSetting(uid, 'ia_uso', JSON.stringify(uso)).catch(() => {}) // lo ya gastado se cuenta aunque la consulta falle
    if (e && e.tope) return { ok: false, codigo: 'tope', error: `Se alcanzó el tope mensual de US$ ${cfg.topeUsd} durante la consulta.` }
    console.error('[ia] fallo', e && (e.status || e.code || e.name), String((e && e.message) || '').slice(0, 200))
    return { ok: false, codigo: 'api', error: explicarError(e) }
  }
}

/** Prueba mínima de la clave: una llamada de pocos tokens (cuesta fracciones de centavo). */
export async function probarClave(uid) {
  const client = await clienteDe(uid)
  if (!client) return { ok: false, error: 'Todavía no hay una clave guardada.' }
  const cfg = leerConfigIA(await getSetting(uid, 'ia_cfg'))
  try {
    const r = await client.messages.create({ model: cfg.modelo, max_tokens: 16, messages: [{ role: 'user', content: 'Responde solo: ok' }] })
    const mes = mesDe(), est = await estadoIA(uid)
    await setSetting(uid, 'ia_uso', JSON.stringify(sumarUso(est.uso, mes, cfg.modelo, r.usage || {})))
    return { ok: true, modelo: cfg.modelo }
  } catch (e) { console.error('[ia] prueba', e && (e.status || e.name)); return { ok: false, error: explicarError(e) } }
}
