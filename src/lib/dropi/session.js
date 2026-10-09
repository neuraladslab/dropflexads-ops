import 'server-only'
// Sesión con Dropi: UN login, token cifrado en la base y reutilizado hasta que venza (≈12 h), y esperas largas ante cualquier fallo.
// Dos modos de iniciar sesión:
//  · «código a mano» (recomendado): NO se guarda la clave del autenticador; cuando hace falta iniciar sesión (≈ una vez al día) la persona escribe
//    el código de 6 dígitos de su app. Un código rechazado cuenta contra un tope de 3 por hora (para no hacer que Dropi bloquee la cuenta).
//  · «automático»: se guarda la clave del autenticador (cifrada) y el código se genera solo.
// Reglas para que Dropi lo vea como un uso normal y no nos bloquee:
//  · nunca dos logins a la vez (reserva atómica en la base: no se mantiene ninguna transacción abierta mientras se espera a Dropi),
//    ni con el mismo código TOTP, ni uno antes de 60 s del anterior;
//  · si el código automático está por vencer (≤2 s) se espera al siguiente;
//  · credenciales rechazadas (modo automático) → se DETIENE todo hasta que el usuario las vuelva a escribir (no se reintenta jamás);
//  · bloqueo/429/401 persistente → esperas de 15 min, 1 h y 6 h; red o respuestas raras → 5 min, 15 min, 1 h.
import sql from '@/lib/db'
import { decryptSecret, encryptSecret } from '@/lib/auth/crypto.mjs'
import { currentCode } from '@/lib/auth/totp.mjs'
import { clearFailures, lockedSeconds, recordFailure, throttleKey } from '@/lib/auth/session'
import { BLOCK_BACKOFF_S, CARD_ID_RE, MIN_LOGIN_INTERVAL_S, NETWORK_BACKOFF_S, PAGE_SIZE, publicIp } from './config.mjs'
import { DropiError, dropiRequest } from './client'

const aad = (uid, field) => `dropi:${uid}:${field}`
export const enc = (uid, field, v) => encryptSecret(String(v), aad(uid, field))
export const dec = (uid, field, v) => (v ? decryptSecret(v, aad(uid, field)) : null)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const JWT_RE = /^[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]*$/
const OTP_RE = /^\d{6,8}$/

const jwtExp = (jwt) => {
  try {
    const exp = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8')).exp
    return Number.isFinite(exp) ? exp * 1000 : null
  } catch { return null }
}

export const maskEmail = (e) => { const [l, d] = String(e).split('@'); return `${l.slice(0, 1)}***@${d || ''}`.slice(0, 80) }
export const maskCard = (c) => `${String(c).slice(0, 4)}…${String(c).slice(-3)}`

const friendly = {
  need_otp: 'Escribe el código de 6 dígitos de tu autenticador de Dropi.',
  otp_rejected: 'Dropi no aceptó el código. Escribe el código actual de tu autenticador (si sigue fallando, reconecta tu cuenta).',
  reauth: 'Dropi rechazó las credenciales. Vuelve a conectar tu cuenta.',
  blocked: 'Dropi bloqueó temporalmente las solicitudes.',
  network: 'No se pudo conectar con Dropi.',
  unexpected: 'Dropi respondió algo inesperado.',
}

/* ---------- reserva (lease) para que nunca haya dos logins a la vez, sin transacciones abiertas durante la red ---------- */
const leaseKey = (uid) => throttleKey('dropilogin', String(uid))
/** true si se obtuvo la reserva (vale 60 s como máximo; se libera siempre). Atómico en la base. */
async function acquireLease(uid) {
  const r = await sql`INSERT INTO auth_throttle (key, fails, window_start, locked_until) VALUES (${leaseKey(uid)}, 1, NOW(), NOW() + interval '60 seconds')
                      ON CONFLICT (key) DO UPDATE SET locked_until = NOW() + interval '60 seconds', window_start = NOW()
                      WHERE auth_throttle.locked_until IS NULL OR auth_throttle.locked_until < NOW() RETURNING key`
  return r.length > 0
}
const releaseLease = (uid) => sql`DELETE FROM auth_throttle WHERE key = ${leaseKey(uid)}`.catch(() => {})

