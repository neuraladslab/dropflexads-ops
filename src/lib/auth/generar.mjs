// Contraseñas iniciales automáticas (las crea el servidor, el superadmin no las escribe ni las elige). Alfabeto sin caracteres que se confunden (0/O, 1/l/I).
import { randomInt } from 'node:crypto'
import { validatePassword } from './policy.mjs'

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'

/** 16 caracteres al azar en cuatro grupos («Kp7m-Qx4R-tN8w-Zc2b»): ≈93 bits; cumple la política de contraseñas. Se muestra una sola vez y debe cambiarse al entrar. */
export function generarClave(email = '') {
  for (;;) {
    const grupos = Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => ALFABETO[randomInt(ALFABETO.length)]).join(''))
    const clave = grupos.join('-')
    if (!validatePassword(clave, email)) return clave
  }
}
