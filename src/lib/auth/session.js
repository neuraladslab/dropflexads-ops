import 'server-only'
import { randomUUID, createHmac } from 'node:crypto'
import { cookies } from 'next/headers'
import sql from '@/lib/db'
import { AUTH_EVENTS_KEEP, COOKIE_NAME, IDLE_TTL_SECONDS, IS_PROD, KNOWN_IP_DAYS, KNOWN_IP_MAX, MAX_ACTIVE_SESSIONS, SESSION_TTL_SECONDS, THROTTLE, THROTTLE_KEEP, authSecret } from './config.mjs'
import { signSessionToken, verifySessionToken } from './token.mjs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const cookieOptions = (maxAge = SESSION_TTL_SECONDS) => ({
  httpOnly: true, // inaccesible desde JavaScript (mitiga robo por XSS)
  secure: IS_PROD,
  sameSite: 'lax',
  path: '/',
  maxAge,
})
export const clearedCookieOptions = () => ({ ...cookieOptions(0), maxAge: 0, expires: new Date(0) })

/** Crea la sesión en BD (revocable) y devuelve el JWT que va en la cookie. Cada login genera una sesión nueva. */
export async function createSession(userId, userAgent = '') {
  const sid = randomUUID()
  await sql.begin(async (tx) => {
    await tx`INSERT INTO sessions (id, user_id, expires_at, user_agent)
             VALUES (${sid}, ${userId}, NOW() + make_interval(secs => ${SESSION_TTL_SECONDS}), ${String(userAgent).slice(0, 200)})`
    // Máximo de sesiones simultáneas: se revocan las más antiguas.
    await tx`UPDATE sessions SET revoked_at = NOW(), revoked_reason = 'limit'
             WHERE user_id = ${userId} AND revoked_at IS NULL
               AND id NOT IN (SELECT id FROM sessions WHERE user_id = ${userId} AND revoked_at IS NULL AND expires_at > NOW()
                              ORDER BY created_at DESC LIMIT ${MAX_ACTIVE_SESSIONS})`
    await tx`DELETE FROM sessions WHERE expires_at < NOW() - interval '7 days'`
  })
  const token = await signSessionToken({ sessionId: sid, userId })
  return { token, sessionId: sid, maxAge: SESSION_TTL_SECONDS }
}

/** Valida firma + expiración del JWT y, además, que la sesión siga viva en la base de datos. */
export async function loadSession(token, { touch = true } = {}) {
  const p = await verifySessionToken(token)
  if (!p || !UUID.test(p.jti)) return null
  const uid = Number(p.sub)
  if (!Number.isInteger(uid)) return null
  // `ownerId` = dueño de los datos con los que se trabaja (la empresa del usuario). Sin empresa asignada (usuarios anteriores a las empresas) se cae a su propio id,
  // que es como funcionaba antes. El superadmin no pertenece a ninguna empresa: administra la plataforma y no ve datos de empresas (ver `guard`).
  const rows = await sql`
    SELECT s.id, s.user_id, u.email, u.role, u.must_change_password, COALESCE(c.owner_id, u.id) AS owner_id, c.id AS company_id, c.name AS company_name,
           (extract(epoch from s.expires_at) * 1000)::bigint AS expires_ms
    FROM sessions s JOIN users u ON u.id = s.user_id
    LEFT JOIN companies c ON c.id = u.company_id
    WHERE s.id = ${p.jti} AND s.user_id = ${uid}
      AND s.revoked_at IS NULL
      AND s.expires_at > NOW()
      AND s.last_seen_at > NOW() - make_interval(secs => ${IDLE_TTL_SECONDS})
      AND u.disabled_at IS NULL
      AND (c.id IS NULL OR c.active) -- una empresa desactivada deja sin acceso a sus usuarios
      AND s.created_at >= u.password_changed_at`
  if (!rows.length) return null
  if (touch) await sql`UPDATE sessions SET last_seen_at = NOW() WHERE id = ${p.jti} AND last_seen_at < NOW() - interval '60 seconds'`
  const r = rows[0]
  return {
    sessionId: r.id, userId: r.user_id, email: r.email, expiresAt: Number(r.expires_ms), idleSeconds: IDLE_TTL_SECONDS,
    ownerId: r.owner_id, role: r.role, mustChange: r.must_change_password, esSuperadmin: r.role === 'superadmin', empresa: r.company_id ? { id: r.company_id, nombre: r.company_name } : null,
  }
}

/** Sesión a partir de una petición de Route Handler. */
export async function getRequestSession(request, opts) {
  const token = request.cookies?.get(COOKIE_NAME)?.value
  return token ? loadSession(token, opts) : null
}

/** Sesión a partir de la cookie en Server Components (layouts y páginas). */
export async function getServerSession() {
  const token = (await cookies()).get(COOKIE_NAME)?.value
  return token ? loadSession(token) : null
}

export async function revokeSession(sessionId, reason) {
  if (!UUID.test(String(sessionId))) return
  await sql`UPDATE sessions SET revoked_at = NOW(), revoked_reason = ${reason} WHERE id = ${sessionId} AND revoked_at IS NULL`
}

/** Cierra todas las sesiones del usuario menos una (por ejemplo, la actual al activar el segundo paso). */
export async function revokeOthers(userId, keepSessionId, reason) {
  await sql`UPDATE sessions SET revoked_at = NOW(), revoked_reason = ${reason} WHERE user_id = ${userId} AND id <> ${keepSessionId} AND revoked_at IS NULL`
}

