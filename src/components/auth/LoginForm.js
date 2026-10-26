'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function LoginForm({ next, notice, agregar = false, recordadas = [] }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ticket, setTicket] = useState('') // segundo paso: llega tras acertar la contraseña (vale 5 minutos)
  const [code, setCode] = useState('')
  const [remember, setRemember] = useState(false)
  const [lista, setLista] = useState(recordadas) // cuentas recordadas en este navegador (entrar sin contraseña)
  const [otra, setOtra] = useState(false) // «usar otra cuenta»

  async function submit(e) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const second = !!ticket
      const res = await fetch(second ? '/api/auth/login/2fa' : '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify(second ? { ticket, code, remember } : { email, password, remember }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.twoFactor && data.ticket) {
        setPassword('')
        setTicket(data.ticket)
        return
      }
      if (res.ok) {
        setPassword('')
        setCode('')
        window.location.replace(next) // navegación completa: estado limpio y sin datos de otra sesión
        return
      }
      setPassword('')
      setCode('')
      if (second && (data.code === 'mfa_expired')) setTicket('') // venció: vuelve a pedir la contraseña
      setError(data.error || 'No se pudo iniciar sesión.')
    } catch {
      setError('No hay conexión con el servidor. Inténtalo de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  async function dispositivo(accion, id) {
    if (busy) return
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/auth/dispositivo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', cache: 'no-store', body: JSON.stringify({ action: accion, id }) })
      const data = await res.json().catch(() => ({}))
      if (accion === 'resume' && res.ok) { window.location.replace(next); return }
      if (accion === 'forget' && res.ok) { setLista((l) => l.filter((c) => c.id !== id)); return }
      if (data.code === 'device') setLista((l) => l.filter((c) => c.id !== id))
      setError(data.error || 'No se pudo completar la acción.')
    } catch {
      setError('No hay conexión con el servidor. Inténtalo de nuevo.')
    } finally { setBusy(false) }
  }

  const elegir = lista.length > 0 && !otra && !ticket
  if (elegir) {
    return (
      <div className="login-card">
        <div className="login-brand">
          <div className="brand-mark"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></svg></div>
          <div><div className="login-name">DropFlexAds</div><div className="login-sub">Colombia Ops</div></div>
        </div>
        <h1 className="login-title">¿Quién entra?</h1>
        {notice ? <div className="login-notice" role="status">{notice}</div> : null}
        <p className="login-help">Estas cuentas están recordadas en este equipo: entras con un clic, sin contraseña.</p>
        <div style={{ display: 'grid', gap: 10 }}>
          {lista.map((c) => (
            <div key={c.id} className="login-cta">
              <button type="button" className="btn ghost wide login-cta-b" disabled={busy} onClick={() => dispositivo('resume', c.id)}>
                <span style={{ overflowWrap: 'anywhere' }}><b>{c.email}</b>{c.empresa ? <span className="muted" style={{ display: 'block', fontSize: 13 }}>{c.empresa}</span> : null}</span>
              </button>
              <button type="button" className="login-eye" disabled={busy} onClick={() => dispositivo('forget', c.id)} title="Dejar de recordar esta cuenta en este equipo">Olvidar</button>
            </div>
          ))}
        </div>
        <div className="errm login-error" role="alert" aria-live="assertive">{busy && !error ? 'Entrando…' : error}</div>
        <button type="button" className="login-eye" onClick={() => { setOtra(true); setError('') }}>Usar otra cuenta con contraseña</button>
      </div>
    )
  }

  return (
    <form className="login-card" onSubmit={submit} noValidate>
      <div className="login-brand">
        <div className="brand-mark">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7" />
            <circle cx="7" cy="18" r="2" />
            <circle cx="17" cy="18" r="2" />
          </svg>
        </div>
        <div>
          <div className="login-name">DropFlexAds</div>
          <div className="login-sub">Colombia Ops</div>
        </div>
      </div>
      <h1 className="login-title">{ticket ? 'Verificación en dos pasos' : 'Inicia sesión'}</h1>
      {notice ? <div className="login-notice" role="status">{notice}</div> : null}
      {agregar && !ticket ? <div className="login-notice" role="status">Vas a abrir otra cuenta. La que tienes abierta sigue activa y podrás cambiar entre ellas desde el menú. <Link href="/" style={{ textDecoration: 'underline' }}>Cancelar</Link></div> : null}

      {ticket ? (
        <>
          <p className="muted" style={{ margin: '0 0 14px' }}>Escribe el código de 6 dígitos de tu app autenticadora. Si perdiste el teléfono, usa un código de recuperación.</p>
          <div className="field">
            <label htmlFor="login-code">Código</label>
            <div className="inp">
              <input id="login-code" type="text" name="one-time-code" autoComplete="one-time-code" inputMode="text" autoCapitalize="characters" spellCheck={false} maxLength={20} required autoFocus value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
          </div>
        </>
      ) : (
        <>
      <div className="field">
        <label htmlFor="login-email">Correo</label>
        <div className="inp">
          <input id="login-email" type="email" name="email" autoComplete="username" inputMode="email" autoCapitalize="none" spellCheck={false} maxLength={254} required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="login-password">Contraseña</label>
        <div className="inp">
          <input id="login-password" type={show ? 'text' : 'password'} name="password" autoComplete="current-password" autoCapitalize="none" spellCheck={false} maxLength={128} required value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="button" className="login-eye" onClick={() => setShow((v) => !v)} aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={show}>
            {show ? 'Ocultar' : 'Mostrar'}
          </button>
        </div>
      </div>

      <label className="login-rec">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        <span><b>Recordar este dispositivo</b><span className="muted" style={{ display: 'block', fontSize: 13 }}>Solo en tu equipo personal: la próxima vez entras con un clic. Puedes olvidarlo cuando quieras en Seguridad.</span></span>
      </label>
        </>
      )}

      <div className="errm login-error" role="alert" aria-live="assertive">{error}</div>
      <button className="btn wide" type="submit" disabled={busy || (ticket ? !code.trim() : !email || !password)}>{busy ? 'Verificando…' : ticket ? 'Verificar' : 'Entrar'}</button>
      {ticket ? <button type="button" className="login-eye" style={{ marginTop: 10 }} onClick={() => { setTicket(''); setCode(''); setError('') }}>Volver</button> : null}
      {!ticket && lista.length > 0 ? <button type="button" className="login-eye" style={{ marginTop: 10 }} onClick={() => { setOtra(false); setError('') }}>Volver a las cuentas recordadas</button> : null}
    </form>
  )
}
