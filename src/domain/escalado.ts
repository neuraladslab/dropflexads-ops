// Escalar la pauta con probabilidades. Todo es cálculo determinista (misma entrada → misma salida: la semilla sale de los datos); la IA nunca calcula nada de esto.
//
// Modelo (cada supuesto es visible y se puede discutir):
//  · Embudo: pedidos por clic ~ Beta (se ensancha sola con pocos datos y cuando los pedidos llegan «a lotes»: sobredispersión medida con los pedidos de cada día) más un riesgo de cambio de régimen
//    (la conversión no es estable semana a semana; crece con la calidad baja de la evidencia y con el tamaño del salto).
//  · Costo por clic al escalar: cpc(S) = cpc₀ · (S/S₀)^e · ruido. La elasticidad e se estima del propio historial (regresión log-log, encogida hacia un valor previo prudente); sin variación suficiente usa el previo.
//  · Entrega: ~ Beta con lo ya finalizado (entregados / devueltos) y un previo con tu % de devolución esperado.
//  · Ganancia por pedido entregado: se remuestrea de las ganancias reales; cada devolución cuesta el flete real promedio.
//  · Resultado de H días = Σ (ganancia − devoluciones) − publicidad con IVA. Se simulan miles de caminos y se resume: probabilidad de ganar, peor caso (1 de 20) y mejor caso (1 de 10) y probabilidad de perder más de lo tolerado.
//  · Restricciones: subida máxima por paso, probabilidades mínimas, calidad de la evidencia y liquidez (el mismo piso del panel «¿cuánto puedo retirar?»).
import { evaluarSalud, type EntradaSalud } from "./salud.ts";

