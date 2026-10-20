// Salud de la billetera: ¿cuánto se puede retirar de ganancia neta, y cuándo? Una sola cuenta, con los mismos números del resto del sistema.
//  1. La utilidad neta es lo que queda de los ingresos de la billetera (lo que Dropi paga) después de los gastos REALES. Se acumula corte a corte y no es negativa (las pérdidas se recuperan primero).
//  2. La billetera debe conservar un PISO de liquidez: publicidad de 7 días con el ritmo real de Meta + lo que Meta ya gastó y aún no cobra − lo que tiene la tarjeta, más el costo esperado de devoluciones.
//  3. La utilidad se divide con los porcentajes. Lo que no es de los socios (reinversión extra, reserva, ahorro, impuestos) se queda en la billetera y también cuenta como piso.
//  4. Lo que se puede retirar es lo MENOR entre: lo que les toca a los socios y aún no han retirado, lo que sobra en la billetera sobre el piso, y la ganancia neta que sigue dentro de la operación
//     (utilidad acumulada − retiros). Así nunca se retira capital, aportes ni plata que aún recupera la inversión.
import { repartirUtilidad, type Destino, type FilaReparto } from "./reparto.ts";
import { sumarDias } from "./fechas.ts";

export const DIAS_PAUTA = 7; // días de publicidad que la billetera y la tarjeta deben poder pagar sin esperar a Dropi (Dropi tarda ~5–7 días en pagar)
export type EntradaSalud = {
  saldoBilletera: number | null; saldoTarjeta: number | null;
  utilidadAcumulada: number; // neto de caja acumulado desde el inicio hasta este corte (puede ser negativo)
  retirado: number; // retiros hechos desde el inicio hasta este corte
  ritmoPauta: number; deudaMeta: number; // publicidad por día activo (con IVA) y lo gastado en Meta que aún no se cobra
  costoDevolucionesEsperado: number; gananciaEsperada: number; // de los pedidos pendientes (estimado)
  diasPago: number | null; hoy: string; destinos: Destino[];
  cuadreMalo: boolean; datosViejos: boolean;
};
export type Estado = "verde" | "amarillo" | "rojo" | "gris";
export type LimitadoPor = "plan" | "necesidades" | "utilidad";
/** Cifras derivadas que las pantallas muestran tal cual (así ninguna pantalla vuelve a calcular nada). */
export type Derivadas = {
  retirableDeLoQueLesToca: number; // lo que se puede retirar hoy de lo que les toca
  pendiente: number; // lo que les toca y hoy no se puede retirar (no se pierde: se libera cuando sobra más)
  pctRetirable: number; // retirable / lo que les toca, en % entero
  pctSocios: number; // suma de los porcentajes de los socios en el reparto
  porSocio: { nombre: string; pct: number; monto: number }[]; // el retiro de hoy partido según el reparto
  seQuedaEnOperacion: number; // la parte de la utilidad que no es de los socios
  saldoParaRetirarTodo: number; // saldo que tendría que tener la billetera para retirar todo lo que les toca
  faltaParaRetirarTodo: number; // cuánto le falta hoy a la billetera para eso
  bajoElMinimo: number; // cuánto por debajo del piso quedaría la billetera si se retirara todo lo que les toca
};
export type Salud = {
  estado: Estado; titulo: string; detalle: string;
  saldo: number | null; utilidadAcumulada: number; filas: FilaReparto[]; // la utilidad acumulada, dividida
  piso: { pauta: number; deudaMeta: number; ritmo: number; tarjeta: number; devoluciones: number; total: number; diasCubiertos: number | null };
  seQueda: number; // lo de la utilidad que se queda en la billetera además del piso: imprevistos, ahorro e impuestos (la reinversión extra en pauta ya está cubierta por el piso)
  bloqueado: number; libre: number; utilidadRetenida: number;
  sociasAcumulado: number; retirado: number; sociasPorRetirar: number; retiroSeguro: number; limitadoPor: LimitadoPor | null;
  proyeccion: { fecha: string; dias: number; retiro: number } | null; // lo que se podría retirar cuando llegue lo que viene en camino (estimado)
  derivadas: Derivadas;
};
const r2 = (n: number) => Math.round(n * 100) / 100;
const cop = (n: number) => (n < 0 ? "−" : "") + "$" + Math.abs(Math.round(n)).toLocaleString("es-CO");
const suma = (f: FilaReparto[], socio: boolean) => r2(f.filter((x) => (x.tipo === "socio") === socio).reduce((a, x) => a + x.monto, 0));

