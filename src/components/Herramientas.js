'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Icono } from '@/components/shell/Icono'
import { cop } from '@/lib/formato'

// Herramientas de operación: lo que pagas cada mes (WhatsApp, IA…). Se reparte por día en la contabilidad. Mismo diseño de la app original.
async function api(method, url, body) {
  const res = await fetch(url, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'No se pudo guardar.')
  return data
}
const aNumero = (s) => Number(String(s).replace(/\D/g, '')) || 0

function Fila({ h, onCambio }) {
  const [valor, setValor] = useState(h.mensual)
  const guardar = async () => { if (valor !== h.mensual) await onCambio(h.id, { mensual: valor }) }
  return (
    <div className={'tool' + (h.activa ? '' : ' off')}>
      <button className={'sw' + (h.activa ? ' on' : '')} role="switch" aria-checked={h.activa} aria-label={`Activar ${h.nombre}`} onClick={() => onCambio(h.id, { activa: !h.activa })} />
      <div><div className="nm">{h.nombre}</div><div className="muted" style={{ fontSize: 13 }}>{cop(valor / 30)}/día</div></div>
      <div className="inp" style={{ padding: '0 10px' }}>
        <span className="pre">$</span>
        <input type="text" inputMode="numeric" autoComplete="off" aria-label={`Valor mensual de ${h.nombre}`} value={Number(valor).toLocaleString('es-CO')} onChange={(e) => setValor(aNumero(e.target.value))} onBlur={guardar} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} style={{ fontSize: 15, padding: '8px 0', textAlign: 'right' }} />
        <span className="muted" style={{ fontSize: 13 }}>/mes</span>
      </div>
      <button className="iconbtn" aria-label={`Eliminar ${h.nombre}`} title="Eliminar" onClick={() => onCambio(h.id, null)}><Icono n="trash" size={16} /></button>
    </div>
  )
}

export default function Herramientas({ lista }) {
  const router = useRouter()
  const [nombre, setNombre] = useState('')
  const [mensual, setMensual] = useState(0)
  const [error, setError] = useState('')
  const total = lista.filter((h) => h.activa).reduce((a, h) => a + h.mensual, 0)

  async function cambio(id, cambios) {
    setError('')
    try {
      if (cambios === null) { if (!window.confirm('¿Eliminar esta herramienta?')) return; await api('DELETE', `/api/herramientas/${id}`) }
      else await api('PATCH', `/api/herramientas/${id}`, cambios)
      router.refresh()
    } catch (e) { setError(e.message) }
  }
  async function agregar(e) {
    e.preventDefault(); setError('')
    try { await api('POST', '/api/herramientas', { nombre, mensual }); setNombre(''); setMensual(0); router.refresh() }
    catch (ex) { setError(ex.message) }
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <div className="card" style={{ marginBottom: 16, display: 'flex', gap: '8px 28px', flexWrap: 'wrap' }}>
        <div><div className="kpi-l">Por mes (activas)</div><div className="kpi-v">{cop(total)}</div></div>
        <div><div className="kpi-l">Por día</div><div className="kpi-v">{cop(total / 30)}</div></div>
        <p className="muted only-learner" style={{ flex: 1, minWidth: 240, margin: 0, alignSelf: 'center', fontSize: 14 }}>Estos costos fijos se descuentan de tu ganancia en Contabilidad, repartidos por día (mensual ÷ 30). Si ya pagas una herramienta con una transferencia desde tu billetera de Dropi (como ChatePro), ese pago ya cuenta: no la agregues aquí o se contaría dos veces.</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {lista.length === 0 && <p className="empty-note">Aún no agregas herramientas. Agrega la primera abajo.</p>}
        {lista.map((h) => <Fila key={h.id + h.mensual} h={h} onCambio={cambio} />)}
      </div>
      <form onSubmit={agregar} className="card" style={{ marginTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="field" style={{ flex: 1, minWidth: 200 }}><label htmlFor="h-nombre">Nombre de la herramienta</label><div className="inp"><input id="h-nombre" type="text" maxLength={80} placeholder="Ej: ChatePro" value={nombre} onChange={(e) => setNombre(e.target.value)} style={{ fontSize: 16 }} /></div></div>
        <div className="field" style={{ width: 200 }}><label htmlFor="h-valor">Valor mensual</label><div className="inp"><span className="pre">$</span><input id="h-valor" type="text" inputMode="numeric" autoComplete="off" value={mensual ? Number(mensual).toLocaleString('es-CO') : ''} onChange={(e) => setMensual(aNumero(e.target.value))} placeholder="0" /></div></div>
        <button className="btn" type="submit" disabled={!nombre.trim()}><Icono n="plus" size={16} />Agregar herramienta</button>
        {error && <span className="errm" role="alert" style={{ width: '100%' }}>{error}</span>}
      </form>
    </div>
  )
}
