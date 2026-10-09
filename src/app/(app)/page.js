import { Pagina } from '@/components/shell/Pagina'
import { itemDe } from '@/components/shell/nav'

export const metadata = { title: 'Dashboard · DropFlexAds Ops' }

// Provisional: las cifras reales llegan cuando estén conectadas las fuentes (Dropi y Meta). Aquí no se muestra ningún número inventado.
const TARJETAS = [
  ['¿Gano o pierdo?', 'Ganancias de pedidos entregados menos todos los costos.', 'Necesita Dropi y Meta'],
  ['Pedidos de hoy', 'Cuántos pedidos entraron hoy y en qué estado van.', 'Necesita Dropi'],
  ['Gasto en Meta', 'Lo que cruza con un cobro de Meta, sin mezclar otros gastos.', 'Necesita Meta y la tarjeta'],
  ['Caja', 'Billetera y tarjeta, y para cuántos días alcanza.', 'Necesita Dropi'],
]
export default function Dashboard() {
  return (
    <Pagina item={itemDe('/')}>
      <div className="kpis">
        {TARJETAS.map(([t, d, e]) => (
          <div className="card" key={t}>
            <div className="kpi-l">{t}</div>
            <div className="kpi-v" aria-label="sin datos">—</div>
            <p className="muted" style={{ margin: '8px 0 10px', fontSize: 14 }}>{d}</p>
            <span className="chip idle">{e}</span>
          </div>
        ))}
      </div>
    </Pagina>
  )
}
