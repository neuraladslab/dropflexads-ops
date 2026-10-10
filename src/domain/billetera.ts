// Qué pasó en la billetera cada día: lo que ENTRÓ y lo que SALIÓ, por tipo. La billetera de Dropi es «de paso» (la ganancia entra y casi toda sale a la tarjeta),
// así que el saldo vive cerca de $0: lo que se entiende es el movimiento, no la línea del saldo.
export type MovDia = { dia: string; kind: string; direction: "in" | "out"; monto: number };
export type EntraCat = "ganancia" | "propia" | "otros";
export type SaleCat = "tarjeta" | "descuentos" | "retiros";
export type DiaFlujo = { dia: string; entra: Record<EntraCat, number>; sale: Record<SaleCat, number>; totalEntra: number; totalSale: number };

export const ENTRA: Record<EntraCat, string> = { ganancia: "Ganancia de pedidos", propia: "Plata que pusiste tú", otros: "Otros ingresos" };
export const SALE: Record<SaleCat, string> = { tarjeta: "Pasado a tu tarjeta", descuentos: "Descuentos (devoluciones, comisiones, pagos)", retiros: "Retiros" };

const catEntra = (kind: string): EntraCat => (kind === "profit" ? "ganancia" : kind === "wallet_topup" ? "propia" : "otros");
const catSale = (kind: string): SaleCat => (kind === "to_card" ? "tarjeta" : kind === "withdrawal" ? "retiros" : "descuentos");
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Agrupa los movimientos por día (ascendente). Cada movimiento cuenta según su dirección real: lo que entra y lo que sale. */
export function flujoPorDia(movs: MovDia[]): DiaFlujo[] {
  const m = new Map<string, DiaFlujo>();
  for (const x of movs) {
    const d = m.get(x.dia) ?? { dia: x.dia, entra: { ganancia: 0, propia: 0, otros: 0 }, sale: { tarjeta: 0, descuentos: 0, retiros: 0 }, totalEntra: 0, totalSale: 0 };
    if (x.direction === "in") { d.entra[catEntra(x.kind)] += x.monto; d.totalEntra += x.monto; }
    else { d.sale[catSale(x.kind)] += x.monto; d.totalSale += x.monto; }
    m.set(x.dia, d);
  }
  return [...m.values()].sort((a, b) => (a.dia < b.dia ? -1 : 1)).map((d) => ({
    ...d, totalEntra: r2(d.totalEntra), totalSale: r2(d.totalSale),
    entra: { ganancia: r2(d.entra.ganancia), propia: r2(d.entra.propia), otros: r2(d.entra.otros) },
    sale: { tarjeta: r2(d.sale.tarjeta), descuentos: r2(d.sale.descuentos), retiros: r2(d.sale.retiros) },
  }));
}
