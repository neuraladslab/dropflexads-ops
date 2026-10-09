// Constantes de la conexión con Dropi. Un solo host permitido; nada de esto viene del usuario.
export const DROPI_BASE = 'https://api.dropi.co'
/**
 * El destino SOLO se puede cambiar en desarrollo y pruebas (NODE_ENV = development | test) y solo hacia https o hacia esta misma máquina.
 * Con NODE_ENV sin definir, «staging» o producción se usa siempre el host fijo: así una variable de entorno comprometida no desvía credenciales.
 */
export function dropiBase() {
  const o = process.env.DROPI_API_BASE
  if ((process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') && o && /^(https:\/\/[a-z0-9.-]+|http:\/\/(127\.0\.0\.1|localhost))(:\d{2,5})?\/?$/i.test(o)) return o.replace(/\/+$/, '')
  return DROPI_BASE
}

/** IP pública válida (v4 o v6) o ''. Se descartan privadas, locales y «unknown». */
export function publicIp(ip) {
  const s = String(ip || '').trim()
  if (!s || s.length > 45) return ''
  const v4 = s.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])]
    if (v4.slice(1).some((x) => Number(x) > 255) || a === 0 || a === 10 || a === 127 || a >= 224 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127)) return ''
    return s
  }
  if (/^[0-9a-f:]+$/i.test(s) && s.includes(':') && !/^(::1?|f[cd][0-9a-f]{2}:|fe[89ab][0-9a-f]:)/i.test(s)) return s
  return ''
}

export const CARD_ID_RE = /^car_[A-Za-z0-9]{8,40}$/
export const PAGE_SIZE = 20            // el mismo tamaño de página que usa el frontend de Dropi
export const MAX_RESPONSE_BYTES = 3 * 1024 * 1024
export const REQUEST_TIMEOUT_MS = 15_000

// Ritmo «humano»: una sola petición a la vez, con pausa entre páginas. Nunca en paralelo.
export const PAGE_DELAY_MS = [700, 1600]
export const MIN_SYNC_INTERVAL_S = 60       // entre sincronizaciones de un mismo usuario
export const MIN_LOGIN_INTERVAL_S = 60      // entre inicios de sesión en Dropi
export const SYNC_BUDGET_MS = 20_000        // tiempo máximo entre páginas de una sincronización (con login y páginas lentas, siempre bajo los 60 s de la función)
export const MAX_PAGES_PER_SYNC = 40
export const WINDOW_DAYS = 7                // cada sincronización trae solo desde 7 días antes de HOY hasta HOY (lo anterior se carga con el JSON si hace falta)

// Esperas tras un fallo (segundos): bloqueo del WAF y errores de red/servidor.
export const BLOCK_BACKOFF_S = [15 * 60, 60 * 60, 6 * 60 * 60]
export const NETWORK_BACKOFF_S = [5 * 60, 15 * 60, 60 * 60]

// La tarjeta empezó a funcionar este día: nada anterior existe. «Reiniciar tarjeta» trae todo desde aquí.
export const CARD_START = '2026-09-21'
