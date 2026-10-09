// Utilidades comunes de los scripts de usuarios (interactivos y sin dejar contraseñas en el historial).
import readline from 'node:readline'
import postgres from 'postgres'
import { sslOptions } from '../src/lib/dbssl.mjs'

export function connect() {
  if (!process.env.POSTGRES_URL) {
    console.error('Falta POSTGRES_URL. Configúrala en .env.local')
    process.exit(1)
  }
  return postgres(process.env.POSTGRES_URL, { ssl: sslOptions(), max: 1 })
}

export function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    if (hidden) {
      rl._writeToOutput = (s) => { if (s.includes('\n') || s.includes('\r')) rl.output.write('\n') }
    }
    rl.question(question, (a) => { rl.close(); resolve(a) })
    if (hidden) process.stdout.write(question)
  })
}

/** Modo interactivo (terminal) o, para automatizar, variables DFA_EMAIL / DFA_PASSWORD. */
export async function credentials({ confirm = false } = {}) {
  if (process.env.DFA_EMAIL && process.env.DFA_PASSWORD) return { email: process.env.DFA_EMAIL.trim().toLowerCase(), password: process.env.DFA_PASSWORD }
  if (!process.stdin.isTTY) {
    console.error('Ejecuta este comando en una terminal interactiva (en Claude Code: escribe "! npm run ..." en el prompt).')
    process.exit(1)
  }
  const email = (await ask('Correo: ')).trim().toLowerCase()
  const password = await ask('Contraseña (mínimo 12 caracteres, no se muestra): ', { hidden: true })
  if (confirm && (await ask('Repite la contraseña: ', { hidden: true })) !== password) {
    console.error('Las contraseñas no coinciden.')
    process.exit(1)
  }
  return { email, password }
}
