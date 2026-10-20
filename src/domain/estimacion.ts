// Lo que se espera de los pedidos que aún no se resuelven. Es una ESTIMACIÓN (se marca siempre como tal): usa la ganancia media real por pedido de la campaña
// y el % de devolución que la persona guardó en cada campaña (15 por defecto). Lo real nunca se mezcla con esto.
import type { Periodo } from "./periodos.ts";

export const DEVOLUCION_POR_DEFECTO = 15;
export type PedidoEst = { creado?: string | null; contable: string; campanaId?: string | null };
export type ParamsEst = {
  gananciaMedia: Map<string, number>; // ganancia real media por pedido pagado, por campaña (clave «sin» para los que no tienen)
  gananciaGlobal: number | null; // media de todos los pedidos pagados: se usa si la campaña aún no tiene ninguno pagado
  pctDevolucion: Map<string, number>; // % de devolución esperado por campaña
  pctDefecto?: number;
  fleteDevolucion: number | null; // lo que Dropi cobra en promedio por una devolución (media real de la billetera)
};
export type Estimacion = {
  gananciaEsperada: number; // en curso × (1 − % devolución) + entregados sin pagar completos
  costoDevoluciones: number; // en curso × % devolución × flete + devueltos que aún no se cobran × flete
  pedidosEstimados: number; // cuántos pedidos entraron en la cuenta
  sinReferencia: number; // pedidos pendientes que no se pudieron estimar (la campaña no tiene ganancia media ni hay media global)
};
const r2 = (n: number) => Math.round(n * 100) / 100;

export function estimarPendientes(pedidos: PedidoEst[], periodos: Periodo[], p: ParamsEst): Map<string, Estimacion> {
  const out = new Map<string, Estimacion>();
  const pctDef = p.pctDefecto ?? DEVOLUCION_POR_DEFECTO;
  for (const per of periodos) {
    const e: Estimacion = { gananciaEsperada: 0, costoDevoluciones: 0, pedidosEstimados: 0, sinReferencia: 0 };
    for (const x of pedidos) {
      if (!x.creado || x.creado < per.desde || x.creado > per.hasta) continue;
      const k = x.campanaId || "sin";
      const pct = (p.pctDevolucion.get(k) ?? pctDef) / 100;
      const g = p.gananciaMedia.get(k) ?? p.gananciaGlobal;
      if (x.contable === "en_curso" || x.contable === "sin_pagar") {
        if (g == null) { e.sinReferencia++; continue; }
        e.pedidosEstimados++;
        e.gananciaEsperada += x.contable === "sin_pagar" ? g : g * (1 - pct); // lo ya entregado no se devuelve
        if (x.contable === "en_curso" && p.fleteDevolucion != null) e.costoDevoluciones += pct * p.fleteDevolucion;
      } else if (x.contable === "devuelto" && p.fleteDevolucion != null) {
        e.pedidosEstimados++; e.costoDevoluciones += p.fleteDevolucion; // devuelto cuyo flete Dropi aún no cobra
      }
    }
    out.set(per.id, { ...e, gananciaEsperada: r2(e.gananciaEsperada), costoDevoluciones: r2(e.costoDevoluciones) });
  }
  return out;
}
