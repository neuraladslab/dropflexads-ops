// Estado de un pedido de Dropi. Dropi no tiene un catálogo fijo (texto libre): se clasifica por palabra clave, igual que en DropFlex App
// (nueva_version-next/lib/dropiStatus.ts). Lo que no encaja cae en «otro»: nunca desaparece.
export type GrupoEstado = "entregado" | "cancelado" | "devolucion" | "novedad" | "transito" | "pendiente" | "otro";

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

export function grupoEstado(crudo: string | null | undefined): GrupoEstado {
  const s = sinTildes(crudo ?? "");
  if (!s) return "otro";
  if (s.includes("CANCEL")) return "cancelado"; // el pedido no se hizo: no es venta ni devolución, y no se importa (ver esCancelado)
  // «ENTREGADA A CONEXIONES» es la entrega a la transportadora, no al cliente final: sigue en tránsito.
  if (s.includes("ENTREG") && !s.includes("CONEXION")) return "entregado";
  if (s.includes("DEVOL") || s.includes("RECHAZ")) return "devolucion"; // ya es plata perdida (flete de regreso)
  if (s.includes("RECLAM") || s.includes("OFICINA") || s.includes("INDEMNIZ") || s.includes("NOVEDAD")) return "novedad"; // en riesgo
  if (s.includes("REPARTO") || s.includes("TRANSITO") || s.includes("RUTA") || s.includes("DESPACH") || s.includes("CONEXION")) return "transito";
  if (s.includes("GUIA") || s.includes("PENDIENTE") || s.includes("CONFIRMACION") || s.includes("PREPARACION")) return "pendiente";
  return "otro";
}

/** Un pedido está «cerrado» cuando ya no cambiará de resultado para la contabilidad (entregado o devuelto). */
export const estaCerrado = (g: GrupoEstado) => g === "entregado" || g === "devolucion";

/** Se traen TODOS los pedidos (en camino, entregados, devoluciones, novedades…) excepto los CANCELADOS, que no son venta ni devolución. */
export const seImporta = (crudo: string | null | undefined) => grupoEstado(crudo) !== "cancelado";

/** Un pedido cancelado no es una venta ni una devolución (queda fuera por seImporta; esto sirve para contarlos). */
export const esCancelado = (crudo: string | null | undefined) => grupoEstado(crudo) === "cancelado";
