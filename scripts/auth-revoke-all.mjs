// Botón de pánico: cierra TODAS las sesiones de todos los usuarios. Uso: npm run auth:revoke-all
// (Rotar AUTH_SECRET también invalida todos los JWT al instante.)
import { connect } from './_auth-cli.mjs'

const sql = connect()
try {
  const rows = await sql`UPDATE sessions SET revoked_at = NOW(), revoked_reason = 'revoke_all' WHERE revoked_at IS NULL RETURNING id`
  console.log(`Sesiones cerradas: ${rows.length}`)
} catch (err) {
  console.error('Error:', err.message)
  process.exitCode = 1
} finally {
  await sql.end()
}
