'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Icono } from '@/components/shell/Icono'
import Dialogo from '@/components/Dialogo'
import { hace } from '@/lib/formato'

// Configuración → Cuenta de Meta. Misma idea que la conexión con Dropi: el token se guarda cifrado, se pide tu contraseña de la app para guardarlo o quitarlo,
// y el token nunca vuelve al navegador (solo sus últimos 4 caracteres).
async function llamar(method, body) {
  const res = await fetch('/api/meta', { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'No se pudo completar la acción.')
  return data
}
const Chip = ({ tono, children }) => <span className={'chip ' + tono}>{children}</span>
function Campo({ id, etiqueta, ayuda, ...props }) {
  return (
    <div className="field">
      <label htmlFor={id}>{etiqueta}</label>
      <div className="inp"><input id={id} {...props} /></div>
      {ayuda && <span className="muted" style={{ fontSize: 13, marginTop: 6, display: 'block' }}>{ayuda}</span>}
    </div>
  )
}

function DialogoConectar({ onCerrar, onListo, actual }) {
  const [v, setV] = useState({ cuenta: actual ? actual.adAccountId : '', token: '', iva: actual ? String(actual.vatPct) : '19', appPassword: '', appCode: '' })
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const set = (k) => (e) => setV((p) => ({ ...p, [k]: e.target.value }))
  async function enviar(e) {
    e.preventDefault()
    if (!v.cuenta || !v.token) { setError('Escribe el ID de la cuenta publicitaria y el token.'); return }
    if (!v.appPassword) { setError('Escribe tu contraseña de esta app.'); return }
    setError(''); setEnviando(true)
    try { await llamar('POST', { action: 'connect', adAccountId: v.cuenta, token: v.token, vatPct: v.iva, appPassword: v.appPassword, appCode: v.appCode }); onListo() }
    catch (ex) { setError(ex.message); setV((p) => ({ ...p, token: '', appPassword: '', appCode: '' })); setEnviando(false) } // nada sensible queda en pantalla
  }
  return (
    <Dialogo etiqueta="Conectar Meta" onCerrar={onCerrar}>
      <form onSubmit={enviar}>
        <h2 style={{ fontSize: 26 }}>Conectar Meta Ads</h2>
        <p className="muted" style={{ marginTop: 10 }}>Se usa la <b>API oficial de Meta</b>, solo para <b>leer</b>: gasto de tus campañas y cobros. No se crea, edita ni pausa nada, y no hay automatización del navegador, así que no pone en riesgo tu cuenta. El token se guarda <b>cifrado</b> y no vuelve al navegador.</p>
        <details className="md-flat" style={{ marginTop: 12 }}>
          <summary>¿Cómo consigo el token? <span className="md-sm">4 pasos en Business Manager</span></summary>
          <ol style={{ margin: '10px 0 0', paddingLeft: 20, fontSize: 14, lineHeight: 1.7 }}>
            <li>Entra a <b>business.facebook.com/settings</b> → <b>Usuarios → Usuarios del sistema → Agregar</b>. Rol «Empleado» basta.</li>
            <li><b>Agregar activos</b> → Cuentas publicitarias → elige tu cuenta con permiso solo de <b>ver rendimiento</b>.</li>
            <li><b>Generar token</b>: elige tu app y marca solo <b>ads_read</b> (y <b>business_management</b> si quieres ver cobros).</li>
            <li>Copia el token (se muestra una sola vez) y pégalo aquí. El ID de la cuenta lo ves en el Administrador de anuncios.</li>
          </ol>
        </details>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 18 }}>
          <Campo id="mt-cuenta" etiqueta="ID de la cuenta publicitaria" ayuda="Solo números; puede empezar con «act_»." autoComplete="off" maxLength={30} placeholder="941640195133155" value={v.cuenta} onChange={set('cuenta')} />
          <Campo id="mt-token" etiqueta="Token del usuario del sistema" type="password" autoComplete="off" maxLength={700} placeholder="EAA…" value={v.token} onChange={set('token')} />
          <Campo id="mt-iva" etiqueta="IVA que Meta cobra encima del gasto (%)" ayuda="En Colombia es 19 %. El gasto que informa Meta viene sin IVA; lo que se cobra en la tarjeta lo incluye." inputMode="decimal" maxLength={5} value={v.iva} onChange={set('iva')} />
          <hr style={{ border: 0, borderTop: '1px solid var(--line2)', width: '100%' }} />
          <Campo id="mt-app" etiqueta="Tu contraseña de esta app (para confirmar que eres tú)" type="password" autoComplete="current-password" maxLength={128} value={v.appPassword} onChange={set('appPassword')} />
          <Campo id="mt-appcode" etiqueta="Código de tu app autenticadora (solo si activaste la verificación en dos pasos aquí)" inputMode="numeric" autoComplete="one-time-code" maxLength={20} placeholder="123456" value={v.appCode} onChange={set('appCode')} />
          <span className="errm" role="alert">{enviando && !error ? 'Comprobando el token con Meta… (puede tardar unos segundos)' : error}</span>
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 20, flexWrap: 'wrap' }}>
          <button className="btn" type="submit" disabled={enviando}>Conectar</button>
          <button className="btn ghost" type="button" onClick={onCerrar}>Cancelar</button>
        </div>
      </form>
    </Dialogo>
  )
}

