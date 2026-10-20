// Creativos: el nombre único (el mismo en esta app, en Meta y en Drive), su estado y una lectura de si funciona, está probándose o hay que refrescarlo.
// Puro (sin base de datos). La lectura es RELATIVA a los demás creativos de la campaña y busca fatiga; nunca promete resultados y, con poca muestra, dice «probando».
import { sumarDias } from "./fechas.ts";

export type Formato = "video" | "imagen";
export const FORMATOS: Record<Formato, { nombre: string; codigo: string }> = { video: { nombre: "Video", codigo: "VID" }, imagen: { nombre: "Imagen", codigo: "IMG" } };
export type EstadoCreativo = "pausado" | "circulando" | "apagado" | "archivado";
export const ESTADOS: Record<EstadoCreativo, { nombre: string; detalle: string }> = {
  circulando: { nombre: "Circulando", detalle: "Está activo en Meta" },
  pausado: { nombre: "Pausado", detalle: "Detenido por ahora; puede volver" },
  apagado: { nombre: "Apagado", detalle: "Ya no se usa en pauta" },
  archivado: { nombre: "Archivado", detalle: "Guardado solo como historial" },
};
export const estadoValido = (v: unknown): v is EstadoCreativo => typeof v === "string" && v in ESTADOS;
export const formatoValido = (v: unknown): v is Formato => v === "video" || v === "imagen";

/** Un tramo del nombre: MAYÚSCULAS, sin tildes ni símbolos, con guiones entre palabras (así el nombre vale igual en Meta y como archivo de Drive). */
export function tramo(s: unknown, max: number): string {
  if (typeof s !== "string") return "";
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max).replace(/-+$/g, "");
}
const pad2 = (n: number) => String(n).padStart(2, "0");
export type PartesNombre = { campana: string; angulo: string; formato: Formato; version: number; fecha: string };
/** CAMPAÑA_ÁNGULO_FORMATO_V##_AAAAMMDD → p. ej. MASAJEADOR_DOLOR-CUELLO_VID_V03_20261019. `null` si falta algo. */
export function nombreCreativo(p: PartesNombre): string | null {
  const c = tramo(p.campana, 24), a = tramo(p.angulo, 30);
  if (!c || !a || !formatoValido(p.formato) || !Number.isInteger(p.version) || p.version < 1 || p.version > 99 || !/^\d{4}-\d{2}-\d{2}$/.test(p.fecha)) return null;
  return `${c}_${a}_${FORMATOS[p.formato].codigo}_V${pad2(p.version)}_${p.fecha.replace(/-/g, "")}`;
}
/** La versión que sigue para la misma campaña + ángulo + formato (la primera es 1). */
export function siguienteVersion(existentes: { campana: string; angulo: string; formato: string; version: number }[], c: { campana: string; angulo: string; formato: string }): number {
  const k = (x: { campana: string; angulo: string; formato: string }) => `${tramo(x.campana, 24)}|${tramo(x.angulo, 30)}|${x.formato}`;
  const mismo = existentes.filter((e) => k(e) === k(c)).map((e) => e.version);
  return mismo.length ? Math.max(...mismo) + 1 : 1;
}
/** Para comparar el nombre de un anuncio de Meta con el del creativo sin que importen mayúsculas ni espacios de más. */
export const llaveNombre = (s: unknown) => (typeof s === "string" ? s.trim().replace(/\s+/g, " ").toUpperCase() : "");

// ---------------------------------------------------------------- lectura de resultados
export type DiaAnuncio = { dia: string; gasto: number; impresiones: number; clics: number; compras: number };
export type EtiquetaCreativo = "funciona" | "regular" | "refrescar" | "probando" | "sin_datos";
export type ReferenciaCampana = { cpc: number | null; ctr: number | null; costoCompra: number | null; hayCompras: boolean; creativosConDatos: number };
export type LecturaCreativo = {
  etiqueta: EtiquetaCreativo; motivos: string[]; alertas: string[];
  gasto: number; impresiones: number; clics: number; compras: number; ctr: number | null; cpc: number | null; costoCompra: number | null; diasConGasto: number; ultimoDia: string | null;
};
export const LECTURA = { gastoMinimo: 50000, gastoSinCompras: 150000, ventanaDias: 3, impresionesVentana: 2000, caidaCtr: 0.3, subidaCpc: 0.4, clicsVentana: 30, mejorQuePares: 0.85, peorQuePares: 1.3, diasSinGastoCirculando: 3, diasGastoSiApagado: 2 };

