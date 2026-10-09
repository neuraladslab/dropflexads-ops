// Comprueba si una contraseña apareció en filtraciones públicas (Have I Been Pwned, rango k-anonimato).
// Solo se envían los PRIMEROS 5 caracteres del SHA-1 de la contraseña: ni la contraseña ni su hash completo salen de este servidor,
// y la respuesta trae cientos de sufijos (con relleno) entre los que no se distingue el tuyo. Si el servicio no responde, NO se bloquea
// el cambio (la política local sigue aplicando); se desactiva con PASSWORD_BREACH_CHECK=off.
import { createHash } from 'node:crypto'

const BASE = process.env.PWNED_API_URL || 'https://api.pwnedpasswords.com/range/'

/** Veces que la contraseña aparece en filtraciones; 0 si no aparece; null si no se pudo comprobar. */
export async function breachCount(password) {
  if (process.env.PASSWORD_BREACH_CHECK === 'off') return null
  const sha = createHash('sha1').update(String(password).normalize('NFKC')).digest('hex').toUpperCase()
  const prefix = sha.slice(0, 5), suffix = sha.slice(5)
  try {
    const res = await fetch(BASE + prefix, { headers: { 'Add-Padding': 'true', 'User-Agent': 'dropflexads-password-check' }, signal: AbortSignal.timeout(3000), cache: 'no-store' })
    if (!res.ok) return null
    for (const line of (await res.text()).split('\n')) {
      const [h, n] = line.trim().split(':')
      if (h === suffix) return Number(n) || 0
    }
    return 0
  } catch {
    return null
  }
}

export const BREACH_MESSAGE = (n) => `Esa contraseña apareció ${n.toLocaleString('es-CO')} ${n === 1 ? 'vez' : 'veces'} en filtraciones de datos públicas. Elige otra, distinta a las que usas en otros sitios.`