function calcular(saldo: number, utilAcum: number, e: EntradaSalud) {
  const util = Math.max(0, r2(utilAcum)), filas = repartirUtilidad(e.destinos, util);
  const socias = suma(filas, true), porRetirar = Math.max(0, r2(socias - e.retirado));
  // La reinversión extra en pauta NO se suma aparte: es plata que va a pauta y el piso ya reserva la pauta de 7 días (sumarla sería contarla dos veces).
  const tarjeta = e.saldoTarjeta ?? 0, seQueda = r2(filas.filter((x) => x.tipo !== "socio" && x.tipo !== "pauta").reduce((a, x) => a + x.monto, 0)), noPauta = seQueda;
  const pauta = Math.max(0, r2(e.deudaMeta + e.ritmoPauta * DIAS_PAUTA - tarjeta)), dev = r2(e.costoDevolucionesEsperado);
  const bloqueado = r2(pauta + dev + seQueda), libre = r2(saldo - bloqueado), retenida = Math.max(0, r2(util - e.retirado));
  const cand: [LimitadoPor, number][] = [["plan", porRetirar], ["necesidades", Math.max(0, libre)], ["utilidad", retenida]];
  const [lim, monto] = cand.reduce((m, c) => (c[1] < m[1] ? c : m));
  return { util, filas, socias, seQueda, noPauta, porRetirar, pauta, tarjeta, dev, bloqueado, libre, retenida, retiro: r2(Math.max(0, monto)), lim };
}

const derivadasVacias: Derivadas = { retirableDeLoQueLesToca: 0, pendiente: 0, pctRetirable: 0, pctSocios: 0, porSocio: [], seQuedaEnOperacion: 0, saldoParaRetirarTodo: 0, faltaParaRetirarTodo: 0, bajoElMinimo: 0 };
function derivar(saldo: number, c: ReturnType<typeof calcular>): Derivadas {
  const socios = c.filas.filter((f) => f.tipo === "socio"), pctSocios = r2(socios.reduce((a, f) => a + f.pct, 0));
  const retirable = Math.min(c.retiro, c.porRetirar), todo = r2(c.bloqueado + c.porRetirar);
  return {
    retirableDeLoQueLesToca: r2(retirable), pendiente: Math.max(0, r2(c.porRetirar - c.retiro)), pctRetirable: c.porRetirar > 0 ? Math.round((retirable / c.porRetirar) * 100) : 0, pctSocios,
    porSocio: c.retiro > 0 && pctSocios > 0 ? socios.map((f) => ({ nombre: f.nombre, pct: f.pct, monto: Math.round((c.retiro * f.pct) / pctSocios) })) : [],
    seQuedaEnOperacion: suma(c.filas, false), saldoParaRetirarTodo: todo, faltaParaRetirarTodo: Math.max(0, r2(todo - saldo)), bajoElMinimo: Math.max(0, r2(c.bloqueado - (saldo - c.porRetirar))),
  };
}

