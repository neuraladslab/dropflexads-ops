// Verificación de seguridad contra una instancia en ejecución (no destruye datos). Uso:
//   npm run dev            (en otra terminal)
//   npm run security:smoke                       → http://localhost:3000
//   BASE_URL=https://tu-app.vercel.app npm run security:smoke
// Con DFA_EMAIL y DFA_PASSWORD (un usuario de prueba) también comprueba CSRF y la revocación de sesión.
// AUTH_SECRET (de .env.local) permite comprobar que los tokens falsificados se rechazan; sin él, esa parte se omite.
// No uses credenciales reales en un entorno compartido: hace inicios de sesión.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { SignJWT } from 'jose'

const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
let pass = 0, fail = 0
const check = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log((cond ? '  ✓ ' : '  ✗ FALLA ') + name + (extra ? '  → ' + extra : '')) }
async function req(method, path, { cookie, headers = {}, body } = {}) {
  const res = await fetch(BASE + path, { method, redirect: 'manual', headers: { Origin: BASE, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) })
  await res.arrayBuffer().catch(() => {})
  return { status: res.status, headers: res.headers, loc: res.headers.get('location') }
}

console.log(`\nVerificando ${BASE}\n`)
try { await req('GET', '/login') } catch { console.error('No se pudo conectar. ¿Está corriendo la app? (npm run dev)'); process.exit(2) }

console.log('[1] Todas las rutas de la API exigen sesión')
const routes = []
const walk = (dir, url) => { for (const e of readdirSync(dir)) { const p = join(dir, e); if (statSync(p).isDirectory()) walk(p, url + '/' + e.replace(/\[id\]/, '1')); else if (e === 'route.js') routes.push({ url, file: p }) } }
walk('app/api', '/api')
let open = []
for (const { url, file } of routes) for (const m of [...readFileSync(file, 'utf8').matchAll(/export const (GET|POST|PUT|PATCH|DELETE)\b/g)].map((x) => x[1])) {
  if (url === '/api/auth/login' || url === '/api/auth/login/2fa' || url === '/api/auth/logout') continue // públicas por diseño (el segundo paso exige un ticket firmado)
  const r = await req(m, url, { body: m === 'GET' || m === 'DELETE' ? undefined : {} }); if (r.status !== 401) open.push(`${m} ${url} → ${r.status}`)
}
check(`${routes.length} rutas protegidas`, open.length === 0, open.join(' | '))

console.log('\n[2] Las páginas redirigen a /login sin sesión')
for (const p of ['/', '/conciliacion', '/campanas', '/costos']) { const r = await req('GET', p); check(`GET ${p}`, [301, 302, 303, 307, 308].includes(r.status) && /\/login/.test(r.loc || '')) }

console.log('\n[3] Cabeceras de seguridad')
const h = (await req('GET', '/login')).headers
check('Content-Security-Policy con nonce y sin unsafe-inline en scripts', /script-src[^;]*'nonce-/.test(h.get('content-security-policy') || '') && !/script-src[^;]*'unsafe-inline'/.test(h.get('content-security-policy') || ''))
check('X-Frame-Options: DENY', (h.get('x-frame-options') || '').toUpperCase() === 'DENY'); check('X-Content-Type-Options: nosniff', h.get('x-content-type-options') === 'nosniff')
check('sin X-Powered-By', !h.get('x-powered-by')); check('sin Access-Control-Allow-Origin', !h.get('access-control-allow-origin'))

const secret = process.env.AUTH_SECRET
if (secret && secret.length >= 32) {
  console.log('\n[4] Tokens falsificados (deben dar 401)')
  const key = new TextEncoder().encode(secret), now = Math.floor(Date.now() / 1000), b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const jwt = (over = {}, k = key, alg = 'HS256') => new SignJWT({}).setProtectedHeader({ alg, typ: 'JWT' }).setSubject('1').setJti(over.jti || '11111111-2222-3333-4444-555555555555').setIssuer(over.iss || 'dropflexads').setAudience(over.aud || 'dropflexads-web').setIssuedAt(over.iat || now).setExpirationTime(over.exp || now + 3600).sign(k)
  const name = process.env.NODE_ENV === 'production' ? '__Host-dfa_session' : 'dfa_session'
  const st = async (t) => (await req('GET', '/api/state', { cookie: `${name}=${t}` })).status
  check('alg=none', (await st(`${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: '1', exp: now + 3600 })}.`)) === 401)
  check('firmado con otro secreto', (await st(await jwt({}, new TextEncoder().encode('x'.repeat(40))))) === 401)
  check('token vencido', (await st(await jwt({ iat: now - 7200, exp: now - 3600 }))) === 401)
  check('audiencia incorrecta', (await st(await jwt({ aud: 'otra' }))) === 401)
  check('sesión inexistente con firma válida', (await st(await jwt({}))) === 401)
  check('jti con inyección SQL', (await st(await jwt({ jti: "x' OR '1'='1" }))) === 401)
} else console.log('\n[4] (omitido: define AUTH_SECRET para probar tokens falsificados)')

if (process.env.DFA_EMAIL && process.env.DFA_PASSWORD) {
  console.log('\n[5] CSRF y revocación de sesión (con tu usuario de prueba)')
  const login = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE }, body: JSON.stringify({ email: process.env.DFA_EMAIL, password: process.env.DFA_PASSWORD }) })
  const cookie = (login.headers.get('set-cookie') || '').split(';')[0]
  if (!cookie) check('inicio de sesión de prueba', false, 'estado ' + login.status)
  else {
    const act = (extra = {}) => fetch(BASE + '/api/activity', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', ...extra }, body: JSON.stringify({ message: 'prueba de seguridad' }) }).then((r) => r.status)
    check('sin Origin ni Referer → 403', (await act()) === 403)
    check('Origin ajeno → 403', (await act({ Origin: 'https://evil.example' })) === 403)
    check('Sec-Fetch-Site: cross-site → 403', (await act({ Origin: BASE, 'Sec-Fetch-Site': 'cross-site' })) === 403)
    check('Content-Type text/plain → 415', (await act({ Origin: BASE, 'Content-Type': 'text/plain' })) === 415)
    check('cuerpo de 12 MB → 413', (await fetch(BASE + '/api/activity', { method: 'POST', headers: { Cookie: cookie, Origin: BASE, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'x'.repeat(12 * 1024 * 1024) }) })).status === 413)
    await req('POST', '/api/auth/logout', { cookie })
    check('el token robado deja de servir tras cerrar sesión', (await req('GET', '/api/state', { cookie })).status === 401)
  }
}
console.log(`\n${pass} correctas, ${fail} fallas`)
process.exit(fail ? 1 : 0)
