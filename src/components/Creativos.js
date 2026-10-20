'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Dialogo from '@/components/Dialogo'
import { cop, fmtN, diaCorto } from '@/lib/formato'
import Ayuda from '@/components/Ayuda'
import { ESTADOS, FORMATOS, LECTURA, nombreCreativo, siguienteVersion } from '@/domain/creativos.ts'

// Creativos: el nombre único (el mismo en esta app, en Meta y en Drive), el estado y una lectura de cuál funciona, cuál se está probando y cuál conviene refrescar.
async function api(method, url, body) {
  const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'No se pudo guardar.')
  return data
}
const ETIQUETA = {
  funciona: { texto: 'Funciona', tono: 'ok' }, regular: { texto: 'Regular', tono: 'idle' }, refrescar: { texto: 'Refrescar', tono: 'bad' },
  probando: { texto: 'Probando', tono: 'blue' }, sin_datos: { texto: 'Sin datos', tono: 'idle' },
}
const pp = (n) => Math.round(n * 100)
const AYUDA_LECTURA = `Compara cada creativo con los demás de su campaña, con el gasto de Meta por anuncio. «Probando»: aún gastó menos de ${cop(LECTURA.gastoMinimo)}, o no tiene compras y gastó menos de ${cop(LECTURA.gastoSinCompras)}. «Funciona»: su costo por compra (o por clic, si Meta no reporta compras) es ${pp(1 - LECTURA.mejorQuePares)} % mejor que el promedio de la campaña. «Refrescar»: el CTR bajó ${pp(LECTURA.caidaCtr)} % o más entre sus primeros y sus últimos ${LECTURA.ventanaDias} días, el costo por clic subió ${pp(LECTURA.subidaCpc)} % o más, o cuesta ${pp(LECTURA.peorQuePares - 1)} % más que el promedio. «Regular»: ni destaca ni falla. Es una guía con tus datos, no una promesa.`
const pct1 = (v) => (v == null ? '—' : (Math.round(v * 1000) / 10).toLocaleString('es-CO') + ' %')

function Copiar({ texto }) {
  const [ok, setOk] = useState(false)
  return <button type="button" className="iconbtn" title="Copiar el nombre" aria-label={`Copiar el nombre ${texto}`} onClick={async () => { try { await navigator.clipboard.writeText(texto); setOk(true); setTimeout(() => setOk(false), 1500) } catch { /* sin portapapeles */ } }}>{ok ? '✓' : '⧉'}</button>
}

