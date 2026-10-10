// Cruce tarjeta ↔ Meta. Una sola definición: un cargo es «de Meta» solo si cruza con un cobro de Meta
// por la REFERENCIA DE PAGO (o por un vínculo manual). Todo lo demás es «otros», aunque diga FACEBK.
export type MovimientoTarjeta = {
  id: string;
  fecha?: string | null; // día (YYYY-MM-DD); hace falta para el cruce de respaldo por monto y fecha
  tipo: "cargo" | "abono";
  estado: "aprobado" | "rechazado";
  monto: number;
  refPago?: string | null;
  cobroManualId?: string | null;
};
export type CobroMeta = { id: string; fecha?: string | null; refPago?: string | null; monto: number; estado: "pagado" | "fallido" | "pendiente" };
export type OpcionesCruce = { tolPct?: number; diasAntes?: number; diasDespues?: number };

const norm = (s?: string | null) => (s ?? "").trim().toUpperCase();
const r2 = (n: number) => Math.round(n * 100) / 100;

export type ResultadoCruce = {
  meta: MovimientoTarjeta[];
  /** De `meta`, los que cruzaron por monto y fecha (el cobro no traía referencia de pago). */
  porMonto: MovimientoTarjeta[];
  otros: MovimientoTarjeta[];
  totalMeta: number;
  totalOtros: number;
  /** Cobros de Meta (pagados) que no aparecen en la tarjeta. */
  cobrosSinTarjeta: CobroMeta[];
  /** Cargos de la tarjeta con referencia que se repiten: el segundo en adelante es un posible cobro doble. */
  repetidos: MovimientoTarjeta[];
};

export function cruzar(tarjeta: MovimientoTarjeta[], cobros: CobroMeta[], op: OpcionesCruce = {}): ResultadoCruce {
  const { tolPct = 1.5, diasAntes = 1, diasDespues = 5 } = op;
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
  // Respaldo: un cobro de Meta SIN referencia de pago se empareja, uno a uno, con el cargo aprobado que no cruzó más parecido en monto (tolerancia en %) y fecha (unos días después).
  const dia = (f?: string | null) => (f ? Date.parse(f + "T12:00:00Z") / 864e5 : NaN);
  const porMonto: MovimientoTarjeta[] = [];
  const libres = otros.slice();
  const pend = cobros.filter((c) => c.estado === "pagado" && !norm(c.refPago) && !cobrosVistos.has(c.id) && c.fecha).sort((a, b) => (a.fecha! < b.fecha! ? -1 : 1));
  for (const c of pend) {
    let mejor = -1, mejorDif = Infinity, mejorDias = Infinity;
    libres.forEach((m, i) => {
      const dias = dia(m.fecha) - dia(c.fecha), dif = Math.abs(m.monto - c.monto);
      if (!Number.isFinite(dias) || dias < -diasAntes || dias > diasDespues || dif > (c.monto * tolPct) / 100) return;
      if (dif < mejorDif || (dif === mejorDif && Math.abs(dias) < mejorDias)) { mejor = i; mejorDif = dif; mejorDias = Math.abs(dias); }
    });
    if (mejor >= 0) { const [m] = libres.splice(mejor, 1); porMonto.push(m); cobrosVistos.add(c.id); }
  }
  if (porMonto.length) {
    const ids = new Set(porMonto.map((m) => m.id));
    for (let i = otros.length - 1; i >= 0; i--) if (ids.has(otros[i].id)) otros.splice(i, 1);
    meta.push(...porMonto);
  }
  const suma = (a: MovimientoTarjeta[]) => r2(a.reduce((s, x) => s + x.monto, 0));
  return {
    meta, porMonto, otros, totalMeta: suma(meta), totalOtros: suma(otros), repetidos,
    cobrosSinTarjeta: cobros.filter((c) => c.estado === "pagado" && !cobrosVistos.has(c.id)),
  };
}
