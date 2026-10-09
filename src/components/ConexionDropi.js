'use client'

import { useCallback, useEffect, useState } from 'react'

const hace = (ms) => {
  if (!ms) return 'nunca'
  const m = Math.round((Date.now() - ms) / 60000)
  return m < 1 ? 'hace un momento' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} días`
}
const cop = (n) => '$' + Math.round(n).toLocaleString('es-CO')

async function llamar(method, body) {
  const res = await fetch('/api/dropi', { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'No se pudo completar la acción.')
  return data
}

function Campo({ id, etiqueta, ayuda, ...props }) {
  return (
    <div className="field">
      <label htmlFor={id}>{etiqueta}</label>
      <div className="inp"><input id={id} {...props} /></div>
      {ayuda && <span className="muted" style={{ fontSize: 13 }}>{ayuda}</span>}
    </div>
  )
}

function Formulario({ onListo }) {
  const [v, setV] = useState({ email: '', password: '', cardId: '', modo: 'otp', otp: '', totp: '', appPassword: '', appCode: '' })
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const set = (k) => (e) => setV((p) => ({ ...p, [k]: e.target.value }))

  async function conectar(e) {
    e.preventDefault()
    setError('')
    setEnviando(true)
    try {
      await llamar('POST', {
        action: 'connect', email: v.email, password: v.password, cardId: v.cardId, appPassword: v.appPassword, appCode: v.appCode,
        ...(v.modo === 'auto' ? { totp: v.totp } : { otp: v.otp }),
      })
      setV((p) => ({ ...p, password: '', otp: '', totp: '', appPassword: '', appCode: '' })) // nada sensible queda en pantalla
      onListo()
    } catch (ex) {
      setError(ex.message)
      setV((p) => ({ ...p, otp: '', appPassword: '', appCode: '' }))
    } finally { setEnviando(false) }
  }

  return (
    <form className="card" style={{ maxWidth: 720 }} onSubmit={conectar}>
      <span className="chip idle">Sin conectar</span>
      <h2 style={{ margin: '12px 0 6px' }}>Conectar Dropi</h2>
      <p className="muted" style={{ marginTop: 0 }}>Se hace <b>un solo inicio de sesión</b> y se reutiliza hasta que venza (unas 12 horas), a un ritmo parecido al de la propia página de Dropi. Solo se leen movimientos y pedidos: no se cambia nada en tu cuenta. Las credenciales se guardan <b>cifradas</b> y nunca vuelven al navegador.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 18 }}>
        <Campo id="dr-email" etiqueta="Correo de Dropi" type="email" autoComplete="off" maxLength={254} value={v.email} onChange={set('email')} />
        <Campo id="dr-pass" etiqueta="Contraseña de Dropi" type="password" autoComplete="new-password" maxLength={128} value={v.password} onChange={set('password')} />
        <fieldset style={{ border: '1px solid var(--line2)', borderRadius: 12, padding: '12px 14px', margin: 0 }}>
          <legend className="muted" style={{ fontSize: 13, padding: '0 6px' }}>¿Cómo inicio sesión en Dropi?</legend>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 8, cursor: 'pointer' }}>
            <input type="radio" name="modo" checked={v.modo === 'otp'} onChange={() => setV((p) => ({ ...p, modo: 'otp' }))} style={{ marginTop: 4 }} />
            <span><b>Con el código de mi autenticador, cuando haga falta</b> <span className="chip ok" style={{ marginLeft: 6 }}>Recomendado</span><br /><span className="muted" style={{ fontSize: 13 }}>No guardo la clave de tu autenticador: te pediré el código de 6 dígitos una vez al día al sincronizar.</span></span>
          </label>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
            <input type="radio" name="modo" checked={v.modo === 'auto'} onChange={() => setV((p) => ({ ...p, modo: 'auto' }))} style={{ marginTop: 4 }} />
            <span><b>Automático</b><br /><span className="muted" style={{ fontSize: 13 }}>Guardo (cifrada) la clave del autenticador y genero los códigos sola. Más cómodo, pero un volcado de la base más la clave de cifrado daría acceso total a tu Dropi.</span></span>
          </label>
        </fieldset>
        {v.modo === 'otp'
          ? <Campo id="dr-otp" etiqueta="Código de tu autenticador de Dropi (el de ahora)" ayuda="Se usa una sola vez para comprobar la conexión y no se guarda." inputMode="numeric" autoComplete="one-time-code" maxLength={8} placeholder="123456" value={v.otp} onChange={set('otp')} />
          : <Campo id="dr-totp" etiqueta="Clave del autenticador de Dropi" ayuda="La clave de texto que Dropi muestra junto al código QR al activar el autenticador." type="password" autoComplete="off" maxLength={600} placeholder="Clave (A–Z, 2–7) o enlace otpauth://" value={v.totp} onChange={set('totp')} />}
        <Campo id="dr-card" etiqueta="ID de la tarjeta" ayuda="Aparece en la dirección de la API de movimientos de tu tarjeta: …/list-card-transactions/car_…/1/20" autoComplete="off" maxLength={60} placeholder="car_…" value={v.cardId} onChange={set('cardId')} />
        <hr style={{ border: 0, borderTop: '1px solid var(--line2)', width: '100%' }} />
        <Campo id="dr-app" etiqueta="Tu contraseña de esta app (para confirmar que eres tú)" type="password" autoComplete="current-password" maxLength={128} value={v.appPassword} onChange={set('appPassword')} />
        <Campo id="dr-appcode" etiqueta="Código de tu app autenticadora (solo si activaste la verificación en dos pasos aquí)" inputMode="numeric" autoComplete="one-time-code" maxLength={20} placeholder="123456" value={v.appCode} onChange={set('appCode')} />
        {error && <div className="tint bad" role="alert"><b style={{ color: 'var(--coral-ink)' }}>{error}</b></div>}
      </div>
      <button className="btn" type="submit" disabled={enviando} style={{ marginTop: 20 }}>{enviando ? 'Conectando con Dropi… (puede tardar unos segundos)' : 'Conectar'}</button>
    </form>
  )
}

function Resultado({ r }) {
  if (!r) return null
  if (r.error && !r.ok) return <div className="tint bad" role="alert" style={{ marginTop: 14 }}><b style={{ color: 'var(--coral-ink)' }}>{r.error.message || r.error}</b></div>
  const estados = r.orders && r.orders.estados ? Object.entries(r.orders.estados).sort((a, b) => b[1] - a[1]) : []
  return (
    <div style={{ marginTop: 16 }}>
      {r.replaced === false && <div className="tint warn" style={{ marginBottom: 10 }}><b style={{ color: 'var(--gold-ink)' }}>No se borró nada: </b>{r.incomplete ? 'Dropi dejó páginas sin leer. Intenta de nuevo.' : 'Dropi no devolvió movimientos.'}</div>}
      <div className="kpis">
        <div className="card"><div className="kpi-l">Tarjeta</div><div className="kpi-v">{r.inserted ?? 0}</div><div className="muted" style={{ fontSize: 13 }}>movimientos nuevos{r.updated ? ` · ${r.updated} actualizados` : ''}{r.window ? ` (${r.window.from} a ${r.window.to})` : ''}</div></div>
        <div className="card"><div className="kpi-l">Saldo de la tarjeta</div><div className="kpi-v">{r.balance && r.balance.ok ? cop(r.balance.amount) : '—'}</div><div className="muted" style={{ fontSize: 13 }}>según Dropi</div></div>
        <div className="card"><div className="kpi-l">Billetera</div><div className="kpi-v">{r.wallet && r.wallet.ok !== false ? (r.wallet.inserted ?? 0) : '—'}</div><div className="muted" style={{ fontSize: 13 }}>movimientos nuevos</div></div>
        <div className="card"><div className="kpi-l">Pedidos</div><div className="kpi-v">{r.orders && r.orders.ok ? r.orders.read : '—'}</div><div className="muted" style={{ fontSize: 13 }}>{r.orders && r.orders.ok ? `${r.orders.inserted} nuevos · ${r.orders.updated} actualizados` : r.orders && r.orders.error ? r.orders.error.message : ''}</div></div>
      </div>
      {estados.length > 0 && (
        <div className="card" style={{ marginTop: 14 }}>
          <b>Pedidos por estado en Dropi</b>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            {estados.map(([e, n]) => <span key={e} className="chip idle">{e} · {n}</span>)}
          </div>
          <p className="muted" style={{ fontSize: 13, margin: '10px 0 0' }}>Así llegan los estados de Dropi. Los agrupo en entregado, devolución, novedad, en tránsito y pendiente; si ves uno que no encaja, avísame.</p>
        </div>
      )}
    </div>
  )
}

export default function ConexionDropi() {
  const [estado, setEstado] = useState(null)
  const [errorCarga, setErrorCarga] = useState('')
  const [trabajando, setTrabajando] = useState('')
  const [otp, setOtp] = useState('')
  const [resultado, setResultado] = useState(null)
  const [desconectando, setDesconectando] = useState(false)
  const [conf, setConf] = useState({ appPassword: '', appCode: '', error: '' })

  const cargar = useCallback(async () => {
    try { setEstado(await llamar('GET')); setErrorCarga('') } catch (e) { setErrorCarga(e.message) }
  }, [])
  useEffect(() => { cargar() }, [cargar])

  async function accion(nombre, textoEspera) {
    if (nombre === 'reset_card' && !window.confirm('Se BORRARÁN los movimientos guardados de la tarjeta y se volverán a traer desde Dropi desde el 21 de septiembre de 2026.\n\nSi Dropi falla o no trae movimientos, no se borra nada. ¿Continuar?')) return
    if (estado && estado.needsOtp && !/^\d{6,8}$/.test(otp)) { setResultado({ error: { message: 'Escribe el código de 6 dígitos de tu autenticador de Dropi para iniciar sesión.' } }); return }
    setTrabajando(textoEspera); setResultado(null)
    try {
      setResultado(await llamar('POST', { action: nombre, ...(otp ? { otp } : {}) }))
    } catch (e) { setResultado({ error: { message: e.message } }) } finally { setOtp(''); setTrabajando(''); cargar() }
  }

  async function desconectar(e) {
    e.preventDefault()
    setConf((c) => ({ ...c, error: '' }))
    try { await llamar('POST', { action: 'disconnect', appPassword: conf.appPassword, appCode: conf.appCode }); setDesconectando(false); setResultado(null); setConf({ appPassword: '', appCode: '', error: '' }); cargar() }
    catch (ex) { setConf((c) => ({ ...c, appPassword: '', appCode: '', error: ex.message })) }
  }

  if (errorCarga) return <div className="card" style={{ maxWidth: 720 }}><b>Dropi</b><p className="muted">{errorCarga}</p><button className="btn ghost" onClick={cargar}>Reintentar</button></div>
  if (!estado) return <div className="card" style={{ maxWidth: 720 }}><span className="muted">Cargando…</span></div>
  if (!estado.connected) return <Formulario onListo={cargar} />

  const espera = estado.cooldownSeconds > 0
  const puede = estado.state !== 'reauth' && !espera && !estado.syncing && !trabajando
  const chip = estado.state === 'reauth' ? <span className="chip bad">Credenciales rechazadas</span>
    : estado.state === 'blocked' ? <span className="chip warn">Dropi nos pausó · espera {Math.ceil(estado.cooldownSeconds / 60)} min</span>
    : espera ? <span className="chip warn">En pausa · {Math.ceil(estado.cooldownSeconds / 60)} min</span>
    : estado.syncing ? <span className="chip blue">Sincronizando…</span>
    : estado.needsOtp ? <span className="chip blue">Escribe tu código para entrar</span>
    : <span className="chip ok">Conectado</span>

  return (
    <div style={{ maxWidth: 980 }}>
      <div className="card">
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><b style={{ fontSize: 18 }}>Dropi</b>{chip}</div>
        <p className="muted" style={{ margin: '6px 0 0', fontSize: 14 }}>Tarjeta {estado.cardHint} · cuenta {estado.emailHint} · última sincronización {hace(estado.lastSyncOkAt)} · {estado.mode === 'otp' ? 'código a mano (no guardo la clave de tu autenticador)' : 'código automático'}</p>
        {estado.lastError && estado.state !== 'ok' && <p style={{ color: 'var(--coral-ink)', fontSize: 14, margin: '6px 0 0' }}>{estado.lastError}</p>}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 16 }}>
          {estado.needsOtp && puede && <div className="inp" style={{ maxWidth: 200 }}><input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={8} placeholder="Código de Dropi" aria-label="Código de 6 dígitos de tu autenticador de Dropi" value={otp} onChange={(e) => setOtp(e.target.value)} /></div>}
          <button className="btn" disabled={!puede} onClick={() => accion('sync', 'Sincronizando con Dropi… (se hace despacio, a propósito)')}>{trabajando.startsWith('Sincronizando') ? 'Sincronizando…' : 'Sincronizar ahora'}</button>
          <button className="btn ghost" disabled={!puede} onClick={() => accion('reset_card', 'Trayendo la tarjeta completa desde el 21 de septiembre… (puede tardar un minuto)')} title="Borra los movimientos guardados de la tarjeta y los vuelve a traer desde el 21 de septiembre">Reiniciar tarjeta desde el 21 de sept.</button>
          <button className="btn ghost" style={{ color: 'var(--coral-ink)', borderColor: '#FECACA' }} onClick={() => setDesconectando((v) => !v)}>Desconectar</button>
        </div>
        {trabajando && <p className="muted" style={{ fontSize: 14, margin: '12px 0 0' }} aria-live="polite">{trabajando}</p>}
        {desconectando && (
          <form onSubmit={desconectar} style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--line)', maxWidth: 420 }}>
            <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>Se borran de aquí tus credenciales y la sesión de Dropi. Lo que ya trajiste se queda. Confirma que eres tú:</p>
            <Campo id="dd-app" etiqueta="Tu contraseña de esta app" type="password" autoComplete="current-password" value={conf.appPassword} onChange={(e) => setConf((c) => ({ ...c, appPassword: e.target.value }))} />
            <div style={{ height: 12 }} />
            <Campo id="dd-code" etiqueta="Código de tu app autenticadora (si lo activaste)" inputMode="numeric" autoComplete="one-time-code" maxLength={20} value={conf.appCode} onChange={(e) => setConf((c) => ({ ...c, appCode: e.target.value }))} />
            {conf.error && <div className="tint bad" role="alert" style={{ marginTop: 10 }}><b style={{ color: 'var(--coral-ink)' }}>{conf.error}</b></div>}
            <button className="btn" type="submit" style={{ marginTop: 12 }}>Desconectar Dropi</button>
          </form>
        )}
        <Resultado r={resultado} />
      </div>
    </div>
  )
}
