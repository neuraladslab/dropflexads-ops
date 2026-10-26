import 'server-only'
import { getSetting } from '@/lib/settings'
import { OPERACION_INICIO } from '@/lib/dropi/config.mjs'
import { hoyBogota } from '@/domain/fechas.ts'
import { mesesSincronizables, mesYAnio, pisoSync } from '@/domain/ventana.ts'

/** Día en que empezó la operación (ajuste `op_from` del usuario; por defecto, el inicio configurado). Lo anterior a esta fecha no cuenta. */
export const inicioOperacion = async (uid) => (await getSetting(uid, 'op_from')) || OPERACION_INICIO

/** ¿La empresa tiene día de inicio? Se fija solo al registrarla (día 1 de ese mes); sin él no se sincroniza. */
export const inicioConfigurado = async (uid) => !!(await getSetting(uid, 'op_from'))
export const SIN_INICIO = 'Esta empresa no tiene día de inicio de la operación. Pídele al superadmin que la revise.'

/** Inicio de la operación y los meses que se pueden sincronizar (desde ese inicio, máximo el mes actual y los 2 anteriores). */
export async function ventanaSync(uid) {
  const hoy = hoyBogota(), inicio = await inicioOperacion(uid)
  return { inicio, inicioTexto: inicio.endsWith('-01') ? mesYAnio(inicio) : null, piso: pisoSync(inicio, hoy), hoy, meses: mesesSincronizables(inicio, hoy) }
}
