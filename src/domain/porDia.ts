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
};

export const diaVacio = (dia: string): Dia => ({ dia, ganancia: 0, devoluciones: 0, comisiones: 0, otrosDescuentos: 0, meta: 0, otrosGastos: 0 });
const r2 = (n: number) => Math.round(n * 100) / 100;

export const costosDelDia = (d: Dia, herramientas = 0): Costos => ({
  meta: d.meta, devoluciones: d.devoluciones, comisionesTarjeta: d.comisiones,
  otrosDescuentosDropi: d.otrosDescuentos, otrosGastosTarjeta: d.otrosGastos, herramientas,
});

/** Suma los días en un total y calcula el veredicto de todo el período. `herramientasPorDia` se reparte por día. */
export function resumirDias(dias: Dia[], herramientasPorDia = 0) {
  const t = diaVacio("total");
  for (const d of dias) {
    t.ganancia += d.ganancia; t.devoluciones += d.devoluciones; t.comisiones += d.comisiones;
    t.otrosDescuentos += d.otrosDescuentos; t.meta += d.meta; t.otrosGastos += d.otrosGastos;
  }
  const herramientas = r2(herramientasPorDia * dias.length);
  return { total: t, herramientas, ...resultado(t.ganancia, costosDelDia(t, herramientas)) };
}

/** Neto de un día (sin herramientas) y su veredicto. */
export const netoDelDia = (d: Dia) => resultado(d.ganancia, costosDelDia(d));