export async function revokeAllForUser(userId, reason) {
  await sql`UPDATE sessions SET revoked_at = NOW(), revoked_reason = ${reason} WHERE user_id = ${userId} AND revoked_at IS NULL`
}

/* ---------- límite de intentos ---------- */
const hmac = (prefix, value) => prefix + ':' + createHmac('sha256', authSecret()).update(prefix + ':' + value).digest('hex').slice(0, 48)
export const throttleKey = (prefix, value) => hmac(prefix, String(value).toLowerCase())

/** Segundos restantes de bloqueo (0 si ninguna clave está bloqueada). */
export async function lockedSeconds(keys) {
  const rows = await sql`SELECT COALESCE(MAX(EXTRACT(epoch FROM (locked_until - NOW()))), 0)::int AS s
                         FROM auth_throttle WHERE key = ANY(${keys}) AND locked_until > NOW()`
  return Math.max(0, rows[0]?.s || 0)
}

/** Anota un fallo. `cfg` permite otra ventana/bloqueo (el freno global usa 60 s en vez de 15 min). */
export async function recordFailure(key, max, cfg = THROTTLE) {
  await sql`
    INSERT INTO auth_throttle (key, fails, window_start) VALUES (${key}, 1, NOW())
    ON CONFLICT (key) DO UPDATE SET
      fails = CASE WHEN auth_throttle.window_start < NOW() - make_interval(secs => ${cfg.windowSeconds}) THEN 1 ELSE auth_throttle.fails + 1 END,
      window_start = CASE WHEN auth_throttle.window_start < NOW() - make_interval(secs => ${cfg.windowSeconds}) THEN NOW() ELSE auth_throttle.window_start END,
      locked_until = CASE WHEN (CASE WHEN auth_throttle.window_start < NOW() - make_interval(secs => ${cfg.windowSeconds}) THEN 1 ELSE auth_throttle.fails + 1 END) >= ${max}
                          THEN NOW() + make_interval(secs => ${cfg.lockSeconds}) ELSE auth_throttle.locked_until END`
}

let lastPrune = 0
/**
 * Borra registros viejos de intentos y de eventos de seguridad. Cualquiera puede generarlos sin cuenta (cada correo inventado crea filas),
 * así que sin esto la tabla crece sin límite. Como mucho una vez cada 5 minutos por instancia y por lotes (no bloquea el inicio de sesión).
 */
export async function pruneAuthTables() {
  const now = Date.now()
  if (now - lastPrune < 5 * 60_000) return
  lastPrune = now
  try {
    await sql`DELETE FROM auth_throttle WHERE ctid IN (SELECT ctid FROM auth_throttle
              WHERE window_start < NOW() - ${THROTTLE_KEEP}::interval AND (locked_until IS NULL OR locked_until < NOW()) LIMIT 5000)`
    await sql`DELETE FROM auth_events WHERE ctid IN (SELECT ctid FROM auth_events WHERE at < NOW() - ${AUTH_EVENTS_KEEP}::interval LIMIT 5000)`
  } catch {
    console.error('[auth] no se pudo limpiar los registros de intentos')
  }
}

/** ¿Este correo ya inició sesión con éxito desde esta IP en los últimos días? (huella `kip:…`, nunca la IP en claro). */
export async function isKnownIp(email, ip) {
  try {
    const rows = await sql`SELECT 1 FROM login_known_ips k JOIN users u ON u.id = k.user_id
                           WHERE lower(u.email) = ${email} AND k.ip_hash = ${throttleKey('kip', ip)}
                             AND k.last_ok_at > NOW() - make_interval(days => ${KNOWN_IP_DAYS}) LIMIT 1`
    return rows.length > 0
  } catch {
    return false // sin la tabla, ninguna IP cuenta como conocida (falla cerrado)
  }
}

/** Anota la IP de un inicio de sesión exitoso y conserva solo las más recientes. */
export async function rememberIp(userId, ip) {
  try {
    const h = throttleKey('kip', ip)
    await sql`INSERT INTO login_known_ips (user_id, ip_hash) VALUES (${userId}, ${h})
              ON CONFLICT (user_id, ip_hash) DO UPDATE SET last_ok_at = NOW()`
    await sql`DELETE FROM login_known_ips WHERE user_id = ${userId} AND ip_hash NOT IN
              (SELECT ip_hash FROM login_known_ips WHERE user_id = ${userId} ORDER BY last_ok_at DESC LIMIT ${KNOWN_IP_MAX})`
  } catch {
    // Es un auxiliar de seguridad: si falla (p. ej. falta aplicar la migración 011) el inicio de sesión no debe caerse.
    console.error('[auth] no se pudo anotar la IP conocida; ¿corriste npm run db:migrate?')
  }
}

export async function clearFailures(key) {
  await sql`DELETE FROM auth_throttle WHERE key = ${key}`
}

/* ---------- bitácora de seguridad (sin contraseñas ni IP en claro) ---------- */
export const clientIp = (request) =>
  (request.headers.get('x-real-ip') || (request.headers.get('x-forwarded-for') || '').split(',')[0] || '').trim()

export async function logAuthEvent(request, event, userId = null) {
  try {
    await sql`INSERT INTO auth_events (user_id, event, ip_hash, user_agent)
              VALUES (${userId}, ${event}, ${throttleKey('ip', clientIp(request) || 'unknown').slice(3)}, ${(request.headers.get('user-agent') || '').slice(0, 200)})`
  } catch (err) {
    console.error('[auth] no se pudo registrar el evento', event)
  }
}
