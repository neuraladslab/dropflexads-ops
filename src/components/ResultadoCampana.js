import { cop, fmtN } from '@/lib/formato'

// Resultado real de una campaña (pedidos atribuidos por producto, ganancia de la billetera, devoluciones). Presentacional: se usa en la lista y en la página de cada campaña.
const Dato = ({ l, v, color, nota }) => (
  <div style={{ minWidth: 110 }}><div className="muted" style={{ fontSize: 12.5 }}>{l}</div><div className="num" style={{ fontSize: 19, fontWeight: 700, color: color ? `var(--${color})` : undefined }}>{v}</div>{nota && <div className="muted" style={{ fontSize: 12 }}>{nota}</div>}</div>
)

// `gasto`: lo que Meta gastó en la campaña ({sinIva, conIva}), null si no está unida a una de Meta, undefined si no aplica (p. ej. «sin campaña»).
export default function ResultadoCampana({ r, gasto }) {
  const dGasto = gasto === undefined ? null
    : gasto ? <Dato l="Gasto en Meta" v={cop(gasto.sinIva)} nota={`sin IVA · ${cop(gasto.conIva)} con IVA`} />
    : <Dato l="Gasto en Meta" v="—" nota="sin campaña de Meta unida" />
  if (!r) return <div style={{ display: 'flex', gap: '12px 26px', flexWrap: 'wrap', marginTop: 14, alignItems: 'center' }}><span className="muted" style={{ fontSize: 14 }}>Todavía no hay pedidos de estos productos.</span>{dGasto}</div>
  return (
    <div style={{ display: 'flex', gap: '12px 26px', flexWrap: 'wrap', marginTop: 14 }}>
      <Dato l="Pedidos" v={fmtN(r.pedidos)} nota={r.enCurso ? `${fmtN(r.enCurso)} en curso` : null} />
      <Dato l="Entregados" v={fmtN(r.entregados)} nota={r.sinPagar ? `${fmtN(r.sinPagar)} sin pagar` : null} />
      <Dato l="Devueltos" v={fmtN(r.devueltos)} color={r.devueltos ? 'coral-ink' : undefined} nota={r.tasaDevolucion != null ? `${r.tasaDevolucion} % de los que terminaron` : null} />
      <Dato l="Ganancia real" v={cop(r.ganancia)} color="jade-ink" nota="ya en tu billetera" />
      {r.costoDevoluciones > 0 && <Dato l="Costo de devoluciones" v={cop(r.costoDevoluciones)} color="coral-ink" />}
      {dGasto}
    </div>
  )
}
