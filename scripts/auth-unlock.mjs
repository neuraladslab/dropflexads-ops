// Quita los bloqueos de inicio de sesión (por cuenta, por IP y el freno global). Uso: npm run auth:unlock
// Un ataque distribuido contra tu cuenta puede hacer que las IP nuevas esperen 15 minutos (desde tu IP habitual sigues entrando):
// este comando te deja entrar de inmediato. No toca las sesiones ni las contraseñas.
import { connect } from './_auth-cli.mjs'

const sql = connect()
try {
  const rows = await sql`DELETE FROM auth_throttle RETURNING key`
  console.log(`Listo: se quitaron ${rows.length} registros de intentos y bloqueos. Ya puedes iniciar sesión.`)
} catch (err) {
  console.error('Error:', err.message)
  process.exitCode = 1
} finally {
  await sql.end()
}
