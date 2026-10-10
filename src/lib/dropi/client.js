import 'server-only'
// Cliente HTTP de Dropi, deliberadamente RESTRINGIDO: solo cuatro rutas (login, tarjeta, saldo de la tarjeta y billetera), un solo host, sin redirecciones, con tope de tiempo y de tamaño,
// una petición a la vez. Nunca devuelve ni registra credenciales, tokens ni el texto de error de Dropi.
import { MAX_RESPONSE_BYTES, REQUEST_TIMEOUT_MS, dropiBase } from './config.mjs'
import { dropiHeaders } from './headers.mjs'
import { motivoDropi } from './parse/errores.mjs'

export class DropiError extends Error {
  // code: reauth | cooldown | blocked | network | unexpected | no_connection | busy
  constructor(code, message, { seconds = 0, status = 0 } = {}) {
    super(message)
    this.name = 'DropiError'
    this.code = code
    this.seconds = seconds
    this.status = status
  }
}

/**
 * Error «inesperado» con el PASO que falló, el código HTTP y el mensaje que dio Dropi (solo su campo `message`/`error`, recortado y sin cadenas largas
 * que parezcan tokens). Así el panel dice qué pasó en vez de un genérico «algo inesperado».
 */
export function inesperado(paso, r) {
  const m = motivoDropi(r.text)
  return new DropiError('unexpected', `Dropi respondió algo inesperado al leer ${paso} (HTTP ${r.status}${m ? ': ' + m : ''}).`, { status: r.status })
}

const ALLOWED = [
  /^\/api\/login$/,
  /^\/api\/credit-cards\/list-card-transactions\/car_[A-Za-z0-9]{8,40}\/\d{1,4}\/\d{1,3}$/,
  // Saldo disponible de la tarjeta: lo informa Dropi, no se calcula.
  /^\/api\/credit-cards\/balances\/car_[A-Za-z0-9]{8,40}$/,
  // Billetera: la misma consulta que hace la pantalla de Dropi (solo lectura, parámetros fijos salvo página, usuario y fechas).
  /^\/api\/historywallet\?orderBy=id&orderDirection=desc&result_number=\d{1,3}&start=\d{1,6}&textToSearch=&type=null&id=null&identification_code=null&user_id=\d{1,12}&from=\d{4}-\d{2}-\d{2}&until=\d{4}-\d{2}-\d{2}&wallet_id=0$/,
  // Pedidos ENTREGADOS (solo lectura, parámetros fijos salvo página, usuario y fechas): se usan para ver cuáles ya te pagaron.
  /^\/api\/orders\/myorders\/v2\?exportAs=orderByRow&orderBy=id&orderDirection=desc&result_number=\d{1,3}&start=\d{1,6}&textToSearch=&status=ENTREGADO&supplier_id=false&user_id=\d{1,12}&from=\d{4}-\d{2}-\d{2}&until=\d{4}-\d{2}-\d{2}&filter_product=undefined&haveIncidenceProcesamiento=false&tag_id=&warranty=false&seller=undefined&filter_date_by=FECHA%20DE%20CREADO&invoiced=null$/,
]
const WAF = /captcha|cloudflare|access denied|request blocked|attention required|incapsula|akamai/i

async function readCapped(res) {
  const reader = res.body && res.body.getReader()
  if (!reader) return ''
  const chunks = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_RESPONSE_BYTES) { await reader.cancel().catch(() => {}); throw new DropiError('unexpected', 'Dropi devolvió una respuesta demasiado grande.') }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/** → { status, text }. Lanza DropiError('blocked'|'network'|'unexpected'). Una respuesta 401 NO lanza: quien llama decide si renueva la sesión. */
export async function dropiRequest(method, path, { token = '', body } = {}) {
  if (!ALLOWED.some((re) => re.test(path))) throw new DropiError('unexpected', 'Ruta de Dropi no permitida.')
  const headers = dropiHeaders({
    'x-authorization': token ? 'Bearer ' + token : 'Bearer undefined',
    'x-captcha-token': '',
    ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
  })
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), REQUEST_TIMEOUT_MS)
  let res, text
  try {
    res = await fetch(dropiBase() + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual', signal: ctl.signal })
    text = await readCapped(res)
  } catch (e) {
    if (e instanceof DropiError) throw e
    throw new DropiError('network', 'No se pudo conectar con Dropi. Inténtalo de nuevo en unos minutos.')
  } finally {
    clearTimeout(timer)
  }
  if (res.status >= 300 && res.status < 400) throw new DropiError('unexpected', 'Dropi respondió con una redirección inesperada.', { status: res.status })
  const html = /text\/html/i.test(res.headers.get('content-type') || '') || /^\s*</.test(text)
  if (res.status === 429 || res.status === 403 || (html && res.status >= 400) || (html && WAF.test(text.slice(0, 4000)))) {
    throw new DropiError('blocked', 'Dropi bloqueó temporalmente las solicitudes (protección anti-abuso).', { status: res.status })
  }
  return { status: res.status, text }
}
