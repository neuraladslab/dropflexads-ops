'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Día en que cierra cada corte del mes. Solo cambia cómo se agrupan los días: no borra ni oculta ningún dato.
export default function CorteMes({ dia }) {
  const router = useRouter()
  const [valor, setValor] = useState(String(dia))
  const [error, setError] = useState('')
  const [guardado, setGuardado] = useState(false)
  const n = Number(valor), valido = Number.isInteger(n) && n >= 1 && n <= 28

  async function guardar(e) {
    e.preventDefault(); setError(''); setGuardado(false)
    try {
      const res = await fetch('/api/corte', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dia: n }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar.')
      setGuardado(true); router.refresh()
    } catch (ex) { setError(ex.message) }
  }

  return (
    <form onSubmit={guardar} className="card" style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="field" style={{ width: 220 }}>
        <label htmlFor="c-dia">Día de corte del mes</label>
        <div className="inp"><input id="c-dia" type="number" min={1} max={28} inputMode="numeric" value={valor} onChange={(e) => { setValor(e.target.value); setGuardado(false) }} /></div>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 14 }}>
        Cada corte cierra ese día (incluido) y el siguiente empieza al día siguiente. Con corte el {valido ? n : '…'}, un periodo va del {valido ? n + 1 : '…'} de un mes al {valido ? n : '…'} del siguiente.
        Es solo una forma de agrupar: no se borra ni se oculta ningún dato, y puedes cambiarlo cuando quieras. Lo ves en Contabilidad → Cortes.
      </p>
      <div><button className="btn" type="submit" disabled={!valido || n === dia}>Guardar</button></div>
      {guardado && <span role="status" style={{ color: 'var(--jade-ink)' }}>Listo: el corte ahora cierra el día {n}.</span>}
      {error && <span className="errm" role="alert">{error}</span>}
    </form>
  )
}
