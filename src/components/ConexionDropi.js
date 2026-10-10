'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Icono } from '@/components/shell/Icono'
import Dialogo from '@/components/Dialogo'
import { diaCorto } from '@/lib/formato'

// Mismo diseño que el panel de Dropi de la app original: tarjeta horizontal a todo el ancho (estado a la izquierda, botones a la derecha),
// versión compacta minimizable y diálogos para conectar y desconectar.
const hace = (ms) => {
  if (!ms) return 'nunca'
  const m = Math.round((Date.now() - ms) / 60000)
  return m < 1 ? 'hace un momento' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} d`
}
const espera = (s) => (s >= 3600 ? Math.ceil(s / 3600) + ' h' : Math.max(1, Math.ceil(s / 60)) + ' min')
const hoyISO = () => new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10)
const cop = (n) => '$' + Math.round(n).toLocaleString('es-CO')

async function llamar(method, body) {
  const res = await fetch('/api/dropi', { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
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

function DialogoConectar({ onCerrar, onListo }) {
  const [v, setV] = useState({ email: '', password: '', cardId: '', modo: 'otp', otp: '', totp: '', appPassword: '', appCode: '' })
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const set = (k) => (e) => setV((p) => ({ ...p, [k]: e.target.value }))

  async function conectar(e) {
    e.preventDefault()
    if (!v.appPassword) { setError('Escribe tu contraseña de esta app.'); return }
    const auto = v.modo === 'auto'
    if (!v.email || !v.password || !v.cardId || (auto ? !v.totp : !v.otp)) {
      setError(auto ? 'Completa el correo, la contraseña, la clave del autenticador y el ID de la tarjeta.' : 'Completa el correo, la contraseña, el ID de la tarjeta y el código de 6 dígitos de tu autenticador de Dropi.')
      return
    }
    setError(''); setEnviando(true)
    try {
      await llamar('POST', { action: 'connect', email: v.email, password: v.password, cardId: v.cardId, appPassword: v.appPassword, appCode: v.appCode, ...(auto ? { totp: v.totp } : { otp: v.otp }) })
      onListo()
    } catch (ex) {
      setError(ex.message)
      setV((p) => ({ ...p, otp: '', appPassword: '', appCode: '' })) // nada sensible queda en pantalla
      setEnviando(false)
    }
  }

  return (
    <Dialogo etiqueta="Conectar Dropi" onCerrar={onCerrar}>
      <form onSubmit={conectar}>
        <h2 style={{ fontSize: 26 }}>Conectar Dropi</h2>
        <p className="muted" style={{ marginTop: 10 }}>Se hace <b>un solo inicio de sesión</b> y se reutiliza hasta que venza (unas 12 horas), a un ritmo parecido al de la propia página de Dropi. Solo se leen movimientos y pedidos: no se cambia nada en tu cuenta. Las credenciales se guardan <b>cifradas</b> y nunca vuelven al navegador.</p>
        <div className="tint warn" style={{ marginTop: 12, fontSize: 14 }}><b style={{ color: 'var(--gold-ink)' }}>Ten claro qué compartes:</b> se guarda tu contraseña de Dropi (cifrada). En modo «código a mano» el servidor NO puede entrar solo: necesita tu código. En modo automático sí puede, con ambos factores. Si puedes, usa una cuenta de Dropi dedicada y protege la clave de cifrado del servidor (<code>DATA_ENCRYPTION_KEY</code>). Dropi podría pausar el acceso automático.</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 18 }}>
          <Campo id="dr-email" etiqueta="Correo de Dropi" type="email" autoComplete="off" maxLength={254} value={v.email} onChange={set('email')} />
          <Campo id="dr-pass" etiqueta="Contraseña de Dropi" type="password" autoComplete="new-password" maxLength={128} value={v.password} onChange={set('password')} />
          <fieldset style={{ border: '1px solid var(--line2)', borderRadius: 12, padding: '12px 14px', margin: 0 }}>
            <legend className="muted" style={{ fontSize: 13, padding: '0 6px' }}>¿Cómo inicio sesión en Dropi?</legend>
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 8, cursor: 'pointer' }}>
              <input type="radio" name="dr-mode" checked={v.modo === 'otp'} onChange={() => setV((p) => ({ ...p, modo: 'otp' }))} style={{ marginTop: 4 }} />
              <span><b>Con el código de mi autenticador, cuando haga falta</b> <Chip tono="ok">Recomendado</Chip><br /><span className="muted" style={{ fontSize: 13 }}>No guardo la clave de tu autenticador: te pediré el código de 6 dígitos una vez al día al sincronizar.</span></span>
            </label>
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
              <input type="radio" name="dr-mode" checked={v.modo === 'auto'} onChange={() => setV((p) => ({ ...p, modo: 'auto' }))} style={{ marginTop: 4 }} />
              <span><b>Automático</b><br /><span className="muted" style={{ fontSize: 13 }}>Guardo (cifrada) la clave del autenticador y genero los códigos sola. Más cómodo, pero un volcado de la base más la clave de cifrado daría acceso total a tu Dropi.</span></span>
            </label>
          </fieldset>
          {v.modo === 'otp'
            ? <Campo id="dr-otpnow" etiqueta="Código de tu autenticador de Dropi (el de ahora)" ayuda="Se usa una sola vez para comprobar la conexión y no se guarda." inputMode="numeric" autoComplete="one-time-code" maxLength={8} placeholder="123456" value={v.otp} onChange={set('otp')} />
            : <Campo id="dr-totp" etiqueta="Clave del autenticador de Dropi" ayuda="La clave de texto que Dropi muestra junto al código QR al activar el autenticador («¿no puedes escanear el código?»)." type="password" autoComplete="off" maxLength={600} placeholder="Clave de texto (A–Z, 2–7) o enlace otpauth://" value={v.totp} onChange={set('totp')} />}
          <Campo id="dr-card" etiqueta="ID de la tarjeta" ayuda="Aparece en la dirección de la API de movimientos de tu tarjeta: …/list-card-transactions/car_…/1/20" autoComplete="off" maxLength={60} placeholder="car_…" value={v.cardId} onChange={set('cardId')} />
          <hr style={{ border: 0, borderTop: '1px solid var(--line2)', width: '100%' }} />
          <Campo id="dr-app" etiqueta="Tu contraseña de esta app (para confirmar que eres tú)" type="password" autoComplete="current-password" maxLength={128} value={v.appPassword} onChange={set('appPassword')} />
          <Campo id="dr-appcode" etiqueta="Código de tu app autenticadora (solo si activaste la verificación en dos pasos aquí)" inputMode="numeric" autoComplete="one-time-code" maxLength={20} placeholder="123456" value={v.appCode} onChange={set('appCode')} />
          <span className="errm" role="alert">{enviando && !error ? 'Conectando con Dropi… (puede tardar unos segundos)' : error}</span>
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 20, flexWrap: 'wrap' }}>
          <button className="btn" type="submit" disabled={enviando}>Conectar</button>
          <button className="btn ghost" type="button" onClick={onCerrar}>Cancelar</button>
        </div>
      </form>
    </Dialogo>
  )
}

function Resultado({ r }) {
  if (!r) return null
  if (r.error && !r.ok) return <div className="tint bad" role="alert" style={{ marginBottom: 16 }}><b style={{ color: 'var(--coral-ink)' }}>{r.error.message || r.error}</b></div>
  const estados = r.orders && r.orders.estados ? Object.entries(r.orders.estados).sort((a, b) => b[1] - a[1]) : []
  const fallos = [['Saldo de la tarjeta', r.balance], ['Billetera', r.wallet], ['Pedidos', r.orders]].filter(([, x]) => x && x.ok === false && x.error)
  return (
    <div style={{ marginBottom: 16 }}>
      {fallos.length > 0 && <div className="tint bad" role="alert" style={{ marginBottom: 10 }}><b style={{ color: 'var(--coral-ink)' }}>Algo no se pudo leer de Dropi</b>{fallos.map(([n, x]) => <div key={n} style={{ fontSize: 14.5, marginTop: 4 }}><b>{n}:</b> {x.error.message}</div>)}<div className="muted" style={{ fontSize: 13, marginTop: 6 }}>Lo que sí se leyó quedó guardado. Si el mensaje trae un código HTTP, mándamelo y lo ajusto.</div></div>}
      {r.replaced === false && <div className="tint warn" style={{ marginBottom: 10 }}><b style={{ color: 'var(--gold-ink)' }}>No se borró nada: </b>{r.incomplete ? 'Dropi dejó páginas sin leer. Intenta de nuevo.' : 'Dropi no devolvió movimientos.'}</div>}
      <div className="kpis">
        <div className="card"><div className="kpi-l">Tarjeta</div><div className="kpi-v">{r.inserted ?? 0}</div><div className="muted" style={{ fontSize: 13 }}>movimientos nuevos{r.updated ? ` · ${r.updated} actualizados` : ''}{r.window ? ` (${r.window.from} a ${r.window.to})` : ''}</div></div>
        <div className="card"><div className="kpi-l">Saldo de la tarjeta</div><div className="kpi-v">{r.balance && r.balance.ok ? cop(r.balance.amount) : '—'}</div><div className="muted" style={{ fontSize: 13 }}>según Dropi</div></div>
        <div className="card"><div className="kpi-l">Billetera</div><div className="kpi-v">{r.wallet && r.wallet.ok !== false ? (r.wallet.inserted ?? 0) : '—'}</div><div className="muted" style={{ fontSize: 13 }}>movimientos nuevos</div></div>
        <div className="card"><div className="kpi-l">Pedidos</div><div className="kpi-v">{r.orders && r.orders.ok ? r.orders.read : '—'}</div><div className="muted" style={{ fontSize: 13 }}>{r.orders && r.orders.ok ? `${r.orders.inserted} nuevos · ${r.orders.updated} actualizados${r.orders.omitidos ? ` · ${r.orders.omitidos} omitidos (${r.orders.canceladas ? `${r.orders.canceladas} cancelados` : 'anteriores al inicio'})` : ''}` : r.orders && r.orders.error ? r.orders.error.message : ''}</div></div>
      </div>
      {estados.length > 0 && (
        <div className="card" style={{ marginTop: 14 }}>
          <b>Pedidos por estado en Dropi</b>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>{estados.map(([e, n]) => <span key={e} className="chip idle">{e} · {n}</span>)}</div>
          <p className="muted only-learner" style={{ fontSize: 13, margin: '10px 0 0' }}>Así llegan los estados de Dropi. Los agrupo en entregado, devolución, novedad, en tránsito y pendiente; si ves uno que no encaja, avísame.</p>
        </div>
      )}
    </div>
  )
}

export default function ConexionDropi() {
  const router = useRouter()
  const [d, setD] = useState(null)
  const [errorCarga, setErrorCarga] = useState('')
  const [conectar, setConectar] = useState(false)
  const [trabajando, setTrabajando] = useState('')
  const [otp, setOtp] = useState('')
  const [desde, setDesde] = useState('') // fecha elegida (vacía = la guardada)
  const [resultado, setResultado] = useState(null)

  const cargar = useCallback(async () => {
    try { setD(await llamar('GET')); setErrorCarga('') } catch (e) { setErrorCarga(e.message) }
  }, [])
  useEffect(() => { cargar() }, [cargar])

  // «Sincronizar desde»: guarda la fecha (si cambió) y trae tarjeta, billetera y pedidos desde ahí. No borra nada y no duplica lo que ya está.
  async function sincronizar(e) {
    e.preventDefault()
    const fecha = desde || d.opFrom
    if (d.needsOtp && !/^\d{6,8}$/.test(otp)) { setResultado({ error: { message: 'Escribe el código de 6 dígitos de tu autenticador de Dropi para iniciar sesión.' } }); return }
    setResultado(null)
    setTrabajando(`Sincronizando desde el ${diaCorto(fecha)}… (se hace despacio, a propósito)`)
    try {
      if (fecha !== d.opFrom) await llamar('POST', { action: 'set_start', from: fecha })
      setResultado(await llamar('POST', { action: 'sync', historico: true, ...(otp ? { otp } : {}) }))
    } catch (ex) { setResultado({ error: { message: ex.message } }) }
    finally { setOtp(''); setDesde(''); setTrabajando(''); cargar(); router.refresh() } // las listas de abajo se leen en el servidor
  }

  const caja = (hijos) => <div className="card" style={{ marginBottom: 16, display: 'flex', gap: '14px 24px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>{hijos}</div>

  let panel
  if (errorCarga) panel = caja(<><div><b>Dropi</b><div className="muted" style={{ fontSize: 14 }}>{errorCarga}</div></div><button className="btn ghost sm" onClick={cargar}>Reintentar</button></>)
  else if (!d) panel = caja(<div className="muted">Dropi: cargando…</div>)
  else if (!d.connected) {
    panel = caja(<>
      <div style={{ maxWidth: 620 }}><b>Conexión con Dropi</b><div className="muted" style={{ fontSize: 14, marginTop: 2 }}>Trae los movimientos de tu tarjeta, tu billetera y el estado real de tus pedidos (entregado, devolución…) sin subir archivos. Tus credenciales se guardan cifradas y solo se hacen lecturas.</div></div>
      <button className="btn sm" onClick={() => setConectar(true)}><Icono n="plus" size={15} />Conectar Dropi</button>
    </>)
  } else {
    const hay = d.cooldownSeconds > 0
    const puede = d.state !== 'reauth' && !hay && !d.syncing && !trabajando
    const st = d.state === 'reauth' ? <Chip tono="bad">Credenciales rechazadas</Chip>
      : d.state === 'blocked' ? <Chip tono="warn">Dropi nos pausó · espera {espera(d.cooldownSeconds)}</Chip>
      : hay ? <Chip tono="warn">En pausa · {espera(d.cooldownSeconds)}</Chip>
      : d.syncing || trabajando ? <Chip tono="blue">Sincronizando…</Chip>
      : d.needsOtp ? <Chip tono="blue">Escribe tu código para entrar</Chip>
      : <Chip tono="ok">Conectado</Chip>
    panel = caja(<>
      <div style={{ minWidth: 260 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><b>Dropi</b>{st}</div>
        <div className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>Tarjeta {d.cardHint} · última sincronización {hace(d.lastSyncOkAt)}</div>
        {d.lastError && d.state !== 'ok' && <div style={{ fontSize: 13.5, color: 'var(--coral-ink)', marginTop: 2 }}>{d.lastError}</div>}
        {trabajando && <div className="muted" style={{ fontSize: 13.5, marginTop: 4 }} aria-live="polite">{trabajando}</div>}
      </div>
      <form onSubmit={sincronizar} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {d.needsOtp && puede && <div className="inp" style={{ maxWidth: 190 }}><input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={8} placeholder="Código de Dropi" aria-label="Código de 6 dígitos de tu autenticador de Dropi" value={otp} onChange={(e) => setOtp(e.target.value)} /></div>}
        <label htmlFor="op-from" style={{ fontSize: 14, fontWeight: 600 }}>Sincronizar desde</label>
        <div className="inp" style={{ padding: '0 10px' }}><input id="op-from" type="date" min="2020-01-01" max={hoyISO()} required value={desde || d.opFrom || ''} onChange={(e) => setDesde(e.target.value)} style={{ fontSize: 15, padding: '8px 0' }} /></div>
        <button className="btn sm" type="submit" disabled={!puede}>{trabajando ? 'Sincronizando…' : 'Sincronizar'}</button>
      </form>
    </>)
  }

  return (
    <>
      {panel}
      <Resultado r={resultado} />
      {conectar && <DialogoConectar onCerrar={() => setConectar(false)} onListo={() => { setConectar(false); cargar(); router.refresh() }} />}
    </>
  )
}
