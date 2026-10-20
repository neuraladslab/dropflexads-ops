'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icono } from '@/components/shell/Icono'
import { RespuestaIA } from './RespuestaIA'

// El asistente de IA como ventana flotante, disponible en todas las pantallas. Sabe en cuál estás (solo la dirección, como contexto) para entender «esta campaña» o «este corte».
// La clave NO se escribe aquí: se configura (cifrada) en Configuración → Inteligencia artificial. La conversación se conserva mientras navegas.
const SUGERIDAS = (ruta) => /^\/campanas\/\d+/.test(ruta)
  ? ['¿Esta campaña está lista para escalar?', '¿Cómo van los pedidos de esta campaña?', '¿Cuál es su devolución real?']
  : ruta.startsWith('/contabilidad')
    ? ['¿Cuánto puedo retirar hoy y por qué?', '¿Cómo voy en este corte?', '¿Qué significa «Por cobrar»?']
    : ['¿Cuánto puedo retirar hoy?', '¿Qué tengo que revisar hoy?', '¿Qué pedidos siguen pendientes y cuánto valen?']

export function AsistenteFlotante() {
  const ruta = usePathname() || '/'
  const [abierto, setAbierto] = useState(false), [estado, setEstado] = useState(null)
  const [msgs, setMsgs] = useState([]), [q, setQ] = useState(''), [env, setEnv] = useState(false), [error, setError] = useState('')
  const fin = useRef(null), campo = useRef(null)

  useEffect(() => { // la primera vez que se abre, se pregunta si ya hay clave guardada
    if (!abierto || (estado && estado.tieneClave)) return
    fetch('/api/ia/config').then((r) => r.json()).then((d) => setEstado({ tieneClave: !!d.tieneClave, modelo: d.config && d.config.modelo })).catch(() => setEstado({ tieneClave: false }))
  }, [abierto]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (abierto && campo.current) campo.current.focus() }, [abierto, estado])
  useEffect(() => { const f = (e) => { if (e.key === 'Escape') setAbierto(false) }; if (abierto) { document.addEventListener('keydown', f); return () => document.removeEventListener('keydown', f) } }, [abierto])
  useEffect(() => { if (fin.current) fin.current.scrollIntoView({ block: 'end' }) }, [msgs, env])

  async function enviar(texto) {
    const pregunta = (texto ?? q).trim()
    if (pregunta.length < 3 || env) return
    setError(''); setEnv(true); setQ('')
    const previo = msgs.map((m) => ({ rol: m.rol, texto: m.rol === 'user' ? m.texto : m.r.texto }))
    setMsgs((m) => [...m, { rol: 'user', texto: pregunta }])
    try {
      const res = await fetch('/api/ia', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tipo: 'pregunta', pregunta, historial: previo, pantalla: ruta }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d.ok) { if (d.codigo === 'sin_clave') setEstado({ tieneClave: false }); throw new Error(d.error || 'No se pudo consultar la IA.') }
      setMsgs((m) => [...m, { rol: 'assistant', r: d }])
    } catch (e) { setError(e.message) } finally { setEnv(false) }
  }

  return (
    <div className="no-print">
      {abierto && (
        <section className="ia-panel" role="dialog" aria-label="Asistente de IA">
          <header className="ia-head">
            <b>Asistente de IA</b>
            <span className="muted" style={{ fontSize: 12.5, flex: 1 }}>responde con tus datos</span>
            {msgs.length > 0 && <button className="iconbtn" type="button" aria-label="Nueva conversación" title="Nueva conversación" onClick={() => { setMsgs([]); setError('') }} disabled={env}><Icono n="refresh" size={16} /></button>}
            <button className="iconbtn" type="button" aria-label="Cerrar el asistente" title="Cerrar (Esc)" onClick={() => setAbierto(false)}><Icono n="x" size={16} /></button>
          </header>
          <div className="ia-msgs">
            {estado && !estado.tieneClave ? (
              <div className="tint blue"><b style={{ color: 'var(--blue)' }}>Falta la clave de Anthropic</b><div style={{ fontSize: 14, marginTop: 4 }}>Guárdala (se cifra y nunca vuelve a mostrarse) en <Link href="/configuracion/ia" className="link" onClick={() => setAbierto(false)}>Configuración → Inteligencia artificial</Link>.</div></div>
            ) : (
              <>
                {msgs.length === 0 && (
                  <div>
                    <p className="muted" style={{ fontSize: 13.5, margin: '0 0 10px' }}>Pregunta lo que quieras sobre tus pedidos, tu dinero, tus campañas o escalar. Consulta el sistema (solo lectura) y <b>cada cifra que cita se verifica</b>.</p>
                    <div style={{ display: 'grid', gap: 6 }}>{SUGERIDAS(ruta).map((s) => <button key={s} type="button" className="md-pill" style={{ textAlign: 'left' }} onClick={() => enviar(s)} disabled={env || !estado}>{s}</button>)}</div>
                  </div>
                )}
                {msgs.map((m, i) => m.rol === 'user'
                  ? <div key={i} className="ia-yo">{m.texto}</div>
                  : <RespuestaIA key={i} r={m.r} compacta />)}
                {env && <div className="muted" style={{ fontSize: 13.5 }}>Consultando tus datos… (10–40 s)</div>}
                {error && <div className="errm" role="alert" style={{ fontSize: 13.5 }}>{error}</div>}
              </>
            )}
            <span ref={fin} />
          </div>
          <form className="ia-form" onSubmit={(e) => { e.preventDefault(); enviar() }}>
            <div className="inp" style={{ flex: 1 }}><input ref={campo} type="text" maxLength={600} autoComplete="off" aria-label="Tu pregunta" placeholder="Escribe tu pregunta…" value={q} onChange={(e) => setQ(e.target.value)} disabled={env || (estado && !estado.tieneClave)} /></div>
            <button className="btn" type="submit" disabled={env || q.trim().length < 3 || (estado && !estado.tieneClave)}>Enviar</button>
          </form>
        </section>
      )}
      <button type="button" className="ia-fab" aria-label={abierto ? 'Cerrar el asistente de IA' : 'Abrir el asistente de IA'} aria-expanded={abierto} title="Asistente de IA" onClick={() => setAbierto((v) => !v)}>
        <Icono n={abierto ? 'x' : 'bolt'} size={24} />
      </button>
    </div>
  )
}
