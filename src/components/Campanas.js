'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Icono } from '@/components/shell/Icono'
import { fmtN } from '@/lib/formato'
import ResultadoCampana from '@/components/ResultadoCampana'
import Ayuda from '@/components/Ayuda'

// Campañas: cada una agrupa productos de Dropi. Los pedidos se atribuyen por producto; la ganancia y las devoluciones son lo real de tu billetera.
async function api(method, url, body) {
  const res = await fetch(url, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(data.error || 'No se pudo guardar.'), { code: data.code })
  return data
}

// Un producto sin ventas todavía no sale de los pedidos: se trae de Dropi por su ID (el número al final de la dirección del producto en Dropi).
function AgregarPorId({ onAgregado }) {
  const [id, setId] = useState('')
  const [otp, setOtp] = useState('')
  const [pideOtp, setPideOtp] = useState(false)
  const [error, setError] = useState('')
  const [buscando, setBuscando] = useState(false)
  async function agregar() {
    setError(''); setBuscando(true)
    try {
      const p = await api('POST', '/api/dropi/productos', { id: id.trim(), ...(otp ? { otp } : {}) })
      setId(''); setOtp(''); setPideOtp(false)
      onAgregado(p)
    } catch (ex) {
      setPideOtp(ex.code === 'need_otp' || ex.code === 'otp_rejected'); setError(ex.message)
    }
    setBuscando(false)
  }
  const enter = (e) => { if (e.key === 'Enter') { e.preventDefault(); if (id.trim() && !buscando) agregar() } }
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="inp" style={{ flex: 1, minWidth: 180 }}><input type="text" inputMode="numeric" placeholder="¿Aún sin ventas? Agrega por ID de Dropi" aria-label="ID del producto en Dropi" value={id} onChange={(e) => setId(e.target.value.replace(/\D/g, '').slice(0, 12))} onKeyDown={enter} style={{ fontSize: 16 }} /></div>
        {pideOtp && <div className="inp" style={{ width: 130 }}><input type="text" inputMode="numeric" placeholder="Código Dropi" aria-label="Código del autenticador de Dropi" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 8))} onKeyDown={enter} style={{ fontSize: 16 }} /></div>}
        <button className="btn ghost" type="button" disabled={buscando || !id.trim()} onClick={agregar}>{buscando ? 'Buscando…' : 'Agregar'}</button>
      </div>
      {error && <span className="errm" role="alert" style={{ display: 'block', marginTop: 6 }}>{error}</span>}
    </div>
  )
}

function SelectorProductos({ productos, valor, onChange, propia, onAgregado }) {
  const alternar = (id) => onChange(valor.includes(id) ? valor.filter((x) => x !== id) : [...valor, id])
  const agregar = <AgregarPorId onAgregado={(p) => { if (!valor.includes(p.id)) onChange([...valor, p.id]); onAgregado() }} />
  if (!productos.length) return <><p className="empty-note">Aún no hay productos: salen de tus pedidos de Dropi. Sincroniza en Mis cuentas y vuelve, o agrégalo por su ID.</p>{agregar}</>
  return (
    <>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflow: 'auto', border: '1px solid var(--line2)', borderRadius: 12, padding: 8 }} role="group" aria-label="Productos">
      {productos.map((p) => {
        const ocupado = p.campana && p.campana !== propia // ya lo tiene otra campaña (la más antigua se lo queda)
        return (
          <label key={p.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 10px', borderRadius: 8, cursor: 'pointer', background: valor.includes(p.id) ? 'var(--blue-soft)' : undefined }}>
            <input type="checkbox" className="pay-ck" checked={valor.includes(p.id)} onChange={() => alternar(p.id)} />
            <span style={{ flex: 1, minWidth: 0 }}><b>{p.nombre}</b> <span className="muted" style={{ fontSize: 13 }}>· {fmtN(p.pedidos)} {p.pedidos === 1 ? 'pedido' : 'pedidos'}</span></span>
            {ocupado && <span className="chip warn" title="Los pedidos de este producto se quedan con la campaña más antigua">ya está en «{p.campana}»</span>}
          </label>
        )
      })}
    </div>
    {agregar}
    </>
  )
}

function FormularioCampana({ productos, onAgregado, inicial, onGuardar, onCancelar, etiqueta }) {
  const [nombre, setNombre] = useState(inicial ? inicial.nombre : '')
  const [ids, setIds] = useState(inicial ? inicial.productIds : [])
  const [dev, setDev] = useState(inicial && inicial.devolucionPct != null ? String(inicial.devolucionPct) : '15')
  const devOk = dev !== '' && Number(dev) >= 0 && Number(dev) <= 100
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  async function enviar(e) {
    e.preventDefault(); setError(''); setEnviando(true)
    try { await onGuardar({ nombre, productIds: ids, devolucionPct: Number(dev) }) } catch (ex) { setError(ex.message); setEnviando(false) }
  }
  return (
    <form onSubmit={enviar} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="field"><label htmlFor="c-nombre">Nombre de la campaña</label><div className="inp"><input id="c-nombre" type="text" maxLength={120} placeholder="Ej: Gafas Jaguar" value={nombre} onChange={(e) => setNombre(e.target.value)} style={{ fontSize: 16 }} /></div></div>
      <div className="field"><label>Productos de esta campaña</label>
        <SelectorProductos productos={productos} valor={ids} onChange={setIds} propia={inicial && inicial.nombre} onAgregado={onAgregado} />
      </div>
      <div className="field" style={{ maxWidth: 260 }}>
        <label htmlFor="c-dev">Devolución esperada (%)<Ayuda t="devolucion_esperada" /></label>
        <div className="inp"><input id="c-dev" type="number" min={0} max={100} step="0.5" inputMode="decimal" value={dev} onChange={(e) => setDev(e.target.value)} style={{ fontSize: 16 }} /><span className="muted" style={{ fontSize: 13 }}>%</span></div>
      </div>
      {error && <span className="errm" role="alert">{error}</span>}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn" type="submit" disabled={enviando || !nombre.trim() || !ids.length || !devOk}>{etiqueta}</button>
        <button className="btn ghost" type="button" onClick={onCancelar}>Cancelar</button>
      </div>
    </form>
  )
}


