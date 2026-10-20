import Link from 'next/link'
import { cop, fmtN, diaCorto } from '@/lib/formato'
import { diasTotales } from '@/domain/periodos.ts'
import Ayuda from '@/components/Ayuda'
import { BarraApilada, Tile, desgloseCorte } from './Viz'

// El resumen de un periodo con las mismas 4 cifras y el mismo vocabulario en todas las pantallas: Entró · Gastaste · Te quedó · Por cobrar, y a dónde se fue lo que entró.
const rango = (c) => `${diaCorto(c.desde)} → ${diaCorto(c.hasta)}`
const signo = (n) => (n < 0 ? '−' : '+') + cop(Math.abs(n))
const VEREDICTO = { gana: ['jade-ink', 'Ganando'], pierde: ['coral-ink', 'Perdiendo'], equilibrio: ['gold-ink', 'Equilibrio'] }

export function ResumenPeriodo({ c, per, hoy, enlace, titulo }) {
  const [col, etq] = VEREDICTO[c.veredicto]
  const { segmentos, marca } = desgloseCorte(c)
  const p = c.pedidos, est = c.estimacion, porCobrar = Math.round(est.gananciaEsperada - est.costoDevoluciones)
  const esCorte = per.tipo === 'corte', total = esCorte ? diasTotales(c) : c.diasCalendario
  const faltan = esCorte ? Math.max(0, Math.round((Date.parse(c.hasta + 'T12:00:00Z') - Date.parse(hoy + 'T12:00:00Z')) / 864e5)) : 0
  const avance = Math.min(100, Math.round((c.diasCalendario / Math.max(1, total)) * 100))
  const nombre = titulo || (esCorte ? (per.abierto ? 'Corte actual' : 'Corte') : per.etiqueta)
  return (
    <section className="card" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <div><div className="kpi-l">{nombre}{esCorte && <Ayuda t="corte" />}</div><b style={{ fontSize: 20 }}>{rango(c)} <span className="muted" style={{ fontWeight: 400, fontSize: 14 }}>{c.hasta.slice(0, 4)}</span></b>
          {esCorte && !per.abierto && <span className="chip idle" style={{ marginLeft: 8 }}>Cerrado</span>}</div>
        {esCorte && per.abierto && <div className="muted" style={{ fontSize: 14 }}>{faltan === 0 ? 'Hoy cierra' : <>Faltan <b style={{ color: 'var(--ink)' }}>{fmtN(faltan)} {faltan === 1 ? 'día' : 'días'}</b> para el cierre</>}</div>}
        {!esCorte && <div className="muted" style={{ fontSize: 14 }}>{fmtN(c.diasCalendario)} {c.diasCalendario === 1 ? 'día' : 'días'}</div>}
      </div>
      {esCorte && per.abierto && <div className="vz-prog" style={{ margin: '10px 0 16px' }} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={avance} aria-label="Avance del corte"><div style={{ width: `${avance}%` }} /></div>}
      {!(esCorte && per.abierto) && <div style={{ height: 12 }} />}

      <div className="vz-tiles">
        <Tile l="Entró" ayuda="entro" v={cop(c.total.ganancia)} color="jade-ink" n={`${fmtN(c.total.entregas)} pedidos pagados por Dropi`} />
        <Tile l="Gastaste" ayuda="gastaste" v={cop(c.costos)} n="publicidad, devoluciones, comisiones" />
        <Tile l={`Te quedó · ${etq}`} ayuda="te_quedo" v={signo(c.neto)} color={col} n="entró menos gastaste" />
        <Tile l="Por cobrar" ayuda="por_cobrar" v={cop(porCobrar)} n={`estimado, de ${fmtN(p.pendientes.n)} pedidos sin pagar`} />
      </div>

      <div style={{ marginTop: 20 }}>
        <BarraApilada titulo="¿A dónde se fue lo que entró?" total={c.total.ganancia} segmentos={segmentos} marca={marca} />
        <p className="muted only-learner" style={{ fontSize: 13.5, margin: '10px 0 0' }}>«Entró» es lo que Dropi ya pagó a tu billetera. Un periodo puede verse flojo aunque sus ventas sean buenas si Dropi las paga en el siguiente.<Ayuda t="caja_venta" /></p>
      </div>
      {enlace && <div style={{ marginTop: 14 }}><Link href={enlace.href} className="btn sm">{enlace.texto}</Link></div>}
    </section>
  )
}
