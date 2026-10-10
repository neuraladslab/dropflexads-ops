import 'server-only'
// Cliente de la Graph API de Meta, deliberadamente RESTRINGIDO: solo lectura de la cuenta publicitaria elegida (rutas en rutas.mjs), un solo host, token por cabecera
// (nunca en la dirección), tope de tiempo, reintentos con espera ante los límites de uso que Meta documenta, y mensajes claros. Nunca registra el token.
import { rutaMetaPermitida } from './rutas.mjs'

const BASE = 'https://graph.facebook.com'
/** El destino solo se puede cambiar en desarrollo y pruebas, y solo hacia https o hacia esta misma máquina (para probar con un servidor falso). */
function base() {
  const o = process.env.META_API_BASE
  if ((process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') && o && /^(https:\/\/[a-z0-9.-]+|http:\/\/(127\.0\.0\.1|localhost))(:\d{2,5})?\/?$/i.test(o)) return o.replace(/\/+$/, '')
  return BASE
}

export class MetaError extends Error {
  // code: token | permiso | limite | red | ruta | inesperado
  constructor(code, message, { status = 0 } = {}) { super(message); this.name = 'MetaError'; this.code = code; this.status = status }
}
const MSG = {
  token: 'El token de Meta no es válido o venció. Genera uno nuevo en Business Manager y vuelve a conectar.',
  permiso: 'El token no puede leer esta cuenta publicitaria: necesita el permiso ads_read y que la cuenta esté asignada a ese usuario del sistema.',
  limite: 'Meta pidió esperar (límite de uso). Se reintentará más tarde.',
  red: 'No se pudo conectar con Meta. Inténtalo de nuevo en unos minutos.',
}
const LIMITES = new Set([4, 17, 32, 613])
const esLimite = (c) => LIMITES.has(c) || (c >= 80000 && c <= 80014)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Si Meta dice que ya se usó casi toda la cuota (X-Business-Use-Case-Usage), se espera un poco antes de la siguiente llamada.
async function respetarCuota(res) {
  try {
    const raw = res.headers.get('x-business-use-case-usage'); if (!raw) return
    const u = Object.values(JSON.parse(raw)).flat()
    const pico = Math.max(0, ...u.map((x) => Math.max(x.call_count || 0, x.total_cputime || 0, x.total_time || 0)))
    if (pico >= 80) await sleep(15_000)
  } catch { /* cabecera ilegible: se ignora */ }
}

/** GET a una ruta permitida. `version` ej. 'v23.0'; `ruta` ej. 'act_123/insights'. Devuelve el JSON. */
export async function metaGet(token, version, ruta, params = {}, intento = 0) {
  const path = `/${version}/${ruta}`
  if (!rutaMetaPermitida(path)) throw new MetaError('ruta', 'Ruta de Meta no permitida.')
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 25_000)
  let res, body
  try {
    res = await fetch(base() + path + '?' + new URLSearchParams(params), { method: 'GET', headers: { Authorization: 'Bearer ' + token }, cache: 'no-store', redirect: 'manual', signal: ctl.signal })
    body = await res.json().catch(() => ({}))
  } catch { throw new MetaError('red', MSG.red) } finally { clearTimeout(timer) }
  await respetarCuota(res)
  if (res.ok) return body
  const e = (body && body.error) || {}, code = Number(e.code) || 0
  if (code === 190 || res.status === 401) throw new MetaError('token', MSG.token, { status: res.status })
  if (code === 10 || code === 200 || code === 299 || res.status === 403) throw new MetaError('permiso', MSG.permiso, { status: res.status })
  if ((esLimite(code) || res.status >= 500 || res.status === 429) && intento < 3) { await sleep(5_000 * 2 ** intento); return metaGet(token, version, ruta, params, intento + 1) }
  if (esLimite(code) || res.status === 429) throw new MetaError('limite', MSG.limite, { status: res.status })
  throw new MetaError('inesperado', `Meta respondió algo inesperado (HTTP ${res.status}${e.message ? ': ' + String(e.message).replace(/[A-Za-z0-9_\-.]{30,}/g, '…').slice(0, 120) : ''}).`, { status: res.status })
}

/** Todas las páginas de una lista (cursor `after`). Tope de páginas para no abusar de la API. */
export async function metaGetAll(token, version, ruta, params = {}, { maxPaginas = 20 } = {}) {
  const out = []
  let after = ''
  for (let i = 0; i < maxPaginas; i++) {
    const b = await metaGet(token, version, ruta, after ? { ...params, after } : params)
    out.push(...(Array.isArray(b.data) ? b.data : []))
    const next = b.paging && b.paging.next, cur = b.paging && b.paging.cursors && b.paging.cursors.after
    if (!next || !cur) break
    after = cur
  }
  return out
}
