'use client'

import { useMemo, useState } from 'react'
import { GLOSARIO, LECCIONES } from '@/lib/glosario'

// Sección Aprender: lecciones cortas y el glosario con buscador. Todo viene de src/lib/glosario.js (el mismo texto de los «?» de cada pantalla).
const sin = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
export default function Aprender() {
  const [q, setQ] = useState('')
  const terminos = useMemo(() => Object.entries(GLOSARIO).filter(([, g]) => !q || sin(`${g.titulo} ${g.corto} ${g.largo || ''}`).includes(sin(q))), [q])
  return (
    <>
      <div className="sec-head" style={{ marginTop: 0 }}><h2>Lecciones de 1 minuto</h2></div>
      <div style={{ display: 'grid', gap: 12, marginBottom: 28 }}>
        {LECCIONES.map((l) => (
          <details key={l.id} className="card aprender-t" id={l.id} style={{ padding: '16px 20px' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 16.5 }}>{l.titulo}</summary>
            <ol style={{ margin: '12px 0 0', paddingLeft: 20, display: 'grid', gap: 8, fontSize: 15 }}>{l.pasos.map((p) => <li key={p}>{p}</li>)}</ol>
          </details>
        ))}
      </div>
      <div className="sec-head" style={{ margin: '0 0 12px' }}><h2>Glosario</h2></div>
      <div className="inp" style={{ maxWidth: 460, marginBottom: 14 }}><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar un término (CPM, devolución, recuperar…)" aria-label="Buscar en el glosario" style={{ border: 0, outline: 0, flex: 1, padding: '11px 0', font: 'inherit', background: 'transparent' }} /></div>
      <div style={{ display: 'grid', gap: 12 }}>
        {terminos.map(([k, g]) => (
          <div key={k} id={k} className="card aprender-t" style={{ padding: '16px 20px' }}>
            <b style={{ fontSize: 16.5 }}>{g.titulo}</b>
            <p style={{ margin: '6px 0 0', fontSize: 15 }}>{g.corto}</p>
            {g.largo && <p className="muted only-learner" style={{ margin: '6px 0 0', fontSize: 14 }}>{g.largo}</p>}
            {g.formula && <p style={{ margin: '8px 0 0', fontSize: 13.5 }}><span className="chip idle">Cómo se calcula</span> {g.formula}</p>}
          </div>
        ))}
        {!terminos.length && <p className="empty-note">No encontré ese término. Prueba con otra palabra.</p>}
      </div>
    </>
  )
}
