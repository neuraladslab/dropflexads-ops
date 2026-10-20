// Reparto de la UTILIDAD. Orden: 1) los ingresos de la billetera (lo que Dropi paga) cubren primero los gastos REALES (publicidad, devoluciones, comisiones, herramientas): lo que queda es la utilidad neta.
// 2) La billetera debe conservar un piso de liquidez (publicidad de 7 días con el ritmo real de Meta + su deuda + costo esperado de devoluciones). 3) La utilidad se divide con los porcentajes:
// los destinos que se quedan en la operación (reinversión extra, reserva, ahorro, impuestos) y, al final, los socios, que es lo único que se retira. salud.ts calcula cuánto se puede retirar y cuándo.
export type TipoDestino = "pauta" | "reserva" | "ahorro" | "impuestos" | "socio" | "otro";
export type Destino = { id: string; nombre: string; pct: number; tipo: TipoDestino };
export const TIPOS: Record<TipoDestino, string> = { pauta: "Reinversión extra en pauta", reserva: "Reserva", ahorro: "Ahorro", impuestos: "Impuestos", socio: "Socio/a (se retira)", otro: "Otro" };

// Punto de partida para una operación que aún crece (dos socios): la mitad de la utilidad se queda en la operación (reinversión extra, imprevistos, ahorro e impuestos) y la otra mitad es de los socios.
export const REPARTO_DEFECTO: Destino[] = [
  { id: "pauta", nombre: "Reinversión extra en pauta", pct: 25, tipo: "pauta" },
  { id: "reserva", nombre: "Reserva de imprevistos", pct: 10, tipo: "reserva" },
  { id: "ahorro", nombre: "Ahorro", pct: 10, tipo: "ahorro" },
  { id: "impuestos", nombre: "Impuestos", pct: 5, tipo: "impuestos" },
  { id: "socio1", nombre: "Socio 1", pct: 25, tipo: "socio" },
  { id: "socio2", nombre: "Socio 2", pct: 25, tipo: "socio" },
];

/** Valida un plan de reparto. Devuelve el mensaje de error o null si está bien. */
export function validarReparto(v: unknown): string | null {
  if (!Array.isArray(v) || v.length < 1 || v.length > 12) return "El reparto debe tener entre 1 y 12 destinos.";
  const ids = new Set<string>();
  let suma = 0;
  for (const d of v as Destino[]) {
    if (!d || typeof d.id !== "string" || !/^[a-z0-9_-]{1,20}$/.test(d.id) || ids.has(d.id)) return "Cada destino necesita un identificador único.";
    ids.add(d.id);
    if (typeof d.nombre !== "string" || !d.nombre.trim() || d.nombre.length > 40) return "Cada destino necesita un nombre (máximo 40 letras).";
    if (!(d.tipo in TIPOS)) return "Tipo de destino no válido.";
    if (typeof d.pct !== "number" || !Number.isFinite(d.pct) || d.pct < 0 || d.pct > 100) return "Cada porcentaje debe estar entre 0 y 100.";
    suma += d.pct;
  }
  return Math.abs(suma - 100) > 0.01 ? `Los porcentajes suman ${Math.round(suma * 100) / 100} %: deben sumar 100 %.` : null;
}

export type FilaReparto = Destino & { monto: number };
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Divide una utilidad según los porcentajes. El último destino absorbe el redondeo: la suma siempre es exactamente la utilidad. */
export function repartirUtilidad(destinos: Destino[], utilidad: number): FilaReparto[] {
  const base = Math.max(0, utilidad);
  let resto = r2(base);
  return destinos.map((d, i) => {
    const monto = i === destinos.length - 1 ? r2(resto) : r2((base * d.pct) / 100);
    resto = r2(resto - monto);
    return { ...d, monto };
  });
}
