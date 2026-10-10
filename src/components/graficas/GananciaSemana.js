'use client'

import { useState } from 'react'
import Ayuda from '@/components/Ayuda'
import { cop, kshort } from '@/lib/formato'

// Tarjeta del Dashboard: la ganancia neta de los últimos 7 días (la cifra) junto a su evolución día a día (la forma), con el mejor día marcado.
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const dd = (d) => `${Number(d.slice(8))} de ${MES[Number(d.slice(5, 7)) - 1]}`

export default function GananciaSemana({ dias }) {
  const [h, setH] = useState(null)
  if (!dias.length) return null
  const netos = dias.map((x) => x.entro - x.gasto), neto = netos.reduce((a, v) => a + v, 0)
  const W = 640, Hh = 150, T = 34, B = 26, L = 14, R = 14, max = Math.max(...netos, 0), min = Math.min(...netos, 0)
  const y = (v) => T + (Hh - T - B) * (1 - (v - min) / (max - min || 1)), x = (i) => L + ((W - L - R) / Math.max(dias.length - 1, 1)) * i
  const mejor = netos.indexOf(Math.max(...netos)), linea = netos.map((v, i) => `${x(i)},${y(v)}`).join(' ')
  const sel = h != null ? h : null
  return (
    <div className="card gr-mini" style={{ marginTop: 16 }}>
      <div>
        <div className="kpi-l">Ganancia neta · últimos {dias.length} días<Ayuda t="ganancia_neta" /></div>
        <div className="kpi-v" style={{ color: neto < 0 ? 'var(--coral-ink)' : undefined, margin: '6px 0' }}>{cop(neto)}</div>
        <p className="muted" style={{ fontSize: 14, margin: 0 }}>{neto >= 0 ? 'Te quedó' : 'Perdiste'} después de publicidad, devoluciones, comisiones y herramientas.</p>
        <p className="muted only-learner" style={{ fontSize: 13, margin: '10px 0 0' }}>Entró {cop(dias.reduce((a, v) => a + v.entro, 0))} y gastaste {cop(dias.reduce((a, v) => a + v.gasto, 0))}. Ventas: Dropi · Gasto: tu tarjeta y Meta.</p>
      </div>
      <div>
        <div className="gr-head"><b style={{ fontSize: 15 }}>Ganancia por día</b><span className="gr-sub">Mejor día <b style={{ color: 'var(--jade-ink)' }}>{kshort(netos[mejor])}</b> · {dd(dias[mejor].dia)}</span></div>
        <div style={{ position: 'relative' }} onMouseLeave={() => setH(null)}>
          <svg viewBox={`0 0 ${W} ${Hh}`} width="100%" role="img" aria-label={`Ganancia neta de cada día: ${dias.map((d, i) => `${dd(d.dia)} ${cop(netos[i])}`).join(', ')}`} style={{ display: 'block' }}>
            {min < 0 && <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="#CBD5E1" strokeDasharray="3 4" />}
            {sel != null && <rect x={x(sel) - (W - L - R) / Math.max(dias.length - 1, 1) / 2} y={0} width={(W - L - R) / Math.max(dias.length - 1, 1)} height={Hh} fill="#EEF3FF" />}
            <polygon points={`${x(0)},${y(Math.max(min, 0))} ${linea} ${x(dias.length - 1)},${y(Math.max(min, 0))}`} fill="var(--blue)" opacity="0.1" />
            <polyline points={linea} fill="none" stroke="var(--blue)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
            {netos.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={i === mejor || i === sel ? 5 : 3} fill="#fff" stroke="var(--blue)" strokeWidth="2.4" />)}
            <text x={x(mejor)} y={y(netos[mejor]) - 12} textAnchor="middle" style={{ font: '700 13px var(--sans)', fill: 'var(--ink)' }}>mejor día</text>
            {dias.map((d, i) => <text key={d.dia} x={x(i)} y={Hh - 7} textAnchor={i === 0 ? 'start' : i === dias.length - 1 ? 'end' : 'middle'} style={{ font: '500 12px var(--sans)', fill: 'var(--muted)' }}>{`${Number(d.dia.slice(8))} ${MES[Number(d.dia.slice(5, 7)) - 1]}`}</text>)}
            {dias.map((d, i) => <rect key={'h' + d.dia} x={x(i) - 40} y={0} width={80} height={Hh} fill="transparent" onMouseEnter={() => setH(i)} onClick={() => setH(sel === i ? null : i)} />)}
          </svg>
          {sel != null && (
            <div className="gr-tip" style={{ left: `${(x(sel) / W) * 100}%`, top: 0, transform: `translateX(${sel > dias.length / 2 ? '-100%' : '0'})` }} role="status">
              <b>{dd(dias[sel].dia)}</b>
              <div><i>Entró</i> {cop(dias[sel].entro)}</div><div><i>Gastaste</i> {cop(dias[sel].gasto)}</div>
              <div>{netos[sel] >= 0 ? 'Ganaste' : 'Perdiste'} <b style={{ display: 'inline' }}>{cop(Math.abs(netos[sel]))}</b></div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
