// Ganancia «por día de venta»: la ganancia de cada pedido se cuenta el día en que se VENDIÓ (aunque Dropi la pague días después) y la publicidad el día en que
// Meta la gastó. Así un día refleja lo que hizo la campaña ese día. Es la vista de «rendimiento»; la de «caja» (por día que Dropi paga) sigue en porDia.ts.
import { diasEntre } from "./series.ts";

const r2 = (n: number) => Math.round(n * 100) / 100;
export type PedidoVenta = { creado: string; contable: string; ganancia: number };
export type CostoDia = { dia: string; publicidad: number; otros: number };

const ENTREGADOS = new Set(["pagado", "sin_pagar", "no_verificable"]);
const DEVUELTOS = new Set(["devuelto", "devuelto_cobrado"]);

/** Un registro por día de `desde` a `hasta`: ventas, entregados, en camino, devueltos, lo que ya se cobró de esas ventas (`entro`) y el costo del día (`gasto`). */
export function gananciaPorVenta(pedidos: PedidoVenta[], costos: CostoDia[], desde: string, hasta: string) {
  const ped = new Map<string, PedidoVenta[]>(), cos = new Map(costos.map((c) => [c.dia, c]));
  for (const p of pedidos) { const a = ped.get(p.creado) || []; a.push(p); ped.set(p.creado, a); }
  return diasEntre(desde, hasta).map((dia) => {
    const ps = ped.get(dia) || [], c = cos.get(dia);
    const entro = r2(ps.filter((p) => p.contable === "pagado").reduce((a, p) => a + p.ganancia, 0));
    const publicidad = r2(c ? c.publicidad : 0), otros = r2(c ? c.otros : 0);
    return {
      dia, ventas: ps.length, entregados: ps.filter((p) => ENTREGADOS.has(p.contable)).length, pagados: ps.filter((p) => p.contable === "pagado").length,
      enCamino: ps.filter((p) => p.contable === "en_curso").length, devueltos: ps.filter((p) => DEVUELTOS.has(p.contable)).length,
      entro, publicidad, gasto: r2(publicidad + otros), neto: r2(entro - publicidad - otros),
    };
  });
}

/**
 * Costo por venta del período con la publicidad real de Meta: por pedido generado, por pedido entregado y lo que te queda por entrega.
 * `mejorCaso` = costo por entrega si se entregaran todos los que van en camino (los entregados ya cuentan con su ganancia real).
 */
export function costoPorVentaReal(dias: { ventas: number; entregados: number; pagados: number; enCamino: number; entro: number; publicidad: number }[]) {
  const s = (k: "ventas" | "entregados" | "pagados" | "enCamino" | "entro" | "publicidad") => dias.reduce((a, d) => a + d[k], 0);
  const ventas = s("ventas"), entregados = s("entregados"), pagados = s("pagados"), enCamino = s("enCamino"), gasto = r2(s("publicidad")), ganancia = r2(s("entro"));
  const gananciaPorPedido = pagados > 0 ? r2(ganancia / pagados) : null;
  const cpaEntrega = entregados > 0 && gasto > 0 ? r2(gasto / entregados) : null;
  return {
    ventas, entregados, pagados, enCamino, gasto, ganancia,
    costoPorPedido: ventas > 0 && gasto > 0 ? r2(gasto / ventas) : null,
    cpaEntrega, gananciaPorPedido,
    quedaPorEntrega: cpaEntrega != null && gananciaPorPedido != null ? r2(gananciaPorPedido - cpaEntrega) : null,
    mejorCaso: gasto > 0 && entregados + enCamino > 0 ? r2(gasto / (entregados + enCamino)) : null,
  };
}
