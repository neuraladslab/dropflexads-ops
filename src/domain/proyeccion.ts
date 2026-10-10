// ¿Cuándo recupero? Con lo que ya vendiste: cada pedido pendiente (entregado sin pagar, o en camino) traerá una ganancia parecida al promedio real de los ya pagados,
// el día que Dropi suele pagar (días promedio entre la venta y el pago). No cuenta publicidad futura: es «qué pasa con lo que ya está en marcha».
import { diasEntre } from "./series.ts";
import { sumarDias } from "./fechas.ts";

const r2 = (n: number) => Math.round(n * 100) / 100;
export type Pendiente = { creado: string; contable: string };

export function proyectarRecuperacion(i: { faltan: number; gananciaPorPedido: number | null; lagDias: number; pendientes: Pendiente[]; hoy: string; tasas?: number[]; tasaBase?: number }) {
  const tasas = i.tasas || [0.6, 0.8, 1], g = i.gananciaPorPedido;
  if (g == null || g <= 0) return null;
  const lag = Math.max(0, Math.round(i.lagDias));
  const pend = i.pendientes.filter((p) => p.contable === "sin_pagar" || p.contable === "en_curso").map((p) => {
    const f = sumarDias(p.creado, lag);
    return { fecha: f < i.hoy ? i.hoy : f, segura: p.contable === "sin_pagar" };
  });
  const cuando = (tasa: number) => {
    const por = new Map<string, number>();
    for (const p of pend) por.set(p.fecha, (por.get(p.fecha) || 0) + g * (p.segura ? 1 : tasa));
    let acum = 0, fecha: string | null = null;
    const serie: { dia: string; acumulado: number }[] = [];
    const ultimo = [...por.keys()].sort().pop() || i.hoy;
    for (const dia of diasEntre(i.hoy, ultimo)) {
      acum += por.get(dia) || 0;
      serie.push({ dia, acumulado: r2(acum - i.faltan) });
      if (fecha == null && acum >= i.faltan) fecha = dia;
    }
    return { esperado: r2(acum), fecha, serie };
  };
  const escenarios = tasas.map((tasa) => { const c = cuando(tasa); return { tasa, esperado: c.esperado, cubre: c.esperado >= i.faltan, sobra: r2(c.esperado - i.faltan), fecha: c.fecha }; });
  const base = i.tasaBase ?? tasas[Math.floor(tasas.length / 2)];
  return { escenarios, serie: cuando(base).serie, tasaBase: base, gananciaPorPedido: g, lagDias: lag, pendientes: pend.length, seguras: pend.filter((p) => p.segura).length };
}
