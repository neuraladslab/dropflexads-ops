'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Ayuda from '@/components/Ayuda'
import { cop, corto, kshort, pct } from '@/lib/formato'

// Gráficas por día que escalan con los datos: rango (7/14/30/90 días/Todo), agrupación (día/semana/mes), eje fijo a la izquierda, desplazamiento horizontal
// cuando hay muchos períodos y cifras sobre cada barra solo cuando caben. Mismo lenguaje visual que el resto de la app (tarjetas, controles, colores).
// `metrica`: { tipo: 'neto' } (entro − gasto) · { tipo: 'cpm' } · { tipo: 'ctr' } · { tipo: 'suma', campo } · { tipo: 'ultimo', campo }.
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const dd = (d) => { const [, m, x] = d.split('-'); return `${Number(x)} ${MES[Number(m) - 1]}` }
const ms = (d) => Date.parse(d + 'T12:00:00Z'), iso = (t) => new Date(t).toISOString().slice(0, 10)
const lunes = (d) => iso(ms(d) - ((new Date(ms(d)).getUTCDay() + 6) % 7) * 864e5)
const FMT = { cop, pct, n: (v) => Math.round(v).toLocaleString('es-CO') }
const barra = (v) => (Math.abs(v) >= 1e6 ? (v < 0 ? '−' : '+') + '$' + (Math.abs(v) / 1e6).toFixed(1).replace('.', ',') + ' M' : kshort(v))
const ejeFmt = { n: (v) => Math.round(v).toLocaleString('es-CO'), cop: corto, pct: (v) => (Math.round(v * 10) / 10).toLocaleString('es-CO') + ' %' }

function agrupar(dias, modo, campoUltimo) {
  if (modo === 'dia') return dias.map((x) => ({ ...x, n: 1, desde: x.dia, hasta: x.dia }))
  const m = new Map()
  for (const x of dias) {
    const k = modo === 'semana' ? lunes(x.dia) : x.dia.slice(0, 7) + '-01'
    let b = m.get(k); if (!b) { b = { dia: k, n: 0, desde: x.dia, hasta: x.dia }; m.set(k, b) }
    for (const [f, v] of Object.entries(x)) if (typeof v === 'number') b[f] = (b[f] || 0) + v
    if (campoUltimo) b[campoUltimo] = x[campoUltimo]
    b.hasta = x.dia; b.n++
  }
  return [...m.values()]
}
const valorDe = (m, b) => (m.tipo === 'neto' ? b.entro - b.gasto : m.tipo === 'cpm' ? (b.impresiones > 0 ? (b.gasto / b.impresiones) * 1000 : null) : m.tipo === 'ctr' ? (b.impresiones > 0 ? (b.clics / b.impresiones) * 100 : null) : b[m.campo])
const nombreP = (b, modo) => (modo === 'dia' ? dd(b.dia) : modo === 'semana' ? `Semana del ${dd(b.desde)} al ${dd(b.hasta)}` : `${MES[Number(b.dia.slice(5, 7)) - 1]} ${b.dia.slice(0, 4)}`)
const etiquetaX = (b, modo) => (modo === 'dia' ? dd(b.dia) : modo === 'semana' ? dd(b.dia) : MES[Number(b.dia.slice(5, 7)) - 1] + " '" + b.dia.slice(2, 4))

function escala(min, max) {
  const lo = Math.min(0, min), hi = Math.max(0, max), raw = (hi - lo || 1) / 4, p = 10 ** Math.floor(Math.log10(raw)), f = raw / p
  const paso = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p, a = Math.floor(lo / paso) * paso, b = Math.ceil(hi / paso) * paso, ticks = []
  for (let v = a; v <= b + paso / 2; v += paso) ticks.push(Math.round(v * 1e6) / 1e6)
  return { a, b, ticks }
}
const txt = { font: '500 12px var(--sans)', fill: 'var(--muted)' }
const H = 300, T = 30, B = 38, EJE = 62

