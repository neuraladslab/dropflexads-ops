import { Icono } from '@/components/shell/Icono'
import TarjetaDropi from './TarjetaDropi'
import { ENTRA, SALE } from '@/domain/billetera.ts'
import { sumarDias } from '@/domain/fechas.ts'
import { cop, corto, diaCorto, fmtN } from '@/lib/formato'

const COL_ENTRA = { ganancia: '#10B981', propia: '#93C5FD', otros: '#CBD5E1' }
const COL_SALE = { tarjeta: '#3B82F6', descuentos: '#EF4444', retiros: '#94A3B8' }

/** Qué entró (hacia arriba) y qué salió (hacia abajo) de la billetera cada día, apilado por tipo. Pasa el mouse por un día para ver el detalle y el saldo con el que cerró. */
function FlujoDias({ dias }) {
  const W = 760, H = 340, t = 30, b = 56, l = 8, r = 8 // abajo queda espacio para el monto de lo que salió y, debajo, el día
  const porDia = new Map(dias.map((x) => [x.dia, x]))
  const primero = dias[0].dia, ultimo = dias[dias.length - 1].dia
  const cal = []
  for (let d = primero; d <= ultimo && cal.length < 45; d = sumarDias(d, 1)) cal.push(porDia.get(d) || { dia: d, vacio: true, totalEntra: 0, totalSale: 0, entra: {}, sale: {} })
  const n = cal.length
  const maxUp = Math.max(1, ...cal.map((x) => x.totalEntra)), maxDown = Math.max(0, ...cal.map((x) => x.totalSale))
  const esc = (H - t - b) / (maxUp + maxDown), cero = t + maxUp * esc
  const hueco = (W - l - r) / n, ancho = Math.min(46, hueco * 0.62), paso = Math.max(1, Math.ceil(n / 12))
  const apilar = (x, lado, cols, sentido) => { let acc = 0; return Object.keys(cols).map((k) => { const v = x[lado][k] || 0; if (!v) return null; const h = Math.max(1.5, v * esc), y = sentido === 'up' ? cero - acc - h : cero + acc; acc += h; return { k, v, h, y } }).filter(Boolean) }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Qué entró y qué salió de la billetera cada día: ${dias.map((x) => `${diaCorto(x.dia)} entró ${cop(x.totalEntra)}, salió ${cop(x.totalSale)}`).join('; ')}`} style={{ display: 'block' }}>
      {cal.map((x, i) => {
        const cx = l + hueco * i + hueco / 2, muestra = i % paso === 0 || i === n - 1
        const tip = x.vacio ? `${diaCorto(x.dia)}: sin movimientos` : `${diaCorto(x.dia)}\nEntró ${cop(x.totalEntra)}${Object.entries(ENTRA).map(([k, nom]) => (x.entra[k] ? `\n   ${nom}: ${cop(x.entra[k])}` : '')).join('')}\nSalió ${cop(x.totalSale)}${Object.entries(SALE).map(([k, nom]) => (x.sale[k] ? `\n   ${nom}: ${cop(x.sale[k])}` : '')).join('')}${x.saldoCierre != null ? `\nCerró con ${cop(x.saldoCierre)}` : ''}`
        return (
          <g key={x.dia}>
            <title>{tip}</title>
            <rect x={cx - hueco / 2} y={t} width={hueco} height={H - t - b} fill="transparent" />
            {apilar(x, 'entra', COL_ENTRA, 'up').map((s) => <rect key={s.k} x={cx - ancho / 2} y={s.y} width={ancho} height={s.h} fill={COL_ENTRA[s.k]} />)}
            {apilar(x, 'sale', COL_SALE, 'down').map((s) => <rect key={s.k} x={cx - ancho / 2} y={s.y} width={ancho} height={s.h} fill={COL_SALE[s.k]} />)}
            {x.totalEntra > 0 && (n <= 14 || muestra) && <text x={cx} y={cero - x.totalEntra * esc - 7} textAnchor="middle" style={{ font: '700 12.5px var(--sans)', fill: 'var(--jade-ink)' }}>{corto(x.totalEntra)}</text>}
            {x.totalSale > 0 && (n <= 14 || muestra) && <text x={cx} y={cero + x.totalSale * esc + 16} textAnchor="middle" style={{ font: '700 12.5px var(--sans)', fill: 'var(--coral-ink)' }}>{corto(x.totalSale)}</text>}
            {(n <= 14 || muestra) && <text x={cx} y={H - 10} textAnchor="middle" style={{ font: `${i === n - 1 ? 700 : 500} 12px var(--sans)`, fill: i === n - 1 ? 'var(--ink)' : 'var(--muted)' }}>{diaCorto(x.dia)}</text>}
          </g>
        )
      })}
      <line x1={l} x2={W - r} y1={cero} y2={cero} stroke="var(--ink)" strokeWidth="1.5" />
    </svg>
  )
}

/** La billetera de Dropi como una billetera (con su bolsillo y lo que entró y salió), la flecha de lo que pasaste, y la tarjeta virtual a la que llega. */
export default function BilleteraVisual({ d }) {
  const aTarjeta = d.totales.to_card || { n: 0, sum: 0 }
  return (
    <>
      <div className="wlt-row">
        <div className="wlt" role="group" aria-label="Billetera Dropi">
          <div className="wlt-top"><span className="wlt-ico"><Icono n="wallet" size={22} /></span><div><b>Billetera Dropi</b><small>Ganancias de tus pedidos entregados</small></div></div>
          <div className="wlt-lbl">En tu billetera hay</div>
          <div className="wlt-big">{d.saldo == null ? '—' : cop(d.saldo)}</div>
          <div className="wlt-pocket"><span>↓ Entró <b>{cop(d.entro)}</b></span><span>↑ Salió <b>{cop(d.salio)}</b></span><i className="wlt-clasp" aria-hidden="true" /></div>
        </div>
        <div className="wlt-mid" aria-label="Lo que pasaste de la billetera a la tarjeta">
          <span>Pasaste a tu tarjeta</span><span className="arrow" aria-hidden="true">→</span><b>{cop(aTarjeta.sum)}</b><span>{fmtN(aTarjeta.n)} {aTarjeta.n === 1 ? 'recarga' : 'recargas'}</span>
        </div>
        <div style={{ flex: 1, minWidth: 260, maxWidth: 430 }}><TarjetaDropi t={d.tarjeta} /></div>
      </div>
      {d.diasFlujo.length >= 1 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <b>¿Qué pasó en tu billetera cada día?</b>
          <p className="muted only-learner" style={{ fontSize: 13.5, margin: '2px 0 10px' }}>Hacia arriba, lo que <b>entró</b> ese día; hacia abajo, lo que <b>salió</b>. Tu billetera es «de paso»: Dropi te paga la ganancia de un pedido y casi toda sale enseguida a tu tarjeta, por eso el saldo casi siempre está cerca de $0. Pasa el mouse por un día para ver el detalle y con cuánto cerró.</p>
          <FlujoDias dias={d.diasFlujo} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', marginTop: 10, fontSize: 13 }}>
            {Object.entries(ENTRA).filter(([k]) => d.diasFlujo.some((x) => x.entra[k])).map(([k, nom]) => <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: COL_ENTRA[k] }} />{nom}</span>)}
            {Object.entries(SALE).filter(([k]) => d.diasFlujo.some((x) => x.sale[k])).map(([k, nom]) => <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: COL_SALE[k] }} />{nom}</span>)}
          </div>
        </div>
      )}
    </>
  )
}
