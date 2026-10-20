import 'server-only'
import { getSetting } from '@/lib/settings'
import { REPARTO_DEFECTO, validarReparto } from '@/domain/reparto.ts'

/** Plan de reparto del usuario (ajuste `reparto`, JSON). Si no hay o no es válido, se usa el de por defecto. */
export function repartoDesde(valor) {
  try {
    const v = JSON.parse(valor || 'null')
    if (v && !validarReparto(v)) return { destinos: v, propio: true }
  } catch { /* JSON dañado: se usa el de por defecto */ }
  return { destinos: REPARTO_DEFECTO, propio: false }
}
export async function repartoDe(uid) {
  return repartoDesde(await getSetting(uid, 'reparto'))
}
