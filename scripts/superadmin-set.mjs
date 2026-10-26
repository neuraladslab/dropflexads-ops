// Da o quita el rol de superadmin a un usuario existente que NO pertenezca a una empresa (el superadmin no ve datos de empresas). Uso: npm run superadmin -- correo@dominio.com   (quitar: npm run superadmin -- correo@dominio.com --quitar)
import { connect } from './_auth-cli.mjs'

const email = (process.argv[2] || '').trim().toLowerCase()
const quitar = process.argv.includes('--quitar')
const sql = connect()
try {
  if (!email || email.startsWith('--')) throw new Error('Indica el correo: npm run superadmin -- correo@dominio.com')
  const role = quitar ? 'member' : 'superadmin'
  if (!quitar) {
    const [u] = await sql`SELECT c.name FROM users u JOIN companies c ON c.id = u.company_id WHERE lower(u.email) = ${email}`
    if (u) throw new Error(`Ese usuario es administrador de la empresa «${u.name}». El superadmin administra la plataforma y no pertenece a ninguna empresa: crea otro usuario con npm run user:create.`)
  }
  const r = await sql`UPDATE users SET role = ${role} WHERE lower(email) = ${email} AND disabled_at IS NULL RETURNING id`
  if (!r.length) throw new Error('No existe un usuario activo con ese correo.')
  // Sus sesiones abiertas se cierran: el cambio de rol aplica en el próximo inicio de sesión.
  await sql`UPDATE sessions SET revoked_at = NOW(), revoked_reason = 'role_change' WHERE user_id = ${r[0].id} AND revoked_at IS NULL`
  console.log(`${email} ahora es ${quitar ? 'miembro (ya no es superadmin)' : 'superadmin'}. Sus sesiones abiertas se cerraron.`)
} catch (err) {
  console.error('Error:', err.message)
  process.exitCode = 1
} finally {
  await sql.end()
}
