import 'server-only'
import { getSetting } from '@/lib/settings'
import { OPERACION_INICIO } from '@/lib/dropi/config.mjs'

/** Día en que empezó la operación (ajuste `op_from` del usuario; por defecto, el inicio configurado). Lo anterior a esta fecha no cuenta. */
export const inicioOperacion = async (uid) => (await getSetting(uid, 'op_from')) || OPERACION_INICIO
