'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Dialogo from '@/components/Dialogo'
import { LIMITES } from '@/domain/copies.ts'

// Los 5 copies de Meta Ads de un creativo (texto principal, título y descripción), escritos por la IA con las fórmulas AIDA y PAS y revisados contra las normas de Meta.
async function llamar(method, id) {
  const res = await fetch(`/api/creativos/${id}/copies`, { method, headers: { 'content-type': 'application/json' }, body: method === 'POST' ? '{}' : undefined })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(data.error || 'No se pudo completar.'), { code: data.code })
  return data
}
const FORMULA = { AIDA: 'Atención → Interés → Deseo → Acción', PAS: 'Problema → Agitación → Solución' }

function Copiar({ texto, etiqueta, children = '⧉' }) {
  const [ok, setOk] = useState(false)
  return <button type="button" className="iconbtn cp-btn" title={etiqueta} aria-label={etiqueta} onClick={async () => { try { await navigator.clipboard.writeText(texto); setOk(true); setTimeout(() => setOk(false), 1500) } catch { /* sin portapapeles */ } }}>{ok ? '✓' : children}</button>
}

function Campo({ nombre, texto, limite }) {
  const largo = [...texto].length, pasa = limite && largo > limite
  return (
    <div className="cp-campo">
      <div className="cp-eti"><span>{nombre}</span>{limite && <span className={pasa ? 'cp-cuenta mal' : 'cp-cuenta'}>{largo}/{limite}</span>}<Copiar texto={texto} etiqueta={`Copiar ${nombre.toLowerCase()}`} /></div>
      <div className="cp-texto">{texto}</div>
    </div>
  )
}

function Tarjeta({ c }) {
  const todo = `${c.principal}\n\nTítulo: ${c.titulo}\nDescripción: ${c.descripcion}`
  return (
    <article className="card cp-card">
      <header className="cp-cab">
        <b>Copy {c.n}</b><span className="chip blue" title={FORMULA[c.formula]}>{c.formula}</span>
        <span className="cp-esp" /><Copiar texto={todo} etiqueta={`Copiar los tres textos del copy ${c.n}`}><span style={{ fontSize: 12.5, fontWeight: 600 }}>Copiar todo</span></Copiar>
      </header>
      <Campo nombre="Texto principal" texto={c.principal} />
      <div className="cp-dos"><Campo nombre="Título" texto={c.titulo} limite={LIMITES.titulo} /><Campo nombre="Descripción" texto={c.descripcion} limite={LIMITES.descripcion} /></div>
      {c.avisos.length > 0 && <div className="tint warn cp-avisos"><b style={{ color: 'var(--gold-ink)' }}>Revísalo antes de usarlo</b><ul>{c.avisos.map((a) => <li key={a}>{a}</li>)}</ul></div>}
    </article>
  )
}

export default function CopiesCreativo({ creativo, autoGenerar = false, onCerrar, onCambio }) {
  const [copies, setCopies] = useState(null), [generando, setGenerando] = useState(false), [error, setError] = useState(null)
  const generar = useCallback(async () => {
    setError(null); setGenerando(true)
    try { const r = await llamar('POST', creativo.id); setCopies(r.copies); if (onCambio) onCambio() } catch (e) { setError({ mensaje: e.message, codigo: e.code }) } finally { setGenerando(false) }
  }, [creativo.id, onCambio])
  useEffect(() => {
    let vivo = true
    llamar('GET', creativo.id).then((r) => { if (!vivo) return; setCopies(r.copies); if (!r.copies.length && autoGenerar) generar() }).catch((e) => { if (vivo) { setCopies([]); setError({ mensaje: e.message, codigo: e.code }) } })
    return () => { vivo = false }
  }, [creativo.id, autoGenerar, generar])
  const hay = copies && copies.length > 0
  return (
    <Dialogo etiqueta="Copies de Meta Ads" onCerrar={onCerrar} ancho={900}>
      <h2 style={{ margin: '0 0 4px' }}>Copies para Meta Ads</h2>
      <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13, wordBreak: 'break-all' }}>{creativo.nombre}</div>
      <div className="muted" style={{ fontSize: 13.5, margin: '2px 0 14px' }}>{creativo.angulo} · {creativo.formato === 'video' ? 'Video' : 'Imagen'}. Escritos con las fórmulas AIDA y PAS y revisados contra las normas de Meta; aun así, léelos antes de publicar.</div>
      <div className="cp-wrap" aria-live="polite">
        {copies === null && <p className="muted">Cargando…</p>}
        {generando && <div className="tint blue"><b style={{ color: 'var(--blue)' }}>Claude está escribiendo tus 5 copies…</b><div style={{ fontSize: 14, marginTop: 2 }}>Tarda cerca de 30 segundos. Puedes dejar esta ventana abierta.</div></div>}
        {error && !generando && (
          <div className="tint warn"><b style={{ color: 'var(--gold-ink)' }}>No se pudieron generar los copies</b><div style={{ fontSize: 14, marginTop: 2 }}>{error.mensaje}</div>
            {(error.codigo === 'sin_clave' || error.codigo === 'tope') && <Link href="/configuracion" className="btn sm" style={{ marginTop: 8, display: 'inline-flex' }}>Ir a Configuración</Link>}</div>
        )}
        {hay && !generando && <div className="cp-lista">{copies.map((c) => <Tarjeta key={c.n} c={c} />)}</div>}
        {copies && !hay && !generando && !error && <p className="muted">Este creativo aún no tiene copies.</p>}
      </div>
      <div className="fbar cp-pie">
        {hay && <span className="muted cp-nota">«Generar otros 5» reemplaza los actuales y cuenta en tu tope mensual de IA.</span>}
        <button className="btn ghost" type="button" onClick={onCerrar}>Cerrar</button>
        <button className="btn" type="button" onClick={generar} disabled={generando || copies === null}>{hay ? 'Generar otros 5' : 'Generar 5 copies'}</button>
      </div>
    </Dialogo>
  )
}
