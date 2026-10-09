// Firma y verificación del JWT (solo firma/expiración). La revocación real se comprueba contra la base de datos.
import { SignJWT, jwtVerify } from 'jose'
import { JWT_ALG, JWT_AUDIENCE, JWT_ISSUER, MFA_AUDIENCE, MFA_TICKET_SECONDS, SESSION_TTL_SECONDS, authSecret } from './config.mjs'

const key = () => new TextEncoder().encode(authSecret())

/** El token no lleva datos personales: solo el id de usuario (sub) y el id de sesión (jti). */
export async function signSessionToken({ sessionId, userId, ttlSeconds = SESSION_TTL_SECONDS }) {
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({})
    .setProtectedHeader({ alg: JWT_ALG, typ: 'JWT' })
    .setSubject(String(userId))
    .setJti(sessionId)
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(key())
}

/** Devuelve el payload o null. Solo acepta HS256 (bloquea alg=none y confusión de algoritmos). */
export async function verifySessionToken(token) {
  if (typeof token !== 'string' || token.length > 2048) return null
  try {
    const { payload } = await jwtVerify(token, key(), {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      algorithms: [JWT_ALG],
      clockTolerance: 5,
      maxTokenAge: SESSION_TTL_SECONDS,
    })
    if (!payload.jti || !payload.sub) return null
    return payload
  } catch (err) {
    if (err && err.name === 'AuthConfigError') throw err
    return null
  }
}

/** Ticket del segundo paso: prueba que la contraseña fue correcta hace menos de 5 minutos. Otra audiencia: NUNCA vale como sesión. */
export async function signMfaTicket(userId) {
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({ typ2: 'mfa' })
    .setProtectedHeader({ alg: JWT_ALG, typ: 'JWT' })
    .setSubject(String(userId))
    .setIssuer(JWT_ISSUER)
    .setAudience(MFA_AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + MFA_TICKET_SECONDS)
    .sign(key())
}

/** Devuelve el id de usuario o null. */
export async function verifyMfaTicket(token) {
  if (typeof token !== 'string' || token.length > 1024) return null
  try {
    const { payload } = await jwtVerify(token, key(), { issuer: JWT_ISSUER, audience: MFA_AUDIENCE, algorithms: [JWT_ALG], clockTolerance: 5, maxTokenAge: MFA_TICKET_SECONDS })
    const uid = Number(payload.sub)
    return payload.typ2 === 'mfa' && Number.isInteger(uid) ? uid : null
  } catch (err) {
    if (err && err.name === 'AuthConfigError') throw err
    return null
  }
}
