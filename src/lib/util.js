// Utilidades compartidas por los importadores y la sincronización.
import { isDate, num } from '@/lib/http'
import { hoyBogota } from '@/domain/fechas.ts'

export const todayCO = () => hoyBogota()
export const okDate = (s) => isDate(s) && s >= '2020-01-01'
export const okAmount = (v) => num(v, { min: 1, max: 1_000_000_000 })
export const clip = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '')
/** Clave que evita duplicar filas al volver a importar el mismo archivo (la repetición dentro del archivo se conserva con #n). */
export function keyer() {
  const seen = new Map()
  return (base) => { const n = (seen.get(base) || 0) + 1; seen.set(base, n); return `${base}|#${n}`.slice(0, 290) }
}
export const MAX_IMPORT = 2000
