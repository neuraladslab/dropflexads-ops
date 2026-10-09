// Política de contraseñas (OWASP/NIST 800-63B): longitud antes que complejidad, y rechazo de lo predecible y de lo ya filtrado.
export const PASSWORD_MIN = 12
export const PASSWORD_MAX = 128

// Raíces muy comunes (en minúsculas, sin acentos). Se rechaza una contraseña que sea solo una raíz más números/símbolos/mayúsculas
// («Colombia2026!», «P@ssw0rd1234», «Qwerty123456»). Una frase larga que CONTENGA una palabra común sí se acepta.
const ROOTS = [
  'password', 'passw0rd', 'contrasena', 'clave', 'admin', 'administrator', 'administrador', 'welcome', 'bienvenido', 'letmein', 'iloveyou', 'tequiero',
  'qwerty', 'qwertyuiop', 'asdfgh', 'asdfghjkl', 'zxcvbn', 'zxcvbnm', 'abcdef', 'abcdefghijkl', 'abc', 'monkey', 'dragon', 'master', 'login', 'princess',
  'football', 'futbol', 'colombia', 'medellin', 'bogota', 'cali', 'dropflexads', 'dropflex', 'dropshipping', 'dropi', 'meta', 'facebook', 'pauta',
  'campana', 'ventas', 'dinero', 'prueba', 'test', 'usuario', 'user', 'changeme', 'cambiame', 'secret', 'secreto', 'superman', 'batman', 'shadow',
  'sunshine', 'trustno', 'freedom', 'whatever', 'hello', 'hola', 'holamundo', 'amor', 'mamacita', 'michelle', 'jesus', 'dios',
]
const SEQUENCES = ['0123456789', '9876543210', 'abcdefghijklmnopqrstuvwxyz', 'zyxwvutsrqponmlkjihgfedcba', 'qwertyuiopasdfghjklzxcvbnm', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm', '1qaz2wsx3edc', '1q2w3e4r5t6y']

const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
// Sustituciones típicas («p@ssw0rd» → «password»).
const unleet = (s) => s.replace(/@/g, 'a').replace(/0/g, 'o').replace(/[1!|]/g, 'i').replace(/3/g, 'e').replace(/[4]/g, 'a').replace(/[5$]/g, 's').replace(/7/g, 't')

/** ¿Todo lo que hay en la contraseña son raíces comunes (con a lo sumo 3 letras de sobra)? */
function predictable(core) {
  if (!core) return false
  if (ROOTS.includes(core)) return true
  let rest = core
  for (let guard = 0; guard < 6; guard++) {
    const r = ROOTS.filter((x) => x.length >= 4 && rest.includes(x)).sort((a, b) => b.length - a.length)[0]
    if (!r) break
    rest = rest.replace(r, '')
  }
  return rest.length < core.length && rest.length <= 3
}

/** Devuelve un mensaje de error en español o null si la contraseña es aceptable. */
export function validatePassword(password, email = '') {
  if (typeof password !== 'string') return 'La contraseña no es válida.'
  if (password.length < PASSWORD_MIN) return `Usa al menos ${PASSWORD_MIN} caracteres. Una frase larga es más segura que una palabra con símbolos.`
  if (password.length > PASSWORD_MAX) return `Usa máximo ${PASSWORD_MAX} caracteres.`
  if (!password.trim()) return 'La contraseña no puede ser solo espacios.'
  const lower = fold(password)
  if (new Set(lower).size < 5) return 'La contraseña es demasiado repetitiva. Usa una frase con más variedad.'
  if (/^(.{1,6})\1+$/.test(lower)) return 'La contraseña repite un mismo patrón. Elige otra.'
  // Tramos de teclado o secuencias («qwertyuiop», «1234567890», «abcdefghij»).
  const letters = lower.replace(/[^a-z0-9]/g, '')
  for (const seq of SEQUENCES) {
    for (let i = 0; i + 8 <= seq.length; i++) if (letters.includes(seq.slice(i, i + 8))) return 'La contraseña contiene una secuencia predecible (como «12345678» o «qwertyui»). Elige otra.'
  }
  // «raíz común» + números/símbolos al final o al inicio.
  // Se prueba con los números quitados («Colombia2026») y con las sustituciones deshechas («p@ssw0rd»).
  const cores = [lower.replace(/[^a-z]/g, ''), unleet(lower.replace(/^[^a-z@$]+|[^a-z0@$]+$/g, '')).replace(/[^a-z]/g, '')]
  if (cores.some(predictable)) return 'Esa contraseña es demasiado común o predecible (palabras típicas con números o símbolos). Usa una frase larga propia.'
  const local = fold(String(email).split('@')[0])
  if (local.length >= 4 && lower.replace(/[^a-z0-9]/g, '').includes(local.replace(/[^a-z0-9]/g, ''))) return 'La contraseña no debe contener tu correo.'
  return null
}
