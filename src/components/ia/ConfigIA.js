'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const MODELOS = [['claude-opus-5-5', 'Claude Opus 5.5', 'El más capaz y el recomendado · ≈ US$ 0,05 por consulta'], ['claude-sonnet-5-5', 'Claude Sonnet 5.5', 'Equilibrado · ≈ US$ 0,025 por consulta'], ['claude-haiku-5-5', 'Claude Haiku 5.5', 'El más económico · ≈ US$ 0,002 por consulta']]

/** Clave de Anthropic (se guarda CIFRADA y nunca vuelve a mostrarse), modelo y tope mensual de gasto. */
export default function ConfigIA({ estado }) {
  const router = useRouter()
  const [clave, setClave] = useState(''), [ws, setWs] = useState(estado.workspaceId || ''), [modelo, setModelo] = useState(estado.config.modelo), [tope, setTope] = useState(String(estado.config.topeUsd))
  const [msg, setMsg] = useState(''), [error, setError] = useState(''), [env, setEnv] = useState(false)
  async function api(metodo, ruta, cuerpo) {
    setError(''); setMsg(''); setEnv(true)
    try {
      const res = await fetch(ruta, { method: metodo, headers: cuerpo ? { 'content-type': 'application/json' } : undefined, body: cuerpo ? JSON.stringify(cuerpo) : undefined })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'No se pudo completar.')
      return d
    } catch (e) { setError(e.message); return null } finally { setEnv(false) }
  }
  const guardar = async (e) => {
    e.preventDefault()
    const cuerpo = { workspaceId: ws.trim(), modelo, topeUsd: Number(String(tope).replace(',', '.')) }
    if (clave.trim()) cuerpo.clave = clave.trim()
    const d = await api('PUT', '/api/ia/config', cuerpo)
    if (d) { setClave(''); setMsg(clave.trim() ? 'Clave guardada (cifrada) y configuración al día.' : 'Configuración guardada.'); router.refresh() }
  }
  const probar = async () => { const d = await api('POST', '/api/ia/probar'); if (d) setMsg(`La clave funciona con ${d.modelo}.`); router.refresh() }
  const borrar = async () => { if (!window.confirm('¿Borrar la clave de Anthropic? La IA dejará de funcionar hasta que guardes otra.')) return; const d = await api('DELETE', '/api/ia/config'); if (d) { setMsg('Clave borrada.'); router.refresh() } }
  const u = estado.uso, pct = Math.min(100, Math.round((u.usd / Math.max(0.01, estado.config.topeUsd)) * 100))
  return (
    <form onSubmit={guardar} style={{ maxWidth: 760, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card">
        <b>Qué hace la IA y qué no</b>
        <ul className="muted" style={{ margin: '8px 0 0', paddingLeft: 20, fontSize: 14, display: 'grid', gap: 4 }}>
          <li>Explica tus cifras, da una <b>segunda opinión</b> sobre escalar y responde preguntas de la operación desde la <b>ventana flotante</b> (el botón azul de abajo a la derecha, en todas las pantallas).</li>
          <li><b>No calcula nada:</b> las cifras las calcula el sistema y ella las consulta con herramientas de solo lectura. Cada cifra de su respuesta se contrasta con esos datos; las que no aparecen salen marcadas.</li>
          <li>Solo recibe cifras agregadas de tu operación. <b>Nunca</b> datos de clientes (el sistema ni los guarda).</li>
          <li>No decide ni ejecuta nada, no cambia configuraciones y no da asesoría tributaria.</li>
        </ul>
      </div>

      <div className="card" style={{ display: 'grid', gap: 12 }}>
        <div className="field">
          <label htmlFor="ia-k">Clave de la API de Anthropic {estado.tieneClave && <span className="chip ok" style={{ marginLeft: 8 }}>Guardada {estado.pista}</span>}</label>
          <div className="inp"><input id="ia-k" type="password" autoComplete="off" spellCheck="false" value={clave} onChange={(e) => setClave(e.target.value)} placeholder={estado.tieneClave ? 'Escribe una nueva solo si quieres cambiarla' : 'sk-ant-…'} /></div>
          <span className="muted" style={{ fontSize: 13 }}>Se guarda <b>cifrada</b> (AES-256-GCM) y nunca vuelve a mostrarse. Créala en console.anthropic.com → API keys; conviene una clave solo para esta app.</span>
        </div>
        <div className="field" style={{ maxWidth: 520 }}>
          <label htmlFor="ia-w">Workspace de Anthropic (opcional)</label>
          <div className="inp"><input id="ia-w" type="text" autoComplete="off" spellCheck="false" value={ws} onChange={(e) => setWs(e.target.value)} placeholder="wrkspc_…" /></div>
          <span className="muted" style={{ fontSize: 13 }}>Solo si Anthropic responde «API key is not scoped to a workspace»: pega aquí el ID del workspace (console.anthropic.com → Workspaces). Si creas la clave dentro de un workspace, no hace falta.</span>
        </div>
        <div className="field" style={{ maxWidth: 520 }}>
          <label htmlFor="ia-m">Modelo</label>
          <select id="ia-m" className="sel" value={modelo} onChange={(e) => setModelo(e.target.value)}>{MODELOS.map(([id, n, d]) => <option key={id} value={id}>{n} — {d}</option>)}</select>
        </div>
        <div className="field" style={{ maxWidth: 260 }}>
          <label htmlFor="ia-t">Tope de gasto al mes (US$)</label>
          <div className="inp"><span className="pre">US$</span><input id="ia-t" type="text" inputMode="decimal" value={tope} onChange={(e) => setTope(e.target.value)} /></div>
          <span className="muted" style={{ fontSize: 13 }}>Al llegar al tope la IA se detiene sola hasta el mes siguiente (o hasta que lo subas).</span>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn" type="submit" disabled={env}>{env ? 'Guardando…' : 'Guardar'}</button>
          {estado.tieneClave && <button className="btn ghost" type="button" onClick={probar} disabled={env}>Probar la clave</button>}
          {estado.tieneClave && <button className="btn ghost" type="button" onClick={borrar} disabled={env}>Borrar la clave</button>}
        </div>
        {msg && <span role="status" style={{ color: 'var(--jade-ink)' }}>{msg}</span>}
        {error && <span className="errm" role="alert">{error}</span>}
      </div>

      <div className="card">
        <div className="kpi-l">Gasto de este mes</div>
        <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--mono)' }}>US$ {u.usd.toFixed(2).replace('.', ',')} <span className="muted" style={{ fontSize: 14, fontWeight: 400 }}>de US$ {estado.config.topeUsd}</span></div>
        <div className="vz-prog" style={{ margin: '8px 0' }} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Gasto del mes frente al tope"><div style={{ width: `${pct}%`, background: pct >= 90 ? 'var(--coral)' : pct >= 70 ? 'var(--gold)' : undefined }} /></div>
        <div className="muted" style={{ fontSize: 13 }}>{u.llamadas} consultas · {(u.tokensEntrada + u.tokensSalida).toLocaleString('es-CO')} tokens</div>
      </div>
    </form>
  )
}
