'use client'

import { useState } from 'react'

// Cambio de contraseña. `obligatorio` = contraseña inicial que puso el superadmin: no se puede usar nada más hasta cambiarla.
// Al cambiarla se cierran todas las sesiones (también esta) y se olvidan los dispositivos recordados: hay que entrar con la nueva.
export default function CambiarClave({ obligatorio = false, email = '' }) {
  const [v, setV] = useState({ current: '', next: '', again: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setV((p) => ({ ...p, [k]: e.target.value }))

  async function enviar(e) {
    e.preventDefault()
    if (busy) return
    if (!v.current || !v.next) { setError('Escribe tu contraseña actual y la nueva.'); return }
    if (v.next !== v.again) { setError('La contraseña nueva y su repetición no coinciden.'); return }
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/auth/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', cache: 'no-store', body: JSON.stringify({ current: v.current, next: v.next }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'No se pudo cambiar la contraseña.'); setV((p) => ({ ...p, current: '' })); return }
      window.location.replace('/login?m=changed')
    } catch { setError('No hay conexión con el servidor. Inténtalo de nuevo.') } finally { setBusy(false) }
  }

  return (
    <form className={obligatorio ? 'login-card' : undefined} onSubmit={enviar} noValidate>
      {obligatorio && <>
        <h1 className="login-title">Cambia tu contraseña</h1>
        <p className="login-help">{email ? <b>{email}</b> : 'Tu cuenta'} se creó con una contraseña inicial que otra persona conoce. Elige una propia para seguir. Después tendrás que iniciar sesión de nuevo.</p>
      </>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="field"><label htmlFor="cc-actual">Contraseña actual</label><div className="inp"><input id="cc-actual" type="password" autoComplete="current-password" maxLength={128} value={v.current} onChange={set('current')} /></div></div>
        <div className="field"><label htmlFor="cc-nueva">Contraseña nueva</label><div className="inp"><input id="cc-nueva" type="password" autoComplete="new-password" maxLength={128} value={v.next} onChange={set('next')} /></div>
          <span className="muted" style={{ fontSize: 13, marginTop: 6, display: 'block' }}>Mínimo 12 caracteres. Una frase larga es más segura que una palabra con símbolos.</span></div>
        <div className="field"><label htmlFor="cc-repite">Repite la contraseña nueva</label><div className="inp"><input id="cc-repite" type="password" autoComplete="new-password" maxLength={128} value={v.again} onChange={set('again')} /></div></div>
        <span className="errm" role="alert" aria-live="assertive">{error}</span>
      </div>
      <button className="btn" type="submit" disabled={busy} style={{ marginTop: 16 }}>{busy ? 'Guardando…' : 'Cambiar contraseña'}</button>
    </form>
  )
}
