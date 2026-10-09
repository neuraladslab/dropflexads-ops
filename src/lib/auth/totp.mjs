// TOTP (RFC 6238, SHA-1, 6 dígitos, 30 s) sin dependencias. Compatible con Google Authenticator, Authy, 1Password, Microsoft Authenticator…
import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'

export const STEP_SECONDS = 30
export const DIGITS = 6
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Encode(buf) {
  let bits = '', out = ''
  for (const b of buf) bits += b.toString(2).padStart(8, '0')
  for (let i = 0; i < bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)]
  return out
}
export function base32Decode(s) {
  let bits = ''
  for (const ch of String(s).toUpperCase().replace(/=+$/, '')) { const i = B32.indexOf(ch); if (i < 0) throw new Error('base32 inválido'); bits += i.toString(2).padStart(5, '0') }
  const out = []
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2))
  return Buffer.from(out)
}

/** Secreto nuevo: 160 bits aleatorios en base32 (32 caracteres). */
export const generateSecret = () => base32Encode(randomBytes(20))

export function hotp(secretBuf, counter, digits = DIGITS, algorithm = 'sha1') {
  const c = Buffer.alloc(8); c.writeBigUInt64BE(BigInt(counter))
  const h = createHmac(algorithm, secretBuf).update(c).digest()
  const o = h[h.length - 1] & 0xf
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]
  return String(n % 10 ** digits).padStart(digits, '0')
}
export const stepOf = (ms = Date.now()) => Math.floor(ms / 1000 / STEP_SECONDS)
export const totpAt = (secret, step, digits = DIGITS) => hotp(base32Decode(secret), step, digits)

/**
 * Comprueba un código de 6 dígitos con tolerancia de ±1 paso (reloj del teléfono desajustado). `lastStep` evita reutilizar un código ya usado.
 * Devuelve el paso aceptado o null. La comparación es en tiempo constante.
 */
export function verifyTotp(secret, code, { lastStep = null, now = Date.now(), window = 1 } = {}) {
  const c = String(code ?? '').replace(/\s+/g, '')
  if (!/^\d{6}$/.test(c)) return null
  const key = base32Decode(secret), cur = stepOf(now)
  let hit = null
  for (let d = -window; d <= window; d++) {
    const step = cur + d
    const exp = Buffer.from(hotp(key, step)), got = Buffer.from(c)
    if (timingSafeEqual(exp, got) && hit === null && (lastStep === null || step > Number(lastStep))) hit = step
  }
  return hit
}

export const otpauthUri = (email, secret, issuer = 'DropFlexAds') =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`

/** Códigos de recuperación: 12 caracteres sin ambigüedades (60 bits), formato XXXX-XXXX-XXXX. */
const RC_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export function generateRecoveryCodes(n = 10) {
  return Array.from({ length: n }, () => {
    const s = Array.from({ length: 12 }, () => RC_ALPHABET[randomInt(RC_ALPHABET.length)]).join('')
    return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`
  })
}
/** ¿Parece un código de recuperación? Devuelve la forma normalizada (XXXX-XXXX-XXXX) o null. */
export function normalizeRecovery(input) {
  const s = String(input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  return /^[A-Z0-9]{12}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}` : null
}

/**
 * Código TOTP actual para un secreto base32 con parámetros propios (otras cuentas, como Dropi, pueden usar SHA-256/512, 8 dígitos o otro periodo).
 * Devuelve {code, step, remaining} (segundos que le quedan al código).
 */
export function currentCode(secret, { algorithm = 'SHA1', digits = DIGITS, period = STEP_SECONDS, now = Date.now() } = {}) {
  const alg = { SHA1: 'sha1', SHA256: 'sha256', SHA512: 'sha512' }[String(algorithm).toUpperCase()]
  if (!alg || ![6, 7, 8].includes(Number(digits)) || !(Number(period) >= 15 && Number(period) <= 120)) throw new Error('Parámetros TOTP no válidos.')
  const secs = Math.floor(now / 1000), step = Math.floor(secs / period)
  return { code: hotp(base32Decode(secret), step, Number(digits), alg), step, remaining: period - (secs % period) }
}

/** Lee lo que el usuario pega al conectar otra cuenta: una URI otpauth://totp/… o solo la clave base32. Devuelve {secret, algorithm, digits, period} o {error}. */
export function parseTotpInput(input) {
  const raw = String(input ?? '').trim()
  if (!raw || raw.length > 600) return { error: 'Pega la clave del autenticador (o el enlace otpauth://).' }
  let secret = raw, algorithm = 'SHA1', digits = 6, period = 30
  if (/^otpauth:\/\//i.test(raw)) {
    let u
    try { u = new URL(raw) } catch { return { error: 'El enlace otpauth:// no es válido.' } }
    if (u.hostname.toLowerCase() !== 'totp') return { error: 'Solo se aceptan códigos basados en tiempo (TOTP).' }
    secret = u.searchParams.get('secret') || ''
    algorithm = (u.searchParams.get('algorithm') || 'SHA1').toUpperCase()
    digits = Number(u.searchParams.get('digits') || 6)
    period = Number(u.searchParams.get('period') || 30)
  }
  secret = secret.replace(/[\s-]/g, '').toUpperCase().replace(/=+$/, '')
  if (!/^[A-Z2-7]{16,128}$/.test(secret)) return { error: 'La clave del autenticador no es válida (letras A–Z y números 2–7, mínimo 16 caracteres).' }
  try { currentCode(secret, { algorithm, digits, period }) } catch { return { error: 'Los parámetros del autenticador no son compatibles.' } }
  return { secret, algorithm, digits, period }
}
