// «Lo vendido por combo»: los pedidos ENTREGADOS agrupados por unidades (1x, 2x, 3x…), con su precio, lo facturado y la ganancia REAL de la billetera.
// Una «venta» es un pedido entregado. La ganancia por venta se promedia solo entre las que ya tienen su ganancia en la billetera.
const r2 = (n: number) => Math.round(n * 100) / 100;

export type PedidoCombo = { idPedido: string; unidades: number | null; total: number | null; contable: string; creado?: string | null };
export type FilaCombo = {
  unidades: number; precio: number | null; ventas: number; pctVentas: number; facturado: number;
  gananciaTotal: number; conGanancia: number; gananciaPorVenta: number | null;
};
const ENTREGADO = new Set(["pagado", "sin_pagar", "no_verificable"]);

export function combosVendidos(pedidos: PedidoCombo[], ganancias: Map<string, number>) {
  const grupos = new Map<number, PedidoCombo[]>();
  let sinCantidad = 0;
  for (const p of pedidos) {
    if (!ENTREGADO.has(p.contable)) continue;
    if (!p.unidades || p.unidades < 1) { sinCantidad++; continue; }
    (grupos.get(p.unidades) ?? grupos.set(p.unidades, []).get(p.unidades)!).push(p);
  }
  const ventasTotal = [...grupos.values()].reduce((a, g) => a + g.length, 0);
  const filas: FilaCombo[] = [...grupos.entries()].sort((a, b) => a[0] - b[0]).map(([unidades, g]) => {
    // Precio actual = el precio más frecuente; si empatan, el del pedido más reciente.
    const cuenta = new Map<number, { n: number; ultimo: string }>();
    for (const p of g) if (p.total) { const c = cuenta.get(p.total) ?? { n: 0, ultimo: "" }; c.n++; if ((p.creado ?? "") > c.ultimo) c.ultimo = p.creado ?? ""; cuenta.set(p.total, c); }
    const precio = [...cuenta.entries()].sort((a, b) => b[1].n - a[1].n || (b[1].ultimo > a[1].ultimo ? 1 : -1))[0]?.[0] ?? null;
    const conG = g.filter((p) => ganancias.has(p.idPedido));
    const gananciaTotal = r2(conG.reduce((a, p) => a + (ganancias.get(p.idPedido) ?? 0), 0));
    return {
      unidades, precio, ventas: g.length, pctVentas: ventasTotal ? Math.round((g.length / ventasTotal) * 100) : 0,
      facturado: r2(g.reduce((a, p) => a + (p.total ?? 0), 0)), gananciaTotal, conGanancia: conG.length,
      gananciaPorVenta: conG.length ? r2(gananciaTotal / conG.length) : null,
    };
  });
  const conGanancia = filas.reduce((a, f) => a + f.conGanancia, 0), gananciaTotal = r2(filas.reduce((a, f) => a + f.gananciaTotal, 0));
  return {
    filas, sinCantidad,
    total: { ventas: ventasTotal, facturado: r2(filas.reduce((a, f) => a + f.facturado, 0)), gananciaTotal, conGanancia, gananciaPorVenta: conGanancia ? r2(gananciaTotal / conGanancia) : null },
  };
}