function DialogoDesconectar({ onCerrar, onListo }) {
  const [c, setC] = useState({ appPassword: '', appCode: '', error: '' })
  const [enviando, setEnviando] = useState(false)
  async function enviar(e) {
    e.preventDefault()
    if (!c.appPassword) { setC((p) => ({ ...p, error: 'Escribe tu contraseña de esta app.' })); return }
    setEnviando(true)
    try { await llamar('POST', { action: 'disconnect', appPassword: c.appPassword, appCode: c.appCode }); onListo() }
    catch (ex) { setC({ appPassword: '', appCode: '', error: ex.message }); setEnviando(false) }
  }
  return (
    <Dialogo etiqueta="Desconectar Meta" onCerrar={onCerrar}>
      <form onSubmit={enviar}>
        <h2 style={{ fontSize: 24 }}>¿Desconectar Meta?</h2>
        <p className="muted" style={{ marginTop: 12 }}>Se borra de aquí el token. El gasto y los cobros que ya trajiste se quedan.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 18 }}>
          <Campo id="md-app" etiqueta="Tu contraseña de esta app (para confirmar que eres tú)" type="password" autoComplete="current-password" maxLength={128} value={c.appPassword} onChange={(e) => setC((p) => ({ ...p, appPassword: e.target.value }))} />
          <Campo id="md-code" etiqueta="Código de tu app autenticadora (solo si activaste la verificación en dos pasos aquí)" inputMode="numeric" autoComplete="one-time-code" maxLength={20} placeholder="123456" value={c.appCode} onChange={(e) => setC((p) => ({ ...p, appCode: e.target.value }))} />
          <span className="errm" role="alert">{c.error}</span>
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 20, flexWrap: 'wrap' }}>
          <button className="btn" type="submit" disabled={enviando} style={{ background: 'var(--coral-ink)' }}>Desconectar</button>
          <button className="btn ghost" type="button" onClick={onCerrar}>Cancelar</button>
        </div>
      </form>
    </Dialogo>
  )
}

