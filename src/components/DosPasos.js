'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Dialogo from '@/components/Dialogo'
import CodigoOtp from '@/components/CodigoOtp'
import { diaCorto } from '@/lib/formato'

// Verificación en dos pasos con una app autenticadora (Google Authenticator, Microsoft Authenticator, Authy, 1Password…). Al iniciar sesión se pide, además de la contraseña, el código de 6 dígitos que cambia cada 30 segundos.
async function llamar(method, body) {
  const res = await fetch('/api/auth/2fa', { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'No se pudo completar la acción.')
  return data
}
const Chip = ({ tono, children }) => <span className={'chip ' + tono}>{children}</span>
const MsgError = ({ children }) => <span className="errm" role="alert" style={{ minHeight: 20 }}>{children}</span>

/** Contraseña (+ código) para desactivar o regenerar. */
function Confirmar({ titulo, texto, boton, peligro, accion, onCerrar, onListo }) {
  const [password, setPassword] = useState(''), [code, setCode] = useState('')
  const [error, setError] = useState(''), [ocupado, setOcupado] = useState(false)
  async function enviar(e) {
    e.preventDefault()
    if (!password) { setError('Escribe tu contraseña.'); return }
    if (code.length !== 6) { setError('Escribe el código de 6 dígitos de tu app.'); return }
    setOcupado(true); setError('')
    try { onListo(await llamar('POST', { action: accion, password, code })) } catch (ex) { setError(ex.message); setCode(''); setOcupado(false) }
  }
  return (
    <Dialogo etiqueta={titulo} onCerrar={onCerrar}>
      <form onSubmit={enviar}>
        <h2 style={{ fontSize: 24 }}>{titulo}</h2>
        <p className="muted" style={{ marginTop: 10 }}>{texto}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 18 }}>
          <div className="field"><label htmlFor="dp-pw">Tu contraseña</label><div className="inp"><input id="dp-pw" type="password" autoComplete="current-password" maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} autoFocus /></div></div>
          <div className="field"><label htmlFor="dp-code">Código de tu app autenticadora</label><CodigoOtp id="dp-code" etiqueta="Código de 6 dígitos de tu app autenticadora" value={code} onChange={setCode} disabled={ocupado} /></div>
          <MsgError>{error}</MsgError>
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 18, flexWrap: 'wrap' }}>
          <button className="btn" type="submit" disabled={ocupado} style={peligro ? { background: 'var(--coral-ink)' } : undefined}>{ocupado ? 'Comprobando…' : boton}</button>
          <button className="btn ghost" type="button" onClick={onCerrar}>Cancelar</button>
        </div>
      </form>
    </Dialogo>
  )
}

/** Códigos de recuperación: se muestran UNA vez. Solo se cierra con el botón (no con Escape ni clic fuera) para no perderlos. */
function Recuperacion({ codigos, onCerrar }) {
  const [copiado, setCopiado] = useState(false), [guardado, setGuardado] = useState(false)
  const texto = codigos.join('\n')
  async function copiar() { try { await navigator.clipboard.writeText(texto); setCopiado(true) } catch { setCopiado(false) } }
  function descargar() {
    const url = URL.createObjectURL(new Blob([`Códigos de recuperación de DropFlexAds\nCada uno sirve una sola vez, en lugar del código de tu app.\n\n${texto}\n`], { type: 'text/plain' }))
    const a = document.createElement('a'); a.href = url; a.download = 'codigos-de-recuperacion.txt'; a.click(); URL.revokeObjectURL(url)
  }
  return (
    <Dialogo etiqueta="Códigos de recuperación" onCerrar={() => {}}>
      <h2 style={{ fontSize: 24 }}>Guarda tus códigos de recuperación</h2>
      <p className="muted" style={{ marginTop: 10 }}>Si pierdes o cambias el teléfono, cada uno de estos códigos te deja entrar <b>una sola vez</b> en lugar del código de la app. <b>No se vuelven a mostrar.</b> Guárdalos en un lugar seguro (un gestor de contraseñas o impresos), no en este mismo equipo.</p>
      <ul className="dp-cods" aria-label="Códigos de recuperación">{codigos.map((c) => <li key={c}>{c}</li>)}</ul>
      <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
        <button className="btn" type="button" onClick={copiar}>{copiado ? 'Copiados ✓' : 'Copiar'}</button>
        <button className="btn ghost" type="button" onClick={descargar}>Descargar .txt</button>
      </div>
      <label className="login-rec" style={{ marginTop: 16 }}><input type="checkbox" checked={guardado} onChange={(e) => setGuardado(e.target.checked)} /><span>Ya guardé mis códigos en un lugar seguro.</span></label>
      <div style={{ marginTop: 14 }}><button className="btn" type="button" disabled={!guardado} onClick={onCerrar}>Listo</button></div>
    </Dialogo>
  )
}

