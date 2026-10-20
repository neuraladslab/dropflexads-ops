'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

// Acciones de un corte: imprimir o guardar en PDF, bajar los CSV y sellar. Lo que está aquí no sale en el PDF (no-print).
export default function AccionesCorte({ id, abierto, sellado, puedeSellar }) {
  const router = useRouter()
  const [abrirForm, setAbrirForm] = useState(false)
  const [nota, setNota] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function sellar(e) {
    e.preventDefault(); setError(''); setEnviando(true)
    try {
      const res = await fetch(`/api/cortes/${id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nota }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'No se pudo sellar.')
      setAbrirForm(false); setNota(''); router.refresh()
    } catch (ex) { setError(ex.message) } finally { setEnviando(false) }
  }

  return (
    <div className="no-print" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <Link href="/contabilidad" className="btn ghost">← Todos los cortes</Link>
        <button className="btn" type="button" onClick={() => window.print()}>Imprimir o guardar en PDF</button>
        <a className="btn ghost" href={`/api/cortes/${id}/csv?tabla=movimientos`}>CSV de movimientos</a>
        <a className="btn ghost" href={`/api/cortes/${id}/csv?tabla=pedidos`}>CSV de pedidos</a>
        {!abierto && puedeSellar && <button className="btn ghost" type="button" aria-expanded={abrirForm} onClick={() => setAbrirForm((v) => !v)}>{sellado ? 'Sellar de nuevo' : 'Sellar este corte'}</button>}
      </div>
      {abrirForm && (
        <form onSubmit={sellar} className="card" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="field" style={{ flex: 1, minWidth: 240 }}>
            <label htmlFor="s-nota">Nota (opcional)</label>
            <div className="inp"><input id="s-nota" type="text" maxLength={300} placeholder="Ej: repartido el 14 de octubre" value={nota} onChange={(e) => setNota(e.target.value)} /></div>
          </div>
          <button className="btn" type="submit" disabled={enviando}>{enviando ? 'Sellando…' : 'Confirmar sellado'}</button>
          <p className="muted" style={{ flexBasis: '100%', margin: 0, fontSize: 13.5 }}>Guarda una foto fija de las cifras de hoy. Nunca se modifica ni se borra: si después cambian los datos, verás qué cambió y podrás sellar de nuevo (versión nueva).</p>
        </form>
      )}
      {error && <span className="errm" role="alert">{error}</span>}
    </div>
  )
}
