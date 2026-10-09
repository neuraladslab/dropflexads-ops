// Parámetros de autenticación. Todo lo sensible viene de variables de entorno; nada se escribe en el código.

export const SESSION_TTL_SECONDS = 8 * 60 * 60 // expiración ABSOLUTA: la contraseña se pide cada 8 horas

const idleMin = Number(process.env.AUTH_IDLE_MINUTES)
export const IDLE_TTL_SECONDS = (Number.isFinite(idleMin) && idleMin >= 5 && idleMin <= 480 ? idleMin : 120) * 60

export const IS_PROD = process.env.NODE_ENV === 'production'
// El prefijo __Host- exige Secure + Path=/ + sin Domain; solo se puede usar sobre HTTPS (producción).
export const COOKIE_NAME = IS_PROD ? '__Host-dfa_session' : 'dfa_session'

export const JWT_ISSUER = 'dropflexads'
export const JWT_AUDIENCE = 'dropflexads-web'
export const JWT_ALG = 'HS256'

export const MAX_ACTIVE_SESSIONS = 5

// Segundo paso del inicio de sesión: tras acertar la contraseña se entrega un «ticket» de vida corta (NO es una sesión: otra audiencia).
export const MFA_AUDIENCE = 'dropflexads-mfa'
export const MFA_TICKET_SECONDS = 5 * 60
// Intentos del segundo paso: por usuario+IP (bloqueo duro) y sumando todas las IP (las IP nuevas esperan; las conocidas no).
export const MFA_THROTTLE = { windowSeconds: 15 * 60, lockSeconds: 15 * 60, maxPerPair: 5, suspect: 15 }

// Límite de intentos fallidos (ventana deslizante) y bloqueo temporal.
//  · maxPerPair: fallos de UNA cuenta desde UNA IP. Quien adivina contraseñas solo se bloquea a sí mismo: no puede dejar fuera al dueño desde otra IP.
//  · maxPerIp: fallos desde una IP contra cualquier cuenta.
//  · suspectAccount: fallos contra una cuenta sumando todas las IP (ataque distribuido). NO bloquea a todos: desde ese momento solo pueden
//    intentar entrar las IP desde las que el dueño ya inició sesión antes (ver login_known_ips); las IP nuevas esperan.
export const THROTTLE = {
  windowSeconds: 15 * 60,
  lockSeconds: 15 * 60,
  maxPerPair: 5,
  maxPerIp: 20,
  suspectAccount: 12,
}
export const KNOWN_IP_DAYS = 30
export const KNOWN_IP_MAX = 10

// Freno de emergencia GLOBAL (todas las cuentas e IP juntas). Solo se activa bajo un ataque sostenido (más de 2 fallos por segundo):
// sin él, quien rote correos e IP puede obligar al servidor a hacer una verificación scrypt (≈250 ms de CPU y 128 MB de RAM) por cada intento.
export const GLOBAL_THROTTLE = { key: 'glob:login', windowSeconds: 60, lockSeconds: 60, max: 120 }
// Verificaciones de contraseña simultáneas por instancia: el resto recibe 429 al instante, sin gastar CPU ni memoria.
export const MAX_CONCURRENT_VERIFY = 3
// Cuánto se conservan los registros de intentos (los genera cualquiera, sin cuenta): se purgan solos.
export const THROTTLE_KEEP = '1 day'
export const AUTH_EVENTS_KEEP = '90 days'

export class AuthConfigError extends Error {
  constructor(message = 'Autenticación no configurada: falta AUTH_SECRET (mínimo 32 caracteres, aleatorio y distinto del ejemplo).') {
    super(message)
    this.name = 'AuthConfigError'
  }
}

// Valores de ejemplo (públicos en .env.example y en la documentación): jamás son válidos como secreto.
const PLACEHOLDER = /cambia-esto|cambia_esto|change.?me|example|ejemplo|your[-_ ]?secret|tu[-_ ]?secreto|secret[-_ ]?here|xxxxxxxx|password/i

/** Secreto de firma. Falla cerrado: sin secreto válido no se firma ni se acepta nada. */
export function authSecret() {
  const s = process.env.AUTH_SECRET
  if (typeof s !== 'string' || s.length < 32 || PLACEHOLDER.test(s) || new Set(s).size < 12) throw new AuthConfigError()
  return s
}
