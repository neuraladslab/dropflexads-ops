export const cop = (n) => (n < 0 ? '−' : '') + '$' + Math.abs(Math.round(Number(n) || 0)).toLocaleString('es-CO')
export const fmtN = (n) => Number(n).toLocaleString('es-CO')
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
/** 'YYYY-MM-DD' → '21 sep'. */
export const diaCorto = (d) => { if (!d) return '—'; const [, m, dd] = String(d).slice(0, 10).split('-'); return `${Number(dd)} ${MES[Number(m) - 1]}` }