// ---------------------------------------------------------------- aleatorios con semilla
export function crearAleatorio(semilla: number) {
  let a = semilla >>> 0, guardado: number | null = null;
  const u = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const normal = () => { if (guardado != null) { const g = guardado; guardado = null; return g; } const r = Math.sqrt(-2 * Math.log(u() + 1e-12)), t = 2 * Math.PI * u(); guardado = r * Math.sin(t); return r * Math.cos(t); };
  const gamma = (k: number): number => {
    if (k < 1) return gamma(k + 1) * Math.pow(u(), 1 / k);
    const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
    for (;;) { let x: number, v: number; do { x = normal(); v = 1 + c * x; } while (v <= 0); v = v * v * v; const w = u(); if (w < 1 - 0.0331 * x ** 4 || Math.log(w) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v; }
  };
  const beta = (a1: number, b1: number) => { const x = gamma(a1), y = gamma(b1); return x / (x + y); };
  const poisson = (l: number) => { if (l <= 0) return 0; if (l > 30) return Math.max(0, Math.round(l + Math.sqrt(l) * normal())); const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= u(); } while (p > L); return k - 1; };
  const binomial = (n: number, p: number) => { if (n <= 0 || p <= 0) return 0; if (p >= 1) return n; if (n > 200) return Math.min(n, Math.max(0, Math.round(n * p + Math.sqrt(n * p * (1 - p)) * normal()))); let k = 0; for (let i = 0; i < n; i++) if (u() < p) k++; return k; };
  return { u, normal, gamma, beta, poisson, binomial };
}
const hash = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return h >>> 0; };
const r2 = (n: number) => Math.round(n * 100) / 100;
const media = (l: number[]) => (l.length ? l.reduce((a, x) => a + x, 0) / l.length : 0);
const mediana = (l: number[]) => { if (!l.length) return 0; const s = [...l].sort((a, b) => a - b), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const desv = (l: number[]) => { if (l.length < 2) return 0; const m = media(l); return Math.sqrt(l.reduce((a, x) => a + (x - m) ** 2, 0) / (l.length - 1)); };
const GASTO_MINIMO = 1000; // por debajo de esto un día no cuenta como «con pauta»

// ---------------------------------------------------------------- tipos
export type DiaPauta = { dia: string; gasto: number; clics: number; impresiones: number }; // gasto SIN IVA, como lo entrega Meta
export type Riesgo = { perdidaMaxima: number; probGanarMin: number; probPerdidaMax: number; pasoMax: number; esperaDias: number };
export const RIESGO_DEFECTO: Riesgo = { perdidaMaxima: 150000, probGanarMin: 0.8, probPerdidaMax: 0.15, pasoMax: 0.25, esperaDias: 3 };
export type EntradaEscalado = {
  dias: DiaPauta[]; // días con pauta de la campaña, del más viejo al más nuevo
  pedidos: number; // pedidos creados de la campaña desde el primer día con pauta
  pedidosPorDia: number[]; // pedidos creados cada día calendario desde el primer día con pauta (con los días en cero): miden qué tan «a lotes» llegan
  entregados: number; devueltos: number; // pedidos ya finalizados
  gananciaPorPedido: number[]; // ganancia real de cada pedido pagado
  fleteDevolucion: number; devolucionEsperadaPct: number; vat: number;
  presupuestoActual: number; // por día, sin IVA
  hoy: string;
  salud: EntradaSalud; // para medir el efecto en el retiro y la liquidez con el MISMO cálculo del panel de salud
  riesgo?: Partial<Riesgo>; horizonte?: number; simulaciones?: number; semilla?: number;
  presupuestosExtra?: number[]; // presupuestos que la persona quiere comparar (p. ej. su objetivo)
};
export type Calidad = "alta" | "media" | "baja";
export type Escenario = {
  presupuesto: number; cambioPct: number; esActual: boolean;
  pGanar: number; pPerdidaMayor: number; media: number; mediana: number; p5: number; p25: number; p75: number; p90: number;
  pedidosDia: number; cpa: number | null; roas: number | null; // medianas
  abanico: { p5: number[]; p25: number[]; p50: number[]; p75: number[]; p90: number[] }; // resultado acumulado día a día
  liquidez: { pisoPauta: number; libre: number; ok: boolean; retiroResultante: number; estado: string };
  cumple: { paso: boolean; ganar: boolean; perdida: boolean; liquidez: boolean };
  alcanzable: boolean; // cumple todo salvo, quizá, el tamaño del paso (se llega en varios pasos)
  aprobado: boolean; // cumple todo, incluido el paso: se puede hacer YA
  motivos: string[];
};
export type Guarda = { clave: string; titulo: string; umbral: number | null; detalle: string; accion: "volver" | "pausar" | "esperar" };
export type PasoRuta = { orden: number; desdeDia: number; presupuesto: number; cambioPct: number; pGanar: number; condicion: string };
export type ResultadoEscalado = {
  calidad: Calidad; motivosCalidad: string[];
  base: { crPedidosPorClic: number; crIC: [number, number]; pEntrega: number; pIC: [number, number]; gananciaMedia: number; elasticidad: number; elasticidadFuente: "historial" | "previo"; cpc0: number; s0: number; dispersion: number; cpaEquilibrio: number; cpaActual: number | null; presupuestoActual: number };
  riesgo: Riesgo; horizonte: number; simulaciones: number;
  escenarios: Escenario[]; accion: "escalar" | "mantener" | "reducir" | "pausar"; recomendado: Escenario | null; objetivo: Escenario | null; techoLiquidez: number;
  ruta: PasoRuta[]; guardas: Guarda[]; explicacion: string[]; supuestos: string[];
};

// ---------------------------------------------------------------- estimaciones
/** Elasticidad del costo por clic al subir el presupuesto: regresión log-log del historial, encogida hacia un previo (0,25 ± 0,15) para no creerle a pocos datos. */
export function estimarElasticidad(dias: DiaPauta[], previo = { e: 0.25, sd: 0.15 }): { e: number; sd: number; fuente: "historial" | "previo" } {
  const x = dias.filter((d) => d.gasto >= GASTO_MINIMO && d.clics > 0);
  const lx = x.map((d) => Math.log(d.gasto)), ly = x.map((d) => Math.log(d.gasto / d.clics));
  const mx = media(lx), sxx = lx.reduce((a, v) => a + (v - mx) ** 2, 0);
  if (x.length < 7 || Math.sqrt(sxx / (x.length - 1)) < 0.15) return { ...previo, fuente: "previo" }; // casi sin variación de gasto: nada que aprender
  const my = media(ly), eHat = lx.reduce((a, v, i) => a + (v - mx) * (ly[i] - my), 0) / sxx;
  const res = ly.map((v, i) => v - my - eHat * (lx[i] - mx)), s2 = res.reduce((a, v) => a + v * v, 0) / Math.max(1, x.length - 2), se = Math.sqrt(s2 / sxx);
  const t0 = 1 / previo.sd ** 2, t1 = 1 / Math.max(se, 1e-6) ** 2, e = (t0 * previo.e + t1 * eHat) / (t0 + t1), sd = 1 / Math.sqrt(t0 + t1);
  return { e: Math.min(0.8, Math.max(0, e)), sd, fuente: "historial" };
}
/** Índice de dispersión de los pedidos por día (1 = llegan parejos; más = llegan «a lotes», p. ej. 14 de golpe un día y ninguno los siguientes). */
export function dispersion(porDia: number[]): number {
  const m = media(porDia);
  return porDia.length < 5 || m <= 0 ? 1 : Math.max(1, desv(porDia) ** 2 / m);
}

// ---------------------------------------------------------------- simulación de un presupuesto
type Base = { crA: number; crB: number; pA: number; pB: number; cpc0: number; s0: number; e: number; eSd: number; sigmaCpc: number; kDia: number; ganancias: number[]; gMu: number; gSd: number; flete: number; vat: number; sigmaReg: number; rho: number; rhoSd: number };
function simular(S: number, H: number, N: number, base: Base, rng: ReturnType<typeof crearAleatorio>, perdidaMax: number) {
  const fin: number[] = [], diaAcum: number[][] = Array.from({ length: H }, () => []), pedidosTot: number[] = [], gastosTot: number[] = [], margenes: number[] = [];
  for (let i = 0; i < N; i++) {
    const cr = rng.beta(base.crA, base.crB), p = rng.beta(base.pA, base.pB);
    const e = Math.min(0.8, Math.max(0, base.e + base.eSd * rng.normal()));
    const salto = Math.max(0, S / base.s0 - 1), sigReg = base.sigmaReg * (1 + 0.5 * salto), rho = Math.max(0, base.rho + base.rhoSd * rng.normal()); // al escalar la conversión por clic tiende a bajar
    const crEf = cr * Math.exp(sigReg * rng.normal() - sigReg * sigReg / 2) * Math.pow(S / base.s0, -rho);
    const cpc = base.cpc0 * Math.pow(S / base.s0, e) * Math.exp(base.sigmaCpc * rng.normal());
    let acum = 0, pedidos = 0, gastoTot = 0, margen = 0;
    for (let d = 0; d < H; d++) {
      const gasto = S * (0.9 + 0.2 * rng.u()), clics = gasto / cpc;
      const lambda = clics * crEf, g = base.kDia > 0 && base.kDia < 1e5 ? rng.gamma(base.kDia) / base.kDia : 1; // pedidos a lotes (binomial negativa)
      const o = rng.poisson(lambda * g), entregados = rng.binomial(o, p);
      let gan = 0;
      if (entregados > 8) gan = entregados * base.gMu + Math.sqrt(entregados) * base.gSd * rng.normal(); // suma de muchas ganancias: aproximación normal (mucho más rápida)
      else for (let j = 0; j < entregados; j++) gan += base.ganancias[Math.floor(rng.u() * base.ganancias.length)];
      const neto = gan - (o - entregados) * base.flete, costo = gasto * base.vat;
      acum += neto - costo; pedidos += o; gastoTot += costo; margen += neto; diaAcum[d].push(acum);
    }
    fin.push(acum); pedidosTot.push(pedidos); gastosTot.push(gastoTot); margenes.push(margen);
  }
  const q = (l: number[], x: number) => { const s = [...l].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(x * (s.length - 1))))]; };
  const abanico = { p5: [] as number[], p25: [] as number[], p50: [] as number[], p75: [] as number[], p90: [] as number[] };
  for (const l of diaAcum) { const s = [...l].sort((a, b) => a - b), at = (x: number) => r2(s[Math.min(s.length - 1, Math.floor(x * (s.length - 1)))]); abanico.p5.push(at(0.05)); abanico.p25.push(at(0.25)); abanico.p50.push(at(0.5)); abanico.p75.push(at(0.75)); abanico.p90.push(at(0.9)); }
  const mp = mediana(pedidosTot) / H, mg = mediana(gastosTot), mm = mediana(margenes);
  return {
    pGanar: fin.filter((x) => x > 0).length / N, pPerdidaMayor: fin.filter((x) => x < -perdidaMax).length / N, media: media(fin), mediana: q(fin, 0.5), p5: q(fin, 0.05), p25: q(fin, 0.25), p75: q(fin, 0.75), p90: q(fin, 0.9),
    pedidosDia: mp, cpa: mp > 0 ? mg / H / mp : null, roas: mg > 0 ? mm / mg : null, abanico,
  };
}

