'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Icono } from '@/components/shell/Icono'
import Ayuda from '@/components/Ayuda'
import { TIPOS, REPARTO_DEFECTO, validarReparto } from '@/domain/reparto.ts'

// Cómo se divide la utilidad de cada corte. Los porcentajes son tuyos: pueden cambiar cuando cambie la operación (más socios, otro ahorro…).
const nuevoId = (lista) => { let n = lista.length + 1; while (lista.some((d) => d.id === 'd' + n)) n++; return 'd' + n }

export default function RepartoConfig({ inicial, propio }) {
  const router = useRouter()
  const [lista, setLista] = useState(inicial)
  const [error, setError] = useState('')
  const [ok, setOk] = useState(false)
  const suma = Math.round(lista.reduce((a, d) => a + (Number(d.pct) || 0), 0) * 100) / 100
  const err = validarReparto(lista.map((d) => ({ ...d, pct: Number(d.pct) })))
  const cambiar = (id, k, v) => { setLista((l) => l.map((d) => (d.id === id ? { ...d, [k]: v } : d))); setOk(false) }

  async function guardar(e) {
    e.preventDefault(); setError(''); setOk(false)
    try {
      const res = await fetch('/api/reparto', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ destinos: lista.map((d) => ({ ...d, pct: Number(d.pct) })) }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar.')
      setOk(true); router.refresh()
    } catch (ex) { setError(ex.message) }
  }

  return (
    <form onSubmit={guardar} style={{ maxWidth: 860, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card">
        <b>Cómo se reparte la utilidad de cada corte<Ayuda t="reparto" /></b>
        <p className="muted" style={{ margin: '6px 0 0', fontSize: 14 }}>Los ingresos de tu billetera (lo que Dropi te paga) cubren primero los gastos reales: publicidad, devoluciones, comisiones y herramientas. Lo que queda es la <b>utilidad</b>, y estos porcentajes la dividen. Lo que no es de los socios se queda en la billetera.</p>
        <div className="only-learner m-oculto" style={{ fontSize: 14, marginTop: 10, display: 'grid', gap: 6 }}>
          <div><b>Piso de liquidez (no es un porcentaje):</b> antes de retirar, la billetera debe poder pagar 7 días de pauta al ritmo real de Meta, lo que Meta ya gastó y aún no cobra, y las devoluciones esperadas.</div>
          <div><b>Reinversión extra en pauta (≈25 %):</b> la parte de la utilidad que vuelve a pauta para crecer. Ya cuenta dentro del piso de 7 días: no se aparta aparte.</div>
          <div><b>Reserva de imprevistos (≈10 %), ahorro (≈10 %) e impuestos (≈5 %):</b> se quedan en la billetera hasta que los muevas a otra cuenta. Si los sacas, cuentan como retiros.</div>
          <div><b>Sobre los impuestos:</b> el 5 % es un marcador. Depende de tu régimen (Simple se calcula sobre ingresos brutos; el ordinario, sobre la utilidad) y de si el IVA de Meta es descontable: pregunta a tu contador.</div>
          <div><b>Socios (el resto, ≈50 %):</b> lo único que se retira. Se divide como acuerden; aquí quedó mitad y mitad.</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {lista.map((d) => (
          <div key={d.id} className="tool rep-fila" style={{ gridTemplateColumns: 'minmax(160px,1fr) 190px 120px auto' }}>
            <div className="inp"><input type="text" maxLength={40} value={d.nombre} onChange={(e) => cambiar(d.id, 'nombre', e.target.value)} aria-label="Nombre del destino" /></div>
            <select className="sel" value={d.tipo} onChange={(e) => cambiar(d.id, 'tipo', e.target.value)} aria-label="Tipo">{Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <div className="inp" style={{ padding: '0 10px' }}><input type="number" min={0} max={100} step="0.5" inputMode="decimal" value={d.pct} onChange={(e) => cambiar(d.id, 'pct', e.target.value)} aria-label={`Porcentaje de ${d.nombre}`} /><span className="muted">%</span></div>
            <button type="button" className="iconbtn" aria-label={`Quitar ${d.nombre}`} title="Quitar" disabled={lista.length <= 1} onClick={() => { setLista((l) => l.filter((x) => x.id !== d.id)); setOk(false) }}><Icono n="trash" size={16} /></button>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className="btn ghost" disabled={lista.length >= 12} onClick={() => { setLista((l) => [...l, { id: nuevoId(l), nombre: 'Nuevo destino', pct: 0, tipo: 'otro' }]); setOk(false) }}><Icono n="plus" size={16} />Agregar destino</button>
        <button type="button" className="btn ghost" onClick={() => { setLista(REPARTO_DEFECTO); setOk(false) }}>Usar el reparto sugerido</button>
        <span style={{ marginLeft: 'auto', fontWeight: 700, color: Math.abs(suma - 100) < 0.01 ? 'var(--jade-ink)' : 'var(--coral-ink)' }}>Suma: {suma} %</span>
      </div>
      <div><button className="btn" type="submit" disabled={!!err}>Guardar reparto</button></div>
      {err && <span className="muted" style={{ fontSize: 13.5 }}>{err}</span>}
      {ok && <span role="status" style={{ color: 'var(--jade-ink)' }}>Listo. Aplica al reparto sugerido de ahora en adelante: los cortes ya sellados conservan el suyo.</span>}
      {error && <span className="errm" role="alert">{error}</span>}
      {!propio && <p className="muted" style={{ fontSize: 13, margin: 0 }}>Hoy se usa el reparto sugerido (no has guardado uno propio).</p>}
    </form>
  )
}