function Tarjeta({ c, productos, onCambio }) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  return (
    <div className="card" style={c.activa ? undefined : { opacity: 0.7 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 19, flex: 1, minWidth: 180 }}><Link href={`/campanas/${c.id}`} style={{ color: 'inherit' }}>{c.nombre}</Link></h2>
        <span className={'chip ' + (c.activa ? 'ok' : 'idle')}>{c.activa ? 'Activa' : 'Pausada'}</span>
        <Link href={`/campanas/${c.id}`} className="btn sm">Abrir</Link>
        <button className="btn ghost sm" onClick={() => onCambio(c.id, { activa: !c.activa })}>{c.activa ? 'Pausar' : 'Activar'}</button>
        <button className="btn ghost sm" aria-expanded={editando} onClick={() => setEditando((v) => !v)}>Editar</button>
        <button className="iconbtn" style={{ width: 36, height: 36, borderRadius: 9 }} aria-label={`Eliminar ${c.nombre}`} title="Eliminar" onClick={() => onCambio(c.id, null)}><Icono n="trash" size={16} /></button>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>{c.productos.map((p) => <span key={p.id} className="chip idle">{p.nombre}</span>)}<span className="chip blue" title="Devolución que esperas de esta campaña: se usa para estimar la ganancia de los pedidos en curso">Devolución esperada {c.devolucionPct} %</span></div>
      {editando
        ? <div style={{ marginTop: 14 }}><FormularioCampana productos={productos} onAgregado={() => router.refresh()} inicial={{ nombre: c.nombre, productIds: c.productIds, devolucionPct: c.devolucionPct }} etiqueta="Guardar cambios" onCancelar={() => setEditando(false)} onGuardar={async (v) => { await onCambio(c.id, v); setEditando(false) }} /></div>
        : <ResultadoCampana r={c.r} gasto={c.gasto} />}
    </div>
  )
}

export default function Campanas({ d }) {
  const router = useRouter()
  const [nueva, setNueva] = useState(false)
  const [error, setError] = useState('')

  async function cambio(id, cambios) {
    setError('')
    try {
      if (cambios === null) { if (!window.confirm('¿Eliminar esta campaña? Los pedidos no se borran: solo dejan de estar agrupados.')) return; await api('DELETE', `/api/campanas/${id}`) }
      else await api('PATCH', `/api/campanas/${id}`, cambios)
      router.refresh()
    } catch (e) { setError(e.message); throw e }
  }
  const sin = d.sinCampana
  const productosLibres = d.productos.filter((p) => !p.campana)

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <p className="muted only-learner" style={{ margin: 0, fontSize: 14, flex: 1, minWidth: 260 }}>Una campaña agrupa los productos que anuncias juntos. Cada pedido se atribuye a su campaña por el producto, y la ganancia es la real de tu billetera de Dropi.</p>
        <Link href="/campanas/todos" className="btn ghost">Todos los pedidos</Link>
        <button className="btn" onClick={() => setNueva((v) => !v)} aria-expanded={nueva}><Icono n="plus" size={16} />Nueva campaña</button>
      </div>
      {error && <div className="tint bad" role="alert" style={{ marginBottom: 12 }}><b style={{ color: 'var(--coral-ink)' }}>{error}</b></div>}
      {nueva && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 19, marginBottom: 12 }}>Nueva campaña</h2>
          <FormularioCampana productos={d.productos} onAgregado={() => router.refresh()} etiqueta="Crear campaña" onCancelar={() => setNueva(false)} onGuardar={async (v) => { await api('POST', '/api/campanas', v); setNueva(false); router.refresh() }} />
        </div>
      )}
      {!d.hayPedidos && <div className="tint blue" style={{ marginBottom: 16 }}><b style={{ color: 'var(--blue)' }}>Aún no hay pedidos de Dropi</b><div style={{ fontSize: 14.5, marginTop: 2 }}>Los productos y los resultados salen de tus pedidos. Sincroniza en Mis cuentas → Dropi.</div></div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {d.campanas.map((c) => <Tarjeta key={c.id + c.nombre + c.productIds.join()} c={c} productos={d.productos} onCambio={cambio} />)}
        {d.campanas.length === 0 && d.hayPedidos && !nueva && <p className="empty-note">Aún no tienes campañas. Crea la primera con «Nueva campaña».</p>}
        {sin && (
          <div className="card" style={{ background: 'var(--panel)' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><h2 style={{ fontSize: 19, flex: 1 }}>Sin campaña</h2><span className="chip idle">Pedidos de productos sin campaña</span><Link href="/campanas/sin" className="btn ghost sm">Ver pedidos</Link></div>
            <ResultadoCampana r={sin} />
            {productosLibres.length > 0 && <p className="muted" style={{ fontSize: 13.5, margin: '12px 0 0' }}>Productos sin campaña: {productosLibres.map((p) => `${p.nombre} (${fmtN(p.pedidos)})`).join(' · ')}</p>}
          </div>
        )}
      </div>
    </>
  )
}
