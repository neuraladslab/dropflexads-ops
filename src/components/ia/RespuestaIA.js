// Muestra la respuesta de la IA con su sello de verificación: cuántas cifras se contrastaron con los datos del sistema y cuáles NO se pudieron verificar.
// El texto se pinta con React (escapa todo): nunca se inserta como HTML.
const negrita = (t) => t.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (/^\*\*[^*]+\*\*$/.test(p) ? <b key={i}>{p.slice(2, -2)}</b> : p))

function Texto({ t }) {
  const bloques = [], lineas = String(t).split('\n')
  let lista = null
  for (const l of lineas) {
    const m = /^\s*[-•*]\s+(.*)$/.exec(l) || /^\s*\d+[.)]\s+(.*)$/.exec(l)
    if (m) { if (!lista) { lista = []; bloques.push(lista) } lista.push(m[1]) } else { lista = null; if (l.trim()) bloques.push(l.trim()) }
  }
  return <>{bloques.map((b, i) => (Array.isArray(b)
    ? <ul key={i} style={{ margin: '6px 0', paddingLeft: 20, display: 'grid', gap: 4 }}>{b.map((x, j) => <li key={j}>{negrita(x)}</li>)}</ul>
    : <p key={i} style={{ margin: '6px 0' }}>{negrita(b)}</p>))}</>
}

export function RespuestaIA({ r, compacta = false }) {
  const ok = r.noVerificadas && r.noVerificadas.length === 0
  return (
    <div className="card" style={{ padding: compacta ? '12px 16px' : undefined }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
        <span className="chip blue">Respuesta de la IA</span>
        {r.cifras && r.cifras.total > 0 && (ok
          ? <span className="chip ok" title="Cada cifra de esta respuesta se contrastó con los datos que devolvió el sistema">✓ {r.cifras.verificadas} {r.cifras.verificadas === 1 ? 'cifra verificada' : 'cifras verificadas'}</span>
          : <span className="chip warn">! {r.noVerificadas.length} {r.noVerificadas.length === 1 ? 'cifra no verificada' : 'cifras no verificadas'}</span>)}
        {r.desdeCache && <span className="chip idle">guardada hace {r.hace || 0} min</span>}
      </div>
      <div style={{ fontSize: 14.5, lineHeight: 1.55 }}><Texto t={r.texto} /></div>
      {r.noVerificadas && r.noVerificadas.length > 0 && (
        <div className="tint warn" style={{ marginTop: 8, fontSize: 13.5 }}><b style={{ color: 'var(--gold-ink)' }}>No tomes estas cifras como ciertas:</b> {r.noVerificadas.join(', ')}. No aparecen en los datos del sistema; revísalas en la pantalla correspondiente antes de decidir.</div>
      )}
      <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
        {r.fuentes && r.fuentes.length > 0 && <>Datos consultados: {r.fuentes.join(', ')} · </>}
        La IA interpreta; las cifras las calcula el sistema. {r.costoUsd != null && <>Costo de esta consulta: US$ {Number(r.costoUsd).toFixed(3).replace('.', ',')}{r.usoMes && <> · este mes US$ {Number(r.usoMes.usd).toFixed(2).replace('.', ',')} de {r.usoMes.topeUsd}</>}.</>}
      </div>
    </div>
  )
}