/** Un inicio de sesión en Dropi, como lo hace su frontend (POST /api/login con usuario, contraseña y código TOTP). → { token, expMs, step } */
export async function loginRequest(creds, { lastStep = null, ip = '', otp = '' } = {}) {
  let c
  if (creds.totp) {
    // Modo automático: el código se genera con la clave del autenticador guardada.
    const params = { algorithm: creds.totp.algorithm, digits: creds.totp.digits, period: creds.totp.period }
    c = currentCode(creds.totp.secret, params)
    if (c.remaining <= 2) { await sleep((c.remaining + 1) * 1000); c = currentCode(creds.totp.secret, params) } // que el código no venza en camino
    if (lastStep != null && c.step <= Number(lastStep)) throw new DropiError('cooldown', 'Espera unos segundos: Dropi no acepta el mismo código dos veces.', { seconds: c.remaining + 1 })
  } else {
    // Modo «código a mano»: la persona escribe el código de su autenticador; no se guarda en ningún sitio.
    if (!OTP_RE.test(String(otp))) throw new DropiError('need_otp', friendly.need_otp)
    c = { code: String(otp), step: Math.floor(Date.now() / 30000) }
  }
  const r = await dropiRequest('POST', '/api/login', {
    body: {
      email: creds.email, password: creds.password, white_brand_id: 1, brand: process.env.DROPI_BRAND ?? '',
      // Como el frontend de Dropi: la IP pública de quien inicia sesión (la de la persona que usa esta app); si no hay una válida, la configurada.
      ipAddress: publicIp(ip) || process.env.DROPI_CLIENT_IP || '38.167.229.146', otp: c.code, with_cdc: false,
    },
  })
  let j = null
  try { j = JSON.parse(r.text) } catch {}
  if (r.status === 200 && j && j.isSuccess === true && typeof j.token === 'string' && j.token.length <= 4096 && JWT_RE.test(j.token)) {
    // Vencimiento sensato (entre 1 minuto y 7 días); si el JWT trae algo raro se usa un plazo corto en vez de fallar al guardarlo.
    const now = Date.now(), e = jwtExp(j.token)
    return { token: j.token, expMs: e && e > now + 60_000 && e < now + 7 * 864e5 ? e : now + 5 * 60_000, step: c.step }
  }
  // Solo un rechazo EXPLÍCITO de Dropi (isSuccess:false, o 400/401/422 con JSON) cuenta como «credenciales/código malos». Una respuesta rara no:
  // eso sería pedirte reescribir las credenciales por un fallo de Dropi, y reintentar con ellas podría bloquear la cuenta.
  if (j && typeof j === 'object' && (j.isSuccess === false || [400, 401, 422].includes(r.status))) {
    throw new DropiError('reauth', 'Dropi rechazó el inicio de sesión. Revisa el correo, la contraseña y el código del autenticador.', { status: r.status })
  }
  throw new DropiError('unexpected', 'Dropi respondió algo inesperado al iniciar sesión.', { status: r.status })
}

const netSeconds = (n) => NETWORK_BACKOFF_S[Math.min(n - 1, NETWORK_BACKOFF_S.length - 1)]

/** Anota un fallo del LOGIN en la base (reauth / blocked / red) con la escalera de esperas. Marca el error como ya registrado. */
async function recordLoginFailure(uid, failCount, e) {
  e.recorded = true
  const n = (failCount || 0) + 1
  if (e.code === 'reauth') {
    await sql`UPDATE dropi_connections SET state = 'reauth', fail_count = ${n}, cooldown_until = NULL, token_enc = NULL, token_exp = NULL, last_login_at = NOW(), last_error = ${friendly.reauth}, updated_at = NOW() WHERE owner_id = ${uid}`
  } else if (e.code === 'blocked') {
    const s = BLOCK_BACKOFF_S[Math.min(n - 1, BLOCK_BACKOFF_S.length - 1)]
    e.seconds = s
    await sql`UPDATE dropi_connections SET state = 'blocked', fail_count = ${n}, cooldown_until = NOW() + make_interval(secs => ${s}), token_enc = NULL, token_exp = NULL, last_login_at = NOW(), last_error = ${friendly.blocked}, updated_at = NOW() WHERE owner_id = ${uid}`
  } else if (e.code !== 'cooldown' && e.code !== 'need_otp' && e.code !== 'otp_rejected') {
    const s = netSeconds(n)
    e.seconds = s
    await sql`UPDATE dropi_connections SET state = 'cooldown', fail_count = ${n}, cooldown_until = NOW() + make_interval(secs => ${s}), last_login_at = NOW(), last_error = ${friendly[e.code] || friendly.unexpected}, updated_at = NOW() WHERE owner_id = ${uid}`
  }
}