function Nuevo({ d, onCerrar, campanaFija }) {
  const router = useRouter()
  const [campanaId, setCampanaId] = useState(campanaFija || d.campanas.find((c) => c.activa)?.id || d.campanas[0]?.id || '')
  const [angulo, setAngulo] = useState(''), [formato, setFormato] = useState('video'), [fecha, setFecha] = useState(d.hoy), [drive, setDrive] = useState(''), [gancho, setGancho] = useState('')
  const [error, setError] = useState(''), [env, setEnv] = useState(false)
  const camp = d.campanas.find((c) => c.id === campanaId)
  const previos = d.creativos.map((c) => ({ campana: c.campana, angulo: c.angulo, formato: c.formato, version: c.version }))
  const version = camp && angulo.trim() ? siguienteVersion(previos, { campana: camp.nombre, angulo, formato }) : 1
  const nombre = camp ? nombreCreativo({ campana: camp.nombre, angulo, formato, version, fecha }) : null
  const sugeridos = d.angulosPorCampana[campanaId] || []
  async function crear(e) {
    e.preventDefault(); setError(''); setEnv(true)
    try { await api('POST', '/api/creativos', { campanaId, angulo, formato, fecha, driveUrl: drive, gancho }); router.refresh(); onCerrar() } catch (ex) { setError(ex.message) } finally { setEnv(false) }
  }
  return (
    <Dialogo etiqueta="Nuevo creativo" onCerrar={onCerrar}>
      <h2 style={{ margin: '0 0 14px' }}>Nuevo creativo</h2>
      <form onSubmit={crear} className="fgrid" style={{ minWidth: 'min(540px, 80vw)' }}>
        <div className="field full"><label htmlFor="cr-c">Campaña</label>
          <select id="cr-c" className="sel" value={campanaId} onChange={(e) => setCampanaId(e.target.value)} disabled={!!campanaFija}>{d.campanas.map((c) => <option key={c.id} value={c.id}>{c.nombre}{c.activa ? '' : ' (inactiva)'}</option>)}</select></div>
        <div className="field full"><label htmlFor="cr-a">Ángulo</label>
          <div className="inp"><input id="cr-a" type="text" list="cr-angulos" maxLength={60} autoComplete="off" value={angulo} onChange={(e) => setAngulo(e.target.value)} placeholder="Ej.: dolor de cuello" /></div>
          <datalist id="cr-angulos">{sugeridos.map((a) => <option key={a} value={a} />)}</datalist>
          <span className="hint">{sugeridos.length ? 'Sugeridos: los que ya usaste en esta campaña.' : 'Cada producto tiene sus ángulos: escríbelo como lo llamas tú.'}</span></div>
        <div className="field"><label htmlFor="cr-f">Formato</label><select id="cr-f" className="sel" value={formato} onChange={(e) => setFormato(e.target.value)}>{Object.entries(FORMATOS).map(([k, v]) => <option key={k} value={k}>{v.nombre}</option>)}</select></div>
        <div className="field"><label htmlFor="cr-d">Fecha del nombre</label><div className="inp"><input id="cr-d" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></div></div>
        <div className="tint blue full" style={{ margin: 0 }}>
          <div className="muted" style={{ fontSize: 13 }}>Nombre del creativo · úsalo igual en Meta y como nombre del archivo en Drive</div>
          <div style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700, wordBreak: 'break-all', marginTop: 4 }}>{nombre || 'Elige la campaña y escribe el ángulo'}</div>
        </div>
        <details className="fdet full">
          <summary>Más datos (opcional): enlace de Drive y gancho</summary>
          <div className="fgrid">
            <div className="field full"><label htmlFor="cr-dr">Enlace de Drive</label><div className="inp"><input id="cr-dr" type="url" maxLength={500} value={drive} onChange={(e) => setDrive(e.target.value)} placeholder="https://drive.google.com/…" /></div></div>
            <div className="field full"><label htmlFor="cr-g">Gancho o texto principal</label><div className="inp"><input id="cr-g" type="text" maxLength={600} value={gancho} onChange={(e) => setGancho(e.target.value)} placeholder="Para recordar de qué trataba" /></div></div>
          </div>
        </details>
        {error && <span className="errm full" role="alert">{error}</span>}
        <div className="fbar full"><button className="btn ghost" type="button" onClick={onCerrar}>Cancelar</button><button className="btn" type="submit" disabled={env || !nombre || !angulo.trim()}>Crear creativo</button></div>
      </form>
    </Dialogo>
  )
}

function Editar({ c, sinEnlazar, onCerrar }) {
  const router = useRouter()
  const [drive, setDrive] = useState(c.drive || ''), [gancho, setGancho] = useState(c.gancho || ''), [notas, setNotas] = useState(c.notas || ''), [ad, setAd] = useState(c.metaAdId || '')
  const [error, setError] = useState(''), [env, setEnv] = useState(false)
  async function guardar(e) {
    e.preventDefault(); setError(''); setEnv(true)
    try { await api('PATCH', `/api/creativos/${c.id}`, { driveUrl: drive, gancho, notas, metaAdId: ad }); router.refresh(); onCerrar() } catch (ex) { setError(ex.message) } finally { setEnv(false) }
  }
  return (
    <Dialogo etiqueta="Editar creativo" onCerrar={onCerrar}>
      <h2 style={{ margin: '0 0 4px' }}>Editar creativo</h2>
      <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13.5, marginBottom: 14, wordBreak: 'break-all' }}>{c.nombre}</div>
      <form onSubmit={guardar} className="fgrid" style={{ minWidth: 'min(540px, 80vw)' }}>
        <div className="field full"><label htmlFor="ed-dr">Enlace de Drive</label><div className="inp"><input id="ed-dr" type="url" maxLength={500} value={drive} onChange={(e) => setDrive(e.target.value)} placeholder="https://drive.google.com/…" /></div></div>
        <div className="field full"><label htmlFor="ed-g">Gancho o texto principal</label><div className="inp"><input id="ed-g" type="text" maxLength={600} value={gancho} onChange={(e) => setGancho(e.target.value)} /></div></div>
        <div className="field full"><label htmlFor="ed-n">Notas</label><div className="inp"><input id="ed-n" type="text" maxLength={1000} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Qué aprendiste con este creativo" /></div></div>
        <div className="field full"><label htmlFor="ed-a">Anuncio de Meta (solo si no se llama igual)</label>
          <select id="ed-a" className="sel" value={ad} onChange={(e) => setAd(e.target.value)}>
            <option value="">— se enlaza por el nombre —</option>
            {c.metaAdId && !sinEnlazar.some((a) => a.id === c.metaAdId) && <option value={c.metaAdId}>Anuncio {c.metaAdId} (enlazado)</option>}
            {sinEnlazar.map((a) => <option key={a.id} value={a.id}>{a.nombre || 'Sin nombre'} · {cop(a.gasto)} · {diaCorto(a.ultimoDia)}</option>)}
          </select>
          <span className="hint">Lo ideal es nombrar el anuncio en Meta igual que el creativo; así se enlaza solo.</span></div>
        {error && <span className="errm full" role="alert">{error}</span>}
        <div className="fbar full"><button className="btn ghost" type="button" onClick={onCerrar}>Cancelar</button><button className="btn" type="submit" disabled={env}>Guardar</button></div>
      </form>
    </Dialogo>
  )
}

