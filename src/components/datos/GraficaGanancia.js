import { cop, diaCorto, kshort } from '@/lib/formato'

/** Ganancia por día (diseño `chartProfit` de la app original): barras sobre/bajo la línea del $0, con el monto sobre cada barra y el día debajo. `dias` en orden cronológico. */
export default function GraficaGanancia({ dias }) {
  const W = 760, H = 300, t = 32, b = 44, l = 8, r = 8
  const maxPos = Math.max(0, ...dias.map((x) => x.neto)), maxNeg = Math.max(0, ...dias.map((x) => -x.neto))
  const alto = H - t - b, esc = alto / (maxPos + maxNeg || 1), cero = t + maxPos * esc
  const hueco = (W - l - r) / Math.max(dias.length, 1), ancho = Math.min(72, hueco * 0.6)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Ganancia de cada día: ${dias.map((x) => `${diaCorto(x.dia)} ${cop(x.neto)}`).join(', ')}`} style={{ display: 'block' }}>
      {dias.map((x, k) => {
        const cx = l + hueco * k + hueco / 2, h = Math.max(2, Math.abs(x.neto) * esc), sube = x.neto >= 0, y = sube ? cero - h : cero
        return (
          <g key={x.dia}>
            <title>{`${diaCorto(x.dia)} · entró ${cop(x.ganancia)} · gastaste ${cop(x.ganancia - x.neto)} · ${sube ? 'ganaste' : 'perdiste'} ${cop(Math.abs(x.neto))}`}</title>
            <rect x={cx - ancho / 2} y={y} width={ancho} height={h} rx="4" fill={sube ? 'var(--jade)' : 'var(--coral)'} />
            <text x={cx} y={sube ? y - 8 : y + h + 18} textAnchor="middle" style={{ font: '700 14px var(--sans)', fill: sube ? 'var(--jade-ink)' : 'var(--coral-ink)' }}>{kshort(x.neto)}</text>
            <text x={cx} y={H - 12} textAnchor="middle" style={{ font: '500 12.5px var(--sans)', fill: 'var(--muted)' }}>{diaCorto(x.dia)}</text>
          </g>
        )
      })}
      <line x1={l} x2={W - r} y1={cero} y2={cero} stroke="var(--ink)" strokeWidth="1.6" />
    </svg>
  )
}
