import 'server-only'
import sql from '@/lib/db'
import { hashPassword } from '@/lib/auth/password.mjs'
import { generarClave } from '@/lib/auth/generar.mjs'
import { logActivity } from '@/lib/activity'
import { hoyBogota } from '@/domain/fechas.ts'
import { inicioDelMes } from '@/domain/ventana.ts'

// Empresas: cada una es un dueño de datos (`owner_id`) con su propia cuenta de Dropi, de Meta, IA y contabilidad. Solo el superadmin las administra.
/** Una carrera entre dos altas iguales choca con el índice único: se responde como «ya existe» (409) y no como un error del servidor. */
const duplicado = (e) => { if (e && e.code === '23505') throw new EmpresaError('Ya existe un usuario o una empresa con esos datos.', 409); throw e }

export class EmpresaError extends Error {
  constructor(message, status = 400) { super(message); this.status = status }
}
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/

/**
 * Todas las empresas, SOLO con datos de administración (nombre, estado, administradores). Nada de su operación: ni pedidos, ni gasto, ni conexiones.
 * El superadmin administra la plataforma; los datos de cada empresa son de sus administradores.
 */
export async function listarEmpresas() {
  const rows = await sql`
    SELECT c.id, c.name, c.active, c.created_at,
           (SELECT COUNT(*)::int FROM users m WHERE m.company_id = c.id AND m.disabled_at IS NULL) AS admins
    FROM companies c ORDER BY c.created_at, c.id`
  return rows.map((r) => ({ id: r.id, nombre: r.name, activa: r.active, creada: new Date(r.created_at).getTime(), admins: r.admins }))
}

/** Administradores (usuarios) de una empresa. */
export async function listarAdmins(empresaId) {
  const rows = await sql`
    SELECT u.id, u.email, u.disabled_at, u.created_at, (u.totp_enabled_at IS NOT NULL) AS dos_pasos, (c.owner_id = u.id) AS principal
    FROM users u JOIN companies c ON c.id = u.company_id WHERE c.id = ${empresaId} ORDER BY u.created_at, u.id`
  return rows.map((r) => ({ id: r.id, email: r.email, deshabilitado: !!r.disabled_at, dosPasos: r.dos_pasos, principal: r.principal, creado: new Date(r.created_at).getTime() }))
}

function validarCorreo(email) {
  const mail = typeof email === 'string' ? email.trim().toLowerCase() : ''
  if (!EMAIL_RE.test(mail) || mail.length > 254) throw new EmpresaError('El correo no es válido.')
  return mail
}

/** Crea la empresa y su primer administrador (queda como dueño de los datos) con una contraseña automática → { empresaId, clave } (la clave solo se devuelve aquí). */
export async function crearEmpresa(creadorId, { nombre, email }) {
  const name = typeof nombre === 'string' ? nombre.trim().replace(/\s+/g, ' ') : ''
  if (name.length < 2 || name.length > 80) throw new EmpresaError('El nombre de la empresa debe tener entre 2 y 80 caracteres.')
  const mail = validarCorreo(email)
  if (await sql`SELECT 1 FROM users WHERE lower(email) = ${mail}`.then((r) => r.length)) throw new EmpresaError('Ya existe un usuario con ese correo.', 409)
  if (await sql`SELECT 1 FROM companies WHERE lower(name) = ${name.toLowerCase()}`.then((r) => r.length)) throw new EmpresaError('Ya existe una empresa con ese nombre.', 409)
  const clave = generarClave(mail), hash = await hashPassword(clave)
  const id = await sql.begin(async (tx) => {
    const [u] = await tx`INSERT INTO users (email, password_hash, must_change_password) VALUES (${mail}, ${hash}, TRUE) RETURNING id`
    const [c] = await tx`INSERT INTO companies (name, owner_id, created_by) VALUES (${name}, ${u.id}, ${creadorId}) RETURNING id`
    await tx`UPDATE users SET company_id = ${c.id} WHERE id = ${u.id}`
    // La operación empieza el día 1 del mes de registro (no se elige). En la MISMA transacción: una empresa sin día de inicio no podría sincronizar y nadie podría arreglarlo.
    await tx`INSERT INTO app_settings (owner_id, key, value) VALUES (${u.id}, 'op_from', ${inicioDelMes(hoyBogota())})`
    return { empresa: c.id, owner: u.id }
  }).catch(duplicado)
  await logActivity(id.owner, `Empresa «${name}» creada por el superadmin`)
  return { empresaId: id.empresa, clave }
}

