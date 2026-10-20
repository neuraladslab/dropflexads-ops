import { cop, corto } from '@/lib/formato'

// Resultado acumulado día a día de un presupuesto: la línea es el caso mediano, la franja oscura el 50 % central de los futuros posibles y la clara va del peor caso razonable (1 de 20) al mejor (1 de 10).
// Línea de 2 px, franjas con transparencia, rejilla de 1 px, el cero marcado; los valores clave escritos al final y una tabla equivalente para lector de pantalla.
export function AbanicoResultados({ abanico, titulo }) {
  const n = abanico.p50.length, W = 640, H = 280, L = 62, R = 112, T = 18, B = 34
  const todos = [0, ...abanico.p5, ...abanico.p90], min = Math.min(...todos), max = Math.max(...todos), span = max - min || 1
  const x = (i) => L + ((i + 1) / n) * (W - L - R), y = (v) => T + (1 - (v - min) / span) * (H - T - B), x0 = L
  const linea = (a) => [`${x0},${y(0)}`, ...a.map((v, i) => `${x(i)},${y(v)}`)]
  const franja = (alto, bajo) => [...linea(alto), ...[...linea(bajo)].reverse()].join(' ')
  const ticks = Array.from({ length: 5 }, (_, i) => min + (span * i) / 4)
  const ult = n - 1
  return (
    <figure style={{ margin: 0 }}>
      {titulo && <figcaption style={{ fontWeight: 600, marginBottom: 6 }}>{titulo}</figcaption>}
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', maxHeight: 320 }} role="img"
        aria-label={`Resultado acumulado en ${n} días: caso mediano ${cop(abanico.p50[ult])}, peor caso razonable ${cop(abanico.p5[ult])}, mejor caso ${cop(abanico.p90[ult])}`}>
        {ticks.map((t) => <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth="1" /><text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize="11.5" fill="var(--muted)">{corto(t)}</text></g>)}
        <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="var(--ink)" strokeWidth="1.2" />
        <polygon points={franja(abanico.p90, abanico.p5)} fill="var(--blue)" opacity="0.10" />
        <polygon points={franja(abanico.p75, abanico.p25)} fill="var(--blue)" opacity="0.18" />
        <polyline points={linea(abanico.p50).join(' ')} fill="none" stroke="var(--blue)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(ult)} cy={y(abanico.p50[ult])} r="4.5" fill="var(--blue)" stroke="#fff" strokeWidth="2" />
        {[['Mejor caso', abanico.p90[ult]], ['Mediano', abanico.p50[ult]], ['Peor caso', abanico.p5[ult]]].map(([t, v]) => (
          <text key={t} x={x(ult) + 10} y={y(v) + 4} fontSize="12" fill="var(--ink)" fontWeight="600">{t} {corto(v)}</text>
        ))}
        {Array.from({ length: n }, (_, i) => <text key={i} x={x(i)} y={H - 10} textAnchor="middle" fontSize="11.5" fill="var(--muted)">día {i + 1}</text>)}
      </svg>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 13, marginTop: 4 }} className="muted">
        <span><i style={{ display: 'inline-block', width: 14, height: 3, background: 'var(--blue)', verticalAlign: 'middle', borderRadius: 2 }} /> caso mediano</span>
        <span><i style={{ display: 'inline-block', width: 14, height: 10, background: 'var(--blue)', opacity: 0.18, verticalAlign: 'middle', borderRadius: 2 }} /> el 50 % central</span>
        <span><i style={{ display: 'inline-block', width: 14, height: 10, background: 'var(--blue)', opacity: 0.10, verticalAlign: 'middle', borderRadius: 2 }} /> del peor al mejor caso</span>
      </div>
      <details className="vz-det" style={{ marginTop: 8 }}>
        <summary>Ver los números por día</summary>
        <table className="tbl" style={{ marginTop: 8 }}><thead><tr><th>Día</th><th>Peor caso</th><th>Mediano</th><th>Mejor caso</th></tr></thead>
          <tbody>{abanico.p50.map((_, i) => <tr key={i}><td>Día {i + 1}</td><td>{cop(abanico.p5[i])}</td><td>{cop(abanico.p50[i])}</td><td>{cop(abanico.p90[i])}</td></tr>)}</tbody></table>
      </details>
    </figure>
  )
}
