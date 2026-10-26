'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Icono } from './Icono'
import CodigoOtp from '@/components/CodigoOtp'
import { cop, diaCorto, hace } from '@/lib/formato'

// Sincronizar Dropi y Meta desde la barra superior, en cualquier pantalla: un mes (completo), el código de Dropi cuando haga falta y un botón por fuente o para todo.
// Sigue trabajando aunque cierres el panel: el botón de la barra muestra el avance. Otras pantallas lo abren con el evento «dfa:abrir-sync».
async function pedir(url, body) {
  const res = await fetch(url, { method: body ? 'POST' : 'GET', headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(data.error || 'No se pudo completar la acción.'), { code: data.code })
  return data
}
const Chip = ({ tono, children }) => <span className={'chip ' + tono}>{children}</span>
const espera = (s) => (s >= 120 ? `${Math.ceil(s / 60)} min` : `${s} s`)

/** Estado de Dropi y Meta en una línea: { tono, texto }. */
function estadoDropi(d) {
  if (!d) return { tono: 'idle', texto: 'Cargando…' }
  if (!d.connected) return { tono: 'idle', texto: 'Sin conectar' }
  if (d.state === 'reauth') return { tono: 'bad', texto: 'Credenciales rechazadas' }
  if (d.cooldownSeconds > 0) return { tono: 'warn', texto: `En pausa · ${espera(d.cooldownSeconds)}` }
  if (d.syncing) return { tono: 'blue', texto: 'Sincronizando…' }
  if (d.needsOtp) return { tono: 'blue', texto: 'Pide tu código' }
  return { tono: 'ok', texto: 'Conectado' }
}
function estadoMeta(m) {
  if (!m) return { tono: 'idle', texto: 'Cargando…' }
  if (!m.connected) return { tono: 'idle', texto: 'Sin conectar' }
  if (m.state === 'reauth') return { tono: 'bad', texto: 'Reconectar: el token no sirve' }
  if (m.syncing) return { tono: 'blue', texto: 'Sincronizando…' }
  return m.state === 'ok' ? { tono: 'ok', texto: 'Conectado' } : { tono: 'warn', texto: 'Con un error' }
}

function ResumenDropi({ r }) {
  if (r.error && !r.ok) return <div className="tint bad" role="alert"><b style={{ color: 'var(--coral-ink)' }}>Dropi: {r.error.message || r.error}</b></div>
  const estados = r.orders && r.orders.estados ? Object.entries(r.orders.estados).sort((a, b) => b[1] - a[1]) : []
  const fallos = [['Saldo de la tarjeta', r.balance], ['Billetera', r.wallet], ['Pedidos', r.orders]].filter(([, x]) => x && x.ok === false && x.error)
  return (
    <div className="tint ok">
      <b style={{ color: 'var(--jade-ink)' }}>Dropi listo</b>
      <ul className="sb-lista">
        <li>Tarjeta: {r.inserted ?? 0} movimientos nuevos{r.updated ? ` · ${r.updated} actualizados` : ''}</li>
        <li>Saldo de la tarjeta: {r.balance && r.balance.ok ? cop(r.balance.amount) : '—'}</li>
        <li>Billetera: {r.wallet && r.wallet.ok !== false ? `${r.wallet.inserted ?? 0} movimientos nuevos` : '—'}</li>
        <li>Pedidos: {r.orders && r.orders.ok ? `${r.orders.read} leídos · ${r.orders.inserted} nuevos · ${r.orders.updated} actualizados` : '—'}</li>
      </ul>
      {fallos.length > 0 && <div role="alert" style={{ color: 'var(--coral-ink)', fontSize: 13.5, marginTop: 6 }}><b>Algo no se pudo leer:</b>{fallos.map(([n, x]) => <div key={n}>{n}: {x.error.message}</div>)}<div className="muted">Lo que sí se leyó quedó guardado.</div></div>}
      {estados.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ cursor: 'pointer', fontSize: 13.5, fontWeight: 600 }}>Pedidos por estado en Dropi</summary>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>{estados.map(([e, n]) => <span key={e} className="chip idle">{e} · {n}</span>)}</div>
        </details>
      )}
    </div>
  )
}
function ResumenMeta({ r }) {
  if (!r.ok) return <div className="tint bad" role="alert"><b style={{ color: 'var(--coral-ink)' }}>Meta: {(r.error && r.error.message) || 'No se pudo sincronizar.'}</b></div>
  return (
    <div className="tint ok">
      <b style={{ color: 'var(--jade-ink)' }}>Meta listo</b>
      <ul className="sb-lista">
        <li>Gasto: {r.gasto.filas} filas (${r.gasto.total.toLocaleString('es-CO')} sin IVA)</li>
      </ul>
    </div>
  )
}

