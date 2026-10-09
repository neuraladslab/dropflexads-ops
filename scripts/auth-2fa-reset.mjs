// Quita la verificación en dos pasos de una cuenta (por ejemplo, si perdiste el teléfono Y los códigos de recuperación).
// Hace falta acceso a la base de datos: quien no la tenga no puede usar este camino. Cierra todas las sesiones de ese usuario.
// Uso: npm run auth:2fa-reset
import { ask, connect } from './_auth-cli.mjs'

const sql = connect()
try {
  const email = (process.env.DFA_EMAIL || (await ask('Correo de la cuenta: '))).trim().toLowerCase()
  const rows = await sql`UPDATE users SET totp_secret_enc = NULL, totp_pending_enc = NULL, totp_enabled_at = NULL, totp_last_step = NULL WHERE lower(email) = ${email} RETURNING id`
  if (!rows.length) throw new Error('No existe un usuario con ese correo.')
  await sql`DELETE FROM recovery_codes WHERE user_id = ${rows[0].id}`
  await sql`UPDATE sessions SET revoked_at = NOW(), revoked_reason = '2fa_reset' WHERE user_id = ${rows[0].id} AND revoked_at IS NULL`
  await sql`DELETE FROM auth_throttle`
  console.log('Listo: se quitó la verificación en dos pasos y se cerraron las sesiones. Entra con tu contraseña y vuelve a activarla.')
} catch (err) {
  console.error('Error:', err.message)
  process.exitCode = 1
} finally {
  await sql.end()
}