// ---------------------------------------------------------------- evaluación completa
export function analizarEscalado(i: EntradaEscalado): ResultadoEscalado {
  const riesgo: Riesgo = { ...RIESGO_DEFECTO, ...(i.riesgo ?? {}) }, H = i.horizonte ?? 7, N = i.simulaciones ?? 2500;
  const activos = i.dias.filter((d) => d.gasto >= GASTO_MINIMO && d.clics > 0), ultimos = activos.slice(-7);
  const clics = activos.reduce((a, d) => a + d.clics, 0), ped = Math.min(i.pedidos, Math.max(0, clics - 1));
  const disp = dispersion(i.pedidosPorDia), w = Math.max(0.15, 1 / disp); // pedidos «a lotes» valen como menos evidencia
  const cpcs = ultimos.map((d) => d.gasto / d.clics), cpc0 = mediana(cpcs) || 1, s0 = mediana(ultimos.map((d) => d.gasto)) || i.presupuestoActual || 1;
  const sigmaCpc = Math.max(0.05, desv(activos.map((d) => Math.log(d.gasto / d.clics))) * 0.5);
  const el = estimarElasticidad(activos);
  const prior = 10, pd = Math.min(0.9, Math.max(0.01, i.devolucionEsperadaPct / 100)), fin = i.entregados + i.devueltos;
  const base: Base = {
    crA: ped * w + 1, crB: (clics - ped) * w + 1, pA: prior * (1 - pd) + i.entregados, pB: prior * pd + i.devueltos, cpc0, s0, e: el.e, eSd: el.sd, sigmaCpc,
    kDia: disp > 1.05 ? Math.max(0.3, media(i.pedidosPorDia) / (disp - 1)) : 1e6, ganancias: i.gananciaPorPedido.length ? i.gananciaPorPedido : [0], gMu: media(i.gananciaPorPedido), gSd: desv(i.gananciaPorPedido), flete: i.fleteDevolucion, vat: 1 + i.vat / 100,
    sigmaReg: 0, rho: 0.08, rhoSd: 0.06,
  };
  const gananciaMedia = media(base.ganancias), pEntrega = base.pA / (base.pA + base.pB), cr = base.crA / (base.crA + base.crB);
  const ic = (a: number, b: number): [number, number] => { const m = a / (a + b), sd = Math.sqrt((a * b) / ((a + b) ** 2 * (a + b + 1))); return [Math.max(0, m - 1.64 * sd), Math.min(1, m + 1.64 * sd)]; };
  const cpaEq = pEntrega * gananciaMedia - (1 - pEntrega) * i.fleteDevolucion; // lo máximo que puede costar un pedido (con IVA) para quedar en cero
  const S0 = i.presupuestoActual, semilla = i.semilla ?? hash(JSON.stringify([S0, i.pedidos, i.entregados, i.devueltos, Math.round(clics), i.dias.length, Math.round(gananciaMedia)]));

  // calidad de la evidencia
  const motivosCalidad: string[] = [];
  let calidad: Calidad = "alta";
  if (activos.length < 10) { calidad = "media"; motivosCalidad.push(`${activos.length} días con pauta (lo ideal son 10 o más)`); }
  if (i.pedidos < 100) { calidad = "media"; motivosCalidad.push(`${i.pedidos} pedidos (lo ideal son 100 o más)`); }
  if (disp > 2) { calidad = calidad === "alta" ? "media" : calidad; motivosCalidad.push(`los pedidos llegan a lotes (índice ${r2(disp)}): el día a día dice poco, se mide por ventanas`); }
  if (activos.length < 7 || i.pedidos < 30 || fin < 15) { calidad = "baja"; motivosCalidad.push(fin < 15 ? `solo ${fin} pedidos finalizados para estimar la entrega` : "muy pocos datos todavía"); }
  if (el.fuente === "previo") motivosCalidad.push("el gasto casi no ha variado: el efecto de escalar sobre el costo se supone (previo prudente), no se midió");

  base.sigmaReg = calidad === "alta" ? 0.12 : calidad === "media" ? 0.2 : 0.3; // volatilidad de la conversión de una semana a otra

  const topeCalidad = calidad === "baja" ? Math.min(riesgo.pasoMax, 0.1) : riesgo.pasoMax; // con poca evidencia el paso máximo baja

  // presupuestos a evaluar
  const mult = [0.8, 1, 1.1, 1.2, 1.25, 1.35, 1.5, 1.75, 2];
  const set = new Set<number>(mult.map((m) => Math.round((S0 * m) / 500) * 500).filter((x) => x > 0));
  set.add(Math.floor((S0 * (1 + topeCalidad)) / 500) * 500); // el mayor paso permitido, redondeado hacia abajo para no pasarse
  for (const x of i.presupuestosExtra ?? []) if (x > 0) set.add(Math.round(x));
  const techo = (() => { // el mayor presupuesto diario cuyo piso de liquidez todavía cabe en la billetera
    let lo = 0, hi = Math.max(S0 * 4, 1e6);
    for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2, s = evaluarSalud({ ...i.salud, ritmoPauta: mid * base.vat }); (s.libre >= 0 ? (lo = mid) : (hi = mid)); }
    return Math.floor(lo / 500) * 500;
  })();
  if (techo > S0) set.add(techo);
  const presupuestos = [...set].sort((a, b) => a - b);

  const escenarios: Escenario[] = presupuestos.map((S) => {
    const rng = crearAleatorio(semilla ^ hash(String(S))), sim = simular(S, H, N, base, rng, riesgo.perdidaMaxima);
    const sal = evaluarSalud({ ...i.salud, ritmoPauta: S * base.vat }), cambio = S0 > 0 ? S / S0 - 1 : 0;
    const cumple = { paso: cambio <= topeCalidad + 1e-9, ganar: sim.pGanar >= riesgo.probGanarMin, perdida: sim.pPerdidaMayor <= riesgo.probPerdidaMax, liquidez: sal.libre >= 0 };
    const motivos: string[] = [];
    if (!cumple.paso) motivos.push(`sube ${Math.round(cambio * 100)} % de una vez (máximo ${Math.round(topeCalidad * 100)} %${calidad === "baja" ? " por la poca evidencia" : ""})`);
    if (!cumple.ganar) motivos.push(`probabilidad de ganar ${Math.round(sim.pGanar * 100)} % (mínimo ${Math.round(riesgo.probGanarMin * 100)} %)`);
    if (!cumple.perdida) motivos.push(`${Math.round(sim.pPerdidaMayor * 100)} % de perder más de $${Math.round(riesgo.perdidaMaxima).toLocaleString("es-CO")} (máximo ${Math.round(riesgo.probPerdidaMax * 100)} %)`);
    if (!cumple.liquidez) motivos.push("la billetera no alcanzaría para cubrir 7 días de pauta a ese ritmo");
    const resto = cumple.ganar && cumple.perdida && cumple.liquidez;
    return { presupuesto: S, cambioPct: Math.round(cambio * 1000) / 10, esActual: S === S0, ...sim, liquidez: { pisoPauta: sal.piso.pauta, libre: sal.libre, ok: sal.libre >= 0, retiroResultante: sal.retiroSeguro, estado: sal.estado }, cumple, alcanzable: resto, aprobado: resto && cumple.paso, motivos };
  });

  const actual = escenarios.find((e) => e.esActual) ?? escenarios[0];
  const aprobados = escenarios.filter((e) => e.aprobado && e.presupuesto > S0);
  const recomendado = aprobados.length ? aprobados.reduce((m, e) => (e.presupuesto > m.presupuesto ? e : m)) : null;
  const alcanzables = escenarios.filter((e) => e.alcanzable && e.presupuesto >= S0), objetivoEsc = alcanzables.length ? alcanzables.reduce((m, e) => (e.presupuesto > m.presupuesto ? e : m)) : null;
  let accion: ResultadoEscalado["accion"] = recomendado ? "escalar" : "mantener";
  if (!recomendado && actual && actual.pGanar < 0.5) accion = actual.pGanar < 0.25 ? "pausar" : "reducir";
  else if (!recomendado && actual && !actual.cumple.liquidez) accion = "reducir";

  // ruta: pasos de +pasoMax cada «esperaDias» días hasta el objetivo, cada uno revisado con la misma simulación
  const ruta: PasoRuta[] = [];
  if (accion === "escalar" && objetivoEsc) {
    let S = S0, k = 0;
    while (S < objetivoEsc.presupuesto && k < 6) {
      const sig = Math.min(objetivoEsc.presupuesto, Math.floor((S * (1 + topeCalidad)) / 500) * 500);
      if (sig <= S) break;
      const esc = escenarios.find((e) => e.presupuesto === sig) ?? (() => { const rng = crearAleatorio(semilla ^ hash(String(sig))), sim = simular(sig, H, N, base, rng, riesgo.perdidaMaxima); return { pGanar: sim.pGanar } as { pGanar: number }; })();
      k++; ruta.push({ orden: k, desdeDia: (k - 1) * riesgo.esperaDias, presupuesto: sig, cambioPct: Math.round((sig / S - 1) * 1000) / 10, pGanar: esc.pGanar, condicion: k === 1 ? "Ahora" : `Si durante ${riesgo.esperaDias} días seguidos no se activa ninguna alerta` });
      S = sig;
    }
  }

  // alertas de salida con números (ventana de 3 días: el día suelto engaña porque los pedidos llegan a lotes)
  const guardas: Guarda[] = [
    { clave: "pausar", titulo: "Pausa o vuelve al presupuesto anterior", umbral: r2(cpaEq), accion: "pausar", detalle: `si el costo por pedido (con IVA) de los últimos ${riesgo.esperaDias} días pasa de $${Math.round(cpaEq).toLocaleString("es-CO")}, cada pedido deja de dejar ganancia` },
    { clave: "volver", titulo: "Vuelve al presupuesto anterior", umbral: r2(cpaEq * 0.8), accion: "volver", detalle: `si el costo por pedido de ${riesgo.esperaDias} días pasa de $${Math.round(cpaEq * 0.8).toLocaleString("es-CO")} (80 % del punto de equilibrio) con al menos 3 pedidos en esa ventana` },
    { clave: "cpm", titulo: "Revisa el anuncio", umbral: r2(cpc0 * 1.4), accion: "esperar", detalle: `si el costo por clic pasa de $${Math.round(cpc0 * 1.4).toLocaleString("es-CO")} (40 % sobre el normal de $${Math.round(cpc0).toLocaleString("es-CO")}), el anuncio se está cansando o la audiencia se saturó` },
    { clave: "espera", titulo: "No toques el presupuesto", umbral: null, accion: "esperar", detalle: `durante ${riesgo.esperaDias} días después de cada cambio: Meta necesita ese tiempo para estabilizarse y el dato de esos días no es comparable` },
  ];
  const cpaActual = actual?.cpa ?? null;
  const explicacion: string[] = [];
  explicacion.push(`Con lo que ha pasado, cada pedido tiene unos ${Math.round(pEntrega * 100)} % de probabilidad de entregarse y deja en promedio $${Math.round(gananciaMedia).toLocaleString("es-CO")} cuando se entrega. Cada devolución cuesta unos $${Math.round(i.fleteDevolucion).toLocaleString("es-CO")}.`);
  explicacion.push(`Por eso un pedido puede costarte hasta $${Math.round(cpaEq).toLocaleString("es-CO")} de publicidad (con IVA) antes de dejar de ser rentable. Hoy te cuesta unos $${cpaActual ? Math.round(cpaActual).toLocaleString("es-CO") : "—"}.`);
  explicacion.push(`Al subir el presupuesto el costo por clic tiende a subir (se estima ${Math.round(el.e * 100) / 100} de elasticidad${el.fuente === "historial" ? ", medida en tu historial" : ", supuesta porque tu gasto casi no ha variado"}): no se duplican los pedidos al duplicar la pauta.`);

  return {
    calidad, motivosCalidad, riesgo, horizonte: H, simulaciones: N,
    base: { crPedidosPorClic: cr, crIC: ic(base.crA, base.crB), pEntrega, pIC: ic(base.pA, base.pB), gananciaMedia, elasticidad: el.e, elasticidadFuente: el.fuente, cpc0, s0, dispersion: disp, cpaEquilibrio: cpaEq, cpaActual, presupuestoActual: S0 },
    escenarios, accion, recomendado, objetivo: objetivoEsc, techoLiquidez: techo, ruta, guardas, explicacion,
    supuestos: [
      `Se simulan ${N.toLocaleString("es-CO")} caminos de ${H} días por presupuesto; el resultado es la ganancia final de los pedidos de esos días (incluye lo que aún está en camino) menos la publicidad con IVA.`,
      "Los pedidos por clic y la entrega se estiman con tus datos y se ensanchan cuando hay pocos o cuando los pedidos llegan a lotes. Se añade un riesgo de cambio de régimen (la conversión no es estable de una semana a otra) y una caída esperada de la conversión al escalar.",
      "El costo por clic sube al escalar según la elasticidad estimada; no se modelan cambios de anuncio, de audiencia ni de temporada.",
      "La liquidez usa el mismo piso del panel «¿cuánto puedo retirar?»: 7 días de pauta, devoluciones esperadas y lo apartado.",
    ],
  };
}