export default function SincronizarBarra() {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [dropi, setDropi] = useState(null)
  const [meta, setMeta] = useState(null)
  const [mes, setMes] = useState('')
  const [otp, setOtp] = useState('')
  const [trabajando, setTrabajando] = useState('') // '', 'dropi', 'meta'
  const [res, setRes] = useState({ dropi: null, meta: null })
  const [ahora, setAhora] = useState(0) // «ahora» se fija al cargar el estado (no se lee el reloj al dibujar)
  const raiz = useRef(null), boton = useRef(null)

  const cargar = useCallback(async () => {
    const [d, m] = await Promise.all([pedir('/api/dropi').catch(() => null), pedir('/api/meta').catch(() => null)])
    setDropi(d); setMeta(m); setAhora(Date.now())
  }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial desde la API
  useEffect(() => { cargar() }, [cargar])

  // Abrir desde otras pantallas, Escape para cerrar y clic fuera.
  useEffect(() => {
    const abrir = () => { setAbierto(true); cargar() }
    window.addEventListener('dfa:abrir-sync', abrir)
    return () => window.removeEventListener('dfa:abrir-sync', abrir)
  }, [cargar])
  useEffect(() => {
    if (!abierto) return
    const fuera = (e) => { if (raiz.current && !raiz.current.contains(e.target)) setAbierto(false) }
    const tecla = (e) => { if (e.key === 'Escape') { setAbierto(false); boton.current?.focus() } }
    document.addEventListener('mousedown', fuera); document.addEventListener('keydown', tecla)
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', tecla) }
  }, [abierto])

  const meses = (dropi && dropi.meses) || (meta && meta.meses) || []
  const actual = meses.find((x) => x.mes === mes) || meses[meses.length - 1]
  const dropiListo = !!dropi && dropi.connected && dropi.state !== 'reauth' && !(dropi.cooldownSeconds > 0) && !dropi.syncing
  const metaListo = !!meta && meta.connected && meta.state !== 'reauth' && !meta.syncing
  const necesitaCodigo = !!dropi && dropi.connected && dropi.needsOtp
  const codigoOk = !necesitaCodigo || otp.length === 6

  async function correr(cuales) {
    if (!actual || trabajando) return
    setRes({ dropi: null, meta: null })
    const rango = { from: actual.desde, to: actual.hasta }
    try {
      if (cuales.includes('dropi')) {
        setTrabajando('dropi')
        try { const r = await pedir('/api/dropi', { action: 'sync', ...rango, ...(otp ? { otp } : {}) }); setRes((p) => ({ ...p, dropi: r })) }
        catch (ex) { setRes((p) => ({ ...p, dropi: { ok: false, error: { message: ex.message } } })) }
        setOtp('') // el código se usa una sola vez
      }
      if (cuales.includes('meta')) {
        setTrabajando('meta')
        try { const r = await pedir('/api/meta', { action: 'sync', ...rango }); setRes((p) => ({ ...p, meta: r })) }
        catch (ex) { setRes((p) => ({ ...p, meta: { ok: false, error: { message: ex.message } } })) }
      }
    } finally { setTrabajando(''); await cargar(); router.refresh() } // las pantallas leen sus datos en el servidor
  }

  // Indicador de la barra: ocupado, atención o al día (según la última sincronización de Dropi, como antes).
  const horas = dropi && dropi.connected && dropi.lastSyncOkAt ? (ahora - dropi.lastSyncOkAt) / 3600e3 : null
  const atencion = (dropi && dropi.connected && (dropi.state === 'reauth' || dropi.needsOtp)) || (meta && meta.connected && meta.state === 'reauth')
  const aldia = horas != null && horas < 12 && !atencion
  const etiqueta = trabajando ? `Sincronizando ${trabajando === 'dropi' ? 'Dropi' : 'Meta'}…` : atencion ? 'Requiere atención' : !dropi ? 'Sincronizar' : !dropi.connected ? 'Dropi sin conectar' : horas == null ? 'Sin sincronizar' : aldia ? 'Datos al día' : `Hace ${horas < 48 ? Math.round(horas) + ' h' : Math.round(horas / 24) + ' días'}`
  const e1 = estadoDropi(dropi), e2 = estadoMeta(meta)

  return (
    <div ref={raiz} style={{ position: 'relative' }}>
      <button ref={boton} type="button" className={'dstat sb-btn ' + (aldia && !trabajando ? 'ok' : 'warn')} aria-haspopup="dialog" aria-expanded={abierto} aria-controls="sb-panel"
        onClick={() => { setAbierto((v) => !v); if (!abierto) cargar() }} title="Sincronizar Dropi y Meta">
        <span className={'sb-ic' + (trabajando ? ' gira' : '')} aria-hidden="true"><Icono n="refresh" size={17} /></span>
        <span className="sb-txt">{etiqueta}</span>
      </button>
      {abierto && (
        <div id="sb-panel" className="pop sb-pop" role="dialog" aria-label="Sincronizar Dropi y Meta" style={{ position: 'absolute', right: 0, top: 48 }}>
          <h4>Sincronizar datos</h4>
          {!actual ? <p className="muted" style={{ margin: 0 }}>{dropi || meta ? 'No hay meses para sincronizar todavía.' : 'Cargando…'}</p> : (
            <>
              <div className="field" style={{ margin: 0 }}>
                <label htmlFor="sb-mes">Mes a traer</label>
                <div className="inp" style={{ padding: '0 8px' }}>
                  <select id="sb-mes" value={actual.mes} onChange={(e) => setMes(e.target.value)} disabled={!!trabajando} style={{ fontSize: 15, padding: '9px 0', border: 0, background: 'transparent', font: 'inherit', width: '100%' }}>
                    {[...meses].reverse().map((x) => <option key={x.mes} value={x.mes}>{x.etiqueta}</option>)}
                  </select>
                </div>
                <span className="muted" style={{ fontSize: 12.5, marginTop: 4, display: 'block' }}>Del {diaCorto(actual.desde)} al {diaCorto(actual.hasta)}. Solo el mes actual y los 2 anteriores, desde el inicio de tu operación.</span>
              </div>

              <section className="sb-src" aria-label="Dropi">
                <div className="sb-h"><b>Dropi</b><Chip tono={e1.tono}>{e1.texto}</Chip></div>
                <div className="muted" style={{ fontSize: 12.5 }}>{dropi && dropi.connected ? <>Tarjeta {dropi.cardHint} · última vez {hace(dropi.lastSyncOkAt)}</> : <>Conéctalo en <Link href="/cuentas" className="link" onClick={() => setAbierto(false)}>Mis cuentas</Link>.</>}</div>
                {dropi && dropi.lastError && dropi.state !== 'ok' && <div style={{ fontSize: 12.5, color: 'var(--coral-ink)' }}>{dropi.lastError}</div>}
                {necesitaCodigo && dropiListo && (
                  <div className="field" style={{ margin: '8px 0 0' }}>
                    <label htmlFor="sb-otp">Código de tu autenticador de Dropi</label>
                    <CodigoOtp id="sb-otp" etiqueta="Código de 6 dígitos de tu autenticador de Dropi" value={otp} onChange={setOtp} disabled={!!trabajando} />
                    <span className="muted" style={{ fontSize: 12.5, marginTop: 4, display: 'block' }}>Cambia cada 30 segundos. Solo se pide cuando no hay una sesión de Dropi abierta; no se guarda.</span>
                  </div>
                )}
              </section>

              <section className="sb-src" aria-label="Meta">
                <div className="sb-h"><b>Meta Ads</b><Chip tono={e2.tono}>{e2.texto}</Chip></div>
                <div className="muted" style={{ fontSize: 12.5 }}>{meta && meta.connected ? <>{meta.accountName || meta.adAccountId} · última vez {hace(meta.lastSyncOkAt)}</> : <>Conéctalo en <Link href="/configuracion" className="link" onClick={() => setAbierto(false)}>Configuración</Link>.</>}</div>
                {meta && meta.lastError && meta.state !== 'ok' && <div style={{ fontSize: 12.5, color: 'var(--coral-ink)' }}>{meta.lastError}</div>}
              </section>

              <div className="sb-acc">
                <button type="button" className="btn" disabled={!!trabajando || !codigoOk || !(dropiListo || metaListo)} onClick={() => correr([...(dropiListo ? ['dropi'] : []), ...(metaListo ? ['meta'] : [])])}>
                  {trabajando ? (trabajando === 'dropi' ? 'Sincronizando Dropi…' : 'Sincronizando Meta…') : dropiListo && metaListo ? 'Sincronizar todo' : dropiListo ? 'Sincronizar Dropi' : 'Sincronizar Meta'}
                </button>
                {dropiListo && metaListo && <>
                  <button type="button" className="btn ghost sm" disabled={!!trabajando || !codigoOk} onClick={() => correr(['dropi'])}>Solo Dropi</button>
                  <button type="button" className="btn ghost sm" disabled={!!trabajando} onClick={() => correr(['meta'])}>Solo Meta</button>
                </>}
              </div>
              {trabajando === 'dropi' && <p className="muted" style={{ fontSize: 12.5, margin: 0 }} aria-live="polite">Dropi se lee despacio, a propósito, para no levantar sospechas. Puedes cerrar este panel: sigue trabajando.</p>}
              <div className="sb-res" aria-live="polite">
                {res.dropi && <ResumenDropi r={res.dropi} />}
                {res.meta && <ResumenMeta r={res.meta} />}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
