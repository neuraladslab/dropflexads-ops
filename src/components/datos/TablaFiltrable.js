'use client'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { cop, fmtN } from '@/lib/formato'

// Tabla con filtros (texto, estados con casillas, fechas), selección de filas con suma y paginación. Todo se resuelve en el navegador sobre las filas recibidas.
// Cada fila trae: id, fecha ('YYYY-MM-DD' o null), valor (con signo: lo que entra +, lo que sale −), estado (clave) y texto (para buscar).
const sinTildes = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const TAMANOS = [25, 50, 100]

/** Suma con signo y desglose: «entra» (positivos) y «sale» (negativos). */
function sumar(filas) {
  let entra = 0, sale = 0
  for (const f of filas) (f.valor >= 0 ? (entra += f.valor) : (sale += f.valor))
  return { n: filas.length, neto: entra + sale, entra, sale, mixto: entra > 0 && sale < 0 }
}
function Suma({ s, etiqueta, neutro }) {
  const color = neutro ? 'var(--ink)' : s.neto < 0 ? 'var(--coral-ink)' : 'var(--jade-ink)'
  return (
    <span><span className="muted">{etiqueta}</span> <b className="num" style={{ color }}>{!neutro && s.neto > 0 ? '+' : ''}{cop(s.neto)}</b>
      {s.mixto && <span className="muted num" style={{ fontSize: 12.5 }}> (entra +{cop(s.entra)} · sale {cop(s.sale)})</span>}</span>
  )
}

function MultiEstado({ estados, cuenta, valor, onChange }) {
  const [abierto, setAbierto] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!abierto) return
    const f = (e) => { if (ref.current && !ref.current.contains(e.target)) setAbierto(false) }
    document.addEventListener('mousedown', f)
    return () => document.removeEventListener('mousedown', f)
  }, [abierto])
  const n = valor.size
  const etiqueta = n === 0 ? 'Estado: todos' : n === 1 ? 'Estado: ' + estados.find((e) => valor.has(e.valor))?.etiqueta : `Estado: ${n} seleccionados`
  const marcar = (v) => { const s = new Set(valor); s.has(v) ? s.delete(v) : s.add(v); onChange(s) }
  return (
    <div className="ms" ref={ref}>
      <button type="button" className="sel ms-btn" aria-haspopup="true" aria-expanded={abierto} onClick={() => setAbierto((v) => !v)}>{etiqueta}</button>
      {abierto && (
        <div className="ms-pop" role="menu" aria-label="Estados (puedes marcar varios)">
          {estados.filter((e) => cuenta[e.valor] || valor.has(e.valor)).map((e) => (
            <button key={e.valor} type="button" className="ms-row" role="menuitemcheckbox" aria-checked={valor.has(e.valor)} onClick={() => marcar(e.valor)}>
              <span className="ms-box" aria-hidden="true">✓</span>{e.etiqueta} <span className="muted" style={{ marginLeft: 'auto', fontWeight: 500 }}>{fmtN(cuenta[e.valor] || 0)}</span>
            </button>
          ))}
          {n > 0 && <button type="button" className="ms-clear" onClick={() => onChange(new Set())}>Quitar selección</button>}
        </div>
      )}
    </div>
  )
}

