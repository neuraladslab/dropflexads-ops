'use client'

import { useState } from 'react'
import Link from 'next/link'
import { RespuestaIA } from './RespuestaIA'

/** «Segunda opinión» de la IA sobre el análisis de escalar una campaña. Solo se llama cuando la persona lo pide (cuesta unos centavos). */
export function PanelIA({ campanaId, presupuesto, tieneClave }) {
  const [r, setR] = useState(null), [error, setError] = useState(''), [env, setEnv] = useState(false)
  async function pedir(forzar) {
    setError(''); setEnv(true)
    try {
      const res = await fetch('/api/ia', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tipo: 'escalar', campanaId, presupuesto: presupuesto || 0, forzar }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d.ok) throw new Error(d.error || 'No se pudo consultar la IA.')
      setR(d)
    } catch (e) { setError(e.message) } finally { setEnv(false) }
  }
  if (!tieneClave) return <div className="card"><b>Segunda opinión de la IA</b><p className="muted" style={{ margin: '6px 0 0', fontSize: 14 }}>Agrega tu clave de Anthropic en <Link href="/configuracion/ia" className="link">Configuración → Inteligencia artificial</Link> para que la IA revise este análisis y señale riesgos.</p></div>
  return (
    <div className="no-print">
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <button className="btn" type="button" onClick={() => pedir(false)} disabled={env}>{env ? 'La IA está revisando… (puede tardar 20–40 s)' : r ? 'Preguntar de nuevo' : 'Pedir segunda opinión a la IA'}</button>
        {r && !env && <button className="link" type="button" onClick={() => pedir(true)}>Actualizar con los datos de ahora</button>}
        <span className="muted" style={{ fontSize: 13 }}>Revisa el análisis, no lo reemplaza. Cada cifra que cite se contrasta con el sistema.</span>
      </div>
      {error && <div className="errm" role="alert" style={{ marginBottom: 10 }}>{error}</div>}
      {r && <RespuestaIA r={r} />}
    </div>
  )
}
