'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FIN_DE_MES, periodoDe } from '@/domain/periodos.ts'
import { diaCorto } from '@/lib/formato'
import { sumarDias } from '@/domain/fechas.ts'

// Día en que cierra cada corte del mes. Solo cambia cómo se agrupan los días: no borra ni oculta ningún dato.
export default function CorteMes({ dia, hoy }) {
  const router = useRouter()
  const [valor, setValor] = useState(String(dia))
  const [error, setError] = useState('')
  const [guardado, setGuardado] = useState(false)
  const n = Number(valor), fin = n === FIN_DE_MES, valido = Number.isInteger(n) && ((n >= 1 && n <= 28) || fin)

  // Los próximos cierres según lo elegido: así se ve qué día es el último de cada mes (28, 29, 30 o 31) antes de guardar.
  const proximos = []
  if (valido) { let p = periodoDe(hoy, n, hoy, hoy); for (let i = 0; i < 4; i++) { proximos.push(p.hasta); p = periodoDe(sumarDias(p.hasta, 1), n, hoy, hoy) } }

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
        <select id="c-dia" className="sel" value={valor} onChange={(e) => { setValor(e.target.value); setGuardado(false) }}>
          {Array.from({ length: 28 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
          <option value={FIN_DE_MES}>Último día del mes (28, 29, 30 o 31)</option>
        </select>
      
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 14 }}>
        Cada corte cierra ese día (incluido) y el siguiente empieza al día siguiente. {fin ? 'Con corte el último día del mes, cada periodo va del 1 al último día de ese mes (28, 29, 30 o 31 según el mes).' : <>Con corte el {valido ? n : '…'}, un periodo va del {valido ? n + 1 : '…'} de un mes al {valido ? n : '…'} del siguiente.</>}
        Es solo una forma de agrupar: no se borra ni se oculta ningún dato, y puedes cambiarlo cuando quieras. Lo ves en Contabilidad → Cortes.
      </p>
      {proximos.length > 0 && <p style={{ margin: 0, fontSize: 14 }}><b>Próximos cierres:</b> {proximos.map((f) => diaCorto(f)).join(' · ')}</p>}
      <div><button className="btn" type="submit" disabled={!valido || n === dia}>Guardar</button></div>
      {guardado && <span role="status" style={{ color: 'var(--jade-ink)' }}>Listo: el corte ahora cierra {fin ? 'el último día del mes' : `el día ${n}`}.</span>}
      {error && <span className="errm" role="alert">{error}</span>}
    </form>
  )
}
