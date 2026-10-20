// Reglas puras de la integración con la IA (Anthropic): modelos y precios, tope mensual, validación de lo que entra y el VERIFICADOR DE CIFRAS.
// La IA nunca calcula las cifras del sistema: las consulta con herramientas de solo lectura. Aun así, todo número de su respuesta se contrasta con lo que devolvieron esas herramientas
// (y con lo que escribió la persona); lo que no aparece se marca como «no verificado» en pantalla. Así una cifra inventada no pasa desapercibida.

export type ModeloId = "claude-opus-5-5" | "claude-sonnet-5-5" | "claude-haiku-5-5";
// Precios en USD por millón de tokens (lista oficial de la API). Lectura de caché ≈ 10 % de la entrada; escritura ≈ 125 %.
export const MODELOS: Record<ModeloId, { nombre: string; detalle: string; entrada: number; salida: number; lectura: number; escritura: number }> = {
  "claude-opus-5-5": { nombre: "Claude Opus 5.5", detalle: "El más capaz y el recomendado", entrada: 4, salida: 20, lectura: 0.2, escritura: 5 },
  "claude-sonnet-5-5": { nombre: "Claude Sonnet 5.5", detalle: "Equilibrado: más económico", entrada: 2, salida: 10, lectura: 0.2, escritura: 2.5 },
  "claude-haiku-5-5": { nombre: "Claude Haiku 5.5", detalle: "El más económico y rápido", entrada: 0.1, salida: 0.5, lectura: 0.01, escritura: 0.125 },
};
export const MODELO_DEFECTO: ModeloId = "claude-opus-5-5";
export const TOPE_DEFECTO_USD = 3;
export type UsoApi = { input_tokens?: number; output_tokens?: number; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null };
export type UsoMes = { mes: string; usd: number; llamadas: number; tokensEntrada: number; tokensSalida: number };
const r4 = (n: number) => Math.round(n * 10000) / 10000;

export function costoUsd(modelo: string, u: UsoApi): number {
  const p = MODELOS[modelo as ModeloId] ?? MODELOS[MODELO_DEFECTO];
  const x = (v?: number | null) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);
  return r4((x(u.input_tokens) * p.entrada + x(u.output_tokens) * p.salida + x(u.cache_read_input_tokens) * p.lectura + x(u.cache_creation_input_tokens) * p.escritura) / 1e6);
}
/** Suma un uso al acumulado del mes; si cambió el mes, el acumulado arranca de cero. */
export function sumarUso(uso: UsoMes | null | undefined, mes: string, modelo: string, u: UsoApi): UsoMes {
  const base = uso && uso.mes === mes ? uso : { mes, usd: 0, llamadas: 0, tokensEntrada: 0, tokensSalida: 0 };
  return { mes, usd: r4(base.usd + costoUsd(modelo, u)), llamadas: base.llamadas + 1, tokensEntrada: base.tokensEntrada + (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0), tokensSalida: base.tokensSalida + (u.output_tokens ?? 0) };
}
export const topeAlcanzado = (uso: UsoMes | null | undefined, mes: string, topeUsd: number) => !!uso && uso.mes === mes && uso.usd >= topeUsd;
export const mesDe = (fecha: Date = new Date()) => fecha.toISOString().slice(0, 7);

export type ConfigIA = { modelo: ModeloId; topeUsd: number };
export function validarConfigIA(v: unknown): { ok: true; valor: ConfigIA } | { ok: false; error: string } {
  const x = (v ?? {}) as { modelo?: unknown; topeUsd?: unknown };
  const modelo = x.modelo === undefined ? MODELO_DEFECTO : x.modelo;
  if (typeof modelo !== "string" || !(modelo in MODELOS)) return { ok: false, error: "Modelo no válido." };
  const tope = x.topeUsd === undefined ? TOPE_DEFECTO_USD : x.topeUsd;
  if (typeof tope !== "number" || !Number.isFinite(tope) || tope < 0.5 || tope > 200) return { ok: false, error: "El tope mensual debe estar entre US$ 0,5 y US$ 200." };
  return { ok: true, valor: { modelo: modelo as ModeloId, topeUsd: Math.round(tope * 100) / 100 } };
}
export const leerConfigIA = (crudo: string | null | undefined): ConfigIA => { try { const r = validarConfigIA(JSON.parse(crudo || "{}")); if (r.ok) return r.valor; } catch { /* dañado */ } return { modelo: MODELO_DEFECTO, topeUsd: TOPE_DEFECTO_USD }; };
/** Una clave de la API de Anthropic empieza por «sk-ant-» y no lleva espacios. Solo se comprueba la forma; la validez real la dice la API. */
export const claveConForma = (k: unknown): k is string => typeof k === "string" && /^sk-ant-[A-Za-z0-9_-]{20,300}$/.test(k.trim());

