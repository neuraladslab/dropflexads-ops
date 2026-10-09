// Un solo sitio para «qué día es». Colombia es UTC-5 todo el año (sin horario de verano).
const BOGOTA_OFFSET_MS = -5 * 3600e3;

/** Día calendario (YYYY-MM-DD) en Bogotá de un instante (Date o ISO con zona). */
export function diaBogota(instante: Date | string | number): string {
  const t = new Date(instante).getTime();
  if (!Number.isFinite(t)) throw new Error("Fecha no válida");
  return new Date(t + BOGOTA_OFFSET_MS).toISOString().slice(0, 10);
}

/** Inicio (inclusive) y fin (exclusive) en UTC de un día de Bogotá: para filtrar timestamps. */
export function rangoUtcDelDia(dia: string): { desde: Date; hasta: Date } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) throw new Error("Día no válido");
  const desde = new Date(Date.parse(dia + "T00:00:00Z") - BOGOTA_OFFSET_MS);
  return { desde, hasta: new Date(desde.getTime() + 864e5) };
}

export function sumarDias(dia: string, n: number): string {
  return new Date(Date.parse(dia + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
}

export const hoyBogota = (ahora: Date = new Date()): string => diaBogota(ahora);
