// Cifrado de secretos en reposo (AES-256-GCM). La clave NO vive en la base de datos:
//  · DATA_ENCRYPTION_KEY (32 bytes en base64 o 64 hex), recomendada: permite rotar AUTH_SECRET sin perder los secretos cifrados; o
//  · si no está, se deriva de AUTH_SECRET con HKDF (rotar AUTH_SECRET entonces invalida los secretos cifrados: se resuelve con `npm run auth:2fa-reset`).
// Formato: v1.<iv>.<tag>.<texto cifrado> (base64url). El «v1» permite rotar claves en el futuro.
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto'
import { AuthConfigError, authSecret } from './config.mjs'

/** Clave de 32 bytes con entropía mínima (rechaza «aaaa…» y similares), o null. */
export function parseKey(raw) {
  const k = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64')
  return k.length === 32 && new Set(k).size >= 8 ? k : null
}
/** La clave que se obtendría SIN DATA_ENCRYPTION_KEY (derivada de AUTH_SECRET): solo para migrar secretos con `npm run data:rekey`. */
export const legacyDerivedKey = () => Buffer.from(hkdfSync('sha256', authSecret(), 'dropflexads', 'data-encryption-v1', 32))

function dataKey() {
  const raw = process.env.DATA_ENCRYPTION_KEY
  if (raw) {
    const k = parseKey(raw)
    if (!k) throw new AuthConfigError('DATA_ENCRYPTION_KEY no es válida: debe ser de 32 bytes (base64 o 64 caracteres hexadecimales) y aleatoria.')
    return k
  }
  // En producción la clave de cifrado NO puede derivarse de AUTH_SECRET: un solo secreto filtrado abriría todo (sesiones y credenciales cifradas).
  if (process.env.NODE_ENV === 'production') throw new AuthConfigError('Falta DATA_ENCRYPTION_KEY (32 bytes, distinta de AUTH_SECRET) para cifrar secretos en producción.')
  return Buffer.from(hkdfSync('sha256', authSecret(), 'dropflexads', 'data-encryption-v1', 32))
}

/** `aad` liga el texto cifrado a un contexto (p. ej. «dropi:7:password»): copiarlo a otra fila o campo hace que no descifre. */
export function encryptSecret(plain, aad = '', key = null) {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key || dataKey(), iv, { authTagLength: 16 })
  if (aad) c.setAAD(Buffer.from(aad))
  const ct = Buffer.concat([c.update(String(plain), 'utf8'), c.final()])
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.')
}

/** Devuelve el texto en claro o null si el formato, la clave o la integridad no coinciden. */
export function decryptSecret(blob, aad = '', key = null) {
  try {
    const [v, iv, tag, ct] = String(blob).split('.')
    if (v !== 'v1') return null
    const tagBuf = Buffer.from(tag, 'base64url')
    if (tagBuf.length !== 16) return null // una etiqueta recortada (p. ej. de 4 bytes) no se acepta nunca
    const d = createDecipheriv('aes-256-gcm', key || dataKey(), Buffer.from(iv, 'base64url'), { authTagLength: 16 })
    if (aad) d.setAAD(Buffer.from(aad))
    d.setAuthTag(tagBuf)
    return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8')
  } catch (e) {
    if (e && e.name === 'AuthConfigError') throw e // falta o es inválida la clave del servidor: es de configuración, no un dato dañado
    return null
  }
}

/** Huella HMAC (con una clave derivada distinta) para guardar códigos de recuperación sin poder leerlos. */
export function codeHash(code) {
  const k = Buffer.from(hkdfSync('sha256', dataKey(), 'dropflexads', 'recovery-code-v1', 32))
  return createHmac('sha256', k).update(String(code)).digest('hex')
}

/** Descifra con el contexto (AAD) y, solo si falla, con el formato anterior sin contexto (secretos guardados antes de ligarlos al usuario). → { value, legacy } | null */
export function decryptBound(blob, aad) {
  const v = decryptSecret(blob, aad)
  if (v !== null) return { value: v, legacy: false }
  const old = decryptSecret(blob)
  return old !== null ? { value: old, legacy: true } : null
}
