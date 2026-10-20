'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'

const num = (s) => Number(String(s).replace(/\D/g, '')) || 0
const miles = (n) => (n ? Number(n).toLocaleString('es-CO') : '')

/** Confirma el presupuesto diario actual de la campaña y la tolerancia al riesgo. Solo cambia el análisis: no toca Meta ni los datos. */
export function ConfigEscalado({ campanaId, presupuesto, confirmado, riesgo }) {
  const router = useRouter()
  const [p, setP] = useState(String(presupuesto))
  const [r, setR] = useState({ perdidaMaxima: String(riesgo.perdidaMaxima), probGanarMin: String(Math.round(riesgo.probGanarMin * 100)), probPerdidaMax: String(Math.round(riesgo.probPerdidaMax * 100)), pasoMax: String(Math.round(riesgo.pasoMax * 100)), esperaDias: String(riesgo.esperaDias) })
  const [error, setError] = useState(''), [ok, setOk] = useState(false), [env, setEnv] = useState(false)
  async function guardar(e) {
    e.preventDefault(); setError(''); setOk(false); setEnv(true)
    try {
      const res = await fetch('/api/escalado', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        presupuestos: { [campanaId]: num(p) },
        riesgo: { perdidaMaxima: num(r.perdidaMaxima), probGanarMin: num(r.probGanarMin) / 100, probPerdidaMax: num(r.probPerdidaMax) / 100, pasoMax: num(r.pasoMax) / 100, esperaDias: num(r.esperaDias) } }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'No se pudo guardar.')
      setOk(true); router.refresh()
    } catch (ex) { setError(ex.message) } finally { setEnv(false) }
  }
  const campo = (id, etiqueta, valor, set, sufijo, prefijo) => (
    <div className="field" style={{ minWidth: 170, flex: '1 1 170px' }}>
      <label htmlFor={id} style={{ fontSize: 13 }}>{etiqueta}</label>
      <div className="inp" style={{ padding: '0 10px' }}>{prefijo && <span className="pre">{prefijo}</span>}<input id={id} type="text" inputMode="numeric" autoComplete="off" value={valor} onChange={(e) => set(e.target.value)} />{sufijo && <span className="muted" style={{ fontSize: 13 }}>{sufijo}</span>}</div>
    </div>
  )
  return (
    <form onSubmit={guardar} className="card" style={{ marginBottom: 16, borderColor: confirmado ? undefined : 'var(--gold-line)' }}>
      {!confirmado && <div style={{ marginBottom: 10 }}><b style={{ color: 'var(--gold-ink)' }}>Confirma tu presupuesto diario actual.</b> <span className="muted">Mientras no lo hagas se usa uno estimado de lo que gastó Meta los últimos días, que puede no ser el que fijaste.</span></div>}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {campo('esc-p', 'Presupuesto diario actual (sin IVA)', miles(num(p)), (v) => setP(String(num(v))), '/día', '$')}
        <button className="btn" type="submit" disabled={env || num(p) < 5000}>{env ? 'Guardando…' : 'Guardar'}</button>
      </div>
      <details className="vz-det" style={{ marginTop: 12 }}>
        <summary>Mi tolerancia al riesgo</summary>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 10 }}>
          {campo('esc-pm', 'Pérdida máxima aceptable en 7 días', miles(num(r.perdidaMaxima)), (v) => setR({ ...r, perdidaMaxima: String(num(v)) }), '', '$')}
          {campo('esc-pg', 'Probabilidad mínima de ganar', r.probGanarMin, (v) => setR({ ...r, probGanarMin: String(num(v)) }), '%')}
          {campo('esc-pp', 'Máximo de probabilidad de perder más que esa cifra', r.probPerdidaMax, (v) => setR({ ...r, probPerdidaMax: String(num(v)) }), '%')}
          {campo('esc-ps', 'Subida máxima por paso', r.pasoMax, (v) => setR({ ...r, pasoMax: String(num(v)) }), '%')}
          {campo('esc-pd', 'Días de espera entre cambios', r.esperaDias, (v) => setR({ ...r, esperaDias: String(num(v)) }), 'días')}
        </div>
        <p className="muted" style={{ fontSize: 13, margin: '10px 0 0' }}>Un presupuesto solo se recomienda si cumple todo: no sube más del máximo por paso, la probabilidad de ganar llega al mínimo, la probabilidad de perder más de la cifra tolerada no pasa del máximo y la billetera sigue cubriendo 7 días de pauta.</p>
      </details>
      {ok && <div role="status" style={{ color: 'var(--jade-ink)', marginTop: 8 }}>Guardado. El análisis ya usa estos valores.</div>}
      {error && <div className="errm" role="alert" style={{ marginTop: 8 }}>{error}</div>}
    </form>
  )
}

/** Compara otro presupuesto: lo añade a la tabla y a las gráficas mediante la dirección (?s=…). */
export function ProbarPresupuesto({ valor }) {
  const router = useRouter(), ruta = usePathname()
  const [v, setV] = useState(valor ? String(valor) : '')
  const ir = (e) => { e.preventDefault(); const n = num(v); router.push(n >= 5000 ? `${ruta}?s=${n}` : ruta, { scroll: false }) }
  return (
    <form onSubmit={ir} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }} className="no-print">
      <div className="field" style={{ minWidth: 210 }}><label htmlFor="esc-s" style={{ fontSize: 13 }}>Probar otro presupuesto diario (sin IVA)</label>
        <div className="inp" style={{ padding: '0 10px' }}><span className="pre">$</span><input id="esc-s" type="text" inputMode="numeric" autoComplete="off" value={miles(num(v))} onChange={(e) => setV(String(num(e.target.value)))} placeholder="Ej: 75.000" /></div></div>
      <button className="btn ghost" type="submit">Calcular</button>
      {valor ? <button className="link" type="button" onClick={() => { setV(''); router.push(ruta, { scroll: false }) }}>Quitar</button> : null}
    </form>
  )
}
