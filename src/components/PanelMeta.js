'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Icono } from '@/components/shell/Icono'
import { diaCorto, hace } from '@/lib/formato'

// Mis cuentas → Meta Ads: estado de la conexión y UN solo control, «Sincronizar» (desde la fecha de inicio de tu operación, la misma de Dropi).
async function llamar(method, body) {
  const res = await fetch('/api/meta', { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'No se pudo completar la acción.')
  return data
}
const Chip = ({ tono, children }) => <span className={'chip ' + tono}>{children}</span>

export default function PanelMeta() {
  const router = useRouter()
  const [d, setD] = useState(null)
  const [error, setError] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const [res, setRes] = useState(null)
  const cargar = useCallback(async () => { try { setD(await llamar('GET')); setError('') } catch (e) { setError(e.message) } }, [])
  useEffect(() => { cargar() }, [cargar])

  async function sincronizar() {
    setTrabajando(true); setRes(null)
    try { setRes(await llamar('POST', { action: 'sync' })) } catch (e) { setRes({ ok: false, error: { message: e.message } }) }
    finally { setTrabajando(false); cargar(); router.refresh() } // las tablas de abajo se leen en el servidor
  }

  const caja = (hijos) => <div className="card" style={{ marginBottom: 16, display: 'flex', gap: '14px 24px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>{hijos}</div>
  if (error) return caja(<><div><b>Meta Ads</b><div className="muted" style={{ fontSize: 14 }}>{error}</div></div><button className="btn ghost sm" onClick={cargar}>Reintentar</button></>)
  if (!d) return caja(<div className="muted">Meta Ads: cargando…</div>)
  if (!d.connected) return caja(<>
    <div style={{ maxWidth: 620 }}><b>Conexión con Meta Ads</b><div className="muted" style={{ fontSize: 14, marginTop: 2 }}>Trae el gasto de cada campaña y tus cobros por la API oficial de Meta (solo lectura). Se conecta una vez en Configuración.</div></div>
    <Link href="/configuracion" className="btn sm"><Icono n="plus" size={15} />Conectar Meta</Link>
  </>)
  const ok = d.state === 'ok'
  return (
    <>
      {caja(<>
        <div style={{ minWidth: 260 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><b>Meta Ads</b>{trabajando || d.syncing ? <Chip tono="blue">Sincronizando…</Chip> : ok ? <Chip tono="ok">Conectado</Chip> : <Chip tono="bad">{d.state === 'reauth' ? 'Reconectar' : 'Con un error'}</Chip>}</div>
          <div className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>{d.accountName || d.adAccountId} · última sincronización {hace(d.lastSyncOkAt)}</div>
          {d.lastError && <div style={{ fontSize: 13.5, color: 'var(--coral-ink)', marginTop: 2 }}>{d.lastError} {d.state !== 'ok' && <Link href="/configuracion" className="link">Ir a Configuración</Link>}</div>}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: 13.5 }}>Sincroniza desde el <b style={{ color: 'var(--ink)' }}>{diaCorto(d.opFrom)}</b></span>
          <button className="btn sm" disabled={trabajando || d.syncing || d.state === 'reauth'} onClick={sincronizar}>{trabajando ? 'Sincronizando…' : 'Sincronizar'}</button>
        </div>
      </>)}
      {res && (res.ok
        ? <div className={'tint ' + (res.cobros && res.cobros.ok === false ? 'warn' : 'ok')} style={{ marginBottom: 16 }}>
            <b style={{ color: res.cobros && res.cobros.ok === false ? 'var(--gold-ink)' : 'var(--jade-ink)' }}>Listo: {res.gasto.filas} filas de gasto (${res.gasto.total.toLocaleString('es-CO')} sin IVA) y {res.cobros.nuevos} cobros nuevos.</b>
            {res.cobros && res.cobros.ok === false && <div style={{ fontSize: 14, marginTop: 4 }}>El gasto se guardó, pero los cobros no se pudieron leer: {res.cobros.error}</div>}
          </div>
        : <div className="tint bad" role="alert" style={{ marginBottom: 16 }}><b style={{ color: 'var(--coral-ink)' }}>{(res.error && res.error.message) || 'No se pudo sincronizar con Meta.'}</b></div>)}
    </>
  )
}