const r2 = (n: number) => Math.round(n * 100) / 100;
/** Referencia de una campaña a partir de todos sus creativos (suma de todos los días de todos los creativos con datos). */
export function referenciaDe(porCreativo: DiaAnuncio[][]): ReferenciaCampana {
  let g = 0, i = 0, c = 0, p = 0, con = 0;
  for (const dias of porCreativo) { const gg = dias.reduce((a, d) => a + d.gasto, 0); if (gg > 0) con++; for (const d of dias) { g += d.gasto; i += d.impresiones; c += d.clics; p += d.compras; } }
  return { cpc: c > 0 ? g / c : null, ctr: i > 0 ? c / i : null, costoCompra: p > 0 ? g / p : null, hayCompras: p > 0, creativosConDatos: con };
}

export function leerCreativo(dias: DiaAnuncio[], ref: ReferenciaCampana, estado: EstadoCreativo, hoy: string): LecturaCreativo {
  const activos = dias.filter((d) => d.gasto > 0).sort((a, b) => a.dia.localeCompare(b.dia));
  const sum = (f: (d: DiaAnuncio) => number, l = activos) => l.reduce((a, d) => a + f(d), 0);
  const gasto = sum((d) => d.gasto), impresiones = sum((d) => d.impresiones), clics = sum((d) => d.clics), compras = sum((d) => d.compras);
  const ctr = impresiones > 0 ? clics / impresiones : null, cpc = clics > 0 ? gasto / clics : null, costoCompra = compras > 0 ? gasto / compras : null;
  const ultimoDia = activos.length ? activos[activos.length - 1].dia : null;
  const base = { gasto: r2(gasto), impresiones, clics, compras, ctr, cpc: cpc == null ? null : r2(cpc), costoCompra: costoCompra == null ? null : r2(costoCompra), diasConGasto: activos.length, ultimoDia };
  const alertas: string[] = [];
  if (estado === "circulando" && ultimoDia && ultimoDia < sumarDias(hoy, -LECTURA.diasSinGastoCirculando)) alertas.push(`Está marcado como circulando pero Meta no registra gasto desde el ${ultimoDia}. ¿Se apagó en Meta?`);
  if (estado === "circulando" && !ultimoDia) alertas.push("Está marcado como circulando pero Meta aún no registra gasto de este anuncio (revisa que se llame igual en Meta).");
  if ((estado === "apagado" || estado === "archivado" || estado === "pausado") && ultimoDia && ultimoDia >= sumarDias(hoy, -LECTURA.diasGastoSiApagado)) alertas.push(`Está marcado como ${estado} pero Meta registra gasto el ${ultimoDia}. Revisa si sigue activo en Meta.`);
  if (!activos.length) return { ...base, etiqueta: "sin_datos", motivos: ["Meta todavía no registra gasto de un anuncio con este nombre."], alertas };

  const motivos: string[] = [];
  const pct = (n: number) => `${(Math.round(n * 1000) / 10).toLocaleString("es-CO")} %`;
  // 1) Fatiga: los primeros días activos contra los últimos (sin solaparse).
  const v = LECTURA.ventanaDias;
  if (activos.length >= v * 2) {
    const a = activos.slice(0, v), z = activos.slice(-v), ia = sum((d) => d.impresiones, a), iz = sum((d) => d.impresiones, z), ca = sum((d) => d.clics, a), cz = sum((d) => d.clics, z);
    if (ia >= LECTURA.impresionesVentana && iz >= LECTURA.impresionesVentana) {
      const ctrA = ca / ia, ctrZ = cz / iz;
      if (ctrZ <= ctrA * (1 - LECTURA.caidaCtr)) motivos.push(`Se está cansando: el CTR bajó de ${pct(ctrA)} (primeros ${v} días) a ${pct(ctrZ)} (últimos ${v}).`);
      if (ca >= LECTURA.clicsVentana && cz >= LECTURA.clicsVentana) {
        const cpcA = sum((d) => d.gasto, a) / ca, cpcZ = sum((d) => d.gasto, z) / cz;
        if (cpcZ >= cpcA * (1 + LECTURA.subidaCpc)) motivos.push(`El costo por clic subió de $${Math.round(cpcA).toLocaleString("es-CO")} a $${Math.round(cpcZ).toLocaleString("es-CO")}.`);
      }
    }
  }
  if (motivos.length) return { ...base, etiqueta: "refrescar", motivos, alertas };

  // 2) Muestra suficiente
  if (gasto < LECTURA.gastoMinimo) return { ...base, etiqueta: "probando", motivos: [`Va en $${Math.round(gasto).toLocaleString("es-CO")} de gasto; hace falta al menos $${LECTURA.gastoMinimo.toLocaleString("es-CO")} para juzgarlo.`], alertas };

  // 3) Resultado frente a los demás creativos de la campaña
  if (ref.hayCompras) {
    if (compras === 0 && gasto >= LECTURA.gastoSinCompras) return { ...base, etiqueta: "refrescar", motivos: [`Gastó $${Math.round(gasto).toLocaleString("es-CO")} sin ninguna compra, y la campaña sí registra compras en otros creativos.`], alertas };
    if (compras === 0) return { ...base, etiqueta: "probando", motivos: [`Aún no registra compras (va en $${Math.round(gasto).toLocaleString("es-CO")}); se decide al llegar a $${LECTURA.gastoSinCompras.toLocaleString("es-CO")} de gasto.`], alertas };
    if (costoCompra != null && ref.costoCompra != null && ref.creativosConDatos >= 2) {
      const rel = costoCompra / ref.costoCompra;
      if (rel <= LECTURA.mejorQuePares) return { ...base, etiqueta: "funciona", motivos: [`Cada compra le cuesta $${Math.round(costoCompra).toLocaleString("es-CO")}, ${pct(1 - rel)} menos que el promedio de la campaña ($${Math.round(ref.costoCompra).toLocaleString("es-CO")}).`], alertas };
      if (rel >= LECTURA.peorQuePares) return { ...base, etiqueta: "refrescar", motivos: [`Cada compra le cuesta $${Math.round(costoCompra).toLocaleString("es-CO")}, ${pct(rel - 1)} más que el promedio de la campaña ($${Math.round(ref.costoCompra).toLocaleString("es-CO")}).`], alertas };
      return { ...base, etiqueta: "regular", motivos: ["Su costo por compra está dentro de lo normal de la campaña."], alertas };
    }
  } else if (cpc != null && ref.cpc != null && ref.creativosConDatos >= 2) {
    const rel = cpc / ref.cpc;
    motivos.push("Meta no reporta compras en esta campaña: se juzga por el costo por clic frente a los demás creativos.");
    if (rel <= LECTURA.mejorQuePares && ctr != null && ref.ctr != null && ctr >= ref.ctr) return { ...base, etiqueta: "funciona", motivos: [...motivos, `Su clic cuesta $${Math.round(cpc).toLocaleString("es-CO")}, ${pct(1 - rel)} menos que el promedio ($${Math.round(ref.cpc).toLocaleString("es-CO")}), con mejor CTR.`], alertas };
    if (rel >= LECTURA.peorQuePares) return { ...base, etiqueta: "refrescar", motivos: [...motivos, `Su clic cuesta $${Math.round(cpc).toLocaleString("es-CO")}, ${pct(rel - 1)} más que el promedio ($${Math.round(ref.cpc).toLocaleString("es-CO")}).`], alertas };
    return { ...base, etiqueta: "regular", motivos: [...motivos, "Su costo por clic está dentro de lo normal de la campaña."], alertas };
  }
  return { ...base, etiqueta: "regular", motivos: ["Es el único creativo con datos suficientes en su campaña: no hay con quién compararlo todavía."], alertas };
}

/** El enlace a Drive: solo https y solo hosts de Google (evita guardar enlaces a sitios ajenos). Devuelve el enlace limpio, o null. */
export function driveUrlLimpia(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t || t.length > 500) return null;
  try {
    const u = new URL(t);
    const h = u.hostname.toLowerCase();
    if (u.protocol !== "https:" || u.username || u.password) return null;
    if (!(h === "drive.google.com" || h === "docs.google.com" || h === "drive.usercontent.google.com" || h.endsWith(".drive.google.com"))) return null;
    return u.toString();
  } catch { return null; }
}
