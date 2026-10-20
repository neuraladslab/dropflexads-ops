import { cop, fmtN } from '@/lib/formato'
import Ayuda from '@/components/Ayuda'

// Piezas visuales de Cortes. Colores validados (separación para daltonismo) en este orden fijo: azul · ámbar · violeta · verde. El coral solo para lo que está mal (devuelto).
export const COLOR = { azul: 'var(--blue)', ambar: 'var(--gold)', violeta: '#8B5CF6', jade: 'var(--jade)', coral: 'var(--coral)' }
/** Porcentaje con una decimal y coma («58,7 %»); lo muy pequeño se dice como tal en vez de mostrar «0,0 %». */
const pct = (v, t) => { const p = t > 0 ? (v / t) * 100 : 0; return p > 0 && p < 0.1 ? '<0,1 %' : p.toFixed(1).replace('.', ',') + ' %' }

/**
 * Barra apilada: una sola barra dividida en tramos; la leyenda siempre dice cuánto vale cada uno (el color nunca va solo).
 * `marca` = {valor, etiqueta}: línea punteada que indica «hasta aquí llega lo que hay» cuando los tramos suman más que eso (p. ej. se gastó más de lo que entró).
 */
export function BarraApilada({ titulo, total, segmentos, marca, unidad = 'cop' }) {
  const f = unidad === 'n' ? fmtN : cop
  const segs = segmentos.filter((s) => s.valor > 0)
  const suma = segs.reduce((a, s) => a + s.valor, 0)
  if (!segs.length) return null
  const alt = segs.map((s) => `${s.etiqueta} ${f(s.valor)}`).join(', ')
  return (
    <div>
      {(titulo || total != null) && <div className="vz-t"><span>{titulo}</span>{total != null && <b>{f(total)}</b>}</div>}
      <div className="vz-wrap">
        <div className="vz-bar" role="img" aria-label={`${titulo || 'Distribución'}: ${alt}`}>
          {segs.map((s) => <div key={s.etiqueta} className="vz-seg" title={`${s.etiqueta}: ${f(s.valor)} (${pct(s.valor, suma)})`} style={{ flexGrow: s.valor, background: s.color }} />)}
        </div>
        {marca && marca.valor > 0 && marca.valor < suma && <div className="vz-marca" style={{ left: `${(marca.valor / suma) * 100}%` }}><span>{marca.etiqueta}</span></div>}
      </div>
      <ul className="vz-leg">{segs.map((s) => <li key={s.etiqueta}><i style={{ background: s.color }} />{s.etiqueta} <b>{f(s.valor)}</b> <span style={{ fontSize: 12.5 }}>· {pct(s.valor, suma)}</span></li>)}</ul>
    </div>
  )
}

/** Tarjeta de una cifra: etiqueta (con su «?» de definición), valor y una nota corta. */
export const Tile = ({ l, v, n, color, ayuda }) => (
  <div className="vz-tile"><div className="l">{l}{ayuda && <Ayuda t={ayuda} />}</div><div className="v" style={color ? { color: `var(--${color})` } : undefined}>{v}</div>{n && <div className="n">{n}</div>}</div>
)

/** «¿A dónde se fue lo que entró?»: publicidad, devoluciones, comisiones y otros, y lo que quedó. Si se gastó más de lo que entró, una línea punteada marca cuánto entró. */
export function desgloseCorte(c) {
  const t = c.total, publicidad = t.meta + t.otrosGastos, devol = t.devoluciones, otros = Math.max(0, c.costos - publicidad - devol)
  return {
    segmentos: [
      { etiqueta: 'Publicidad', valor: publicidad, color: COLOR.azul },
      { etiqueta: 'Devoluciones', valor: devol, color: COLOR.ambar },
      { etiqueta: 'Comisiones y otros', valor: otros, color: COLOR.violeta },
      { etiqueta: 'Te quedó', valor: Math.max(0, c.neto), color: COLOR.jade },
    ],
    marca: c.neto < 0 ? { valor: t.ganancia, etiqueta: `Entró ${cop(t.ganancia)}` } : null,
  }
}
