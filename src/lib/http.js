// Utilidades SOLO de servidor (usan lib/db.js). No importar desde componentes 'use client'.
import sql from '@/lib/db'
import { sameOrigin, jsonBodyOk } from '@/lib/auth/csrf.mjs'
import { getRequestSession } from '@/lib/auth/session'

// El superadmin administra la plataforma (empresas y, más adelante, facturación): solo puede llamar a estas rutas, nunca a las de datos de una empresa.
const RUTAS_SUPERADMIN = /^\/api\/(empresas|auth)(\/|$)/

// Con una contraseña inicial sin cambiar solo se puede cambiarla (o cerrar sesión): nada más hasta entonces.
const RUTAS_CAMBIO_CLAVE = /^\/api\/auth\/(password|logout|session|cuentas)$/

export const ok = (data, status = 200) => Response.json(data, { status })
export const bad = (message, status = 400, code) => Response.json(code ? { error: message, code } : { error: message }, { status })

/** Tamaño máximo de un cuerpo JSON (una importación de 2.000 filas pesa ≈1 MB; un JSON de la tarjeta, decenas de KB). */
export const MAX_BODY_BYTES = 4 * 1024 * 1024

/**
 * Lee el cuerpo JSON con tope de tamaño: se lee por trozos y se corta al pasar el máximo, también cuando no viene Content-Length
 * (si no, un cuerpo enorme se carga entero en memoria). Rechaza (null) el carácter nulo \u0000: PostgreSQL no lo admite en texto
 * y daría un error 500; es una entrada inválida, no un fallo del servidor.
 */
export async function readBody(request) {
  try {
    const len = Number(request.headers.get('content-length'))
    if (Number.isFinite(len) && len > MAX_BODY_BYTES) return null
    const reader = request.body && request.body.getReader()
    if (!reader) return null
    const chunks = []
    let size = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_BODY_BYTES) { await reader.cancel().catch(() => {}); return null }
      chunks.push(value)
    }
    const text = Buffer.concat(chunks).toString('utf8')
    if (text.includes('\u0000') || /\\u0000/i.test(text)) return null
    const b = JSON.parse(text)
    return b && typeof b === 'object' ? b : null
  } catch {
    return null
  }
}

/** Cabeceras que impiden guardar en caché respuestas con datos del usuario. */
function noStore(res) {
  res.headers.set('Cache-Control', 'no-store, max-age=0')
  res.headers.set('Pragma', 'no-cache')
  res.headers.set('Vary', 'Cookie')
  res.headers.set('X-Content-Type-Options', 'nosniff')
  return res
}

/**
 * Envuelve un handler de la API. Por defecto exige una sesión válida (JWT firmado + sesión viva en BD),
 * comprueba el origen (CSRF) y evita el caché. Cualquier error inesperado responde 500 sin filtrar detalles.
 * `{ auth: false }` solo para el inicio de sesión. `{ passive: true }` comprueba la sesión sin renovar su tiempo de inactividad.
 */
export function guard(handler, { auth = true, passive = false } = {}) {
  return async (request, ctx) => {
    try {
      if (!sameOrigin(request)) return noStore(bad('Solicitud no permitida.', 403))
      if (!jsonBodyOk(request)) return noStore(bad('Tipo de contenido no permitido.', 415))
      if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) return noStore(bad('El contenido es demasiado grande.', 413))
      let session = null
      if (auth) {
        session = await getRequestSession(request, { touch: !passive })
        if (!session) return noStore(bad('Tu sesión terminó. Inicia sesión de nuevo.', 401, 'auth'))
        if (session.mustChange && !RUTAS_CAMBIO_CLAVE.test(new URL(request.url).pathname)) return noStore(bad('Primero debes cambiar tu contraseña.', 403, 'must_change'))
        if (session.esSuperadmin && !RUTAS_SUPERADMIN.test(new URL(request.url).pathname)) return noStore(bad('El superadmin no tiene acceso a los datos de las empresas.', 403))
      }
      return noStore(await handler(request, ctx, session))
    } catch (error) {
      if (error && error.name === 'AuthConfigError') {
        console.error('[auth]', error.message)
        return noStore(bad('El acceso no está configurado en el servidor.', 503))
      }
      // Solo código y mensaje: el objeto completo de la base trae `detail` con los valores de la fila que falló.
      console.error('[api]', request.method, new URL(request.url).pathname, error && (error.code || error.name), error && String(error.message || '').slice(0, 200))
      return noStore(bad('Error interno del servidor', 500))
    }
  }
}

export const isId = (v) => typeof v === 'string' || typeof v === 'number' ? /^\d{1,9}$/.test(String(v)) : false

export function isDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(s + 'T12:00:00Z')
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

/** Fecha de hoy + 1 día en ISO (tolerancia por husos horarios). */
export function maxDate() {
  return new Date(Date.now() + 36 * 3600 * 1000).toISOString().slice(0, 10)
}

export function num(v, { min = -Infinity, max = Infinity, int = false } = {}) {
  if (v === '' || v === null || v === undefined || typeof v === 'boolean') return null
  const n = Number(v)
  if (!Number.isFinite(n) || n < min || n > max) return null
  return int ? Math.round(n) : n
}

export const text = (v, max) => (typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max ? v.trim() : null)
