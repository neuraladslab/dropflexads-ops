// Contabilidad por pedido: cada pedido de Dropi queda en un estado contable, cruzando su estado con la billetera (ID de pedido o guía).
import { grupoEstado, type GrupoEstado } from "./estadoPedido.ts";

export type PedidoDropi = { idPedido: string; guia?: string | null; estado: string; entregadoDia?: string | null; total?: number | null };
export type GananciaBilletera = { idPedido?: string | null; guia?: string | null }; // ganancias que entraron y no fueron reversadas
export type CobroDevolucion = { idPedido?: string | null; guia?: string | null }; // cobros por devolución de la billetera

export type EstadoContable = "pagado" | "sin_pagar" | "no_verificable" | "devuelto" | "devuelto_cobrado" | "en_curso";

export type PedidoContable<T extends PedidoDropi> = T & { grupo: GrupoEstado; contable: EstadoContable; dias?: number; anticipado?: boolean };

const dd = (a: string, b: string) => Math.round((Date.parse(a + "T12:00:00Z") - Date.parse(b + "T12:00:00Z")) / 864e5);

/**
 * entregado + ganancia en la billetera → pagado · entregado sin ganancia → sin_pagar (solo si se entregó dentro del tiempo que cubre la billetera
 * sincronizada; antes de eso no se puede saber: no_verificable) · devolución → devuelto (y devuelto_cobrado si ya hay cobro de devolución)
 * · cualquier otro estado → en_curso.
 * Un pedido con PAGO ANTICIPADO (la billetera lo pagó al crearlo, «salida por nueva orden») cuyo valor ya entró a la cuenta de la persona NO lo paga Dropi: una vez entregado cuenta como pagado (anticipado),
 * no como «entregado sin pagar» ni como pendiente.
 */
export function clasificarPedidos<T extends PedidoDropi>(
  pedidos: T[], ganancias: GananciaBilletera[], devoluciones: CobroDevolucion[], billeteraDesde: string | null, hoy: string, anticipados: string[] = [],
): PedidoContable<T>[] {
  const anticipo = new Set(anticipados);
  const ids = (xs: { idPedido?: string | null }[]) => new Set(xs.map((x) => x.idPedido).filter(Boolean) as string[]);
  const guias = (xs: { guia?: string | null }[]) => new Set(xs.map((x) => x.guia).filter(Boolean) as string[]);
  const gId = ids(ganancias), gGuia = guias(ganancias), dId = ids(devoluciones), dGuia = guias(devoluciones);
  return pedidos.map((p) => {
    const grupo = grupoEstado(p.estado);
    const tiene = (idSet: Set<string>, guiaSet: Set<string>) => idSet.has(p.idPedido) || (!!p.guia && guiaSet.has(p.guia));
    if (grupo === "devolucion") return { ...p, grupo, contable: tiene(dId, dGuia) ? "devuelto_cobrado" : "devuelto" };
    if (grupo !== "entregado") return { ...p, grupo, contable: "en_curso" };
    if (tiene(gId, gGuia)) return { ...p, grupo, contable: "pagado" };
    if (anticipo.has(p.idPedido)) return { ...p, grupo, contable: "pagado", anticipado: true }; // ya cobrado por fuera de Dropi
    const ref = p.entregadoDia;
    if (!billeteraDesde || !ref || ref < billeteraDesde) return { ...p, grupo, contable: "no_verificable" };
    return { ...p, grupo, contable: "sin_pagar", dias: Math.max(0, dd(hoy, ref)) };
  });
}