export function evaluarSalud(e: EntradaSalud): Salud {
  const piso0 = { pauta: 0, deudaMeta: 0, ritmo: 0, tarjeta: 0, devoluciones: 0, total: 0, diasCubiertos: null };
  const vacio = { utilidadAcumulada: r2(Math.max(0, e.utilidadAcumulada)), filas: [] as FilaReparto[], piso: piso0, seQueda: 0, bloqueado: 0, libre: 0, utilidadRetenida: 0, sociasAcumulado: 0, retirado: r2(e.retirado),
    sociasPorRetirar: 0, retiroSeguro: 0, limitadoPor: null as LimitadoPor | null, proyeccion: null, derivadas: derivadasVacias };
  if (e.saldoBilletera == null) return { estado: "gris", titulo: "Sin saldo de la billetera", detalle: "Sincroniza Dropi para conocer el saldo.", saldo: null, ...vacio };
  const c = calcular(e.saldoBilletera, e.utilidadAcumulada, e);
  let proyeccion: Salud["proyeccion"] = null;
  if (e.gananciaEsperada > 0) {
    const dias = Math.min(30, Math.max(1, Math.round(e.diasPago ?? 7))), gasto = e.ritmoPauta * dias; // mientras llega lo que viene en camino se sigue pautando
    const p = calcular(Math.max(0, e.saldoBilletera + e.gananciaEsperada - gasto), e.utilidadAcumulada + e.gananciaEsperada - e.costoDevolucionesEsperado - gasto, e);
    if (p.retiro > c.retiro + 1) proyeccion = { fecha: sumarDias(e.hoy, dias), dias, retiro: p.retiro };
  }
  const base = {
    saldo: r2(e.saldoBilletera), utilidadAcumulada: c.util, filas: c.filas,
    piso: { pauta: c.pauta, deudaMeta: r2(e.deudaMeta), ritmo: r2(e.ritmoPauta), tarjeta: r2(c.tarjeta), devoluciones: c.dev, total: r2(c.pauta + c.dev), diasCubiertos: e.ritmoPauta > 0 ? r2(Math.max(0, e.saldoBilletera + c.tarjeta - e.deudaMeta - c.dev - c.noPauta) / e.ritmoPauta) : null },
    seQueda: c.seQueda, bloqueado: c.bloqueado, libre: c.libre, utilidadRetenida: c.retenida, sociasAcumulado: c.socias, retirado: r2(e.retirado), sociasPorRetirar: c.porRetirar, retiroSeguro: c.retiro, limitadoPor: c.lim, proyeccion, derivadas: derivar(e.saldoBilletera, c),
  };
  if (e.cuadreMalo) return { estado: "rojo", titulo: "No retires todavía: las cifras no cuadran", detalle: "La billetera no cuadra con sus movimientos. Sincroniza Dropi de nuevo y revisa los avisos del corte antes de sacar plata.", ...base };
  if (!e.destinos.some((d) => d.tipo === "socio" && d.pct > 0)) return { estado: "gris", titulo: "No hay socios en el reparto", detalle: "Agrega al menos un destino de tipo «Socio/a» con porcentaje en Configuración → Reparto.", ...base };
  if (c.retiro <= 0) {
    if (c.libre <= 0) return { estado: "rojo", titulo: "No retires: la billetera no cubre lo que debe quedarse", detalle: `Deben quedar ${cop(c.bloqueado)} (pauta de ${DIAS_PAUTA} días, devoluciones y lo que se queda de la utilidad) y hay ${cop(e.saldoBilletera)}.`, ...base };
    if (c.util <= 0) return { estado: "gris", titulo: "Todavía no hay ganancia neta para retirar", detalle: "Lo que hay en la billetera aún recupera la inversión: la utilidad acumulada es cero.", ...base };
    return { estado: "gris", titulo: "No hay nada pendiente de retirar", detalle: "Ya retiraste lo que les tocaba a los socios con la utilidad acumulada hasta hoy.", ...base };
  }
  const motivo = c.lim === "utilidad" ? "es toda la ganancia neta que queda en la operación" : c.lim === "necesidades" ? "es lo que sobra sobre el piso de liquidez" : "es lo que les toca a los socios y aún no han retirado";
  const cautela = e.datosViejos ? " Dropi o Meta llevan más de un día sin sincronizar: sincroniza antes de retirar." : "";
  if (c.lim === "plan" && !e.datosViejos) return { estado: "verde", titulo: `Puedes retirar hasta ${cop(c.retiro)}`, detalle: `Es lo que les toca a los socios y la billetera cubre el piso de liquidez.${cautela}`, ...base };
  return { estado: "amarillo", titulo: `Retira como máximo ${cop(c.retiro)}`, detalle: `Ese monto ${motivo}.${cautela}`, ...base };
}
