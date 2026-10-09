// ¿Gano o pierdo? Una sola definición: ganancia real de pedidos entregados (billetera de Dropi) menos costos reales.
export type Costos = {
  meta: number; // con IVA, solo lo que cruza con Meta
  devoluciones: number;
  comisionesTarjeta: number;
  otrosDescuentosDropi: number;
  otrosGastosTarjeta: number;
  herramientas: number;
};
export type Veredicto = "gana" | "pierde" | "equilibrio";

export function resultado(gananciaPedidos: number, c: Costos) {
  const costos = c.meta + c.devoluciones + c.comisionesTarjeta + c.otrosDescuentosDropi + c.otrosGastosTarjeta + c.herramientas;
  const neto = Math.round((gananciaPedidos - costos) * 100) / 100;
  const margen = Math.max(1000, gananciaPedidos * 0.02); // dentro de este rango se considera equilibrio
  const veredicto: Veredicto = neto > margen ? "gana" : neto < -margen ? "pierde" : "equilibrio";
  return { costos, neto, veredicto, retornoPorPesoEnMeta: c.meta > 0 ? gananciaPedidos / c.meta : null };
}
