// Cambia la contraseña de un usuario y CIERRA todas sus sesiones. Uso: npm run user:passwd
import { hashPassword } from '../lib/auth/password.mjs'
import { validatePassword } from '../lib/auth/policy.mjs'
import { BREACH_MESSAGE, breachCount } from '../lib/auth/breach.mjs'
import { connect, credentials } from './_auth-cli.mjs'

const sql = connect()
try {
  const { email, password } = await credentials({ confirm: true })
  const problem = validatePassword(password, email)
  if (problem) throw new Error(problem)
  const breached = await breachCount(password)
  if (breached > 0) throw new Error(BREACH_MESSAGE(breached))
  const rows = await sql`UPDATE users SET password_hash = ${await hashPassword(password)}, password_changed_at = NOW() WHERE lower(email) = ${email} RETURNING id`
  if (!rows.length) throw new Error('No existe un usuario con ese correo.')
  await sql`UPDATE sessions SET revoked_at = NOW(), revoked_reason = 'password_change' WHERE user_id = ${rows[0].id} AND revoked_at IS NULL`
  await sql`DELETE FROM auth_throttle`
  console.log('Contraseña actualizada y sesiones cerradas.')
} catch (err) {
  console.error('Error:', err.message)
  process.exitCode = 1
} finally {
  await sql.end()
}
