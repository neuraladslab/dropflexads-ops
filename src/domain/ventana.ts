// Qué fechas se piden a Dropi en cada sincronización. Lógica pura (sin base de datos ni red), con pruebas.
//  · incremental (la de todos los días y «Sincronizar ahora»): desde 2 días antes de la última sincronización buena (por si algo cambió de estado).
//  · histórico (primera vez, o «Traer histórico»): desde el inicio de la operación hasta hoy. No borra nada: lo ya guardado se reconoce y no se duplica.
//  · rango (manual, un día o entre dos fechas): exactamente lo pedido.
import { sumarDias } from "./fechas.ts";

export const MAX_DIAS = 120; // tope de retroceso (Dropi tarda más y el WAF vigila lecturas grandes)
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export type EntradaVentana = {
  hoy: string;
  inicioOperacion: string;
  ultimaSyncDia?: string | null; // día (Bogotá) de la última sincronización buena
  hayDatos: boolean;
  from?: string | null;
  to?: string | null;
  completo?: boolean;
};

export function calcularVentana(e: EntradaVentana): { from: string; to: string } {
  const piso = sumarDias(e.hoy, -MAX_DIAS);
  const acotar = (d: string) => (d < piso ? piso : d);
  if (e.from) {
    const hasta = e.to && e.to <= e.hoy ? e.to : e.hoy;
    return { from: acotar(e.from > hasta ? hasta : e.from), to: hasta };
  }
  const inicio = e.inicioOperacion > e.hoy ? e.hoy : e.inicioOperacion;
  if (e.completo || !e.hayDatos || !e.ultimaSyncDia) return { from: acotar(inicio), to: e.hoy };
  const desde = sumarDias(e.ultimaSyncDia, -2);
  return { from: acotar(desde < inicio ? inicio : desde), to: e.hoy };
}

/** Valida un rango pedido a mano. Devuelve el mensaje de error, o null si está bien. */
export function validarRango(from: unknown, to: unknown, hoy: string): string | null {
  if (typeof from !== "string" || !FECHA.test(from)) return "La fecha «desde» no es válida.";
  const hasta = typeof to === "string" && to ? to : from; // un solo día: sin «hasta»
  if (!FECHA.test(hasta)) return "La fecha «hasta» no es válida.";
  if (from < "2020-01-01") return "La fecha «desde» es demasiado antigua.";
  if (hasta > hoy) return "La fecha «hasta» no puede ser futura.";
  if (from > hasta) return "La fecha «desde» debe ser anterior o igual a «hasta».";
  if ((Date.parse(hasta + "T12:00:00Z") - Date.parse(from + "T12:00:00Z")) / 864e5 > MAX_DIAS) return `El rango no puede pasar de ${MAX_DIAS} días.`;
  return null;
}

/** ¿Esta fecha (YYYY-MM-DD) cae dentro de la operación? Lo anterior a la fecha de inicio no cuenta. Sin fecha no se puede juzgar: se deja pasar. */
export const dentroDeOperacion = (fecha: string | null | undefined, inicio: string) => !fecha || fecha >= inicio;

/** Valida la fecha desde la que se sincronizan los datos de Dropi (tarjeta y billetera). Devuelve el mensaje de error, o null si está bien. */
export function validarInicio(from: unknown, hoy: string): string | null {
  if (typeof from !== "string" || !FECHA.test(from)) return "Escribe una fecha válida.";
  if (from > hoy) return "La fecha no puede ser futura.";
  const piso = sumarDias(hoy, -MAX_DIAS);
  if (from < piso) return `Solo se pueden traer datos de hasta ${MAX_DIAS} días atrás (desde el ${piso}).`;
  return null;
}
