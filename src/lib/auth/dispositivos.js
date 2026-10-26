import 'server-only'
// Dispositivos recordados («Recordar este dispositivo»). En el navegador vive un secreto aleatorio por cuenta (cookie httpOnly `id.secreto`, hasta 5);
// en la base solo su huella SHA-256. Cada uso rota el secreto: copiar la cookie no sirve más de una vez, y si alguien usa un secreto viejo se elimina el dispositivo.
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import sql from '@/lib/db'
import { DEVICE_COOKIE_NAME, DEVICE_MAX_DAYS, DEVICE_MAX_PER_USER, DEVICE_TTL_DAYS } from './config.mjs'
import { cookieOptions, clearedCookieOptions } from './session'

const ENTRY_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/i
const hash = (secret) => createHash('sha256').update(secret).digest('hex')
const ttlDias = (role) => (role === 'superadmin' ? DEVICE_TTL_DAYS.superadmin : DEVICE_TTL_DAYS.member)

/** Nombre legible del dispositivo a partir del User-Agent («Chrome en macOS»). Solo para que la persona lo reconozca. */
export function etiquetaDispositivo(ua = '') {
  const nav = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Navegador'
  const so = /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'un equipo'
  return `${nav} en ${so}`
}

/** Entradas válidas de la cookie del navegador: [{ id, secret }]. */
export function entradas(cookieValue) {
  return String(cookieValue || '').split(',').map((e) => ENTRY_RE.exec(e)).filter(Boolean).map((m) => ({ id: m[1].toLowerCase(), secret: m[2] })).slice(0, DEVICE_MAX_PER_USER + 3)
}
export const leerCookie = (request) => entradas(request.cookies.get(DEVICE_COOKIE_NAME)?.value)

export function escribirCookie(res, lista) {
  if (lista.length) res.cookies.set(DEVICE_COOKIE_NAME, lista.map((e) => `${e.id}.${e.secret}`).join(','), cookieOptions(DEVICE_TTL_DAYS.member * 86400))
  else res.cookies.set(DEVICE_COOKIE_NAME, '', clearedCookieOptions())
}

/** Registra este navegador como dispositivo recordado de la persona → { id, secret } (para la cookie). Quita los más antiguos si pasa el tope. */
export async function recordar(userId, role, userAgent = '') {
  const id = randomUUID(), secret = randomBytes(32).toString('base64url')
  await sql`DELETE FROM trusted_devices WHERE user_id = ${userId} AND expires_at < NOW()` // los vencidos no se acumulan
  await sql`INSERT INTO trusted_devices (id, user_id, secret_hash, label, expires_at)
            VALUES (${id}, ${userId}, ${hash(secret)}, ${etiquetaDispositivo(userAgent)}, NOW() + make_interval(days => ${ttlDias(role)}))`
  await sql`DELETE FROM trusted_devices WHERE user_id = ${userId} AND id NOT IN
            (SELECT id FROM trusted_devices WHERE user_id = ${userId} ORDER BY last_used_at DESC LIMIT ${DEVICE_MAX_PER_USER})`
  return { id, secret }
}

/** Añade/reemplaza una entrada en la lista de la cookie (una por cuenta) y quita las que ya no existen en la base. */
export async function conEntrada(lista, nueva, userId) {
  const propias = await sql`SELECT id FROM trusted_devices WHERE user_id = ${userId}`
  const mias = new Set(propias.map((r) => r.id))
  return [nueva, ...lista.filter((e) => e.id !== nueva.id && !mias.has(e.id))].slice(0, DEVICE_MAX_PER_USER + 3)
}

const FILA = (id) => sql`
  SELECT d.id, d.user_id, d.secret_hash, d.prev_hash, d.created_at, u.email, u.role, c.name AS company_name,
         (d.rotated_at IS NOT NULL AND d.rotated_at > NOW() - interval '30 seconds') AS grace
  FROM trusted_devices d JOIN users u ON u.id = d.user_id LEFT JOIN companies c ON c.id = u.company_id
  WHERE d.id = ${id} AND d.expires_at > NOW() AND d.created_at > NOW() - make_interval(days => ${DEVICE_MAX_DAYS})
    AND u.disabled_at IS NULL AND NOT u.must_change_password AND d.created_at >= u.password_changed_at
    AND (c.id IS NULL OR c.active)`

/** ¿El secreto de esta entrada es el vigente? → fila del dispositivo/usuario, o null. Un secreto desconocido elimina el dispositivo (posible copia robada). */
async function validar(entrada) {
  const [d] = await FILA(entrada.id)
  if (!d) return null
  const h = hash(entrada.secret)
  if (h === d.secret_hash || (d.grace && d.prev_hash === h)) return d
  await sql`DELETE FROM trusted_devices WHERE id = ${d.id}`
  return null
}

/** Cuentas recordadas en este navegador, para la pantalla de inicio de sesión (sin tocar nada). */
export async function recordadas(lista) {
  const out = []
  for (const e of lista) {
    const d = await validar(e).catch(() => null)
    if (d) out.push({ id: d.id, email: d.email, empresa: d.role === 'superadmin' ? 'Plataforma' : d.company_name })
  }
  return out
}

/** Usa el dispositivo para entrar: valida, rota el secreto y renueva la vigencia → { userId, email, entrada } o null. */
export async function usar(entrada) {
  const d = await validar(entrada)
  if (!d) return null
  const secret = randomBytes(32).toString('base64url')
  await sql`UPDATE trusted_devices SET prev_hash = secret_hash, secret_hash = ${hash(secret)}, rotated_at = NOW(), last_used_at = NOW(),
            expires_at = NOW() + make_interval(days => ${ttlDias(d.role)}) WHERE id = ${d.id}`
  return { userId: d.user_id, email: d.email, entrada: { id: d.id, secret } }
}

export const olvidar = (userId, id) => sql`DELETE FROM trusted_devices WHERE id = ${id} AND user_id = ${userId}`
export const olvidarTodos = (userId) => sql`DELETE FROM trusted_devices WHERE user_id = ${userId}`
export async function listar(userId) {
  const rows = await sql`SELECT id, label, created_at, last_used_at, expires_at FROM trusted_devices WHERE user_id = ${userId} AND expires_at > NOW() ORDER BY last_used_at DESC`
  return rows.map((r) => ({ id: r.id, etiqueta: r.label, creado: new Date(r.created_at).getTime(), ultimoUso: new Date(r.last_used_at).getTime(), vence: new Date(r.expires_at).getTime() }))
}
