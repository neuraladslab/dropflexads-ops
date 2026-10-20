'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { diaCorto } from '@/lib/formato'

// Elige qué periodo mira la pantalla: corte actual, anterior, otro corte, todo el tiempo o un rango libre. La elección viaja en la URL (?p=…), así se puede compartir o volver a ella.
const rango = (c) => `${diaCorto(c.desde)} → ${diaCorto(c.hasta)} ${c.hasta.slice(0, 4)}`
export default function SelectorPeriodo({ cortes, param, tipo, desde, hasta, hoy, inicio, ruta = '' }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(tipo === 'rango')
  const [d1, setD1] = useState(desde), [d2, setD2] = useState(hasta)
  const ir = (p) => router.push(`${ruta}?p=${encodeURIComponent(p)}`, { scroll: false })
  const hay = cortes.length > 1
  const activo = (x) => (param === x ? ' on' : '')
  const valido = d1 && d2 && d1 <= d2 && d1 >= inicio && d2 <= hoy
  return (
    <div className="no-print" style={{ marginBottom: 16 }}>
      <div className="md-pills" role="group" aria-label="Periodo" style={{ margin: 0, alignItems: 'center' }}>
        <button type="button" className={'md-pill' + activo('actual')} aria-pressed={param === 'actual'} onClick={() => ir('actual')}>Corte actual</button>
        {hay && <button type="button" className={'md-pill' + activo('anterior')} aria-pressed={param === 'anterior'} onClick={() => ir('anterior')}>Corte anterior</button>}
        <button type="button" className={'md-pill' + activo('todo')} aria-pressed={param === 'todo'} onClick={() => ir('todo')}>Todo el tiempo</button>
        <button type="button" className={'md-pill' + (tipo === 'rango' ? ' on' : '')} aria-expanded={abierto} onClick={() => setAbierto((v) => !v)}>Rango libre</button>
        {hay && (
          <select className="sel" aria-label="Elegir un corte" value={tipo === 'corte' && !['actual', 'anterior'].includes(param) ? param : ''} onChange={(e) => e.target.value && ir(e.target.value)} style={{ width: 'auto' }}>
            <option value="">Otro corte…</option>
            {cortes.map((c) => <option key={c.id} value={c.id}>{rango(c)}{c.abierto ? ' (abierto)' : ''}</option>)}
          </select>
        )}
      </div>
      {abierto && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
          <div className="inp" style={{ padding: '0 10px' }}><input type="date" value={d1} min={inicio} max={d2 || hoy} onChange={(e) => setD1(e.target.value)} aria-label="Desde" style={{ fontSize: 14, padding: '8px 0' }} /></div>
          <span className="muted">a</span>
          <div className="inp" style={{ padding: '0 10px' }}><input type="date" value={d2} min={d1 || inicio} max={hoy} onChange={(e) => setD2(e.target.value)} aria-label="Hasta" style={{ fontSize: 14, padding: '8px 0' }} /></div>
          <button type="button" className="btn sm" disabled={!valido} onClick={() => ir(`${d1}_${d2}`)}>Ver ese rango</button>
        </div>
      )}
    </div>
  )
}
