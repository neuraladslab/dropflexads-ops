// Corte por periodo: agrupa los días en periodos que terminan cada mes en el día de corte (inclusive). NO borra ni oculta nada: es solo una forma de agrupar.
// Con corte 12, el periodo «12 oct» va del 13 sep al 12 oct. El primer periodo arranca el día en que empezó la operación (puede ser corto).
import { resultado, type Veredicto } from "./ganancia.ts";
import { costosDelDia, diaVacio, type Dia } from "./porDia.ts";
import { sumarDias } from "./fechas.ts";
import type { DiaFlujo } from "./billetera.ts";

export const CORTE_POR_DEFECTO = 12;
/** Hasta el 28 para que el día exista en todos los meses. */
export const diaCorteValido = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 28;

export type Periodo = { id: string; desde: string; hasta: string; abierto: boolean };

const pad = (n: number) => String(n).padStart(2, "0");
const partes = (dia: string) => ({ a: Number(dia.slice(0, 4)), m: Number(dia.slice(5, 7)), d: Number(dia.slice(8, 10)) });
const fecha = (a: number, m: number, d: number) => { const t = new Date(Date.UTC(a, m - 1, d)); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`; };

/** Último día (inclusive) del periodo al que pertenece `dia`. */
function finDe(dia: string, corte: number): string {
  const { a, m, d } = partes(dia);
  return d <= corte ? fecha(a, m, corte) : fecha(a, m + 1, corte);
}
/** Primer día del periodo que termina en `fin`. */
const inicioDe = (fin: string, corte: number): string => { const { a, m } = partes(fin); return fecha(a, m - 1, corte + 1); };

/** Periodo de un día. `inicioOperacion` recorta el comienzo del primer periodo; `hoy` marca si sigue abierto. */
export function periodoDe(dia: string, corte: number, inicioOperacion: string, hoy: string): Periodo {
  const hasta = finDe(dia, corte);
  const desde = inicioDe(hasta, corte);
  return { id: hasta, desde: desde < inicioOperacion ? inicioOperacion : desde, hasta, abierto: hoy <= hasta };
}

/** Todos los periodos desde el inicio de la operación hasta el que contiene a hoy, del más viejo al más nuevo. */
export function listarPeriodos(inicioOperacion: string, hoy: string, corte: number): Periodo[] {
  const fuera = hoy < inicioOperacion;
  const ini = fuera ? hoy : inicioOperacion;
  const out: Periodo[] = [];
  let p = periodoDe(ini, corte, ini, hoy);
  for (;;) {
    out.push(p);
    if (hoy <= p.hasta) return out;
    p = periodoDe(sumarDias(p.hasta, 1), corte, ini, hoy);
  }
}

/** Días calendario transcurridos del periodo (si sigue abierto, hasta hoy). */
export function diasTranscurridos(p: Periodo, hoy: string): number {
  const fin = hoy < p.hasta ? hoy : p.hasta;
  return Math.max(0, Math.round((Date.parse(fin + "T12:00:00Z") - Date.parse(p.desde + "T12:00:00Z")) / 864e5) + 1);
}
export const diasTotales = (p: Periodo) => Math.round((Date.parse(p.hasta + "T12:00:00Z") - Date.parse(p.desde + "T12:00:00Z")) / 864e5) + 1;

const r2 = (n: number) => Math.round(n * 100) / 100;
const dentro = (dia: string, p: Periodo) => dia >= p.desde && dia <= p.hasta;

export type ResumenPeriodo = Periodo & {
  diasCalendario: number; diasConMovimiento: number; total: Dia; herramientas: number; costos: number; neto: number; veredicto: Veredicto;
  retornoPorPesoEnMeta: number | null; dias: Dia[];
};

/** Suma los días de cada periodo. Las herramientas se reparten por cada día calendario transcurrido del periodo (no solo por los días con movimientos). */
export function resumenPorPeriodo(dias: Dia[], periodos: Periodo[], herramientasPorDia: number, hoy: string): ResumenPeriodo[] {
  return periodos.map((p) => {
    const delPeriodo = dias.filter((d) => dentro(d.dia, p)).sort((a, b) => (a.dia < b.dia ? 1 : -1));
    const t = diaVacio("total");
    for (const d of delPeriodo) {
      t.ganancia += d.ganancia; t.devoluciones += d.devoluciones; t.comisiones += d.comisiones; t.otrosDescuentos += d.otrosDescuentos;
      t.meta += d.meta; t.otrosGastos += d.otrosGastos; t.entregas += d.entregas; t.pagosHerramientas += d.pagosHerramientas;
    }
    const diasCalendario = diasTranscurridos(p, hoy);
    const herramientas = r2(herramientasPorDia * diasCalendario);
    return { ...p, diasCalendario, diasConMovimiento: delPeriodo.length, total: t, herramientas, ...resultado(t.ganancia, costosDelDia(t, herramientas)), dias: delPeriodo };
  });
}

export type FlujoPeriodo = Periodo & {
  gananciaEntro: number; otrasEntradas: number; totalEntra: number; aTarjeta: number; descuentos: number; retiros: number; totalSale: number;
  saldoApertura: number | null; saldoCierre: number | null;
};

/**
 * Flujo de la billetera por periodo. El saldo NO se corta: es un acumulado que se arrastra de un periodo al siguiente (la plata se queda para pagar campañas).
 * `dias` trae el saldo al cierre de cada día con movimientos (null si Dropi no lo dio).
 */
export function flujoPorPeriodo(dias: (DiaFlujo & { saldoCierre: number | null })[], periodos: Periodo[], saldoActual: number | null = null): FlujoPeriodo[] {
  const orden = [...dias].sort((a, b) => (a.dia < b.dia ? -1 : 1));
  let saldo: number | null = null; // último saldo conocido, se arrastra
  const out = periodos.map((p) => {
    const del = orden.filter((d) => dentro(d.dia, p));
    const f: FlujoPeriodo = { ...p, gananciaEntro: 0, otrasEntradas: 0, totalEntra: 0, aTarjeta: 0, descuentos: 0, retiros: 0, totalSale: 0, saldoApertura: null, saldoCierre: null };
    for (const d of del) {
      f.gananciaEntro += d.entra.ganancia; f.otrasEntradas += d.entra.propia + d.entra.otros; f.totalEntra += d.totalEntra;
      f.aTarjeta += d.sale.tarjeta; f.descuentos += d.sale.descuentos; f.retiros += d.sale.retiros; f.totalSale += d.totalSale;
    }
    const ultimo = [...del].reverse().find((d) => d.saldoCierre != null);
    f.saldoApertura = saldo != null ? saldo : ultimo && ultimo.saldoCierre != null ? r2(ultimo.saldoCierre - f.totalEntra + f.totalSale) : null;
    f.saldoCierre = ultimo && ultimo.saldoCierre != null ? ultimo.saldoCierre : saldo;
    if (f.saldoCierre != null) saldo = f.saldoCierre;
    for (const k of ["gananciaEntro", "otrasEntradas", "totalEntra", "aTarjeta", "descuentos", "retiros", "totalSale"] as const) f[k] = r2(f[k]);
    return f;
  });
  // El último periodo termina en el saldo que Dropi informa HOY (el del último movimiento), no en el del último día con saldo conocido.
  const ultimo = out[out.length - 1];
  if (ultimo && saldoActual != null) ultimo.saldoCierre = saldoActual;
  return out;
}

export type PedidoDelCorte = { creado?: string | null; contable: string; total?: number | null; pagadoDia?: string | null; cobradoDia?: string | null };
export type Conteo = { n: number; valor: number };
export type PedidosPeriodo = Periodo & {
  vendidos: Conteo; // pedidos creados en el corte (se atribuyen al corte donde se vendieron)
  estado: Record<"pagado" | "en_curso" | "sin_pagar" | "no_verificable" | "devuelto" | "devuelto_cobrado", Conteo>; // cómo van HOY
  pendientes: Conteo; // lo que sigue sin resolverse hoy: en curso + entregado sin pagar + devuelto sin cobrar
  cierranAnteriores: Conteo; // ventas de cortes anteriores que se pagaron (ganancia en la billetera) o se cobraron (flete de devolución) dentro de este corte
};

/**
 * Pedidos por corte: cada pedido pertenece al corte donde se CREÓ. Así nada desaparece al cortar: lo que sigue en curso, entregado sin pagar o devuelto sin cobrar
 * queda como «pendiente» en su corte de origen, y cuando la billetera registra su pago o su cobro en un corte posterior ese corte lo cuenta en «cierran ventas anteriores».
 */
export function pedidosPorPeriodo(pedidos: PedidoDelCorte[], periodos: Periodo[]): PedidosPeriodo[] {
  const cero = (): Conteo => ({ n: 0, valor: 0 });
  const suma = (c: Conteo, p: PedidoDelCorte) => { c.n += 1; c.valor = r2(c.valor + (p.total || 0)); };
  return periodos.map((per) => {
    const estado = { pagado: cero(), en_curso: cero(), sin_pagar: cero(), no_verificable: cero(), devuelto: cero(), devuelto_cobrado: cero() };
    const vendidos = cero(), cierranAnteriores = cero();
    for (const p of pedidos) {
      if (p.creado && dentro(p.creado, per)) {
        suma(vendidos, p);
        if (p.contable in estado) suma(estado[p.contable as keyof typeof estado], p);
      } else if (p.creado && p.creado < per.desde) {
        const cerro = (p.pagadoDia && dentro(p.pagadoDia, per)) || (p.cobradoDia && dentro(p.cobradoDia, per)); // fechas de la billetera
        if (cerro) suma(cierranAnteriores, p);
      }
    }
    const pendientes = { n: estado.en_curso.n + estado.sin_pagar.n + estado.devuelto.n, valor: r2(estado.en_curso.valor + estado.sin_pagar.valor + estado.devuelto.valor) };
    return { ...per, vendidos, estado, pendientes, cierranAnteriores };
  });
}

export type DiaVenta = { dia: string; ventas: number; pagados: number; enCamino: number; devueltos: number; entro: number; publicidad: number };
export type VentasPeriodo = Periodo & { ventas: number; pagados: number; enCamino: number; devueltos: number; cobrado: number; publicidad: number };

/** Rendimiento de las VENTAS de cada corte (por día de venta): la ganancia ya cobrada de lo vendido y la publicidad gastada en esos mismos días. Es una vista de rendimiento; la oficial es la de caja. */
export function ventasPorPeriodo(serie: DiaVenta[], periodos: Periodo[]): VentasPeriodo[] {
  return periodos.map((p) => {
    const v: VentasPeriodo = { ...p, ventas: 0, pagados: 0, enCamino: 0, devueltos: 0, cobrado: 0, publicidad: 0 };
    for (const d of serie) if (dentro(d.dia, p)) { v.ventas += d.ventas; v.pagados += d.pagados; v.enCamino += d.enCamino; v.devueltos += d.devueltos; v.cobrado += d.entro; v.publicidad += d.publicidad; }
    v.cobrado = r2(v.cobrado); v.publicidad = r2(v.publicidad);
    return v;
  });
}

/** % de devolución real de las ventas del corte: devueltos entre los que ya terminaron su camino (entregados + devueltos). null si todavía no terminó ninguno. */
export function tasaDevolucionReal(p: PedidosPeriodo): number | null {
  const dev = p.estado.devuelto.n + p.estado.devuelto_cobrado.n;
  const fin = dev + p.estado.pagado.n + p.estado.sin_pagar.n + p.estado.no_verificable.n;
  return fin > 0 ? Math.round((dev / fin) * 100) : null;
}

export type PeriodoElegido = { tipo: "corte" | "todo" | "rango"; id: string; desde: string; hasta: string; abierto: boolean; etiqueta: string; param: string };
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Qué periodo mira la pantalla. `param` viene de la URL: «actual» (por defecto) · «anterior» · el día de cierre de un corte (2026-10-12) · «todo» · «2026-10-01_2026-10-15» (rango libre).
 * Un valor que no se entiende cae en el corte actual: la pantalla nunca queda vacía ni falla por una URL mal escrita.
 */
export function resolverPeriodo(param: string | null | undefined, periodos: Periodo[], hoy: string, inicio: string): PeriodoElegido {
  const actual = periodos.find((p) => p.abierto) ?? periodos[periodos.length - 1];
  const deCorte = (p: Periodo, pr: string): PeriodoElegido => ({ tipo: "corte", id: p.id, desde: p.desde, hasta: p.hasta, abierto: p.abierto, etiqueta: "", param: pr });
  const x = (param ?? "actual").trim();
  if (x === "actual" || x === "") return deCorte(actual, "actual");
  if (x === "anterior") { const i = periodos.indexOf(actual); return deCorte(periodos[Math.max(0, i - 1)], i > 0 ? "anterior" : "actual"); }
  if (x === "todo") return { tipo: "todo", id: "todo", desde: inicio, hasta: hoy, abierto: true, etiqueta: "Todo el tiempo", param: "todo" };
  if (FECHA.test(x)) { const p = periodos.find((q) => q.id === x); return p ? deCorte(p, x) : deCorte(actual, "actual"); }
  const m = /^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/.exec(x);
  if (m) {
    const desde = m[1] < inicio ? inicio : m[1], hasta = m[2] > hoy ? hoy : m[2];
    if (desde <= hasta && !Number.isNaN(Date.parse(desde + "T12:00:00Z")) && !Number.isNaN(Date.parse(hasta + "T12:00:00Z"))) return { tipo: "rango", id: x, desde, hasta, abierto: hasta >= hoy, etiqueta: "Rango libre", param: `${desde}_${hasta}` };
  }
  return deCorte(actual, "actual");
}
