// Series para las gráficas: puras y probadas, para que lo que se dibuja sea exactamente lo que dicen los resúmenes.
import { sumarDias } from "./fechas.ts";
import { netoDelDia, type Dia } from "./porDia.ts";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Todos los días de `desde` a `hasta` (inclusive), en orden. */
export function diasEntre(desde: string, hasta: string): string[] {
  const out: string[] = [];
  for (let d = desde; d <= hasta && out.length < 400; d = sumarDias(d, 1)) out.push(d);
  return out;
}

/**
 * Resultado acumulado día a día: cada día suma lo que entró (ganancias de pedidos entregados) menos todos los costos, incluidas las herramientas de ese día.
 * El último valor es exactamente «recuperado − invertido»: cuando la línea cruza el 0, la inversión se recuperó.
 */
export function acumuladoPorDia(dias: Dia[], herramientasPorDia: number, desde: string, hasta: string) {
  const por = new Map(dias.map((d) => [d.dia, d]));
  let acum = 0;
  return diasEntre(desde, hasta).map((dia) => {
    const d = por.get(dia);
    const entro = d ? d.ganancia : 0, neto = (d ? netoDelDia(d).neto : 0) - herramientasPorDia;
    acum = r2(acum + neto);
    return { dia, entro: r2(entro), gasto: r2(entro - neto), neto: r2(neto), acumulado: acum };
  });
}

export type FilaMeta = { d: string; spend: number; imp: number; clicks: number };

/** CPM (costo por mil impresiones) y CTR (% de clics) de un conjunto de cifras; null si no hubo impresiones. */
export const cpmDe = (gasto: number, imp: number) => (imp > 0 ? r2((gasto / imp) * 1000) : null);
export const ctrDe = (clics: number, imp: number) => (imp > 0 ? r2((clics / imp) * 100) : null);

/** Serie diaria de una campaña de Meta: gasto (sin IVA), CPM y CTR por cada día del rango (días sin gasto: gasto 0 y CPM/CTR null). */
export function serieMeta(filas: FilaMeta[], desde: string, hasta: string) {
  const por = new Map(filas.map((f) => [f.d, f]));
  return diasEntre(desde, hasta).map((dia) => {
    const f = por.get(dia);
    return { dia, gasto: f ? r2(f.spend) : 0, impresiones: f ? f.imp : 0, clics: f ? f.clicks : 0, cpm: f ? cpmDe(f.spend, f.imp) : null, ctr: f ? ctrDe(f.clicks, f.imp) : null };
  });
}

/** Resumen exacto del gasto de una campaña: totales, promedio por día con gasto y los días extremos de CPM y CTR. */
export function resumenMeta(filas: FilaMeta[]) {
  const con = filas.filter((f) => f.spend > 0 || f.imp > 0);
  const gasto = r2(con.reduce((a, f) => a + f.spend, 0)), imp = con.reduce((a, f) => a + f.imp, 0), clics = con.reduce((a, f) => a + f.clicks, 0);
  const conCpm = con.filter((f) => f.imp > 0).map((f) => ({ dia: f.d, cpm: cpmDe(f.spend, f.imp) as number, ctr: ctrDe(f.clicks, f.imp) as number }));
  const mejorCpm = conCpm.length ? conCpm.reduce((m, x) => (x.cpm < m.cpm ? x : m)) : null, peorCpm = conCpm.length ? conCpm.reduce((m, x) => (x.cpm > m.cpm ? x : m)) : null;
  const mejorCtr = conCpm.length ? conCpm.reduce((m, x) => (x.ctr > m.ctr ? x : m)) : null;
  return {
    dias: con.length, gasto, promedioDia: con.length ? r2(gasto / con.length) : 0, impresiones: imp, clics,
    cpm: cpmDe(gasto, imp), ctr: ctrDe(clics, imp), mejorCpm, peorCpm, mejorCtr,
  };
}
