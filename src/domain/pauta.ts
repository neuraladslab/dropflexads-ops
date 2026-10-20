// Cuánta publicidad hay que poder pagar. Dos cosas, ambas con IVA y con los datos reales de Meta:
//  · El RITMO de gasto: promedio por día ACTIVO de la última semana (un día con la campaña pausada no cuenta como «gasto bajo»), tomando el mayor entre ese promedio y el de los últimos 3 días activos.
//  · La DEUDA con Meta: lo que ya gastó (con IVA) y todavía no cobró. Meta cobra por umbral (cada ~$90 mil), no cada día, así que siempre hay un cobro en camino.
import { sumarDias } from "./fechas.ts";

export type GastoDia = { dia: string; gasto: number }; // gasto con IVA
export type CobroMeta = { dia: string; monto: number }; // cobros de Meta pagados (los de «Mis cuentas → Meta»)
const r2 = (n: number) => Math.round(n * 100) / 100;
export const GASTO_MINIMO_ACTIVO = 1000; // por debajo de esto el día se considera sin pauta (hay residuos de centavos)

/** `hasta` debe ser un día COMPLETO (ayer, si hoy aún está gastando): un día a medias bajaría el promedio. */
export function ritmoPauta(gastos: GastoDia[], hasta: string): { ritmo: number; promedio7: number; ultimos3: number; diasActivos: number } {
  const desde = sumarDias(hasta, -6);
  const por = new Map<string, number>();
  for (const g of gastos) if (g.dia >= desde && g.dia <= hasta) por.set(g.dia, (por.get(g.dia) ?? 0) + g.gasto);
  const activos = [...por].filter(([, v]) => v >= GASTO_MINIMO_ACTIVO).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([, v]) => v);
  if (!activos.length) return { ritmo: 0, promedio7: 0, ultimos3: 0, diasActivos: 0 };
  const media = (l: number[]) => l.reduce((a, x) => a + x, 0) / l.length;
  const promedio7 = media(activos), ultimos3 = media(activos.slice(-3));
  return { ritmo: r2(Math.max(promedio7, ultimos3)), promedio7: r2(promedio7), ultimos3: r2(ultimos3), diasActivos: activos.length };
}

/** Gastado (con IVA) hasta `hasta` menos lo ya cobrado hasta `hasta`. Nunca negativo. Depende de que los cobros de Meta estén registrados. */
export function deudaMeta(gastos: GastoDia[], cobros: CobroMeta[], hasta: string): number {
  const g = gastos.filter((x) => x.dia <= hasta).reduce((a, x) => a + x.gasto, 0), c = cobros.filter((x) => x.dia <= hasta).reduce((a, x) => a + x.monto, 0);
  return Math.max(0, r2(g - c));
}
