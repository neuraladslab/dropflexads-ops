import 'server-only'
// Varias cuentas abiertas en el mismo navegador (p. ej. el superadmin y el dueño de una empresa) con cambio rápido, sin volver a escribir la contraseña.
// La cuenta activa sigue en la cookie de siempre; las demás guardan su token en `dfa_cuentas`. Cada token sigue siendo una sesión revocable en la base
// de datos: aquí solo se decide cuál es la activa. El cambio afecta a todas las pestañas del navegador (comparten cookies).
import { COOKIE_NAME, MAX_ACCOUNTS, OTHERS_COOKIE_NAME } from './config.mjs'
import { verifySessionToken } from './token.mjs'
import { cookieOptions, clearedCookieOptions, loadSession, revokeSession } from './session'

const TOKEN_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/

/** Tokens de las demás cuentas del navegador (sin validar). */
export function otrosTokens(request) {
  const raw = request.cookies.get(OTHERS_COOKIE_NAME)?.value || ''
  return raw.split(',').filter((t) => TOKEN_RE.test(t) && t.length <= 2048).slice(0, MAX_ACCOUNTS)
}

/** Escribe la cuenta activa y la lista de las demás en la respuesta. */
export function escribirCuentas(res, activo, otros, maxAge) {
  if (activo) res.cookies.set(COOKIE_NAME, activo, cookieOptions(maxAge))
  else res.cookies.set(COOKIE_NAME, '', clearedCookieOptions())
  if (otros.length) res.cookies.set(OTHERS_COOKIE_NAME, otros.join(','), cookieOptions())
  else res.cookies.set(OTHERS_COOKIE_NAME, '', clearedCookieOptions())
}

/**
 * Tras un inicio de sesión correcto: la cuenta que estaba activa pasa a la lista (si es de otra persona) y la nueva queda activa.
 * Si la persona ya tenía esa cuenta abierta, la sesión vieja se cierra (una entrada por cuenta). Pasa del tope → se cierra la más antigua.
 */
export async function abrirCuenta(request, res, nuevoToken, nuevoUserId, maxAge) {
  const actual = request.cookies.get(COOKIE_NAME)?.value
  const previos = [...(actual ? [actual] : []), ...otrosTokens(request)]
  const otros = []
  for (const t of previos) {
    const p = await verifySessionToken(t).catch(() => null)
    if (!p) continue
    if (Number(p.sub) === Number(nuevoUserId)) { await revokeSession(p.jti, 'replaced'); continue }
    otros.push(t)
  }
  while (otros.length > MAX_ACCOUNTS - 1) {
    const p = await verifySessionToken(otros.pop()).catch(() => null) // la más antigua es la última
    if (p) await revokeSession(p.jti, 'limit')
  }
  escribirCuentas(res, nuevoToken, otros, maxAge)
}

/** Primera cuenta guardada que siga viva → { token, resto } (o null). Las vencidas se descartan. */
export async function promover(request, { excepto } = {}) {
  const otros = otrosTokens(request)
  for (let i = 0; i < otros.length; i++) {
    const p = await verifySessionToken(otros[i]).catch(() => null)
    if (!p || (excepto && Number(p.sub) === excepto)) continue
    if (await loadSession(otros[i], { touch: false })) return { token: otros[i], resto: otros.filter((_, j) => j !== i) }
  }
  return null
}

/** Las demás cuentas, solo las que siguen vivas, con lo mínimo para mostrarlas. */
export async function listarOtras(request) {
  const vivas = []
  for (const t of otrosTokens(request)) {
    const s = await loadSession(t, { touch: false }).catch(() => null)
    if (s) vivas.push({ token: t, id: s.sessionId, userId: s.userId, email: s.email, esSuperadmin: s.esSuperadmin, empresa: s.empresa ? s.empresa.nombre : null })
  }
  return vivas
}
