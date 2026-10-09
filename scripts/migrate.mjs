// Aplica database/schema.sql (idempotente: solo CREATE ... IF NOT EXISTS).
// Uso: npm run db:migrate   (carga POSTGRES_URL desde .env.local)
import postgres from 'postgres'
import { sslOptions } from '../lib/dbssl.mjs'
import { readFileSync } from 'node:fs'

const url = process.env.POSTGRES_URL
if (!url) {
  console.error('Falta POSTGRES_URL. Configúrala en .env.local')
  process.exit(1)
}

const sql = postgres(url, { ssl: sslOptions(url), max: 1 })
try {
  await sql.unsafe(readFileSync(new URL('../database/schema.sql', import.meta.url), 'utf8'))
  const rows = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' ORDER BY table_name`
  console.log('Migración aplicada. Tablas:', rows.map((r) => r.table_name).join(', '))
} catch (err) {
  console.error('Error en la migración:', err.message)
  process.exitCode = 1
} finally {
  await sql.end()
}