// ---------------------------------------------------------------- configuración de la persona
export type ConfigEscalado = { presupuestos: Record<string, number>; riesgo: Riesgo };
const entre = (v: unknown, a: number, b: number) => typeof v === "number" && Number.isFinite(v) && v >= a && v <= b;
/** Valida lo que llega del navegador. Devuelve la configuración limpia o un mensaje de error. */
export function validarConfigEscalado(v: unknown, actual?: ConfigEscalado): { ok: true; valor: ConfigEscalado } | { ok: false; error: string } {
  const x = (v ?? {}) as { presupuestos?: Record<string, unknown>; riesgo?: Partial<Record<keyof Riesgo, unknown>> };
  const presupuestos: Record<string, number> = { ...(actual?.presupuestos ?? {}) };
  for (const [id, val] of Object.entries(x.presupuestos ?? {})) {
    if (!/^\d{1,9}$/.test(id)) return { ok: false, error: "Campaña no válida." };
    if (val === null) { delete presupuestos[id]; continue; }
    if (!entre(val, 5000, 5_000_000)) return { ok: false, error: "El presupuesto diario debe estar entre $5.000 y $5.000.000." };
    presupuestos[id] = Math.round(val as number);
  }
  const r = { ...RIESGO_DEFECTO, ...(actual?.riesgo ?? {}) } as Riesgo, n = x.riesgo ?? {};
  if (n.perdidaMaxima !== undefined) { if (!entre(n.perdidaMaxima, 10_000, 10_000_000)) return { ok: false, error: "La pérdida máxima debe estar entre $10.000 y $10.000.000." }; r.perdidaMaxima = Math.round(n.perdidaMaxima as number); }
  if (n.probGanarMin !== undefined) { if (!entre(n.probGanarMin, 0.5, 0.99)) return { ok: false, error: "La probabilidad mínima de ganar debe estar entre 50 % y 99 %." }; r.probGanarMin = n.probGanarMin as number; }
  if (n.probPerdidaMax !== undefined) { if (!entre(n.probPerdidaMax, 0.01, 0.5)) return { ok: false, error: "La probabilidad máxima de perder más de lo tolerado debe estar entre 1 % y 50 %." }; r.probPerdidaMax = n.probPerdidaMax as number; }
  if (n.pasoMax !== undefined) { if (!entre(n.pasoMax, 0.05, 1)) return { ok: false, error: "La subida máxima por paso debe estar entre 5 % y 100 %." }; r.pasoMax = n.pasoMax as number; }
  if (n.esperaDias !== undefined) { if (!entre(n.esperaDias, 1, 14) || !Number.isInteger(n.esperaDias)) return { ok: false, error: "La espera entre cambios debe ser de 1 a 14 días." }; r.esperaDias = n.esperaDias as number; }
  return { ok: true, valor: { presupuestos, riesgo: r } };
}
/** Lee el ajuste guardado (JSON) y lo completa con los valores por defecto; si está dañado, usa los de por defecto. */
export function leerConfigEscalado(crudo: string | null | undefined): ConfigEscalado {
  try { const r = validarConfigEscalado(JSON.parse(crudo || "{}")); if (r.ok) return r.valor; } catch { /* JSON dañado */ }
  return { presupuestos: {}, riesgo: { ...RIESGO_DEFECTO } };
}