export default function TablaFiltrable({ filas, columnas, estados, buscar = 'Buscar por descripción, referencia o monto…', unidad = 'movimientos', vacio = 'No hay nada para mostrar.', sinFecha = false, neutro = false, acciones }) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(() => new Set()) // estados marcados
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [pagina, setPagina] = useState(1)
  const [tam, setTam] = useState(25)
  const [marcados, setMarcados] = useState(() => new Set()) // ids marcados con la casilla
  const [abiertas, setAbiertas] = useState(() => new Set()) // filas con el detalle completo abierto (en el celular, tocando el texto)
  const alternarDetalle = (id) => setAbiertas((a) => { const n = new Set(a); n.has(id) ? n.delete(id) : n.add(id); return n })
  const hayDetalle = columnas.some((c) => c.txt || c.m)

  const cuenta = useMemo(() => { const c = {}; for (const f of filas) c[f.estado] = (c[f.estado] || 0) + 1; return c }, [filas])
  const filtradas = useMemo(() => {
    const k = sinTildes(q.trim()).replace(/[$.]/g, '') // «$90.000» y «90000» encuentran lo mismo
    return filas.filter((f) => {
      if (sel.size && !sel.has(f.estado)) return false
      if (desde && (!f.fecha || f.fecha < desde)) return false
      if (hasta && (!f.fecha || f.fecha > hasta)) return false
      if (k && !sinTildes(f.texto).includes(k)) return false
      return true
    })
  }, [filas, q, sel, desde, hasta])

  const paginas = Math.max(1, Math.ceil(filtradas.length / tam))
  const pag = Math.min(pagina, paginas)
  const visibles = filtradas.slice((pag - 1) * tam, pag * tam)
  const hayFiltros = !!(q || sel.size || desde || hasta)
  const sFiltrado = useMemo(() => sumar(filtradas), [filtradas])
  const sMarcado = useMemo(() => sumar(filas.filter((f) => marcados.has(f.id))), [filas, marcados])
  const todasPagina = visibles.length > 0 && visibles.every((f) => marcados.has(f.id))

  const cambiar = (fn) => (v) => { fn(v); setPagina(1) }
  const alternar = (id) => setMarcados((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const alternarPagina = () => setMarcados((s) => { const n = new Set(s); for (const f of visibles) todasPagina ? n.delete(f.id) : n.add(f.id); return n })
  const marcarFiltradas = () => setMarcados((s) => { const n = new Set(s); for (const f of filtradas) n.add(f.id); return n })
  const quitarFiltros = () => { setQ(''); setSel(new Set()); setDesde(''); setHasta(''); setPagina(1) }

  const from = filtradas.length ? (pag - 1) * tam + 1 : 0
  const to = Math.min(filtradas.length, pag * tam)
  const irA = (p) => setPagina(Math.min(Math.max(1, p), paginas))

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
        <div className="inp" style={{ flex: 1, minWidth: 220 }}><input type="search" value={q} onChange={(e) => cambiar(setQ)(e.target.value)} placeholder={buscar} autoComplete="off" aria-label="Buscar" style={{ fontSize: 15 }} /></div>
        {estados && <MultiEstado estados={estados} cuenta={cuenta} valor={sel} onChange={cambiar(setSel)} />}
        {!sinFecha && (
          <>
            <div className="inp" style={{ padding: '0 10px' }}><input type="date" value={desde} max={hasta || undefined} onChange={(e) => cambiar(setDesde)(e.target.value)} aria-label="Desde" title="Desde" style={{ fontSize: 14, padding: '8px 0' }} /></div>
            <div className="inp" style={{ padding: '0 10px' }}><input type="date" value={hasta} min={desde || undefined} onChange={(e) => cambiar(setHasta)(e.target.value)} aria-label="Hasta" title="Hasta" style={{ fontSize: 14, padding: '8px 0' }} /></div>
          </>
        )}
        {hayFiltros && <button className="link" onClick={quitarFiltros}>Quitar filtros</button>}
      </div>

      <div className="card" style={{ marginBottom: 12, padding: '12px 18px', display: 'flex', gap: '6px 22px', flexWrap: 'wrap', alignItems: 'baseline' }}>
        <span><b>{fmtN(filtradas.length)}</b> <span className="muted">{hayFiltros ? `de ${fmtN(filas.length)} ${unidad}` : unidad}</span></span>
        <Suma s={sFiltrado} neutro={neutro} etiqueta={hayFiltros ? 'Suma de lo filtrado' : 'Suma de todo'} />
      </div>

      {marcados.size > 0 && (
        <div className="tint blue" style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 12, padding: '12px 16px' }}>
          <b>{fmtN(marcados.size)} {marcados.size === 1 ? 'señalado' : 'señalados'}</b>
          <Suma s={sMarcado} neutro={neutro} etiqueta="Suma" />
          {filtradas.some((f) => !marcados.has(f.id)) && <button className="link" onClick={marcarFiltradas}>Señalar los {fmtN(filtradas.length)} de este filtro</button>}
          <span style={{ flex: 1 }} />
          {acciones && acciones(marcados)}
          <button className="btn ghost sm" onClick={() => setMarcados(new Set())}>Quitar selección</button>
        </div>
      )}

      <div className="card tbl-card"><div className="scroll-x"><table className="tbl">
        <thead><tr>
          <th style={{ width: 36, minWidth: 0, textAlign: 'center' }}><input type="checkbox" className="pay-ck" checked={todasPagina} onChange={alternarPagina} aria-label="Señalar todos los de esta página" disabled={!visibles.length} /></th>
          {columnas.map((c) => <th key={c.titulo} className={[c.izq || c.txt ? 'st' : '', c.m ? 'm-oculto' : ''].join(' ').trim() || undefined}>{c.titulo}</th>)}
        </tr></thead>
        <tbody>
          {visibles.map((f) => (
            <Fragment key={f.id}>
              <tr className={marcados.has(f.id) ? 'row sel' : undefined} style={marcados.has(f.id) ? { background: 'var(--blue-soft)' } : undefined}>
                <td style={{ minWidth: 0, width: 36, textAlign: 'center' }}><input type="checkbox" className="pay-ck" checked={marcados.has(f.id)} onChange={() => alternar(f.id)} aria-label="Señalar" /></td>
                {columnas.map((c) => <td key={c.titulo} className={[c.txt ? 'txt' : c.izq ? 'st' : '', c.m ? 'm-oculto' : ''].join(' ').trim() || undefined}>{c.txt
                  ? <span className={'clamp' + (abiertas.has(f.id) ? ' abierto' : '')} role="button" tabIndex={0} aria-expanded={abiertas.has(f.id)} onClick={() => alternarDetalle(f.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alternarDetalle(f.id) } }}>{c.celda(f)}</span>
                  : c.celda(f)}</td>)}
              </tr>
              {hayDetalle && abiertas.has(f.id) && (
                <tr className="fila-det"><td colSpan={columnas.length + 1}>
                  <dl>{columnas.filter((c) => c.txt || c.m).map((c) => <div key={c.titulo}><dt>{c.titulo}</dt><dd>{c.celda(f) || '—'}</dd></div>)}</dl>
                </td></tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table></div>
        {!visibles.length && <p className="empty-note" style={{ padding: 18, margin: 0 }}>{hayFiltros ? 'Ninguno coincide con los filtros.' : vacio}</p>}
      </div>

      {filtradas.length > 0 && (
        <div className="pager" role="navigation" aria-label="Paginación" style={{ flexWrap: 'wrap' }}>
          <div className="rowbtns"><button className="btn ghost sm" disabled={pag <= 1} onClick={() => irA(1)} aria-label="Primera página">«</button><button className="btn ghost sm" disabled={pag <= 1} onClick={() => irA(pag - 1)}>Anterior</button></div>
          <span className="muted" style={{ fontSize: 13 }}>{fmtN(from)}–{fmtN(to)} de {fmtN(filtradas.length)} · página {fmtN(pag)} de {fmtN(paginas)}</span>
          <div className="rowbtns">
            <select className="sel" value={tam} onChange={(e) => { setTam(Number(e.target.value)); setPagina(1) }} aria-label="Filas por página" style={{ width: 'auto' }}>{TAMANOS.map((n) => <option key={n} value={n}>{n} por página</option>)}</select>
            <button className="btn ghost sm" disabled={pag >= paginas} onClick={() => irA(pag + 1)}>Siguiente</button><button className="btn ghost sm" disabled={pag >= paginas} onClick={() => irA(paginas)} aria-label="Última página">»</button>
          </div>
        </div>
      )}
    </div>
  )
}
