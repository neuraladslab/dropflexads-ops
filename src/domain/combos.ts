// «Lo vendido por combo»: los pedidos ENTREGADOS agrupados por el VALOR TOTAL que devuelve Dropi (cada precio es un combo), con lo facturado y la ganancia REAL de la billetera.
// Agrupar por valor clasifica todos los pedidos entregados, incluso los que no traen la cantidad de unidades. Una «venta» es un pedido entregado.
// La ganancia por venta se promedia solo entre las que ya tienen su ganancia en la billetera.
const r2 = (n: number) => Math.round(n * 100) / 100;

export type PedidoCombo = { idPedido: string; unidades: number | null; total: number | null; contable: string; creado?: string | null };
export type FilaCombo = {
  valor: number; unidades: number | null; ventas: number; pctVentas: number; facturado: number;
  gananciaTotal: number; conGanancia: number; gananciaPorVenta: number | null;
};
const ENTREGADO = new Set(["pagado", "sin_pagar", "no_verificable"]);

export function combosVendidos(pedidos: PedidoCombo[], ganancias: Map<string, number>) {
  const grupos = new Map<number, PedidoCombo[]>();
  let sinValor = 0;
  for (const p of pedidos) {
    if (!ENTREGADO.has(p.contable)) continue;
    if (!p.total || p.total <= 0) { sinValor++; continue; }
    (grupos.get(p.total) ?? grupos.set(p.total, []).get(p.total)!).push(p);
  }
  const ventasTotal = [...grupos.values()].reduce((a, g) => a + g.length, 0);
  const filas: FilaCombo[] = [...grupos.entries()].sort((a, b) => a[0] - b[0]).map(([valor, g]) => {
    // Unidades del combo = la cantidad más frecuente entre sus pedidos (null si ninguno la trae).
    const cuenta = new Map<number, number>();
    for (const p of g) if (p.unidades && p.unidades >= 1) cuenta.set(p.unidades, (cuenta.get(p.unidades) ?? 0) + 1);
    const unidades = [...cuenta.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? null;
    const conG = g.filter((p) => ganancias.has(p.idPedido));
    const gananciaTotal = r2(conG.reduce((a, p) => a + (ganancias.get(p.idPedido) ?? 0), 0));
    return {
      valor, unidades, ventas: g.length, pctVentas: ventasTotal ? Math.round((g.length / ventasTotal) * 100) : 0,
      facturado: r2(g.reduce((a, p) => a + (p.total ?? 0), 0)), gananciaTotal, conGanancia: conG.length,
      gananciaPorVenta: conG.length ? r2(gananciaTotal / conG.length) : null,
    };
  });
  const conGanancia = filas.reduce((a, f) => a + f.conGanancia, 0), gananciaTotal = r2(filas.reduce((a, f) => a + f.gananciaTotal, 0));
  return {
    filas, sinValor,
    total: { ventas: ventasTotal, facturado: r2(filas.reduce((a, f) => a + f.facturado, 0)), gananciaTotal, conGanancia, gananciaPorVenta: conGanancia ? r2(gananciaTotal / conGanancia) : null },
  };
}
