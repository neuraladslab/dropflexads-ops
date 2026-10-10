// Campañas: cada campaña agrupa uno o más PRODUCTOS de Dropi. Un pedido se atribuye a una campaña por su producto (decisión de la usuaria).
// Regla: la primera campaña (en el orden dado: la más antigua) que tenga algún producto del pedido; si ninguna, el pedido queda «sin campaña».
export type CampanaDef = { id: string; productIds: string[] };
export type PedidoProductos = { idPedido: string; productIds: string[] };

export function atribuir(pedidos: PedidoProductos[], campanas: CampanaDef[]): Map<string, string | null> {
  const out = new Map<string, string | null>();
  for (const p of pedidos) {
    const c = campanas.find((c) => c.productIds.some((id) => p.productIds.includes(id)));
    out.set(p.idPedido, c ? c.id : null);
  }
  return out;
}

export type PedidoContable = { idPedido: string; contable: string };
export type FilaCampana = {
  pedidos: number; entregados: number; pagados: number; sinPagar: number; devueltos: number; enCurso: number;
  ganancia: number; costoDevoluciones: number; tasaDevolucion: number | null;
};
const r2 = (n: number) => Math.round(n * 100) / 100;
const vacia = (): FilaCampana => ({ pedidos: 0, entregados: 0, pagados: 0, sinPagar: 0, devueltos: 0, enCurso: 0, ganancia: 0, costoDevoluciones: 0, tasaDevolucion: null });

/**
 * Resultado por campaña (clave = id de campaña, o «sin» para lo que no tiene). `ganancias` y `devoluciones` = lo real de la billetera por ID de pedido.
 * Entregados = pagados + sin pagar + no verificables. Tasa de devolución = devueltos / (entregados + devueltos): lo que ya terminó su camino.
 */
export function resumenPorCampana(
  pedidos: PedidoContable[], asignacion: Map<string, string | null>, ganancias: Map<string, number>, devoluciones: Map<string, number>,
): Map<string, FilaCampana> {
  const m = new Map<string, FilaCampana>();
  for (const p of pedidos) {
    const k = asignacion.get(p.idPedido) ?? "sin";
    const f = m.get(k) ?? vacia();
    f.pedidos++;
    if (p.contable === "pagado") { f.pagados++; f.entregados++; }
    else if (p.contable === "sin_pagar" || p.contable === "no_verificable") { f.sinPagar += p.contable === "sin_pagar" ? 1 : 0; f.entregados++; }
    else if (p.contable === "devuelto" || p.contable === "devuelto_cobrado") f.devueltos++;
    else f.enCurso++;
    f.ganancia += ganancias.get(p.idPedido) ?? 0;
    f.costoDevoluciones += devoluciones.get(p.idPedido) ?? 0;
    m.set(k, f);
  }
  for (const f of m.values()) {
    f.ganancia = r2(f.ganancia); f.costoDevoluciones = r2(f.costoDevoluciones);
    const fin = f.entregados + f.devueltos;
    f.tasaDevolucion = fin > 0 ? Math.round((f.devueltos / fin) * 100) : null;
  }
  return m;
}
