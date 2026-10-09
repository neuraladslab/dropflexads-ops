// Genera AUTH_SECRET (firma de sesiones). Uso:
//   npm run auth:init     agrega AUTH_SECRET a .env.local si falta (no muestra ni cambia nada más)
//   npm run auth:secret   imprime un secreto nuevo (para pegarlo en las variables de entorno de Vercel)
import { randomBytes } from 'node:crypto'
import { appendFileSync, chmodSync, existsSync, readFileSync } from 'node:fs'

const secret = () => randomBytes(48).toString('base64url')

if (process.argv.includes('--print')) {
  console.log(secret())
  console.error('\nPégalo como AUTH_SECRET en Vercel → Settings → Environment Variables (usa uno distinto al local).')
  process.exit(0)
}

const file = '.env.local'
const text = existsSync(file) ? readFileSync(file, 'utf8') : ''
const m = text.match(/^AUTH_SECRET=(.*)$/m)
if (m && m[1].trim().length >= 32) {
  console.log('AUTH_SECRET ya está configurado. No se cambió nada.')
  process.exit(0)
}
if (m) {
  console.error('Hay un AUTH_SECRET demasiado corto en .env.local (mínimo 32 caracteres). Bórralo y vuelve a ejecutar este comando.')
  process.exit(1)
}
appendFileSync(file, `${text && !text.endsWith('\n') ? '\n' : ''}\n# Secreto para firmar sesiones (JWT). No lo compartas ni lo subas a Git.\nAUTH_SECRET=${secret()}\n`)
try { chmodSync(file, 0o600) } catch {}
console.log('Listo: se agregó AUTH_SECRET a .env.local. Reinicia "npm run dev" para que lo tome.')