function Resumen({ titulo, filas, nombre }) {
  if (!filas.length) return null
  return (
    <div className="card tbl-card"><div style={{ padding: '14px 16px 4px', fontWeight: 700 }}>{titulo}</div>
      <div className="scroll-x"><table className="tbl tbl-res"><thead><tr><th>{nombre}</th><th>Creativos</th><th>Funcionan</th><th>A refrescar</th><th>Gasto (sin IVA)</th><th>CTR</th><th>Costo por clic</th><th>Costo por compra</th></tr></thead>
        <tbody>{filas.map((f) => <tr key={f.clave}><td><b>{f.clave === 'video' || f.clave === 'imagen' ? FORMATOS[f.clave].nombre : f.clave}</b></td><td>{fmtN(f.creativos)}</td><td>{fmtN(f.funcionan)}</td><td>{fmtN(f.refrescar)}</td><td>{cop(f.gasto)}</td><td>{pct1(f.ctr)}</td><td>{f.cpc == null ? '—' : cop(f.cpc)}</td><td>{f.costoCompra == null ? '—' : cop(f.costoCompra)}</td></tr>)}</tbody></table></div></div>
  )
}

export default function Creativos({ d, campanaFija = null }) {
  const router = useRouter()
  const [nuevo, setNuevo] = useState(false), [editando, setEditando] = useState(null), [error, setError] = useState('')
  const [fc, setFc] = useState(campanaFija || ''), [fe, setFe] = useState(''), [ff, setFf] = useState(''), [fl, setFl] = useState(''), [q, setQ] = useState('')
  const lista = useMemo(() => (d.creativos || []).filter((c) => (!fc || c.campanaId === fc) && (!fe || c.estado === fe) && (!ff || c.formato === ff) && (!fl || c.lectura.etiqueta === fl) && (!q || (c.nombre + ' ' + c.angulo + ' ' + (c.gancho || '')).toUpperCase().includes(q.trim().toUpperCase()))), [d.creativos, fc, fe, ff, fl, q])
  if (d.sinMigracion) return <div className="tint warn"><b style={{ color: 'var(--gold-ink)' }}>Falta preparar la base de datos</b><div style={{ fontSize: 14, marginTop: 4 }}>Este módulo necesita dos tablas nuevas. Ejecuta <code>npm run db:migrate</code> (solo agrega tablas; no toca nada existente) y recarga.</div></div>
  const alertas = d.creativos.filter((c) => c.lectura.alertas.length)
  async function cambiarEstado(c, estado) {
    setError('')
    try { await api('PATCH', `/api/creativos/${c.id}`, { estado }); router.refresh() } catch (ex) { setError(ex.message) }
  }
  return (
    <>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <button className="btn" type="button" onClick={() => setNuevo(true)} disabled={!d.campanas.length}>+ Nuevo creativo</button>
        {Object.entries(ESTADOS).map(([k, v]) => <span key={k} className="chip idle" title={v.detalle}>{v.nombre}: {d.conteo[k] || 0}</span>)}
        {!d.campanas.length && <span className="muted" style={{ fontSize: 13.5 }}>Primero crea o sincroniza una campaña.</span>}
      </div>
      {alertas.length > 0 && (
        <div className="tint warn" style={{ marginBottom: 14 }}><b style={{ color: 'var(--gold-ink)' }}>{alertas.length === 1 ? '1 creativo no cuadra con Meta' : `${alertas.length} creativos no cuadran con Meta`}</b>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 14 }}>{alertas.slice(0, 6).map((c) => <li key={c.id}><b>{c.nombre}</b>: {c.lectura.alertas[0]}</li>)}</ul></div>
      )}
      {!d.hayGastoPorAnuncio && d.creativos.length > 0 && <p className="muted" style={{ fontSize: 13.5 }}>Todavía no hay gasto por anuncio de Meta. Sincroniza en Mis cuentas → Meta Ads; los resultados aparecen cuando el anuncio en Meta se llama igual que el creativo.</p>}

      <div className="card" style={{ marginBottom: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
        <div className="field" style={{ flex: '1 1 200px' }}><label htmlFor="f-q">Buscar</label><div className="inp"><input id="f-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, ángulo o gancho" /></div></div>
        {!campanaFija && <div className="field"><label htmlFor="f-c">Campaña</label><select id="f-c" className="sel" value={fc} onChange={(e) => setFc(e.target.value)}><option value="">Todas</option>{d.campanas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></div>}
        <div className="field"><label htmlFor="f-e">Estado</label><select id="f-e" className="sel" value={fe} onChange={(e) => setFe(e.target.value)}><option value="">Todos</option>{Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v.nombre}</option>)}</select></div>
        <div className="field"><label htmlFor="f-f">Formato</label><select id="f-f" className="sel" value={ff} onChange={(e) => setFf(e.target.value)}><option value="">Todos</option>{Object.entries(FORMATOS).map(([k, v]) => <option key={k} value={k}>{v.nombre}</option>)}</select></div>
        <div className="field"><label htmlFor="f-l">Lectura<Ayuda texto={AYUDA_LECTURA} titulo="Lectura" /></label><select id="f-l" className="sel" value={fl} onChange={(e) => setFl(e.target.value)}><option value="">Todas</option>{Object.entries(ETIQUETA).map(([k, v]) => <option key={k} value={k}>{v.texto}</option>)}</select></div>
      </div>
      {error && <p className="errm" role="alert">{error}</p>}

      {lista.length === 0 ? (
        <div className="card"><p className="empty-note" style={{ margin: 0 }}>{d.creativos.length ? 'Ningún creativo coincide con los filtros.' : 'Aún no tienes creativos. Crea el primero: la app arma el nombre y tú lo usas igual en Meta y en Drive.'}</p></div>
      ) : (
        <div className="cr-wrap"><div className="card tbl-card cr-tabla"><div className="scroll-x"><table className="tbl">
          <thead><tr><th>Creativo</th><th>Campaña / ángulo</th><th>Estado</th><th>Lectura<Ayuda texto={AYUDA_LECTURA} titulo="Lectura" /></th><th>Gasto (sin IVA)</th><th>CTR</th><th>Costo por clic</th><th>Compras</th><th></th></tr></thead>
          <tbody>{lista.map((c) => { const l = c.lectura, e = ETIQUETA[l.etiqueta]; return (
            <tr key={c.id}>
              <td style={{ maxWidth: 320 }}><div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12.5, fontWeight: 700, wordBreak: 'break-all' }}>{c.nombre}</span><Copiar texto={c.nombre} /></div>
                {c.gancho && <div className="muted" style={{ fontSize: 12.5 }}>{c.gancho}</div>}</td>
              <td>{c.campana}<div className="muted" style={{ fontSize: 12.5 }}>{c.angulo} · {FORMATOS[c.formato].nombre}</div></td>
              <td><select className="sel" aria-label={`Estado de ${c.nombre}`} value={c.estado} onChange={(ev) => cambiarEstado(c, ev.target.value)}>{Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v.nombre}</option>)}</select>
                {l.alertas.length > 0 && <div style={{ color: 'var(--gold-ink)', fontSize: 12.5 }}>⚠ No cuadra con Meta</div>}</td>
              <td><span className={'chip ' + e.tono}>{e.texto}</span>
                <details><summary className="muted" style={{ fontSize: 12.5, cursor: 'pointer' }}>por qué</summary><div style={{ fontSize: 12.5, maxWidth: 280 }}>{l.motivos.join(' ')}{l.alertas.map((a) => <div key={a} style={{ color: 'var(--gold-ink)' }}>⚠ {a}</div>)}</div></details></td>
              <td>{l.gasto ? cop(l.gasto) : '—'}</td><td>{pct1(l.ctr)}</td><td>{l.cpc == null ? '—' : cop(l.cpc)}</td><td>{l.gasto ? fmtN(l.compras) : '—'}</td>
              <td style={{ whiteSpace: 'nowrap' }}>{c.drive && <a className="link" href={c.drive} target="_blank" rel="noopener noreferrer">Drive</a>} <button type="button" className="btn ghost" style={{ padding: '4px 10px' }} onClick={() => setEditando(c)}>Editar</button></td>
            </tr>) })}</tbody></table></div></div>
        {/* Celular: una tarjeta por creativo (la tabla no cabe) */}
        <div className="cr-lista">
          {lista.map((c) => { const l = c.lectura, e = ETIQUETA[l.etiqueta]; return (
            <article key={c.id} className="card cr-card">
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                <span className="cr-nombre">{c.nombre}</span><Copiar texto={c.nombre} />
              </div>
              <div className="muted" style={{ fontSize: 13 }}>{c.campana} · {c.angulo} · {FORMATOS[c.formato].nombre}</div>
              {c.gancho && <div className="muted" style={{ fontSize: 12.5 }}>{c.gancho}</div>}
              <div className="cr-fila">
                <select className="sel" aria-label={`Estado de ${c.nombre}`} value={c.estado} onChange={(ev) => cambiarEstado(c, ev.target.value)}>{Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v.nombre}</option>)}</select>
                <span className={'chip ' + e.tono}>{e.texto}</span>
              </div>
              <dl className="cr-datos">
                <div><dt>Gasto (sin IVA)</dt><dd>{l.gasto ? cop(l.gasto) : '—'}</dd></div>
                <div><dt>CTR</dt><dd>{pct1(l.ctr)}</dd></div>
                <div><dt>Costo por clic</dt><dd>{l.cpc == null ? '—' : cop(l.cpc)}</dd></div>
                <div><dt>Compras</dt><dd>{l.gasto ? fmtN(l.compras) : '—'}</dd></div>
              </dl>
              <details className="cr-por"><summary>Por qué esta lectura</summary><div style={{ fontSize: 13 }}>{l.motivos.join(' ')}{l.alertas.map((a) => <div key={a} style={{ color: 'var(--gold-ink)' }}>⚠ {a}</div>)}</div></details>
              {l.alertas.length > 0 && <div style={{ color: 'var(--gold-ink)', fontSize: 13 }}>⚠ No cuadra con Meta</div>}
              <div className="cr-fila">{c.drive && <a className="link" href={c.drive} target="_blank" rel="noopener noreferrer">Abrir en Drive</a>}<button type="button" className="btn ghost sm" onClick={() => setEditando(c)}>Editar</button></div>
            </article>) })}
        </div></div>
      )}

      {d.creativos.length > 0 && <div style={{ display: 'grid', gap: 14, marginTop: 20 }}><Resumen titulo="¿Qué ángulo rinde mejor?" nombre="Ángulo" filas={d.resumen.porAngulo} /><Resumen titulo="¿Video o imagen?" nombre="Formato" filas={d.resumen.porFormato} /></div>}

      {d.sinEnlazar.length > 0 && (
        <details className="card" style={{ marginTop: 20 }}><summary style={{ cursor: 'pointer', fontWeight: 700 }}>Anuncios de Meta sin creativo ({d.sinEnlazar.length})</summary>
          <p className="muted" style={{ fontSize: 13.5 }}>Estos anuncios gastaron pero su nombre no coincide con ningún creativo. Crea el creativo con el mismo nombre del anuncio, renombra el anuncio en Meta, o enlázalo a mano desde «Editar».</p>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>{d.sinEnlazar.map((a) => <li key={a.id}><span style={{ fontFamily: 'ui-monospace, monospace' }}>{a.nombre || '(sin nombre)'}</span> · {cop(a.gasto)} · último gasto {diaCorto(a.ultimoDia)}</li>)}</ul></details>
      )}
      {nuevo && <Nuevo d={d} campanaFija={campanaFija} onCerrar={() => setNuevo(false)} />}
      {editando && <Editar c={editando} sinEnlazar={d.sinEnlazar} onCerrar={() => setEditando(null)} />}
    </>
  )
}