export default function ConexionMeta() {
  const router = useRouter()
  const [d, setD] = useState(null)
  const [errorCarga, setErrorCarga] = useState('')
  const [dialogo, setDialogo] = useState(null)
  const [iva, setIva] = useState('')
  const [msg, setMsg] = useState({ texto: '', error: false })

  const cargar = useCallback(async () => { try { setD(await llamar('GET')); setErrorCarga('') } catch (e) { setErrorCarga(e.message) } }, [])
  useEffect(() => { cargar() }, [cargar])

  async function guardarIva(e) {
    e.preventDefault(); setMsg({ texto: '', error: false })
    try { await llamar('POST', { action: 'set_vat', vatPct: iva }); await cargar(); router.refresh(); setIva(''); setMsg({ texto: 'IVA guardado.', error: false }) }
    catch (ex) { setMsg({ texto: ex.message, error: true }) }
  }

  if (errorCarga) return <div className="card"><b>Meta</b><p className="muted">{errorCarga}</p><button className="btn ghost sm" onClick={cargar}>Reintentar</button></div>
  if (!d) return <div className="card"><span className="muted">Meta: cargando…</span></div>
  const termina = () => { setDialogo(null); cargar(); router.refresh() }
  const modales = (
    <>
      {dialogo === 'conectar' && <DialogoConectar actual={d.connected ? d : null} onCerrar={() => setDialogo(null)} onListo={termina} />}
      {dialogo === 'desconectar' && <DialogoDesconectar onCerrar={() => setDialogo(null)} onListo={termina} />}
    </>
  )

  if (!d.connected) {
    return (
      <>
        <div className="card" style={{ display: 'flex', gap: '14px 24px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ maxWidth: 640 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><b style={{ fontSize: 18 }}>Cuenta de Meta</b><Chip tono="idle">Sin conectar</Chip></div>
            <div className="muted" style={{ fontSize: 14, marginTop: 4 }}>Conecta tu cuenta publicitaria por la API oficial de Meta (solo lectura) para traer el gasto de cada campaña y tus cobros. Con eso se separa la publicidad de «otros gastos» y se puede calcular el costo por venta y cuándo escalar.</div>
          </div>
          <button className="btn" onClick={() => setDialogo('conectar')}><Icono n="plus" size={16} />Conectar Meta</button>
        </div>
        {modales}
      </>
    )
  }
  const estado = d.state === 'ok' ? <Chip tono="ok">Conectado</Chip> : d.state === 'reauth' ? <Chip tono="bad">Reconectar: el token no sirve</Chip> : <Chip tono="warn">Con un error</Chip>
  return (
    <>
      <div className="card">
        <div style={{ display: 'flex', gap: '14px 24px', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><b style={{ fontSize: 18 }}>{d.accountName || 'Cuenta de Meta'}</b>{estado}</div>
            <div className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>{d.adAccountId} · moneda {d.currency || '—'} · token {d.tokenHint} · última sincronización {hace(d.lastSyncOkAt)}</div>
            {d.lastError && <div style={{ fontSize: 13.5, color: 'var(--coral-ink)', marginTop: 4, maxWidth: 640 }}>{d.lastError}</div>}
            <p className="muted only-learner" style={{ fontSize: 13.5, margin: '8px 0 0' }}>El gasto y los cobros se traen desde <b>Mis cuentas → Meta Ads</b> y una vez al día solos.</p>
          </div>
          <div className="rowbtns">
            {d.state !== 'ok' && <button className="btn sm" onClick={() => setDialogo('conectar')}>Reconectar</button>}
            <button className="btn ghost sm" onClick={() => setDialogo('conectar')}>Cambiar token</button>
            <button className="btn ghost sm" style={{ color: 'var(--coral-ink)', borderColor: '#FECACA' }} onClick={() => setDialogo('desconectar')}>Desconectar</button>
          </div>
        </div>
        <form onSubmit={guardarIva} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
          <label htmlFor="meta-iva" style={{ fontSize: 14, fontWeight: 600 }}>IVA que Meta cobra encima del gasto</label>
          <div className="inp" style={{ padding: '0 10px', width: 110 }}><input id="meta-iva" inputMode="decimal" maxLength={5} value={iva === '' ? String(d.vatPct) : iva} onChange={(e) => { setIva(e.target.value); setMsg({ texto: '', error: false }) }} style={{ fontSize: 15, padding: '8px 0', textAlign: 'right' }} /><span className="pre">%</span></div>
          <button className="btn ghost sm" type="submit" disabled={iva === '' || Number(iva) === d.vatPct}>Guardar IVA</button>
          {msg.texto && <span role="status" style={{ fontSize: 13.5, color: msg.error ? 'var(--coral-ink)' : 'var(--jade-ink)' }}>{msg.texto}</span>}
        </form>
      </div>
      {modales}
    </>
  )
}
