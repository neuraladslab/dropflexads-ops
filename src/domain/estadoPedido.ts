// Estado de un pedido de Dropi. Dropi no tiene un catálogo fijo (texto libre): se clasifica por palabra clave, igual que en DropFlex App
// (nueva_version-next/lib/dropiStatus.ts). Lo que no encaja cae en «otro»: nunca desaparece.
export type GrupoEstado = "entregado" | "devolucion" | "novedad" | "transito" | "pendiente" | "otro";

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

export function grupoEstado(crudo: string | null | undefined): GrupoEstado {
  const s = sinTildes(crudo ?? "");
  if (!s) return "otro";
  if (s.includes("ENTREG")) return "entregado";
  if (s.includes("DEVOL") || s.includes("RECHAZ") || s.includes("CANCEL")) return "devolucion"; // ya es plata perdida (flete de regreso)
  if (s.includes("RECLAM") || s.includes("OFICINA") || s.includes("INDEMNIZ") || s.includes("NOVEDAD")) return "novedad"; // en riesgo
  if (s.includes("REPARTO") || s.includes("TRANSITO") || s.includes("RUTA") || s.includes("DESPACH")) return "transito";
  if (s.includes("GUIA") || s.includes("PENDIENTE") || s.includes("CONFIRMACION") || s.includes("PREPARACION")) return "pendiente";
  return "otro";
}

/** Un pedido está «cerrado» cuando ya no cambiará de resultado para la contabilidad (entregado o devuelto). */
export const estaCerrado = (g: GrupoEstado) => g === "entregado" || g === "devolucion";
