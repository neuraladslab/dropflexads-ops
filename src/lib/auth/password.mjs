// Hash de contraseñas con scrypt (OWASP: N=2^17, r=8, p=1). Sin dependencias nativas.
import { scrypt as scryptCb, randomBytes, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCb)
const PARAMS = { N: 131072, r: 8, p: 1, keylen: 32 }
const MAXMEM = 256 * 1024 * 1024

const norm = (pw) => String(pw).normalize('NFKC')

// Cada scrypt usa ≈128 MB y ≈250 ms de CPU: se limita cuántos corren a la vez en esta instancia (el resto espera su turno). Lo usan TODAS las rutas
// que verifican o crean contraseñas, no solo el login: un usuario con sesión no puede agotar la memoria lanzando muchas peticiones.
const MAX_SCRYPT = 3
let active = 0
const waiting = []
const acquire = () => new Promise((res) => { if (active < MAX_SCRYPT) { active++; res() } else waiting.push(res) })
const release = () => { const n = waiting.shift(); if (n) n(); else active-- }
async function limited(fn) { await acquire(); try { return await fn() } finally { release() } }

export async function hashPassword(password) {
  const salt = randomBytes(16)
  const h = await limited(() => scrypt(norm(password), salt, PARAMS.keylen, { N: PARAMS.N, r: PARAMS.r, p: PARAMS.p, maxmem: MAXMEM }))
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString('base64')}$${h.toString('base64')}`
}

function parse(stored) {
  const parts = typeof stored === 'string' ? stored.split('$') : []
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null
  const [, N, r, p, salt, hash] = parts
  const out = { N: Number(N), r: Number(r), p: Number(p), salt: Buffer.from(salt, 'base64'), hash: Buffer.from(hash, 'base64') }
  if (![out.N, out.r, out.p].every(Number.isInteger) || out.hash.length < 16 || out.salt.length < 8) return null
  return out
}

/** Comparación en tiempo constante. Devuelve false ante cualquier formato inválido. */
export async function verifyPassword(password, stored) {
  const s = parse(stored)
  if (!s) return false
  const h = await limited(() => scrypt(norm(password), s.salt, s.hash.length, { N: s.N, r: s.r, p: s.p, maxmem: MAXMEM }))
  return h.length === s.hash.length && timingSafeEqual(h, s.hash)
}

export function needsRehash(stored) {
  const s = parse(stored)
  return !s || s.N < PARAMS.N || s.r < PARAMS.r || s.p < PARAMS.p
}

let dummy
/** Gasta el mismo tiempo que una verificación real cuando el usuario no existe (evita enumerar cuentas por tiempos). */
export async function burnVerification(password) {
  dummy ??= await hashPassword(randomBytes(12).toString('hex'))
  await verifyPassword(password, dummy)
}