/**
 * Token de sesión de Dropi del usuario (de la base si sigue vigente; si no, UN login). Lanza DropiError.
 * Modo «código a mano»: sin token vigente hace falta `otp` (el código que la persona escribe); si falta, lanza need_otp sin tocar a Dropi.
 */
export async function getToken(uid, { force = false, ip = '', otp = '' } = {}) {
  const fail = (e) => { e.recorded = true; throw e } // lo que sale de aquí ya quedó reflejado en la base (o no necesita registrarse)
  const [c] = await sql`SELECT * FROM dropi_connections WHERE owner_id = ${uid}`
  if (!c) fail(new DropiError('no_connection', 'Todavía no conectaste tu cuenta de Dropi.'))
  const now = Date.now()
  if (c.state === 'reauth') fail(new DropiError('reauth', friendly.reauth))
  // La espera manda aunque el token siga vigente: si Dropi nos pausó, no se le pide nada hasta que pase.
  if (c.cooldown_until && new Date(c.cooldown_until).getTime() > now) {
    fail(new DropiError(c.state === 'blocked' ? 'blocked' : 'cooldown', friendly[c.state === 'blocked' ? 'blocked' : 'network'], { seconds: Math.ceil((new Date(c.cooldown_until).getTime() - now) / 1000) }))
  }
  if (!force && c.token_enc && c.token_exp && new Date(c.token_exp).getTime() > now) {
    const t = dec(uid, 'token', c.token_enc)
    if (t) return t
  }
  if (c.last_login_at && now - new Date(c.last_login_at).getTime() < MIN_LOGIN_INTERVAL_S * 1000) {
    fail(new DropiError('cooldown', 'Espera un momento antes de volver a iniciar sesión en Dropi.', { seconds: Math.ceil(MIN_LOGIN_INTERVAL_S - (now - new Date(c.last_login_at).getTime()) / 1000) }))
  }
  let creds
  try {
    creds = { email: dec(uid, 'email', c.email_enc), password: dec(uid, 'password', c.password_enc), totp: c.totp_enc ? JSON.parse(dec(uid, 'totp', c.totp_enc)) : null }
    if (!creds.email || !creds.password || (c.totp_enc && !creds.totp?.secret)) throw new Error('x')
  } catch (e0) {
    if (e0 && e0.name === 'AuthConfigError') throw e0 // falta/está mal la clave de cifrado del servidor: es de configuración, no de tus credenciales
    await sql`UPDATE dropi_connections SET state = 'reauth', last_error = 'No se pudieron leer las credenciales guardadas. Vuelve a conectar tu cuenta.', updated_at = NOW() WHERE owner_id = ${uid}`
    fail(new DropiError('reauth', 'No se pudieron leer las credenciales guardadas. Vuelve a conectar tu cuenta.'))
  }
  // Modo «código a mano»: sin código no se intenta nada; y los códigos rechazados se limitan a 3 por hora.
  const otpKey = throttleKey('dropiotp', String(uid))
  if (!creds.totp) {
    if (!OTP_RE.test(String(otp))) fail(new DropiError('need_otp', friendly.need_otp))
    const w = await lockedSeconds([otpKey])
    if (w > 0) fail(new DropiError('cooldown', 'Demasiados códigos rechazados. Espera antes de volver a intentarlo.', { seconds: w }))
  }
  if (!(await acquireLease(uid))) fail(new DropiError('cooldown', 'Ya se está iniciando sesión en Dropi. Espera unos segundos.', { seconds: 10 }))
  try {
    let r
    try {
      r = await loginRequest(creds, { lastStep: c.last_login_step, ip, otp })
    } catch (e0) {
      let e = e0 instanceof DropiError ? e0 : new DropiError('unexpected', 'Error interno al iniciar sesión en Dropi.')
      if (!creds.totp && e.code === 'reauth') {
        // En modo «código a mano» un rechazo no deja la conexión en «reauth» (la contraseña puede estar bien): se limita y se avisa.
        e = new DropiError('otp_rejected', friendly.otp_rejected)
        await recordFailure(otpKey, 3, { windowSeconds: 3600, lockSeconds: 3600 })
        e.recorded = true
      } else await recordLoginFailure(uid, c.fail_count, e)
      throw e
    }
    try {
      await sql`UPDATE dropi_connections SET token_enc = ${enc(uid, 'token', r.token)}, token_exp = ${new Date(r.expMs - 60_000)},
                state = 'ok', cooldown_until = NULL, last_login_at = NOW(), last_login_step = ${r.step}, last_error = NULL, updated_at = NOW() WHERE owner_id = ${uid}`
      // (fail_count NO se reinicia aquí: solo una lectura exitosa de movimientos lo hace; si no, un bloqueo al leer nunca escalaría)
    } catch (e0) {
      if (e0 && e0.name === 'AuthConfigError') throw e0
      const e = new DropiError('unexpected', 'No se pudo guardar la sesión de Dropi.')
      await recordLoginFailure(uid, c.fail_count, e)
      throw e
    }
    return r.token
  } finally {
    await releaseLease(uid)
  }
}

