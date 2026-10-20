'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { cop, fmtN, diaCorto } from '@/lib/formato'
import { diasTotales } from '@/domain/periodos.ts'
import Ayuda from '@/components/Ayuda'

const rango = (c) => `${diaCorto(c.desde)} → ${diaCorto(c.hasta)}`
const TAMANOS = [6, 12, 24]
const signo = (n) => (n < 0 ? '−' : '+') + cop(Math.abs(n))
const Neto = ({ n }) => <b style={{ color: n < 0 ? 'var(--coral-ink)' : 'var(--jade-ink)' }}>{signo(n)}</b>

/** Neto de caja de cada corte (del más viejo al más nuevo). Verde = te quedó plata, rojo = perdiste; el corte abierto va más claro. Barras delgadas y el valor escrito debajo. */
function GraficaCortes({ cortes }) {
  const l = [...cortes].reverse().slice(-12)
  if (l.length < 2) return null
  const max = Math.max(1, ...l.map((c) => Math.abs(c.neto))), n = Math.max(l.length, 6), W = 100 / n // el espacio se reparte para que pocas barras no se vean enormes
  return (
    <div className="card" style={{ marginBottom: 12, padding: '14px 18px' }}>
      <div className="kpi-l">Lo que te quedó en cada corte</div>
      <svg viewBox="0 0 100 44" preserveAspectRatio="none" style={{ width: '100%', height: 120 }} role="img" aria-label={'Neto por corte: ' + l.map((c) => `${rango(c)} ${signo(c.neto)}`).join('; ')}>
        <line x1="0" x2="100" y1="22" y2="22" stroke="var(--line2)" strokeWidth="0.3" vectorEffect="non-scaling-stroke" />
        {l.map((c, i) => {
          const h = (Math.abs(c.neto) / max) * 20, x = i * W + (W - 2.4) / 2
          return <rect key={c.id} x={x} width={2.4} y={c.neto >= 0 ? 22 - h : 22} height={Math.max(h, 0.4)} rx="0.5" fill={c.neto >= 0 ? 'var(--jade)' : 'var(--coral)'} opacity={c.abierto ? 0.55 : 1}><title>{`${rango(c)}: ${signo(c.neto)}${c.abierto ? ' (abierto)' : ''}`}</title></rect>
        })}
      </svg>
      <div style={{ display: 'flex' }}>{l.map((c) => <span key={c.id} style={{ width: `${100 / n}%`, textAlign: 'center', fontSize: 12, lineHeight: 1.35 }}><span className="muted">{diaCorto(c.hasta)}</span><br /><b style={{ fontFamily: 'var(--mono)', fontSize: 12.5 }}>{signo(c.neto)}</b></span>)}</div>
    </div>
  )
}