// ---------------------------------------------------------------- lo que entra
export type Turno = { rol: "user" | "assistant"; texto: string };
const sinControl = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").replace(/\s+\n/g, "\n").trim();
/** La pantalla donde está la persona (la dirección), solo si tiene la forma de una ruta de la app: se le da a la IA como contexto, nunca como instrucción. */
export const limpiarPantalla = (v: unknown): string => (typeof v === "string" && /^\/[a-z0-9/_-]{0,80}$/.test(v) ? v : "");
export function limpiarEntrada(i: { pregunta?: unknown; historial?: unknown; pantalla?: unknown }): { ok: true; pregunta: string; historial: Turno[]; pantalla: string } | { ok: false; error: string } {
  if (typeof i.pregunta !== "string") return { ok: false, error: "Escribe una pregunta." };
  const pregunta = sinControl(i.pregunta);
  if (pregunta.length < 3) return { ok: false, error: "Escribe una pregunta." };
  if (pregunta.length > 600) return { ok: false, error: "La pregunta es demasiado larga (máximo 600 letras)." };
  const historial: Turno[] = [];
  if (Array.isArray(i.historial)) for (const t of i.historial.slice(-6) as { rol?: unknown; texto?: unknown }[]) {
    if (t && (t.rol === "user" || t.rol === "assistant") && typeof t.texto === "string") historial.push({ rol: t.rol, texto: sinControl(t.texto).slice(0, 1500) });
  }
  while (historial.length && historial[0].rol !== "user") historial.shift(); // la conversación siempre empieza con la persona
  return { ok: true, pregunta, historial, pantalla: limpiarPantalla(i.pantalla) };
}

// ---------------------------------------------------------------- verificador de cifras
export type Cifra = { texto: string; valor: number; pct: boolean; moneda: boolean; abrev: boolean; decimales: boolean };
const RE = /(\$)?\s?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?\s?(%|millones\b|mil\b|M\b)?/g;
/** Extrae los números de un texto en formato colombiano ($1.234.567, 87 %, 0,8, 150 mil, 1,2 M). */
export function extraerCifras(texto: string): Cifra[] {
  const out: Cifra[] = [];
  for (const m of texto.matchAll(RE)) {
    const entero = m[2].replace(/\./g, ""), dec = m[3], suf = m[4];
    let v = Number(dec ? `${entero}.${dec}` : entero);
    const abrev = suf === "mil" || suf === "M" || suf === "millones";
    if (suf === "mil") v *= 1e3; else if (suf === "M" || suf === "millones") v *= 1e6;
    if (!Number.isFinite(v)) continue;
    out.push({ texto: m[0].trim(), valor: v, pct: suf === "%", moneda: m[1] === "$", abrev, decimales: !!dec });
  }
  return out;
}
/** Todos los números que aparecen en una estructura (valores numéricos y números escritos dentro de textos). */
export function recolectarHechos(obj: unknown, acc: number[] = []): number[] {
  if (typeof obj === "number" && Number.isFinite(obj)) acc.push(obj);
  else if (typeof obj === "string") for (const c of extraerCifras(obj)) acc.push(c.valor);
  else if (Array.isArray(obj)) for (const x of obj) recolectarHechos(x, acc);
  else if (obj && typeof obj === "object") for (const x of Object.values(obj)) recolectarHechos(x, acc);
  return acc;
}
const exenta = (c: Cifra) => !c.pct && !c.moneda && !c.abrev && !c.decimales && Number.isInteger(c.valor) && (c.valor <= 31 || (c.valor >= 2020 && c.valor <= 2035)); // días, pasos, años
/** Cifras de la respuesta que NO aparecen en los datos (con la tolerancia del redondeo y permitiendo sumas, diferencias y mitades de cifras que sí están). */
export function verificarCifras(texto: string, hechos: number[], extras: number[] = []): { total: number; verificadas: number; noVerificadas: string[] } {
  const base = [...new Set([...hechos, ...extras].filter((n) => Number.isFinite(n)).map((n) => Math.round(n * 1e4) / 1e4))];
  const derivadas: number[] = [];
  if (base.length <= 350) for (let i = 0; i < base.length; i++) { derivadas.push(base[i] / 2); for (let j = i + 1; j < base.length; j++) { derivadas.push(base[i] + base[j], Math.abs(base[i] - base[j])); } }
  const todos = base.concat(derivadas), enPct = todos.filter((n) => Math.abs(n) <= 1.5).map((n) => n * 100); // 0,87 se puede escribir como 87 %
  const cerca = (v: number, lista: number[], tol: number, abs: number) => lista.some((h) => Math.abs(h - v) <= Math.max(abs, Math.abs(h) * tol));
  const cifras = extraerCifras(texto).filter((c) => !exenta(c)), malas: string[] = [];
  for (const c of cifras) {
    const ok = c.pct ? cerca(c.valor, todos.concat(enPct), 0.01, 0.6) : c.abrev ? cerca(c.valor, todos, 0.05, 0) : cerca(c.valor, todos, 0.006, c.decimales ? 0.011 : 1);
    if (!ok && !malas.includes(c.texto)) malas.push(c.texto);
  }
  return { total: cifras.length, verificadas: cifras.length - malas.length, noVerificadas: malas };
}
