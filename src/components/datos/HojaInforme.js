'use client'

import { useState } from 'react'

// La hoja del informe de un corte, con el mismo diseño del «informe para reclamos ante Dropi»: una barra de controles (que no se imprime) y una hoja de documento con secciones numeradas.
// Las secciones se pueden incluir u omitir antes de imprimir o guardar en PDF; el titular y las observaciones se escriben en la hoja.
export default function HojaInforme({ titulo, subtitulo, filasId, intro, puntos, secciones, texto, titularInicial, pie, acciones }) {
  const [incluir, setIncluir] = useState(() => Object.fromEntries(secciones.map((s) => [s.id, true])))
  const [titular, setTitular] = useState(titularInicial)
  const [notas, setNotas] = useState('')
  const [copiado, setCopiado] = useState(false)
  const activas = secciones.filter((s) => incluir[s.id])

  async function copiar() {
    try { await navigator.clipboard.writeText(texto + (notas.trim() ? `\n\nObservaciones: ${notas.trim()}` : '')); setCopiado(true); setTimeout(() => setCopiado(false), 2000) } catch { /* sin portapapeles: no pasa nada */ }
  }

  return (
    <>
      <div className="rp-bar no-print" style={{ borderRadius: 12, marginBottom: 8 }}>
        <div style={{ flex: '1 1 100%', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <b style={{ fontSize: 17 }}>Informe de cierre del corte</b><span style={{ flex: 1 }} />
          <button className="btn soft" type="button" onClick={copiar}>{copiado ? 'Copiado ✓' : 'Copiar texto'}</button>
        </div>
        <div style={{ flex: '1 1 100%' }}>{acciones}</div>
        <div className="field" style={{ minWidth: 240, flex: '1 1 240px' }}>
          <label htmlFor="rp-titular" style={{ fontSize: 12.5 }}>Titular(es) del informe</label>
          <div className="inp"><input id="rp-titular" type="text" maxLength={120} value={titular} onChange={(e) => setTitular(e.target.value)} placeholder="Nombres de las socias" /></div>
        </div>
        <div style={{ flex: '1 1 100%' }}>
          <div className="muted" style={{ fontSize: 12.5, marginBottom: 4 }}>Qué incluir en el informe</div>
          {secciones.map((s) => (
            <label key={s.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13.5, margin: '2px 12px 2px 0' }}>
              <input type="checkbox" checked={incluir[s.id]} onChange={(e) => setIncluir((v) => ({ ...v, [s.id]: e.target.checked }))} />{s.titulo}
            </label>
          ))}
        </div>
        <div className="field" style={{ flex: '1 1 100%' }}>
          <label htmlFor="rp-notas" style={{ fontSize: 12.5 }}>Observaciones (opcional)</label>
          <div className="inp"><textarea id="rp-notas" rows={2} maxLength={1200} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ej: el retiro del corte se hizo el 14 de noviembre" style={{ width: '100%', border: 0, outline: 0, background: 'transparent', font: 'inherit', resize: 'vertical' }} /></div>
        </div>
      </div>

      <div className="rp-paper" id="rp-paper">
        <h1>{titulo}</h1>
        <div className="sub">{subtitulo}</div>
        <table style={{ margin: '12px 0' }}><tbody>
          <tr><th style={{ width: '30%' }}>Titular(es)</th><td>{titular || ' '}</td></tr>
          {filasId.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}
        </tbody></table>

        <h2>Resumen</h2>
        {intro}
        {puntos.length > 0 && <ol>{puntos.map((x) => <li key={x}>{x}</li>)}</ol>}
        {notas.trim() && <p style={{ whiteSpace: 'pre-wrap' }}><b>Observaciones:</b> {notas.trim()}</p>}

        {activas.map((s, i) => <section key={s.id}><h2>{i + 1}. {s.titulo}</h2>{s.nodo}</section>)}

        <p style={{ marginTop: 26, fontSize: 11.5, color: '#64748b', borderTop: '1px solid #cbd5e1', paddingTop: 8 }}>{pie}</p>
      </div>
    </>
  )
}