export default function GraficaDias({ dias: diasProp, vistas, tipo = 'barras', metrica, formato = 'cop', color = 'var(--blue)', titulo, titularPos, titularNeg, subtitulo, termino, ayuda }) {
  const [vista, setVista] = useState(vistas ? vistas[0].clave : null)
  const activa = vistas ? vistas.find((v) => v.clave === vista) || vistas[0] : null
  const dias = activa ? activa.dias : diasProp
  const campoUltimo = metrica.tipo === 'ultimo' ? metrica.campo : null
  const total = dias.length
  const opciones = [7, 14, 30, 90].filter((k) => k < total)
  const [rango, setRango] = useState(total > 14 ? 14 : 0)
  const [modoSel, setModoSel] = useState(null), [hover, setHover] = useState(null), [ancho, setAncho] = useState(720)
  const wrap = useRef(null), scroll = useRef(null)
  const visibles = useMemo(() => (rango && rango < total ? dias.slice(-rango) : dias), [dias, rango, total])
  const modoAuto = visibles.length <= 45 ? 'dia' : visibles.length <= 200 ? 'semana' : 'mes'
  const modo = modoSel || modoAuto
  const pts = useMemo(() => agrupar(visibles, modo, campoUltimo).map((b) => ({ ...b, v: valorDe(metrica, b) })), [visibles, modo, campoUltimo, metrica])
  useLayoutEffect(() => {
    if (!wrap.current) return
    const medir = () => setAncho(Math.max(300, wrap.current.clientWidth - EJE))
    medir(); const ro = new ResizeObserver(medir); ro.observe(wrap.current); return () => ro.disconnect()
  }, [])
  useEffect(() => { if (scroll.current) scroll.current.scrollLeft = scroll.current.scrollWidth }, [pts.length, ancho])

  const n = pts.length, minSlot = tipo === 'barras' ? 44 : 30
  const slot = Math.max(ancho / Math.max(n, 1), minSlot), W = slot * n
  const vals = pts.map((p) => p.v).filter((v) => v != null)
  const esc = escala(vals.length ? Math.min(...vals) : 0, vals.length ? Math.max(...vals) : 1)
  const y = (v) => T + (H - T - B) * (1 - (v - esc.a) / (esc.b - esc.a || 1))
  const f = FMT[formato], conValor = slot >= 46, paso = Math.max(1, Math.ceil(60 / slot))
  const unidad = modo === 'dia' ? 'días' : modo === 'semana' ? 'semanas' : 'meses'

  // Titular: el mensaje de la gráfica según los datos que se ven.
  const suma = (k) => pts.reduce((a, p) => a + (p[k] || 0), 0)
  let titular = titulo, resumen = null
  if (metrica.tipo === 'neto') {
    const buenos = pts.filter((p) => p.v > 0).length, neto = suma('entro') - suma('gasto')
    titular = buenos === n ? `Ganaste plata en todos los ${n} ${unidad}` : buenos === 0 ? `No ganaste plata en ninguno de los ${n} ${unidad}` : `Ganaste plata en ${buenos} de ${n} ${unidad}`
    resumen = <>Entró <b>{cop(suma('entro'))}</b> · gastaste <b>{cop(suma('gasto'))}</b> · {neto >= 0 ? 'te quedó' : 'perdiste'} <b style={{ color: neto >= 0 ? 'var(--jade-ink)' : 'var(--coral-ink)' }}>{cop(Math.abs(neto))}</b></>
  } else if (metrica.tipo === 'cpm' || metrica.tipo === 'ctr') {
    const tot = metrica.tipo === 'cpm' ? (suma('impresiones') > 0 ? (suma('gasto') / suma('impresiones')) * 1000 : null) : (suma('impresiones') > 0 ? (suma('clics') / suma('impresiones')) * 100 : null)
    titular = `${titulo}: ${tot == null ? '—' : f(Math.round(tot * 100) / 100)}`
  } else if (metrica.tipo === 'suma') titular = `${titulo}: ${f(suma(metrica.campo))}`
  else if (metrica.tipo === 'ultimo' && vals.length) { const u = vals[vals.length - 1]; titular = (u >= 0 ? titularPos : titularNeg || titularPos).replace('{v}', cop(Math.abs(u))) }

  const lineas = (b) => {
    if (metrica.tipo === 'neto') return [...(b.ventas != null ? [['Pedidos vendidos', String(b.ventas)]] : []), ['Entró', cop(b.entro)], ['Gastaste', cop(b.gasto)], [b.v >= 0 ? 'Te quedó' : 'Perdiste', cop(Math.abs(b.v))], ...(b.enCamino ? [['En camino', `${b.enCamino} (su ganancia llega después)`]] : [])]
    if (metrica.tipo === 'cpm') return [['Gastaste', cop(b.gasto)], ['Impresiones', Math.round(b.impresiones).toLocaleString('es-CO')], ['CPM', b.v == null ? 'sin impresiones' : cop(b.v)]]
    if (metrica.tipo === 'ctr') return [['Clics', Math.round(b.clics).toLocaleString('es-CO')], ['Impresiones', Math.round(b.impresiones).toLocaleString('es-CO')], ['CTR', b.v == null ? 'sin impresiones' : pct(b.v)]]
    if (metrica.tipo === 'ultimo') return [['Acumulado', cop(b.v)], ...(b.neto != null ? [['Ese período', cop(b.neto)]] : [])]
    if (metrica.tipo === 'suma' && b.entregados != null) return [['Pedidos vendidos', String(b.ventas)], ['Entregados', String(b.entregados)], ['En camino', String(b.enCamino)], ['Devueltos', String(b.devueltos)]]
    return [[titulo, f(b.v)]]
  }
  const x = (i) => slot * i + slot / 2
  const tramos = []; let cur = []
  if (tipo === 'linea') { pts.forEach((p, i) => { if (p.v == null) { if (cur.length) tramos.push(cur); cur = [] } else cur.push([x(i), y(p.v), p, i]) }); if (cur.length) tramos.push(cur) }
  const idx = pts.map((p, i) => (p.v != null ? i : -1)).filter((i) => i >= 0)
  const marcas = new Set(conValor ? idx : idx.length ? [idx[idx.length - 1], idx[vals.indexOf(Math.max(...vals))], idx[vals.indexOf(Math.min(...vals))]] : [])
  const etiqueta = (v) => (metrica.tipo === 'neto' ? barra(v) : formato === 'pct' ? pct(v) : formato === 'n' ? String(Math.round(v)) : corto(v))
  const base = y(Math.max(esc.a, Math.min(0, esc.b)))
  const tip = hover != null && pts[hover] ? pts[hover] : null
  const tipX = tip ? Math.min(Math.max(EJE + x(hover) - (scroll.current ? scroll.current.scrollLeft : 0), 90), EJE + ancho - 90) : 0

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="gr-head"><b className="gr-title">{titular}{termino && <Ayuda t={termino} />}</b>{subtitulo && <span className="gr-sub">{subtitulo}</span>}</div>
      {resumen && <div style={{ fontSize: 14.5, marginTop: 4 }}>{resumen}</div>}
      <div className="gr-bar">
        {vistas && (
          <div className="seg" role="group" aria-label="Contar la ganancia por">
            {vistas.map((v) => <button key={v.clave} type="button" className={activa.clave === v.clave ? 'on' : ''} onClick={() => setVista(v.clave)}>{v.etiqueta}</button>)}
          </div>
        )}
        {(opciones.length > 0) && (
          <div className="seg" role="group" aria-label="Rango">
            {opciones.map((k) => <button key={k} type="button" className={rango === k ? 'on' : ''} onClick={() => { setRango(k); setModoSel(null) }}>{k} días</button>)}
            <button type="button" className={!rango || rango >= total ? 'on' : ''} onClick={() => { setRango(0); setModoSel(null) }}>Todo ({total})</button>
          </div>
        )}
        {visibles.length > 14 && (
          <div className="seg" role="group" aria-label="Agrupar por">
            {[['dia', 'Día'], ['semana', 'Semana'], ['mes', 'Mes']].map(([k, t]) => <button key={k} type="button" className={modo === k ? 'on' : ''} onClick={() => setModoSel(k)}>{t}</button>)}
          </div>
        )}
      </div>
      <div className="gr-wrap" ref={wrap} onMouseLeave={() => setHover(null)}>
        <svg width={EJE} height={H} aria-hidden="true" style={{ flex: 'none' }}>
          {esc.ticks.map((v) => <text key={v} x={EJE - 8} y={y(v) + 4} textAnchor="end" style={txt}>{ejeFmt[formato](v)}</text>)}
        </svg>
        <div className="gr-scroll" ref={scroll} onScroll={() => setHover(null)}>
          <svg width={W} height={H} role="img" aria-label={`${titular}. ${pts.map((p) => `${nombreP(p, modo)}: ${p.v == null ? 'sin dato' : f(p.v)}`).join('; ')}`} style={{ display: 'block' }}>
            {esc.ticks.map((v) => <line key={v} x1={0} x2={W} y1={y(v)} y2={y(v)} stroke={v === 0 ? '#0F172A' : '#E2E8F0'} strokeWidth={v === 0 ? 1.4 : 1} strokeDasharray={v === 0 ? undefined : '3 4'} />)}
            {hover != null && <rect x={slot * hover} y={T - 8} width={slot} height={H - T - B + 8} fill="#EEF3FF" />}
            {tipo === 'barras' && pts.map((p, i) => {
              if (p.v == null) return null
              const bw = Math.min(56, slot * 0.62), y0 = y(0), yv = y(p.v), top = Math.min(y0, yv), h = Math.max(p.v === 0 ? 0 : 2, Math.abs(yv - y0))
              return (
                <g key={p.dia}>
                  <rect x={x(i) - bw / 2} y={top} width={bw} height={h} rx="6" fill={metrica.tipo === 'neto' ? (p.v >= 0 ? 'var(--jade)' : 'var(--coral)') : color} />
                  {(conValor || marcas.has(i)) && p.v !== 0 && <text x={x(i)} y={p.v >= 0 ? top - 7 : top + h + 15} textAnchor="middle" style={{ font: '700 13px var(--sans)', fill: metrica.tipo === 'neto' ? (p.v >= 0 ? 'var(--jade-ink)' : 'var(--coral-ink)') : 'var(--ink)' }}>{etiqueta(p.v)}</text>}
                </g>
              )
            })}
            {tipo === 'linea' && tramos.map((t, k) => (
              <g key={k}>
                {t.length > 1 && <path d={`M${t[0][0]},${base} ${t.map((q) => `L${q[0]},${q[1]}`).join(' ')} L${t[t.length - 1][0]},${base} Z`} fill={color} opacity="0.1" />}
                {t.length > 1 && <polyline points={t.map((q) => `${q[0]},${q[1]}`).join(' ')} fill="none" stroke={color} strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />}
                {t.map(([px, py, p, i]) => (
                  <g key={p.dia}>
                    <circle cx={px} cy={py} r={hover === i ? 6 : marcas.has(i) ? 4.5 : 3} fill="#fff" stroke={color} strokeWidth="2.4" />
                    {marcas.has(i) && <text x={px} y={py - 11} textAnchor={i === n - 1 && n > 5 ? 'end' : 'middle'} style={{ font: '700 12.5px var(--sans)', fill: 'var(--ink)' }}>{etiqueta(p.v)}</text>}
                  </g>
                ))}
              </g>
            ))}
            {pts.map((p, i) => i % paso === 0 || i === n - 1 ? <text key={'x' + p.dia} x={x(i)} y={H - 14} textAnchor="middle" style={txt}>{etiquetaX(p, modo)}</text> : null)}
            {pts.map((p, i) => <rect key={'h' + p.dia} x={slot * i} y={0} width={slot} height={H} fill="transparent" onMouseEnter={() => setHover(i)} onMouseMove={() => setHover(i)} onClick={() => setHover(hover === i ? null : i)} />)}
          </svg>
        </div>
        {tip && (
          <div className="gr-tip" style={{ left: tipX, top: 8, transform: 'translateX(-50%)' }} role="status">
            <b>{nombreP(tip, modo)}</b>
            {lineas(tip).map(([k, v]) => <div key={k}><i>{k}</i> {v}</div>)}
          </div>
        )}
      </div>
      {activa && activa.nota && <p className="gr-note">{activa.nota}</p>}
      {ayuda && <p className="gr-note only-learner"><b>Cómo leer esta gráfica:</b> {ayuda}</p>}
      <p className="gr-note only-pro" style={{ marginTop: 6 }}>{n} {unidad} · pasa el cursor por un punto para ver el detalle.</p>
    </div>
  )
}