export async function invalidateToken(uid) {
  await sql`UPDATE dropi_connections SET token_enc = NULL, token_exp = NULL WHERE owner_id = ${uid}`
}

/**
 * Conecta (o reconecta) la cuenta: un solo login de prueba y una lectura de la primera página para comprobar el ID de la tarjeta.
 * Solo si ambos salen bien se guardan las credenciales (cifradas). Con `totp` (clave del autenticador) queda en modo automático; sin ella, en modo
 * «código a mano» y hace falta `otp` (el código de ahora). Tope de 3 intentos FALLIDOS por hora y usuario, y reserva por usuario (nunca dos a la vez).
 */
export async function connectDropi(uid, { email, password, totp, otp, cardId }, { ip = '' } = {}) {
  const key = throttleKey('dropiconnect', String(uid))
  const wait = await lockedSeconds([key])
  if (wait > 0) throw new DropiError('cooldown', 'Demasiados intentos de conexión con Dropi. Espera antes de volver a intentarlo.', { seconds: wait })
  if (!CARD_ID_RE.test(cardId)) throw new DropiError('unexpected', 'El ID de la tarjeta no tiene el formato esperado (car_…).')
  if (!totp && !OTP_RE.test(String(otp))) throw new DropiError('need_otp', friendly.need_otp)
  // Antes de gastar un login (y un código de 6 dígitos que no se puede reutilizar) se comprueba que la base está al día con el modo elegido.
  if (!totp) {
    const [col] = await sql`SELECT is_nullable FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'dropi_connections' AND column_name = 'totp_enc'`
    if (!col || col.is_nullable !== 'YES') throw new DropiError('unexpected', 'A tu base de datos le falta aplicar una migración (014). Ejecuta «npm run db:migrate» y vuelve a intentarlo: tu código de Dropi no se gastó.')
  }
  const [cur] = await sql`SELECT state, cooldown_until, last_login_at, last_login_step FROM dropi_connections WHERE owner_id = ${uid}`
  if (cur) {
    const now = Date.now()
    if (cur.cooldown_until && new Date(cur.cooldown_until).getTime() > now) {
      throw new DropiError(cur.state === 'blocked' ? 'blocked' : 'cooldown', friendly[cur.state === 'blocked' ? 'blocked' : 'network'], { seconds: Math.ceil((new Date(cur.cooldown_until).getTime() - now) / 1000) })
    }
    if (cur.last_login_at && now - new Date(cur.last_login_at).getTime() < MIN_LOGIN_INTERVAL_S * 1000) {
      throw new DropiError('cooldown', 'Espera un momento antes de volver a intentar.', { seconds: Math.ceil(MIN_LOGIN_INTERVAL_S - (now - new Date(cur.last_login_at).getTime()) / 1000) })
    }
  }
  if (!(await acquireLease(uid))) throw new DropiError('cooldown', 'Ya se está conectando con Dropi. Espera unos segundos.', { seconds: 10 })
  try {
    const r = await loginRequest({ email, password, totp: totp || null }, { lastStep: cur?.last_login_step ?? null, ip, otp })
    // Comprobación de la tarjeta con la misma sesión (una petición, como abrir la pantalla en Dropi).
    const page = await dropiRequest('GET', `/api/credit-cards/list-card-transactions/${cardId}/1/${PAGE_SIZE}`, { token: r.token })
    if (page.status !== 200) throw new DropiError('unexpected', 'Dropi no devolvió los movimientos de esa tarjeta. Revisa el ID de la tarjeta.', { status: page.status })
    try { JSON.parse(page.text) } catch { throw new DropiError('unexpected', 'Dropi devolvió una respuesta que no se puede leer.') }
    await sql`
      INSERT INTO dropi_connections (owner_id, email_enc, password_enc, totp_enc, card_id_enc, email_hint, card_hint, token_enc, token_exp, state, fail_count, cooldown_until, last_login_at, last_login_step, last_sync_at, last_sync_ok_at, next_page, last_error)
      VALUES (${uid}, ${enc(uid, 'email', email)}, ${enc(uid, 'password', password)}, ${totp ? enc(uid, 'totp', JSON.stringify(totp)) : null}, ${enc(uid, 'card', cardId)}, ${maskEmail(email)}, ${maskCard(cardId)},
              ${enc(uid, 'token', r.token)}, ${new Date(r.expMs - 60_000)}, 'ok', 0, NULL, NOW(), ${r.step}, NULL, NULL, NULL, NULL)
      ON CONFLICT (owner_id) DO UPDATE SET email_enc = EXCLUDED.email_enc, password_enc = EXCLUDED.password_enc, totp_enc = EXCLUDED.totp_enc, card_id_enc = EXCLUDED.card_id_enc,
        email_hint = EXCLUDED.email_hint, card_hint = EXCLUDED.card_hint, token_enc = EXCLUDED.token_enc, token_exp = EXCLUDED.token_exp, state = 'ok', fail_count = 0, cooldown_until = NULL,
        last_login_at = NOW(), last_login_step = EXCLUDED.last_login_step, sync_started_at = NULL, last_sync_at = NULL, next_page = NULL, last_error = NULL, updated_at = NOW()`
  } catch (e) {
    if (e instanceof DropiError && !['cooldown', 'need_otp'].includes(e.code)) await recordFailure(key, 3, { windowSeconds: 3600, lockSeconds: 3600 }) // cuenta como intento fallido
    throw e
  } finally {
    await releaseLease(uid)
  }
  await clearFailures(key)
}

