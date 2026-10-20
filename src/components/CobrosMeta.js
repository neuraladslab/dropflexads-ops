'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Dialogo from '@/components/Dialogo'
import { Icono } from '@/components/shell/Icono'
import { TablaCobrosMeta } from '@/components/datos/TablasDatos'
const todayCO = () => new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10) // hoy en Bogotá

// Cobros de Meta: Meta ya no los entrega por la API, así que se anotan a mano (con su referencia de pago) o se importan desde el JSON de la calculadora.
async function llamar(body) {
  const res = await fetch('/api/meta-cobros', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'No se pudo completar la acción.')
  return data
}

function Anotar({ onCerrar, onListo }) {
  const [f, setF] = useState({ date: todayCO(), amount: '', reference: '', paymentRef: '', notes: '' })
  const [error, setError] = useState(''), [ocupado, setOcupado] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  async function guardar(e) {
    e.preventDefault(); setOcupado(true); setError('')
    try { await llamar({ action: 'add', ...f, amount: Number(String(f.amount).replace(/\D/g, '')) }); onListo('Cobro guardado.') } catch (er) { setError(er.message); setOcupado(false) }
  }
  return (
    <Dialogo etiqueta="Anotar un cobro de Meta" onCerrar={onCerrar}>
      <h2 style={{ marginTop: 0 }}>Anotar un cobro de Meta</h2>
      <p className="muted" style={{ marginTop: 0 }}>Copia los datos de tu extracto de facturación de Meta. El importe es el que ves ahí (ya incluye IVA).</p>
      <form onSubmit={guardar} className="fgrid" style={{ minWidth: 'min(560px, 80vw)' }}>
        <div className="field"><label htmlFor="cm-f">Fecha del cobro</label><div className="inp"><input id="cm-f" type="date" value={f.date} max={todayCO()} onChange={set('date')} required /></div></div>
        <div className="field"><label htmlFor="cm-i">Importe (con IVA)</label><div className="inp"><span className="pre">$</span><input id="cm-i" data-num inputMode="numeric" autoComplete="off" placeholder="52.267" value={f.amount} onChange={(e) => { const d = e.target.value.replace(/\D/g, '').slice(0, 12); setF({ ...f, amount: d ? Number(d).toLocaleString('es-CO') : '' }) }} required /></div></div>
        <div className="field full"><label htmlFor="cm-r">Referencia de pago</label><div className="inp"><input id="cm-r" type="text" value={f.paymentRef} onChange={(e) => setF({ ...f, paymentRef: e.target.value.toUpperCase() })} placeholder="PZ4XV8SWF4" maxLength={24} autoComplete="off" /></div><span className="hint">La que aparece en el extracto como «FACEBK *PZ4XV8SWF4»: letras y números. Sirve para cruzar el cobro con tu tarjeta.</span></div>
        <details className="fdet full">
          <summary>Más datos (opcional)</summary>
          <div className="fgrid">
            <div className="field full"><label htmlFor="cm-t">Identificador de la transacción</label><div className="inp"><input id="cm-t" type="text" value={f.reference} onChange={set('reference')} placeholder="28990819463938228-28947602274926610" maxLength={80} autoComplete="off" /></div></div>
            <div className="field full"><label htmlFor="cm-n">Nota</label><div className="inp"><input id="cm-n" type="text" value={f.notes} onChange={set('notes')} maxLength={300} /></div></div>
          </div>
        </details>
        {error && <div className="tint bad full" role="alert" style={{ margin: 0 }}><b style={{ color: 'var(--coral-ink)' }}>{error}</b></div>}
        <div className="fbar full"><button type="button" className="btn ghost" onClick={onCerrar}>Cancelar</button><button className="btn" disabled={ocupado}>{ocupado ? 'Guardando…' : 'Guardar cobro'}</button></div>
      </form>
    </Dialogo>
  )
}

export default function CobrosMeta({ cobros }) {
  const router = useRouter(), archivo = useRef(null)
  const [dialogo, setDialogo] = useState(false), [aviso, setAviso] = useState(null), [ocupado, setOcupado] = useState(false)
  const listo = (m) => { setDialogo(false); setAviso({ ok: true, m }); router.refresh() }

  async function importar(e) {
    const file = e.target.files && e.target.files[0]; e.target.value = ''
    if (!file) return
    setOcupado(true); setAviso(null)
    try {
      if (file.size > 3 * 1024 * 1024) throw new Error('El archivo es demasiado grande.')
      let j; try { j = JSON.parse(await file.text()) } catch { throw new Error('El archivo no es un JSON válido.') }
      const r = await llamar({ action: 'import', format: j && j.format, charges: j && j.charges })
      listo(`Importados ${r.imported} cobros nuevos` + (r.skipped ? `, ${r.skipped} ya estaban` : '') + (r.before ? `, ${r.before} anteriores al inicio de la operación` : '') + (r.invalid ? `, ${r.invalid} no válidos` : '') + '.')
    } catch (er) { setAviso({ ok: false, m: er.message }) } finally { setOcupado(false) }
  }
  async function quitar(id) {
    if (!window.confirm('¿Quitar este cobro?')) return
    try { await llamar({ action: 'delete', ids: [id] }); router.refresh() } catch (er) { setAviso({ ok: false, m: er.message }) }
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <button className="btn sm" onClick={() => setDialogo(true)}><Icono n="plus" size={15} />Anotar cobro</button>
        <button className="btn ghost sm" disabled={ocupado} onClick={() => archivo.current && archivo.current.click()}>{ocupado ? 'Importando…' : 'Importar JSON'}</button>
        <input ref={archivo} type="file" accept="application/json,.json" hidden onChange={importar} />
      </div>
      {aviso && <div className={'tint ' + (aviso.ok ? 'ok' : 'bad')} role={aviso.ok ? 'status' : 'alert'} style={{ marginBottom: 10 }}><b style={{ color: aviso.ok ? 'var(--jade-ink)' : 'var(--coral-ink)' }}>{aviso.m}</b></div>}
      <TablaCobrosMeta cobros={cobros} onQuitar={quitar} />
      {dialogo && <Anotar onCerrar={() => setDialogo(false)} onListo={listo} />}
    </>
  )
}
