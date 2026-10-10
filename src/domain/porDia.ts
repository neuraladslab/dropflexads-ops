// Ganancia por día: junta lo que entró a la billetera (ganancias de pedidos entregados) con lo que costó (Meta, devoluciones, comisiones, otros).
// Cada día es un día de Bogotá. Una sola cifra de ganancia: la misma que usa el Dashboard.
import { resultado, type Costos } from "./ganancia.ts";

export type Dia = {
  dia: string;
  ganancia: number;
  devoluciones: number;
  comisiones: number; // mantenimiento y comisión de recarga de la tarjeta
  otrosDescuentos: number;
  meta: number; // lo que cruza con un cobro de Meta
  otrosGastos: number; // gastos de la tarjeta que no son de Meta
  entregas: number; // pedidos entregados (ganancias de la billetera) ese día
  pagosHerramientas: number; // transferencias de la billetera a herramientas (p. ej. ChatePro): cuentan como Herramientas
};

export const diaVacio = (dia: string): Dia => ({ dia, ganancia: 0, devoluciones: 0, comisiones: 0, otrosDescuentos: 0, meta: 0, otrosGastos: 0, entregas: 0, pagosHerramientas: 0 });
const r2 = (n: number) => Math.round(n * 100) / 100;

export const costosDelDia = (d: Dia, herramientas = 0): Costos => ({
  meta: d.meta, devoluciones: d.devoluciones, comisionesTarjeta: d.comisiones,
  otrosDescuentosDropi: d.otrosDescuentos, otrosGastosTarjeta: d.otrosGastos, herramientas: herramientas + d.pagosHerramientas,
});

/** Suma los días en un total y calcula el veredicto de todo el período. `herramientasPorDia` se reparte por día. */
export function resumirDias(dias: Dia[], herramientasPorDia = 0) {
  const t = diaVacio("total");
  for (const d of dias) {
    t.ganancia += d.ganancia; t.devoluciones += d.devoluciones; t.comisiones += d.comisiones;
    t.otrosDescuentos += d.otrosDescuentos; t.meta += d.meta; t.otrosGastos += d.otrosGastos; t.entregas += d.entregas; t.pagosHerramientas += d.pagosHerramientas;
  }
  const herramientas = r2(herramientasPorDia * dias.length);
  return { total: t, herramientas, ...resultado(t.ganancia, costosDelDia(t, herramientas)) };
}

/** Neto de un día (sin herramientas) y su veredicto. */
export const netoDelDia = (d: Dia) => resultado(d.ganancia, costosDelDia(d));

/**
 * Costo por venta REAL: lo gastado en publicidad (solo lo que cruza con Meta) entre los pedidos entregados. Si no hay entregas o no hay gasto de Meta
 * identificado, no se inventa: devuelve null en lo que no se puede calcular.
 */
export function costoPorVenta(total: Dia, neto: number) {
  const n = total.entregas;
  const cpa = n > 0 && total.meta > 0 ? r2(total.meta / n) : null;
  const gananciaPorPedido = n > 0 ? r2(total.ganancia / n) : null;
  return {
    entregas: n, gastoMeta: total.meta, cpa, gananciaPorPedido,
    quedaPorPedido: cpa != null && gananciaPorPedido != null ? r2(gananciaPorPedido - cpa) : null, // lo que deja cada pedido después de pagar su publicidad
    netoPorPedido: n > 0 ? r2(neto / n) : null, // con TODOS los costos
  };
}

/** Reparto de los costos: cada uno con su parte del total de costos y de la ganancia de pedidos. Solo los que valen más de 0, de mayor a menor. */
export function repartoDeCostos(c: Costos, ganancia: number) {
  const filas: [string, number][] = [
    ["Publicidad en Meta", c.meta], ["Otros gastos de la tarjeta", c.otrosGastosTarjeta], ["Devoluciones", c.devoluciones],
    ["Comisiones y mantenimiento de la tarjeta", c.comisionesTarjeta], ["Otros descuentos de Dropi", c.otrosDescuentosDropi], ["Herramientas", c.herramientas],
  ];
  const total = filas.reduce((a, [, v]) => a + v, 0);
  return filas.filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([nombre, monto]) => ({
    nombre, monto: r2(monto), pctDelCosto: total > 0 ? Math.round((monto / total) * 100) : 0, pctDeLaGanancia: ganancia > 0 ? Math.round((monto / ganancia) * 100) : null,
  }));
}
