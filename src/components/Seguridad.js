'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import CambiarClave from '@/components/auth/CambiarClave'
import DosPasos from '@/components/DosPasos'
import Dialogo from '@/components/Dialogo'
import { hace } from '@/lib/formato'

// Seguridad de la cuenta: contraseña y dispositivos recordados (entrar sin escribir la contraseña desde un equipo personal; se pueden eliminar cuando no hagan falta).
async function llamar(method, body) {
  const res = await fetch('/api/auth/dispositivos', { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'No se pudo completar la acción.')
  return data
}

function DialogoRecordar({ onCerrar, onListo }) {
  const [v, setV] = useState({ appPassword: '', appCode: '' })
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  async function enviar(e) {
    e.preventDefault()
    if (!v.appPassword) { setError('Escribe tu contraseña.'); return }
    setEnviando(true); setError('')
    try { await llamar('POST', { action: 'remember', ...v }); onListo() } catch (ex) { setError(ex.message); setEnviando(false) }
  }
  return (
    <Dialogo etiqueta="Recordar este dispositivo" onCerrar={onCerrar}>
      <form onSubmit={enviar}>
        <h2 style={{ fontSize: 24 }}>Recordar este dispositivo</h2>
        <p className="muted" style={{ marginTop: 12 }}>La próxima vez entrarás con un clic, sin escribir la contraseña. Hazlo solo en tu equipo personal: quien use este navegador podrá entrar a tu cuenta. Para cambios delicados (conectar Dropi o Meta) se te seguirá pidiendo la contraseña.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 18 }}>
          <div className="field"><label htmlFor="rd-app">Tu contraseña (para confirmar que eres tú)</label><div className="inp"><input id="rd-app" type="password" autoComplete="current-password" maxLength={128} value={v.appPassword} onChange={(e) => setV((p) => ({ ...p, appPassword: e.target.value }))} /></div></div>
          <div className="field"><label htmlFor="rd-code">Código de tu app autenticadora (solo si activaste los dos pasos)</label><div className="inp"><input id="rd-code" inputMode="numeric" autoComplete="one-time-code" maxLength={20} placeholder="123456" value={v.appCode} onChange={(e) => setV((p) => ({ ...p, appCode: e.target.value }))} /></div></div>
          <span className="errm" role="alert">{error}</span>
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 20, flexWrap: 'wrap' }}>
          <button className="btn" type="submit" disabled={enviando}>Recordar</button>
          <button className="btn ghost" type="button" onClick={onCerrar}>Cancelar</button>
        </div>
      </form>
    </Dialogo>
  )
}

export default function Seguridad({ email, puedeRecordar }) {
  const router = useRouter()
  const [lista, setLista] = useState(null)
  const [error, setError] = useState('')
  const [dialogo, setDialogo] = useState(false)
  const [trabajando, setTrabajando] = useState('')

  const cargar = useCallback(async () => { try { setLista((await llamar('GET')).dispositivos); setError('') } catch (ex) { setError(ex.message) } }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial desde la API
  useEffect(() => { cargar() }, [cargar])

  async function olvidar(accion, id) {
    setTrabajando(id || 'todos'); setError('')
    try { await llamar('POST', { action: accion, id }); await cargar(); router.refresh() } catch (ex) { setError(ex.message) } finally { setTrabajando('') }
  }
  const aqui = lista && lista.some((d) => d.actual)

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <section className="card" aria-labelledby="seg-clave">
        <b id="seg-clave" style={{ fontSize: 18 }}>Contraseña</b>
        <p className="muted" style={{ fontSize: 14, margin: '4px 0 14px' }}>{email}. Al cambiarla se cierran todas tus sesiones y se olvidan tus dispositivos recordados.</p>
        <CambiarClave />
      </section>

      <DosPasos />

      <section className="card" aria-labelledby="seg-disp">
        <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ maxWidth: 560 }}>
            <b id="seg-disp" style={{ fontSize: 18 }}>Dispositivos recordados</b>
            <p className="muted" style={{ fontSize: 14, margin: '4px 0 0' }}>Equipos desde los que entras con un clic, sin escribir la contraseña. Elimina los que ya no uses o no sean tuyos.</p>
          </div>
          <div className="rowbtns">
            {puedeRecordar && lista && !aqui && <button className="btn sm" onClick={() => setDialogo(true)}>Recordar este dispositivo</button>}
            {lista && lista.length > 1 && <button className="btn ghost sm" disabled={!!trabajando} onClick={() => olvidar('forget_all')} style={{ color: 'var(--coral-ink)' }}>Eliminar todos</button>}
          </div>
        </div>
        {error && <p className="errm" role="alert" style={{ marginTop: 10 }}>{error}</p>}
        {!lista && !error && <p className="muted" style={{ marginTop: 12 }}>Cargando…</p>}
        {lista && lista.length === 0 && <p className="muted" style={{ marginTop: 12 }}>No hay dispositivos recordados. {puedeRecordar ? 'Puedes recordar este con el botón de arriba.' : 'Cambia tu contraseña inicial para poder recordar dispositivos.'}</p>}
        {lista && lista.map((d) => (
          <div key={d.id} className="seg-fila">
            <div>
              <b>{d.etiqueta}</b> {d.actual && <span className="chip ok">Este dispositivo</span>}
              <div className="muted" style={{ fontSize: 13 }}>Recordado {hace(d.creado)} · último uso {hace(d.ultimoUso)}</div>
            </div>
            <button className="btn ghost sm" disabled={!!trabajando} onClick={() => olvidar('forget', d.id)} style={{ color: 'var(--coral-ink)' }}>Eliminar</button>
          </div>
        ))}
      </section>
      {dialogo && <DialogoRecordar onCerrar={() => setDialogo(false)} onListo={() => { setDialogo(false); cargar(); router.refresh() }} />}
    </div>
  )
}
