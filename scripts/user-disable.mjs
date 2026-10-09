// Deshabilita (o rehabilita con --enable) un usuario y cierra sus sesiones. Uso: npm run user:disable -- correo@dominio.com
import { connect } from './_auth-cli.mjs'

const email = (process.argv[2] || '').trim().toLowerCase()
const enable = process.argv.includes('--enable')
if (!email || email.startsWith('--')) {
  console.error('Uso: npm run user:disable -- correo@dominio.com [--enable]')
  process.exit(1)
}
const sql = connect()
try {
  const rows = await sql`UPDATE users SET disabled_at = ${enable ? null : sql`NOW()`} WHERE lower(email) = ${email} RETURNING id`
  if (!rows.length) throw new Error('No existe un usuario con ese correo.')
  if (!enable) {
    await sql`UPDATE sessions SET revoked_at = NOW(), revoked_reason = 'user_disabled' WHERE user_id = ${rows[0].id} AND revoked_at IS NULL`
    await sql`DELETE FROM dropi_connections WHERE owner_id = ${rows[0].id}` // las credenciales de terceros no se quedan guardadas de un usuario deshabilitado
  }
  console.log(enable ? 'Usuario habilitado.' : 'Usuario deshabilitado y sesiones cerradas.')
} catch (err) {
  console.error('Error:', err.message)
  process.exitCode = 1
} finally {
  await sql.end()
}
