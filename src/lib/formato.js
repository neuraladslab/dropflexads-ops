export const cop = (n) => (n < 0 ? '−' : '') + '$' + Math.abs(Math.round(Number(n) || 0)).toLocaleString('es-CO')
export const fmtN = (n) => Number(n).toLocaleString('es-CO')
/** Monto corto para etiquetas: $55k, −$1,2 M. */
export const corto = (n) => { const a = Math.abs(Math.round(Number(n) || 0)); const t = a >= 1e6 ? (a / 1e6).toFixed(1).replace('.', ',') + ' M' : a >= 1000 ? Math.round(a / 1000) + 'k' : String(a); return (n < 0 ? '−' : '') + '$' + t }
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
/** 'YYYY-MM-DD' → '21 sep'. */
export const diaCorto = (d) => { if (!d) return '—'; const [, m, dd] = String(d).slice(0, 10).split('-'); return `${Number(dd)} ${MES[Number(m) - 1]}` }
/** 'YYYY-MM-DD' → '21 de septiembre de 2026' (o sin año). */
export const fechaLarga = (d, conAnio = true) => new Date(d + 'T12:00:00Z').toLocaleDateString('es-CO', { day: 'numeric', month: 'long', ...(conAnio ? { year: 'numeric' } : {}), timeZone: 'UTC' })
/** Monto con signo para etiquetas de gráficas: +$55 mil, −$180 mil, +$900. */
export const kshort = (n) => { const a = Math.abs(Math.round(Number(n) || 0)); return (n < 0 ? '−' : '+') + '$' + (a >= 1000 ? Math.round(a / 1000) + ' mil' : a) }
/** Hace cuánto pasó algo (ms desde 1970): «hace 3 h». */
export const hace = (ms) => { if (!ms) return 'nunca'; const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? 'hace un momento' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} d` }

// Métricas de anuncios (el gasto va sin IVA, como lo entrega Meta).
export const cpm = (gasto, imp) => (imp > 0 ? (gasto / imp) * 1000 : 0) // costo por mil impresiones
export const ctr = (clics, imp) => (imp > 0 ? (clics / imp) * 100 : 0) // % de impresiones que dieron un clic
export const pct = (n) => (Math.round(n * 100) / 100).toLocaleString('es-CO') + ' %'
