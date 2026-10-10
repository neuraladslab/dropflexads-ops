// ¿Cuándo recupero la inversión? Lo invertido = todo lo que ha costado la operación (publicidad, devoluciones, comisiones, otros gastos, herramientas)
// desde que empezó. Lo recuperado = ganancias de pedidos entregados que ya entraron a la billetera. Una sola cifra, la misma de Contabilidad.
import { sumarDias } from "./fechas.ts";

export type EstadoRecuperacion = "sin_datos" | "recuperada" | "en_camino" | "sin_ritmo";
const r2 = (n: number) => Math.round(n * 100) / 100;

export function recuperacion(invertido: number, recuperado: number, ritmoPorDia: number, hoy: string) {
  if (invertido <= 0 && recuperado <= 0) return { estado: "sin_datos" as EstadoRecuperacion, pct: null, faltan: 0, excedente: 0, dias: null, fecha: null };
  const faltan = Math.max(0, r2(invertido - recuperado));
  const excedente = r2(recuperado - invertido);
  const pct = invertido > 0 ? Math.min(100, Math.floor((recuperado / invertido) * 100)) : 100;
  if (faltan === 0) return { estado: "recuperada" as EstadoRecuperacion, pct: 100, faltan: 0, excedente, dias: 0, fecha: null };
  // Con el ritmo reciente (lo que te queda por día tras todos los costos): si es ≤ 0, a este paso no se recupera.
  if (ritmoPorDia <= 0) return { estado: "sin_ritmo" as EstadoRecuperacion, pct, faltan, excedente, dias: null, fecha: null };
  const dias = Math.ceil(faltan / ritmoPorDia);
  return { estado: "en_camino" as EstadoRecuperacion, pct, faltan, excedente, dias, fecha: sumarDias(hoy, dias) };
}