/** Activar: 1) contraseña → 2) escanear el QR → 3) escribir el primer código → 4) guardar los códigos de recuperación. */
function Activar({ onCerrar, onListo }) {
  const [paso, setPaso] = useState(1)
  const [password, setPassword] = useState(''), [code, setCode] = useState('')
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(''), [ocupado, setOcupado] = useState(false), [copiada, setCopiada] = useState(false)

  async function empezar(e) {
    e.preventDefault()
    if (!password) { setError('Escribe tu contraseña.'); return }
    setOcupado(true); setError('')
    try { setDatos(await llamar('POST', { action: 'setup', password })); setPaso(2); setPassword('') } catch (ex) { setError(ex.message) } finally { setOcupado(false) }
  }
  async function confirmar(e) {
    e.preventDefault()
    if (code.length !== 6) { setError('Escribe el código de 6 dígitos que muestra tu app.'); return }
    setOcupado(true); setError('')
    try { onListo((await llamar('POST', { action: 'enable', code })).recoveryCodes) } catch (ex) { setError(ex.message); setCode(''); setOcupado(false) }
  }
  async function copiarClave() { try { await navigator.clipboard.writeText(datos.secret); setCopiada(true) } catch { setCopiada(false) } }

  return (
    <Dialogo etiqueta="Activar verificación en dos pasos" onCerrar={onCerrar}>
      <h2 style={{ fontSize: 24 }}>Activar verificación en dos pasos</h2>
      <p className="muted" style={{ marginTop: 6, fontSize: 13.5 }}>Paso {paso} de 3</p>
      {paso === 1 && (
        <form onSubmit={empezar}>
          <p className="muted" style={{ marginTop: 10 }}>Necesitas una app autenticadora en tu teléfono (Google Authenticator, Microsoft Authenticator, Authy, 1Password…). Primero confirma tu contraseña.</p>
          <div className="field" style={{ marginTop: 14 }}><label htmlFor="dp-pw1">Tu contraseña</label><div className="inp"><input id="dp-pw1" type="password" autoComplete="current-password" maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} autoFocus /></div></div>
          <MsgError>{error}</MsgError>
          <div style={{ display: 'flex', gap: 12, marginTop: 14, flexWrap: 'wrap' }}><button className="btn" type="submit" disabled={ocupado}>{ocupado ? 'Comprobando…' : 'Continuar'}</button><button className="btn ghost" type="button" onClick={onCerrar}>Cancelar</button></div>
        </form>
      )}
      {paso === 2 && datos && (
        <div>
          <p style={{ marginTop: 10, fontSize: 14.5 }}>Abre tu app autenticadora, agrega una cuenta y <b>escanea este código QR</b>.</p>
          <div className="dp-qr" role="img" aria-label="Código QR para tu app autenticadora" dangerouslySetInnerHTML={{ __html: datos.qr }} />
          <details style={{ marginTop: 10 }}>
            <summary style={{ cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>¿No puedes escanearlo? Escribe la clave a mano</summary>
            <div className="dp-clave"><code>{datos.secret.replace(/(.{4})/g, '$1 ').trim()}</code><button type="button" className="btn ghost sm" onClick={copiarClave}>{copiada ? 'Copiada ✓' : 'Copiar'}</button></div>
            <p className="muted" style={{ fontSize: 12.5, margin: '6px 0 0' }}>Elige «basada en tiempo» (TOTP) en tu app.</p>
          </details>
          <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}><button className="btn" type="button" onClick={() => { setPaso(3); setError('') }}>Ya lo agregué</button><button className="btn ghost" type="button" onClick={onCerrar}>Cancelar</button></div>
        </div>
      )}
      {paso === 3 && (
        <form onSubmit={confirmar}>
          <p style={{ marginTop: 10, fontSize: 14.5 }}>Escribe el código de 6 dígitos que muestra tu app ahora mismo para comprobar que quedó bien.</p>
          <div className="field" style={{ marginTop: 12 }}><label htmlFor="dp-c3">Código de tu app</label><CodigoOtp id="dp-c3" etiqueta="Código de 6 dígitos de tu app autenticadora" value={code} onChange={setCode} disabled={ocupado} autoFocus /></div>
          <MsgError>{error}</MsgError>
          <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 0' }}>Al activarlo se cierran tus otras sesiones abiertas (esta sigue).</p>
          <div style={{ display: 'flex', gap: 12, marginTop: 14, flexWrap: 'wrap' }}><button className="btn" type="submit" disabled={ocupado || code.length !== 6}>{ocupado ? 'Comprobando…' : 'Activar'}</button><button className="btn ghost" type="button" onClick={() => { setPaso(2); setCode(''); setError('') }}>Volver al QR</button></div>
        </form>
      )}
    </Dialogo>
  )
}