/** Lista de cortes con filtros (año, resultado, abierto/cerrado, pendientes, fechas) y paginación. Cada fila lleva al informe del corte. */
export function CortesLista({ cortes }) {
  const [anio, setAnio] = useState('')
  const [res, setRes] = useState('')
  const [sit, setSit] = useState('')
  const [pend, setPend] = useState(false)
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [pagina, setPagina] = useState(1)
  const [tam, setTam] = useState(TAMANOS[0])

  const anios = useMemo(() => [...new Set(cortes.map((c) => c.hasta.slice(0, 4)))].sort().reverse(), [cortes])
  const anterior = useMemo(() => new Map(cortes.map((c, i) => [c.id, cortes[i + 1] || null])), [cortes]) // la lista viene del más nuevo al más viejo
  const filtrados = useMemo(() => cortes.filter((c) => {
    if (anio && c.hasta.slice(0, 4) !== anio) return false
    if (res && c.veredicto !== res) return false
    if (sit === 'abierto' && !c.abierto) return false
    if (sit === 'cerrado' && c.abierto) return false
    if (sit === 'sellado' && !c.cierre) return false
    if (sit === 'sin_sellar' && (c.cierre || c.abierto)) return false
    if (pend && !c.pedidos.pendientes.n) return false
    if (desde && c.hasta < desde) return false // el corte se cruza con el rango pedido
    if (hasta && c.desde > hasta) return false
    return true
  }), [cortes, anio, res, sit, pend, desde, hasta])

  const paginas = Math.max(1, Math.ceil(filtrados.length / tam))
  const pag = Math.min(pagina, paginas)
  const visibles = filtrados.slice((pag - 1) * tam, pag * tam)
  const hayFiltros = !!(anio || res || sit || pend || desde || hasta)
  const cambiar = (fn) => (v) => { fn(v); setPagina(1) }
  const quitar = () => { setAnio(''); setRes(''); setSit(''); setPend(false); setDesde(''); setHasta(''); setPagina(1) }
  const irA = (p) => setPagina(Math.min(Math.max(1, p), paginas))
  const from = filtrados.length ? (pag - 1) * tam + 1 : 0, to = Math.min(filtrados.length, pag * tam)
  const sumaNeto = filtrados.reduce((a, c) => a + c.neto, 0), sumaGan = filtrados.reduce((a, c) => a + c.total.ganancia, 0), sumaCost = filtrados.reduce((a, c) => a + c.costos, 0)

  return (
    <div>
      <GraficaCortes cortes={filtrados.length ? filtrados : cortes} />
      {cortes.length > 3 && <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
        {anios.length > 1 && <select className="sel" value={anio} onChange={(e) => cambiar(setAnio)(e.target.value)} aria-label="Año" style={{ width: 'auto' }}><option value="">Todos los años</option>{anios.map((a) => <option key={a} value={a}>{a}</option>)}</select>}
        <select className="sel" value={res} onChange={(e) => cambiar(setRes)(e.target.value)} aria-label="Resultado del corte" style={{ width: 'auto' }}>
          <option value="">Todos los resultados</option><option value="gana">Ganando</option><option value="pierde">Perdiendo</option><option value="equilibrio">Equilibrio</option>
        </select>
        <select className="sel" value={sit} onChange={(e) => cambiar(setSit)(e.target.value)} aria-label="Estado del corte" style={{ width: 'auto' }}>
          <option value="">Todos los estados</option><option value="abierto">Abierto</option><option value="cerrado">Cerrados</option><option value="sellado">Sellados</option><option value="sin_sellar">Cerrados sin sellar</option>
        </select>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 14 }}><input type="checkbox" checked={pend} onChange={(e) => cambiar(setPend)(e.target.checked)} />Con pedidos pendientes</label>
        <div className="inp" style={{ padding: '0 10px' }}><input type="date" value={desde} max={hasta || undefined} onChange={(e) => cambiar(setDesde)(e.target.value)} aria-label="Desde" title="Cortes desde" style={{ fontSize: 14, padding: '8px 0' }} /></div>
        <div className="inp" style={{ padding: '0 10px' }}><input type="date" value={hasta} min={desde || undefined} onChange={(e) => cambiar(setHasta)(e.target.value)} aria-label="Hasta" title="Cortes hasta" style={{ fontSize: 14, padding: '8px 0' }} /></div>
        {hayFiltros && <button className="link" onClick={quitar}>Quitar filtros</button>}
      </div>}

      {cortes.length > 3 && <div className="card" style={{ marginBottom: 12, padding: '12px 18px', display: 'flex', gap: '6px 22px', flexWrap: 'wrap', alignItems: 'baseline' }}>
        <span><b>{fmtN(filtrados.length)}</b> <span className="muted">{hayFiltros ? `de ${fmtN(cortes.length)} cortes` : cortes.length === 1 ? 'corte' : 'cortes'}</span></span>
        <span className="muted">Ganancia <b style={{ color: 'var(--jade-ink)' }}>{cop(sumaGan)}</b></span>
        <span className="muted">Gastos <b>{cop(sumaCost)}</b></span>
        <span className="muted">Te quedó <Neto n={sumaNeto} /></span>
      </div>}

      <div className="card tbl-card" style={{ marginBottom: 16 }}><div className="scroll-x"><table className="tbl tbl-cortes" style={{ minWidth: 720 }}>
        <thead><tr>
          <th>Corte<Ayuda t="corte" /></th><th>Entró</th><th>Gastos</th><th>Te quedó</th>
          <th className="only-pro">vs anterior</th><th className="only-pro">Por cobrar (est.)</th><th className="only-pro">Retiros</th><th className="only-pro">Saldo al cerrar</th><th>Informe</th>
        </tr></thead>
        <tbody>
          {visibles.map((c) => {
            const a = anterior.get(c.id), porCobrar = Math.round((c.estimacion.gananciaEsperada - c.estimacion.costoDevoluciones) * 100) / 100
            return (
              <tr key={c.id} className="row">
                <td><b>{rango(c)}</b> <span className="muted" style={{ fontSize: 12.5 }}>{c.hasta.slice(0, 4)}</span>
                  {c.abierto && <span className="chip blue" style={{ marginLeft: 8 }}>Abierto</span>}
                  {c.cierre && <span className="chip ok" style={{ marginLeft: 8 }} title={c.cierre.cambios.length ? 'Cambió desde el sellado' : 'Sin cambios desde el sellado'}>Sellado{c.cierre.cambios.length ? ' · cambió' : ''}</span>}
                  <div className="muted" style={{ fontSize: 12.5 }}>{fmtN(diasTotales(c))} días · {fmtN(c.pedidos.pendientes.n)} pedidos pendientes</div></td>
                <td style={{ color: 'var(--jade-ink)', whiteSpace: 'nowrap' }}>{c.total.ganancia ? '+' + cop(c.total.ganancia) : '—'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{c.costos ? '−' + cop(c.costos) : '—'}</td>
                <td style={{ whiteSpace: 'nowrap' }}><Neto n={c.neto} /></td>
                <td className="only-pro">{a ? signo(c.neto - a.neto) : '—'}</td>
                <td className="only-pro">{c.estimacion.pedidosEstimados ? cop(porCobrar) : '—'}</td>
                <td className="only-pro">{c.flujo.retiros ? cop(c.flujo.retiros) : '—'}</td>
                <td className="only-pro">{c.flujo.saldoCierre != null ? cop(c.flujo.saldoCierre) : '—'}</td>
                <td><Link href={`/contabilidad/cortes/${c.id}`} className="btn sm">Ver informe</Link></td>
              </tr>
            )
          })}
        </tbody>
      </table></div>
        {!visibles.length && <p className="empty-note" style={{ padding: 18, margin: 0 }}>{hayFiltros ? 'Ningún corte coincide con los filtros.' : 'Aún no hay cortes.'}</p>}
      </div>

      {filtrados.length > tam && (
        <div className="pager" role="navigation" aria-label="Paginación" style={{ flexWrap: 'wrap' }}>
          <div className="rowbtns"><button className="btn ghost sm" disabled={pag <= 1} onClick={() => irA(1)} aria-label="Primera página">«</button><button className="btn ghost sm" disabled={pag <= 1} onClick={() => irA(pag - 1)}>Anterior</button></div>
          <span className="muted" style={{ fontSize: 13 }}>{fmtN(from)}–{fmtN(to)} de {fmtN(filtrados.length)} · página {fmtN(pag)} de {fmtN(paginas)}</span>
          <div className="rowbtns">
            <select className="sel" value={tam} onChange={(e) => { setTam(Number(e.target.value)); setPagina(1) }} aria-label="Cortes por página" style={{ width: 'auto' }}>{TAMANOS.map((n) => <option key={n} value={n}>{n} por página</option>)}</select>
            <button className="btn ghost sm" disabled={pag >= paginas} onClick={() => irA(pag + 1)}>Siguiente</button><button className="btn ghost sm" disabled={pag >= paginas} onClick={() => irA(paginas)} aria-label="Última página">»</button>
          </div>
        </div>
      )}
    </div>
  )
}