/** Otro administrador para una empresa existente (contraseña automática → { clave }): ve y gestiona los mismos datos que el primero. */
export async function crearAdmin(empresaId, { email }) {
  const [c] = await sql`SELECT id, owner_id FROM companies WHERE id = ${empresaId}`
  if (!c) throw new EmpresaError('La empresa no existe.', 404)
  const mail = validarCorreo(email)
  if (await sql`SELECT 1 FROM users WHERE lower(email) = ${mail}`.then((r) => r.length)) throw new EmpresaError('Ya existe un usuario con ese correo.', 409)
  const clave = generarClave(mail)
  await sql`INSERT INTO users (email, password_hash, company_id, must_change_password) VALUES (${mail}, ${await hashPassword(clave)}, ${c.id}, TRUE)`.catch(duplicado)
  await logActivity(c.owner_id, 'El superadmin creó un administrador para esta empresa')
  return { clave }
}

/** Un administrador de empresa (nunca el propio superadmin ni otra cuenta de plataforma). */
async function adminDe(empresaId, userId) {
  const [u] = await sql`SELECT u.id, c.owner_id FROM users u JOIN companies c ON c.id = u.company_id WHERE u.id = ${userId} AND c.id = ${empresaId} AND u.role = 'member'`
  if (!u) throw new EmpresaError('Ese administrador no existe en esta empresa.', 404)
  return u
}

/** Contraseña automática nueva para un administrador (la olvidó) → { clave }. Cierra todas sus sesiones y debe cambiarla al entrar. */
export async function cambiarClaveAdmin(empresaId, userId) {
  const u = await adminDe(empresaId, userId)
  const [{ email }] = await sql`SELECT email FROM users WHERE id = ${u.id}`
  const clave = generarClave(email)
  await sql`UPDATE users SET password_hash = ${await hashPassword(clave)}, password_changed_at = NOW(), must_change_password = TRUE WHERE id = ${u.id}`
  await sql`DELETE FROM trusted_devices WHERE user_id = ${u.id}`
  await sql`UPDATE sessions SET revoked_at = NOW(), revoked_reason = 'password_reset' WHERE user_id = ${u.id} AND revoked_at IS NULL`
  await logActivity(u.owner_id, 'El superadmin restableció la contraseña de un administrador')
  return { clave }
}

/** Deshabilita o rehabilita a un administrador (cierra sus sesiones al deshabilitar). */
export async function cambiarEstadoAdmin(empresaId, userId, habilitado) {
  const u = await adminDe(empresaId, userId)
  await sql`UPDATE users SET disabled_at = ${habilitado ? null : sql`NOW()`} WHERE id = ${u.id}`
  if (!habilitado) await sql`UPDATE sessions SET revoked_at = NOW(), revoked_reason = 'disabled' WHERE user_id = ${u.id} AND revoked_at IS NULL`
}

export async function cambiarEstado(empresaId, activa) {
  const [c] = await sql`UPDATE companies SET active = ${activa} WHERE id = ${empresaId} RETURNING id, name`
  if (!c) throw new EmpresaError('La empresa no existe.', 404)
  return c
}

export async function renombrarEmpresa(empresaId, nombre) {
  const name = typeof nombre === 'string' ? nombre.trim().replace(/\s+/g, ' ') : ''
  if (name.length < 2 || name.length > 80) throw new EmpresaError('El nombre de la empresa debe tener entre 2 y 80 caracteres.')
  if (await sql`SELECT 1 FROM companies WHERE lower(name) = ${name.toLowerCase()} AND id <> ${empresaId}`.then((r) => r.length)) throw new EmpresaError('Ya existe una empresa con ese nombre.', 409)
  const [c] = await sql`UPDATE companies SET name = ${name} WHERE id = ${empresaId} RETURNING id`
  if (!c) throw new EmpresaError('La empresa no existe.', 404)
}

/** Qué herramientas ya están conectadas para el dueño de datos `uid` (para marcar la guía de conexión). */
export async function estadoConexiones(uid) {
  const [r] = await sql`
    SELECT EXISTS (SELECT 1 FROM dropi_connections WHERE owner_id = ${uid}) AS dropi,
           EXISTS (SELECT 1 FROM meta_connections WHERE owner_id = ${uid}) AS meta,
           EXISTS (SELECT 1 FROM dropi_orders WHERE owner_id = ${uid}) AS pedidos,
           EXISTS (SELECT 1 FROM app_settings WHERE owner_id = ${uid} AND key = 'op_from') AS inicio`
  return { dropi: r.dropi, meta: r.meta, pedidos: r.pedidos, inicio: r.inicio }
}
