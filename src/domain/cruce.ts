// Cruce tarjeta ↔ Meta. Una sola definición: un cargo es «de Meta» solo si cruza con un cobro de Meta
// por la REFERENCIA DE PAGO (o por un vínculo manual). Todo lo demás es «otros», aunque diga FACEBK.
export type MovimientoTarjeta = {
  id: string;
  tipo: "cargo" | "abono";
  estado: "aprobado" | "rechazado";
  monto: number;
  refPago?: string | null;
  cobroManualId?: string | null;
};
export type CobroMeta = { id: string; refPago?: string | null; monto: number; estado: "pagado" | "fallido" | "pendiente" };

const norm = (s?: string | null) => (s ?? "").trim().toUpperCase();
const r2 = (n: number) => Math.round(n * 100) / 100;

export type ResultadoCruce = {
  meta: MovimientoTarjeta[];
  otros: MovimientoTarjeta[];
  totalMeta: number;
  totalOtros: number;
  /** Cobros de Meta (pagados) que no aparecen en la tarjeta. */
  cobrosSinTarjeta: CobroMeta[];
  /** Cargos de la tarjeta con referencia que se repiten: el segundo en adelante es un posible cobro doble. */
  repetidos: MovimientoTarjeta[];
};

export function cruzar(tarjeta: MovimientoTarjeta[], cobros: CobroMeta[]): ResultadoCruce {
  const porRef = new Map<string, CobroMeta>();
  for (const c of cobros) if (norm(c.refPago)) porRef.set(norm(c.refPago), c);
  const porId = new Map(cobros.map((c) => [c.id, c]));

  const meta: MovimientoTarjeta[] = [];
  const otros: MovimientoTarjeta[] = [];
  const repetidos: MovimientoTarjeta[] = [];
  const vistos = new Set<string>();
  const cobrosVistos = new Set<string>();

  for (const m of tarjeta) {
    if (m.tipo !== "cargo" || m.estado !== "aprobado") continue; // solo lo que movió plata hacia afuera
    const ref = norm(m.refPago);
    const cobro = (m.cobroManualId ? porId.get(m.cobroManualId) : undefined) ?? (ref ? porRef.get(ref) : undefined);
    if (!cobro) { otros.push(m); continue; }
    meta.push(m);
    cobrosVistos.add(cobro.id);
    if (ref) { if (vistos.has(ref)) repetidos.push(m); vistos.add(ref); }
  }
  const suma = (a: MovimientoTarjeta[]) => r2(a.reduce((s, x) => s + x.monto, 0));
  return {
    meta, otros, totalMeta: suma(meta), totalOtros: suma(otros), repetidos,
    cobrosSinTarjeta: cobros.filter((c) => c.estado === "pagado" && !cobrosVistos.has(c.id)),
  };
}
