// Crea un usuario (no hay registro público). Uso: npm run user:create
import { hashPassword } from '../src/lib/auth/password.mjs'
import { validatePassword } from '../src/lib/auth/policy.mjs'
import { BREACH_MESSAGE, breachCount } from '../src/lib/auth/breach.mjs'
import { connect, credentials } from './_auth-cli.mjs'

const sql = connect()
try {
  const { email, password } = await credentials({ confirm: true })
  if (!/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(email) || email.length > 254) throw new Error('El correo no es válido.')
  const problem = validatePassword(password, email)
  if (problem) throw new Error(problem)
  const breached = await breachCount(password)
  if (breached > 0) throw new Error(BREACH_MESSAGE(breached))
  const exists = await sql`SELECT 1 FROM users WHERE lower(email) = ${email}`
  if (exists.length) throw new Error('Ya existe un usuario con ese correo.')
  await sql`INSERT INTO users (email, password_hash) VALUES (${email}, ${await hashPassword(password)})`
  console.log(`Usuario creado: ${email}`)
} catch (err) {
  console.error('Error:', err.message)
  process.exitCode = 1
} finally {
  await sql.end()
}
