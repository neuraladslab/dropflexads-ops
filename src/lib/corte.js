import 'server-only'
import { getSetting } from '@/lib/settings'
import { CORTE_POR_DEFECTO, diaCorteValido } from '@/domain/periodos.ts'

/** Día del mes en que cierra cada corte (ajuste `cut_day` del usuario; por defecto el 12). Solo agrupa: no borra ni oculta datos. */
/** El mismo cálculo a partir del valor ya leído (así una visita lee todos los ajustes con una sola consulta). */
export const corteDesde = (valor) => { const n = Number(valor); return diaCorteValido(n) ? n : CORTE_POR_DEFECTO }
export async function corteDia(uid) {
  return corteDesde(await getSetting(uid, 'cut_day'))
}
