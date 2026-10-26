// Proxy (antes "middleware"): primera línea de defensa. NO reemplaza las comprobaciones del servidor:
// aquí solo se valida firma/expiración del JWT (barato); la revocación se verifica contra la BD en la API y en el layout.
import { NextResponse } from 'next/server'
import { COOKIE_NAME } from './lib/auth/config.mjs'
import { verifySessionToken } from './lib/auth/token.mjs'

const PUBLIC_PAGES = new Set(['/login'])
// /api/cron/dropi no usa sesión: la protege el secreto CRON_SECRET (Bearer) dentro de la propia ruta.
const PUBLIC_API = new Set(['/api/auth/login', '/api/auth/login/2fa', '/api/auth/logout', '/api/auth/dispositivo', '/api/cron/dropi'])
const IS_DEV = process.env.NODE_ENV === 'development'

function csp(nonce) {
  const dir = [
    "default-src 'self'",
    // strict-dynamic: solo corren los scripts con nonce (y los que ellos carguen). Sin unsafe-inline.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${IS_DEV ? " 'unsafe-eval'" : ''}`,
    IS_DEV ? "style-src 'self' 'unsafe-inline'" : `style-src-elem 'self' 'nonce-${nonce}'`,
    // La interfaz usa atributos style="…" generados por el motor; los atributos no pueden llevar nonce.
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data:",
    // Visor de creativos: solo la vista previa de Google Drive puede incrustarse.
    "frame-src https://drive.google.com",
    "font-src 'self'",
    IS_DEV ? "connect-src 'self' ws: wss:" : "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "worker-src 'self'",
    "manifest-src 'self'",
  ]
  if (!IS_DEV) dir.push('upgrade-insecure-requests')
  return dir.join('; ')
}

function harden(res, policy) {
  res.headers.set('Content-Security-Policy', policy)
  res.headers.set('X-Content-Type-Options', 'nosniff')
  res.headers.set('X-Frame-Options', 'DENY')
  // same-origin (no no-referrer): con no-referrer algunos navegadores mandan «Origin: null» en las mutaciones y la verificación CSRF las rechazaría.
  res.headers.set('Referrer-Policy', 'same-origin')
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()')
  res.headers.set('Cross-Origin-Opener-Policy', 'same-origin')
  res.headers.set('Cross-Origin-Resource-Policy', 'same-origin')
  res.headers.set('Cache-Control', 'no-store, max-age=0')
  res.headers.set('Pragma', 'no-cache')
  if (!IS_DEV) res.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains')
  return res
}

export async function proxy(request) {
  const { pathname, search } = request.nextUrl
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const policy = csp(nonce)
  const isApi = pathname.startsWith('/api/')
  const isPublic = PUBLIC_PAGES.has(pathname) || PUBLIC_API.has(pathname)

  if (!isPublic) {
    const token = request.cookies.get(COOKIE_NAME)?.value
    let authed = false
    if (token) {
      try {
        authed = !!(await verifySessionToken(token))
      } catch {
        authed = false // sin AUTH_SECRET válido se falla cerrado
      }
    }
    if (!authed) {
      if (isApi) {
        return harden(NextResponse.json({ error: 'Tu sesión terminó. Inicia sesión de nuevo.', code: 'auth' }, { status: 401 }), policy)
      }
      const url = new URL('/login', request.url)
      if (pathname !== '/') url.searchParams.set('next', pathname + search)
      return harden(NextResponse.redirect(url), policy)
    }
  }

  const headers = new Headers(request.headers)
  headers.set('x-nonce', nonce)
  headers.set('Content-Security-Policy', policy)
  return harden(NextResponse.next({ request: { headers } }), policy)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico|woff2?)$).*)'],
}