/**
 * Un fallo al LEER movimientos (429/403, red, respuesta rara, 401 que persiste tras un login nuevo) también activa la espera: sin esto se seguiría
 * insistiendo a Dropi sincronización tras sincronización. Escalera: bloqueo 15 min → 1 h → 6 h; red o respuestas raras 5 min → 15 min → 1 h.
 */
export async function recordReadFailure(uid, e) {
  if (!(e instanceof DropiError) || !['blocked', 'network', 'unexpected', 'cooldown'].includes(e.code) || e.recorded) return
  const [c] = await sql`SELECT fail_count FROM dropi_connections WHERE owner_id = ${uid}`
  if (!c) return
  const n = (c.fail_count || 0) + 1
  const blocked = e.code === 'blocked'
  const s = blocked ? BLOCK_BACKOFF_S[Math.min(n - 1, BLOCK_BACKOFF_S.length - 1)] : netSeconds(n)
  e.seconds = s; e.recorded = true
  await sql`UPDATE dropi_connections SET state = ${blocked ? 'blocked' : 'cooldown'}, fail_count = ${n}, cooldown_until = NOW() + make_interval(secs => ${s}),
            ${blocked ? sql`token_enc = NULL, token_exp = NULL,` : sql``} last_error = ${(blocked ? friendly.blocked : friendly[e.code] || friendly.unexpected)}, updated_at = NOW() WHERE owner_id = ${uid}`
}
