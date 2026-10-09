// Calculadora de rentabilidad y de escalado. Extraída de calculadora/lib/pauta/core.js (calcOut, scOut, incFor) como funciones PURAS:
// sin DOM, sin estado global. Es la única parte «estimada» del sistema y así se rotula en la interfaz.
const EPS = 1e-9; // tolerancia de punto flotante en los umbrales (ROAS 2×…)

/** Constantes del modo rápido (solo se pide el costo del producto). */
export const MODO_RAPIDO = { flete: 14000, comision: 2500, devolucionesPct: 15, cpaMax: 20000 } as const;

export type EntradaRentabilidad = {
  costoProducto: number;
  flete: number;
  comision: number;
  precioVenta: number;
  devolucionesPct: number;
  cpaMax: number;
};

/** Margen bruto de una venta: lo que queda tras producto, flete y comisión. */
export const margenBruto = (e: Pick<EntradaRentabilidad, "precioVenta" | "costoProducto" | "flete" | "comision">) =>
  e.precioVenta - e.costoProducto - e.flete - e.comision;

/** Entradas del modo rápido: precio de venta = 2,5× el costo operativo (regla de oro de la guía). */
export function entradaRapida(costoProducto: number): EntradaRentabilidad {
  const costo = costoProducto + MODO_RAPIDO.flete + MODO_RAPIDO.comision;
  return {
    costoProducto, flete: MODO_RAPIDO.flete, comision: MODO_RAPIDO.comision,
    precioVenta: Math.ceil(costo * 2.5), devolucionesPct: MODO_RAPIDO.devolucionesPct, cpaMax: MODO_RAPIDO.cpaMax,
  };
}

export function rentabilidad(e: EntradaRentabilidad) {
  const costo = e.costoProducto + e.flete + e.comision;
  const bruto = e.precioVenta - costo;
  const colchon = (bruto * e.devolucionesPct) / 100; // lo que se pierde por devoluciones
  const real = bruto - colchon; // el CPA máximo se define SIEMPRE sobre el margen real, nunca sobre el bruto
  const presupuestoDiario = Math.max(20000, Math.ceil(Math.round(real * 0.5 * 1e6) / 1e6));
  const ventasPorDia = e.cpaMax > 0 ? Math.floor(presupuestoDiario / e.cpaMax) : 0;
  const gananciaNeta = real - e.cpaMax; // por venta, ya pagado el anuncio
  const gananciaDia = ventasPorDia * gananciaNeta;
  return {
    costo, bruto, colchon, real, presupuestoDiario, ventasPorDia, gananciaNeta, gananciaDia, gananciaMes: gananciaDia * 30,
    rentable: real > e.cpaMax, multiplo: e.costoProducto > 0 ? e.precioVenta / e.costoProducto : 0,
  };
}

/** Cuánto subir el presupuesto (%) según el ROAS de margen. */
export const incrementoPorRoas = (roas: number) =>
  roas >= 4 - EPS ? 100 : roas >= 3 - EPS ? 75 : roas >= 2.5 - EPS ? 50 : roas >= 2 - EPS ? 25 : 0;

export type EntradaEscalado = {
  presupuesto: number; // gasto diario en Meta SIN IVA
  cpa: number;
  ventasPorDia: number;
  margenPorVenta: number; // margen real por venta
  cpaMax?: number | null;
  diasRegistrados?: number | null;
};

export function escalado(m: EntradaEscalado, ivaPct: number) {
  const vk = 1 + ivaPct / 100;
  const roas = m.presupuesto > 0 ? (m.ventasPorDia * m.margenPorVenta) / (m.presupuesto * vk) : 0; // ROAS de margen, con IVA
  let puntaje = 50;
  if (roas >= 3 - EPS) puntaje += 30; else if (roas >= 2.5 - EPS) puntaje += 20; else if (roas >= 2 - EPS) puntaje += 10;
  if (m.cpa < m.margenPorVenta * 0.4) puntaje += 20; else if (m.cpa < m.margenPorVenta * 0.6) puntaje += 10;
  if (m.ventasPorDia >= 5) puntaje += 20; else if (m.ventasPorDia >= 3) puntaje += 15; else if (m.ventasPorDia >= 2) puntaje += 10;
  puntaje = Math.min(puntaje, 100);
  const cpaOk = m.cpaMax == null || m.cpa <= m.cpaMax;
  const diasOk = m.diasRegistrados == null || m.diasRegistrados >= 3;
  const puedeEscalar = roas >= 2 - EPS && m.ventasPorDia >= 2 - EPS && cpaOk && diasOk;
  const incremento = incrementoPorRoas(roas);
  const fase = m.ventasPorDia < 2 ? 0 : m.ventasPorDia < 5 ? 1 : m.ventasPorDia < 10 ? 2 : 3;
  const nuevoPresupuesto = m.presupuesto * (1 + incremento / 100);
  const nuevasVentas = m.presupuesto > 0 ? Math.floor((nuevoPresupuesto / m.presupuesto) * m.ventasPorDia) : 0;
  return {
    roas, puntaje, puedeEscalar, cpaOk, diasOk, incremento, fase, nuevoPresupuesto, nuevasVentas,
    nuevoRoas: nuevoPresupuesto > 0 ? (nuevasVentas * m.margenPorVenta) / (nuevoPresupuesto * vk) : 0,
    gananciaNueva: nuevasVentas * m.margenPorVenta - nuevoPresupuesto * vk,
    gananciaActual: m.ventasPorDia * m.margenPorVenta - m.presupuesto * vk,
  };
}
