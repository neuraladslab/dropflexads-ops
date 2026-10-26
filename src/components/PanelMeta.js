'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Icono } from '@/components/shell/Icono'
import { hace } from '@/lib/formato'

// Campañas (lista y pestaña «Gasto en Meta»): estado de la conexión con Meta. Sincronizar se hace desde la barra superior (botón «Sincronizar»), en cualquier pantalla.
async function llamar(method, body) {
  const res = await fetch('/api/meta', { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'No se pudo completar la acción.')
  return data
}
const Chip = ({ tono, children }) => <span className={'chip ' + tono}>{children}</span>

export default function PanelMeta() {
  const [d, setD] = useState(null)
  const [error, setError] = useState('')
  const cargar = useCallback(async () => { try { setD(await llamar('GET')); setError('') } catch (e) { setError(e.message) } }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial desde la API
  useEffect(() => { cargar() }, [cargar])

  const caja = (hijos) => <div className="card" style={{ marginBottom: 16, display: 'flex', gap: '14px 24px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>{hijos}</div>
  if (error) return caja(<><div><b>Meta Ads</b><div className="muted" style={{ fontSize: 14 }}>{error}</div></div><button className="btn ghost sm" onClick={cargar}>Reintentar</button></>)
  if (!d) return caja(<div className="muted">Meta Ads: cargando…</div>)
  if (!d.connected) return caja(<>
    <div style={{ maxWidth: 620 }}><b>Conexión con Meta Ads</b><div className="muted" style={{ fontSize: 14, marginTop: 2 }}>Trae el gasto, CPM y CTR de cada campaña por la API oficial de Meta (solo lectura). Se conecta una vez en Configuración.</div></div>
    <Link href="/configuracion" className="btn sm"><Icono n="plus" size={15} />Conectar Meta</Link>
  </>)
  const ok = d.state === 'ok'
  return (
    <>
      {caja(<>
        <div style={{ minWidth: 260 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><b>Meta Ads</b>{d.syncing ? <Chip tono="blue">Sincronizando…</Chip> : ok ? <Chip tono="ok">Conectado</Chip> : <Chip tono="bad">{d.state === 'reauth' ? 'Reconectar' : 'Con un error'}</Chip>}</div>
          <div className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>{d.accountName || d.adAccountId} · última sincronización {hace(d.lastSyncOkAt)}</div>
          {d.lastError && <div style={{ fontSize: 13.5, color: 'var(--coral-ink)', marginTop: 2 }}>{d.lastError} {d.state !== 'ok' && <Link href="/configuracion" className="link">Ir a Configuración</Link>}</div>}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: 13.5, maxWidth: 260 }}>Para traer datos usa <b>Sincronizar</b>, en la barra de arriba.</span>
        </div>
      </>)}
    </>
  )
}