export default function DosPasos() {
  const router = useRouter()
  const [e, setE] = useState(null)
  const [error, setError] = useState('')
  const [dialogo, setDialogo] = useState(null) // 'activar' | 'desactivar' | 'regenerar'
  const [codigos, setCodigos] = useState(null)

  const cargar = useCallback(async () => { try { setE(await llamar('GET')); setError('') } catch (ex) { setError(ex.message) } }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial desde la API
  useEffect(() => { cargar() }, [cargar])
  const listo = () => { setDialogo(null); cargar(); router.refresh() }

  return (
    <section className="card" aria-labelledby="seg-2fa">
      <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ maxWidth: 560 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <b id="seg-2fa" style={{ fontSize: 18 }}>Verificación en dos pasos</b>
            {e && (e.enabled ? <Chip tono="ok">Activada</Chip> : <Chip tono="warn">Desactivada</Chip>)}
          </div>
          <p className="muted" style={{ fontSize: 14, margin: '4px 0 0' }}>Además de tu contraseña, se pide el código de 6 dígitos de una app autenticadora en tu teléfono. Aunque alguien conozca tu contraseña, no puede entrar sin ese código.</p>
          {e && e.enabled && <p className="muted" style={{ fontSize: 13.5, margin: '8px 0 0' }}>Activada el {diaCorto(new Date(e.enabledAt).toISOString().slice(0, 10))} · te quedan <b>{e.recoveryLeft}</b> {e.recoveryLeft === 1 ? 'código de recuperación' : 'códigos de recuperación'}{e.recoveryLeft <= 2 ? '. Genera nuevos pronto.' : '.'}</p>}
        </div>
        <div className="rowbtns">
          {e && !e.enabled && <button className="btn sm" onClick={() => setDialogo('activar')}>Activar</button>}
          {e && e.enabled && <>
            <button className="btn ghost sm" onClick={() => setDialogo('regenerar')}>Códigos de recuperación nuevos</button>
            <button className="btn ghost sm" style={{ color: 'var(--coral-ink)' }} onClick={() => setDialogo('desactivar')}>Desactivar</button>
          </>}
        </div>
      </div>
      {error && <p className="errm" role="alert" style={{ marginTop: 10 }}>{error}</p>}
      {!e && !error && <p className="muted" style={{ marginTop: 12 }}>Cargando…</p>}
      {dialogo === 'activar' && <Activar onCerrar={() => setDialogo(null)} onListo={(c) => { setDialogo(null); setCodigos(c); cargar() }} />}
      {dialogo === 'desactivar' && <Confirmar titulo="Desactivar la verificación en dos pasos" texto="Tu cuenta quedará protegida solo por la contraseña. Se cierran tus otras sesiones y se borran tus códigos de recuperación." boton="Desactivar" peligro accion="disable" onCerrar={() => setDialogo(null)} onListo={listo} />}
      {dialogo === 'regenerar' && <Confirmar titulo="Códigos de recuperación nuevos" texto="Los códigos anteriores dejan de servir. Los nuevos se muestran una sola vez." boton="Generar códigos" accion="recovery" onCerrar={() => setDialogo(null)} onListo={(r) => { setDialogo(null); setCodigos(r.recoveryCodes); cargar() }} />}
      {codigos && <Recuperacion codigos={codigos} onCerrar={() => { setCodigos(null); router.refresh() }} />}
    </section>
  )
}
