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
  // Nunca antes del inicio de la operación ni de los 3 meses permitidos (el mes actual y los 2 anteriores), ni más de MAX_DIAS atrás.
  const base = pisoSync(e.inicioOperacion, e.hoy);
  const tope = sumarDias(e.hoy, -MAX_DIAS);
  const piso = base > tope ? base : tope;
  const acotar = (d: string) => (d < piso ? piso : d);
  if (e.from) {
    const hasta = e.to && e.to <= e.hoy ? e.to : e.hoy;
    return { from: acotar(e.from > hasta ? hasta : e.from), to: hasta };
  }
  const inicio = piso > e.hoy ? e.hoy : piso;
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

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const MESES_ATRAS = 2; // el mes actual y los 2 anteriores (p. ej. en octubre: octubre, septiembre y agosto)

/** Primer día que se puede elegir como inicio de la operación: el día 1 del mes de hace `MESES_ATRAS` meses. */
export function pisoInicio(hoy: string): string {
  const total = Number(hoy.slice(0, 4)) * 12 + (Number(hoy.slice(5, 7)) - 1) - MESES_ATRAS;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}-01`;
}

/** «agosto, septiembre y octubre de 2026» (los meses desde los que se puede empezar). */
export function mesesPermitidos(hoy: string): string {
  const piso = pisoInicio(hoy);
  const base = Number(piso.slice(0, 4)) * 12 + (Number(piso.slice(5, 7)) - 1);
  const m = [0, 1, 2].map((i) => ({ mes: MESES[(base + i) % 12], anio: Math.floor((base + i) / 12) }));
  const anios = [...new Set(m.map((x) => x.anio))];
  return anios.length === 1 ? `${m[0].mes}, ${m[1].mes} y ${m[2].mes} de ${anios[0]}` : m.map((x, i) => `${x.mes} de ${x.anio}${i === 1 ? " y" : i === 0 ? "," : ""}`).join(" ").replace(", y", " y");
}

const errorPiso = (hoy: string) => `Solo se puede traer información desde el 1 de ${MESES[Number(pisoInicio(hoy).slice(5, 7)) - 1]} de ${pisoInicio(hoy).slice(0, 4)}: el mes actual y los ${MESES_ATRAS} anteriores (${mesesPermitidos(hoy)}).`;

/** Día 1 del mes de una fecha: la operación de una empresa empieza el día 1 del mes en que se registra. */
export const inicioDelMes = (dia: string): string => `${dia.slice(0, 7)}-01`;

/** «octubre de 2026» (mes y año de una fecha YYYY-MM-DD). */
export const mesYAnio = (dia: string): string => `${MESES[Number(dia.slice(5, 7)) - 1]} de ${dia.slice(0, 4)}`;

/** Primer día que se puede sincronizar: el más reciente entre el inicio de la operación y el piso de los 3 meses. */
export const pisoSync = (inicio: string, hoy: string): string => {
  const piso = pisoInicio(hoy);
  return inicio > piso ? inicio : piso;
};

export type MesSincronizable = { mes: string; etiqueta: string; desde: string; hasta: string };

/** Meses que se pueden sincronizar (del más antiguo al actual) con su rango de días: desde = el día 1 (o el inicio de la operación, si cae en ese mes), hasta = el último día (o hoy). */
export function mesesSincronizables(inicio: string, hoy: string): MesSincronizable[] {
  const piso = pisoSync(inicio, hoy);
  const out: MesSincronizable[] = [];
  let y = Number(piso.slice(0, 4)), m = Number(piso.slice(5, 7));
  const fin = Number(hoy.slice(0, 4)) * 12 + Number(hoy.slice(5, 7));
  while (y * 12 + m <= fin) {
    const primero = `${y}-${String(m).padStart(2, "0")}-01`;
    const ultimo = sumarDias(`${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`, -1);
    out.push({ mes: primero.slice(0, 7), etiqueta: mesYAnio(primero), desde: primero < piso ? piso : primero, hasta: ultimo > hoy ? hoy : ultimo });
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}

/** Valida un rango pedido a mano para sincronizar: un solo mes, sin pasar por encima del inicio de la operación ni de los 3 meses permitidos. */
export function validarRangoOperacion(from: unknown, to: unknown, hoy: string, inicio: string): string | null {
  const e = validarRango(from, to, hoy);
  if (e) return e;
  const desde = from as string, hasta = typeof to === "string" && to ? to : desde;
  if (desde.slice(0, 7) !== hasta.slice(0, 7)) return "Sincroniza un solo mes a la vez: «desde» y «hasta» deben ser del mismo mes.";
  if (desde < inicio) return `Tu operación empieza el ${inicio}: no se puede traer nada anterior.`;
  if (desde < pisoInicio(hoy)) return errorPiso(hoy);
  return null;
}
