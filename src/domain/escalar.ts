// ¿Cuándo escalar una campaña? Las reglas de la calculadora (ROAS de margen ≥ 2×, CPA bajo el máximo, ≥ 3 días con datos, ≥ 2 ventas por día, esperar tras cambiar el
// presupuesto; pausar si ROAS < 1×; incremento 25/50/75/100 % según el ROAS) aplicadas a los datos reales: gasto de Meta, pedidos de la campaña y lo que de verdad deja cada pedido.
// Como parte de los pedidos aún va en camino, el veredicto usa una tasa de entrega PRUDENTE (el ROAS «prudente»): así no se recomienda subir presupuesto con ventas que pueden devolverse.
const r2 = (n: number) => Math.round(n * 100) / 100;
const EPS = 1e-9;

export const incrementoPara = (roas: number) => (roas >= 4 - EPS ? 100 : roas >= 3 - EPS ? 75 : roas >= 2.5 - EPS ? 50 : roas >= 2 - EPS ? 25 : 0);
export type DiaEscalar = { dia: string; gasto: number; ventas: number }; // gasto sin IVA (como lo entrega Meta)
export type Veredicto = "escalar" | "vigilar" | "pausar" | "sin_datos";

/** ¿Hubo un cambio fuerte de gasto hace poco? Compara cada día con el promedio de los hasta 3 anteriores; devuelve cuántos días van desde el último salto (o null si no hubo). */
export function diasDesdeCambio(gastos: number[], umbral = 0.25): number | null {
  let ultimo: number | null = null, anterior = false;
  for (let i = 1; i < gastos.length; i++) {
    const prev = gastos.slice(Math.max(0, i - 3), i), media = prev.reduce((a, v) => a + v, 0) / prev.length;
    const salto = media > 0 && Math.abs(gastos[i] - media) / media >= umbral && Math.abs(gastos[i] - media) >= 5000;
    if (salto && !anterior) ultimo = i; // varios días seguidos de ajuste cuentan como un solo cambio, el del primer día
    anterior = salto;
  }
  return ultimo == null ? null : gastos.length - ultimo;
}

export function evaluarEscalado(i: { dias: DiaEscalar[]; margen: number | null; tasaEntrega?: number; vat?: number; cpaMaxPct?: number }) {
  const dias = i.dias.slice(-7), n = dias.length, tasa = i.tasaEntrega ?? 0.6, vk = 1 + (i.vat ?? 19) / 100, pct = i.cpaMaxPct ?? 0.6;
  if (!n || i.margen == null || i.margen <= 0) return { veredicto: "sin_datos" as Veredicto, n, margen: i.margen };
  const gasto = dias.reduce((a, d) => a + d.gasto, 0), ventas = dias.reduce((a, d) => a + d.ventas, 0);
  const presupuesto = r2(gasto / n), conv = ventas / n, convPrudente = conv * tasa;
  const gastoIva = gasto * vk, roas = gastoIva > 0 ? (ventas * i.margen) / gastoIva : 0, roasPrudente = roas * tasa;
  const cpa = ventas > 0 ? r2(gastoIva / ventas) : null, cpaMax = r2(i.margen * pct);
  const cambio = diasDesdeCambio(dias.map((d) => d.gasto));
  const checks = [
    { clave: "roas", ok: roasPrudente >= 2 - EPS, texto: `ROAS de margen de 2× o más (con ${Math.round(tasa * 100)} % de entrega): hoy ${r2(roasPrudente)}×`, valor: r2(roasPrudente) },
    { clave: "cpa", ok: cpa != null && cpa <= cpaMax, texto: `Costo por venta bajo ${cpaMaxLabel(pct)} de lo que te deja cada venta (máx. ${fmt(cpaMax)}): hoy ${cpa == null ? "sin ventas" : fmt(cpa)}`, valor: cpa },
    { clave: "dias", ok: n >= 3, texto: `Al menos 3 días con gasto: llevas ${n}`, valor: n },
    { clave: "ventas", ok: convPrudente >= 2 - EPS, texto: `2 ventas por día o más (con ${Math.round(tasa * 100)} % de entrega): hoy ${r2(convPrudente)}`, valor: r2(convPrudente) },
    { clave: "espera", ok: cambio == null || cambio >= 3, texto: cambio == null || cambio >= 3 ? "Sin cambios recientes de presupuesto" : `El gasto cambió hace ${cambio} ${cambio === 1 ? "día" : "días"}: espera a tener 3 días con el nuevo presupuesto`, valor: cambio },
  ];
  const veredicto: Veredicto = gasto > 0 && roasPrudente < 1 - EPS ? "pausar" : checks.every((c) => c.ok) ? "escalar" : "vigilar";
  const incremento = incrementoPara(roasPrudente);
  return {
    veredicto, n, margen: i.margen, tasa, presupuesto, conv: r2(conv), roas: r2(roas), roasPrudente: r2(roasPrudente), cpa, cpaMax, checks, cambio,
    incremento: veredicto === "escalar" ? incremento : 0, nuevoPresupuesto: veredicto === "escalar" ? r2(presupuesto * (1 + incremento / 100)) : null,
  };
}
const cpaMaxLabel = (p: number) => `${Math.round(p * 100)} %`;
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
