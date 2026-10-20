import Link from 'next/link'
import { cop, fmtN, diaCorto, hace } from '@/lib/formato'
import Ayuda from '@/components/Ayuda'
import GraficaDias from '@/components/graficas/GraficaDias'
import { GLOSARIO } from '@/lib/glosario'
import { CortesLista } from './CortesLista'
import { PanelSalud } from './PanelSalud'
import SelectorPeriodo from './SelectorPeriodo'
import { ResumenPeriodo } from './ResumenPeriodo'
import { BarraApilada, Tile, COLOR } from './Viz'
import { TablaDias } from './TablasDatos'
import { VISTAS } from './Vistas'

// «Dinero»: todo lo del dinero de UN periodo (corte actual, anterior, otro, todo el tiempo o un rango libre) en una sola pantalla, con las mismas cifras y los mismos nombres en todas partes.
// Aquí viven, sin perder nada, las pestañas que antes estaban separadas: Ganancia por día, Costo por venta, A dónde va mi plata y Caja.
const signo = (n) => (n < 0 ? '−' : '+') + cop(Math.abs(n))
const rango = (c) => `${diaCorto(c.desde)} → ${diaCorto(c.hasta)}`
const Aviso = ({ tono = 'blue', titulo, children }) => (
  <div className={'tint ' + tono} style={{ marginBottom: 16 }}><b style={{ color: `var(--${tono === 'warn' ? 'gold' : tono === 'bad' ? 'coral' : 'blue'}-ink, var(--blue))` }}>{titulo}</b><div style={{ fontSize: 14.5, marginTop: 2 }}>{children}</div></div>
)
const Seccion = ({ titulo, ayuda, children }) => <section style={{ marginTop: 26 }}><div className="sec-head" style={{ marginTop: 0 }}><h2>{titulo}{ayuda && <Ayuda t={ayuda} />}</h2></div>{children}</section>
const CIFRAS = ['entro', 'gastaste', 'te_quedo', 'por_cobrar', 'saldo_billetera', 'saldo_tarjeta', 'retirable', 'utilidad_acumulada']

export function VistaDinero({ d }) {
  const { per, c, base, caja, desglose, costoVenta: cv } = d
  const esCorte = per.tipo === 'corte', p = c.pedidos, e = p.estado
  const cortesSel = [...base.cortes].reverse().map(({ id, desde, hasta, abierto }) => ({ id, desde, hasta, abierto }))
  const bien = cv.quedaPorEntrega != null && cv.quedaPorEntrega >= 0, sinGasto = !(cv.gasto > 0)
  const totalCosto = desglose.reduce((a, f) => a + f.monto, 0)
  return (
    <>
      {!base.cierresListos && <Aviso tono="warn" titulo="Falta una actualización de la base de datos">Aplícala con <code>npm run db:migrate</code> para poder sellar cortes.</Aviso>}

      <PanelSalud s={base.salud} origen={base.origen} inicio={base.inicio} hoy={base.hoy} ritmo={base.ritmoPauta} titulo="Hoy: ¿cuánto puedo retirar?" />
      <div className="vz-tiles" style={{ marginBottom: 20 }}>
        <Tile l="Billetera" ayuda="saldo_billetera" v={caja.billetera == null ? '—' : cop(caja.billetera)} n="según el último movimiento" />
        <Tile l="Tarjeta" ayuda="saldo_tarjeta" v={caja.tarjeta ? cop(caja.tarjeta.monto) : '—'} n={caja.tarjeta ? `según Dropi, leído ${hace(caja.tarjeta.leido)}` : 'sincroniza Dropi'} />
        <Tile l="Pedidos entregados" v={fmtN(caja.entregados.n)} n={`por ${cop(caja.entregados.valor)} en total`} />
      </div>

      <div className="sec-head" style={{ marginTop: 0 }}><h2>Mira otro periodo</h2></div>
      <SelectorPeriodo cortes={cortesSel} param={per.param} tipo={per.tipo} desde={per.desde} hasta={per.hasta} hoy={base.hoy} inicio={base.inicio} ruta="/contabilidad" />
      <ResumenPeriodo c={c} per={per} hoy={base.hoy} enlace={esCorte ? { href: `/contabilidad/cortes/${per.id}`, texto: 'Ver el informe imprimible de este corte' } : null} />

      {!c.dias.length ? <Aviso titulo="Sin movimientos en este periodo">No hay ganancias ni gastos entre el {diaCorto(per.desde)} y el {diaCorto(per.hasta)}. Elige otro periodo.</Aviso> : (
        <>
          <Seccion titulo="A dónde va tu plata" ayuda="gastaste">
            {!d.hayCobros && <Aviso tono="warn" titulo="Sin cobros de Meta cargados">La publicidad aparece dentro de «otros gastos de la tarjeta». Cuando se conecte Meta se separa.</Aviso>}
            <div className="card">
              {desglose.length === 0 ? <p className="muted" style={{ margin: 0 }}>Sin gastos en este periodo.</p> : desglose.map((f) => (
                <div key={f.nombre} className="rowline" style={{ alignItems: 'center' }}>
                  <span>{f.nombre}</span>
                  <span style={{ display: 'inline-flex', gap: 16, alignItems: 'baseline', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <span className="muted" style={{ fontSize: 13 }}>{f.pctDelCosto} % de lo que gastaste{f.pctDeLaGanancia != null ? ` · ${f.pctDeLaGanancia} % de lo que entró` : ''}</span>
                    <b className="num">{cop(f.monto)}</b>
                  </span>
                </div>
              ))}
            </div>
          </Seccion>

          <Seccion titulo="Día por día" ayuda="te_quedo">
            {d.vistas.venta.length > 0 && <GraficaDias vistas={VISTAS({ serie: d.vistas.venta }, d.vistas.pago, d.vistas.herr).reverse() /* abre en caja: es la que cuadra con «Te quedó» de arriba */} tipo="barras" metrica={{ tipo: 'neto' }} formato="cop" termino="ganancia_neta" subtitulo="Ya descuenta publicidad, devoluciones y comisiones"
              ayuda="cada barra es lo que entró menos lo que gastaste. «Por día de venta» muestra lo que hizo cada día de ventas; «Por día de pago» muestra cuándo se movió la plata." />}
            <details className="vz-det" style={{ marginTop: 12 }}><summary>Ver los días en tabla</summary><div style={{ marginTop: 8 }}><TablaDias dias={c.dias} /></div></details>
            {d.herramientasPorDia > 0 && <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>Las herramientas ({cop(d.herramientasPorDia)} por día) se descuentan solo en el total, no en cada día.</p>}
          </Seccion>

          <Seccion titulo="Costo por venta" ayuda="cpa">
            {sinGasto ? <Aviso titulo="El costo por venta necesita el gasto en publicidad">Conecta Meta y sincroniza (Campañas), o carga los cobros de Meta: así sé cuánto gastaste en anuncios.</Aviso> : (
              cv.cpaEntrega != null && cv.gananciaPorPedido != null && (
                <div className={'tint ' + (bien ? 'ok' : 'warn')} style={{ marginBottom: 14 }}>
                  <b style={{ fontSize: 18, color: bien ? 'var(--jade-ink)' : 'var(--gold-ink)' }}>Cada pedido entregado te cuesta {cop(cv.cpaEntrega)} en publicidad y te deja {cop(cv.gananciaPorPedido)}: {bien ? `te quedan ${cop(cv.quedaPorEntrega)} por pedido` : `pierdes ${cop(-cv.quedaPorEntrega)} por pedido`}.</b>
                  {cv.enCamino > 0 && cv.mejorCaso != null && <div style={{ fontSize: 14.5, marginTop: 4 }}>Pero tienes <b>{fmtN(cv.enCamino)} pedidos en camino</b> que ya tienen su publicidad gastada y aún no suman ganancia. Si se entregaran todos, el costo por entrega bajaría a <b>{cop(cv.mejorCaso)}</b> y te quedarían {cop(cv.gananciaPorPedido - cv.mejorCaso)} por pedido. Es el mejor caso, no una promesa.</div>}
                </div>
              )
            )}
            <div className="vz-tiles">
              <Tile l="Pedidos vendidos" v={fmtN(cv.ventas)} n={`${fmtN(cv.entregados)} entregados · ${fmtN(cv.enCamino)} en camino`} />
              <Tile l="Costo por pedido entregado" ayuda="cpa" v={cv.cpaEntrega == null ? '—' : cop(cv.cpaEntrega)} n={cv.cpaEntrega == null ? 'sin gasto de publicidad' : `${cop(cv.gasto)} de publicidad entre ${fmtN(cv.entregados)} entregados`} />
              <Tile l="Costo por pedido vendido" v={cv.costoPorPedido == null ? '—' : cop(cv.costoPorPedido)} n={`${cop(cv.gasto)} entre ${fmtN(cv.ventas)} vendidos`} />
              <Tile l="Ganancia por pedido" v={cv.gananciaPorPedido == null ? '—' : cop(cv.gananciaPorPedido)} color="jade-ink" n={`promedio real de ${fmtN(cv.pagados)} pedidos ya pagados`} />
              <Tile l="Te queda por pedido entregado" v={cv.quedaPorEntrega == null ? '—' : cop(cv.quedaPorEntrega)} color={cv.quedaPorEntrega != null ? (cv.quedaPorEntrega >= 0 ? 'jade-ink' : 'coral-ink') : undefined} n="ganancia − costo de la publicidad" />
            </div>
            <p className="muted only-learner" style={{ fontSize: 13.5, margin: '12px 0 0' }}>La publicidad es la que Meta gastó (con IVA) en los días de este periodo. El costo por pedido <b>entregado</b> es el de una venta que sí se cobró; el <b>vendido</b> incluye los que aún van en camino, por eso se ve alto mientras haya muchos pedidos sin entregar. Conviene medir periodos largos.</p>
          </Seccion>

          <Seccion titulo="Pedidos vendidos en el periodo" ayuda="pendiente_corte">
            <div className="card">
              <BarraApilada unidad="n" titulo="¿Cómo van hoy?" total={p.vendidos.n} segmentos={[
                { etiqueta: 'Pagados', valor: e.pagado.n, color: COLOR.jade }, { etiqueta: 'En curso', valor: e.en_curso.n, color: COLOR.azul },
                { etiqueta: 'Entregados sin pagar', valor: e.sin_pagar.n, color: COLOR.ambar }, { etiqueta: 'No verificables', valor: e.no_verificable.n, color: COLOR.violeta },
                { etiqueta: 'Devueltos', valor: e.devuelto.n + e.devuelto_cobrado.n, color: COLOR.coral }]} />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 26px', marginTop: 14, fontSize: 14.5 }}>
                <span><b>{fmtN(p.pendientes.n)}</b> <span className="muted">pendientes · valor de venta {cop(p.pendientes.valor)}</span></span>
                <span><b>{fmtN(p.cierranAnteriores.n)}</b> <span className="muted">ventas de periodos anteriores que se pagaron en este</span></span>
              </div>
            </div>
          </Seccion>
        </>
      )}

      <Seccion titulo="Cómo han ido los cortes"><CortesLista cortes={base.cortes} /></Seccion>
      <p className="muted" style={{ fontSize: 13, marginTop: 14 }}>Cortas {base.corte === 31 ? 'el último día de cada mes' : `el día ${base.corte} de cada mes`} · <Link href="/configuracion/corte" className="link">cambiar</Link> · la operación empezó el {diaCorto(base.inicio)} · nada se borra ni se oculta.</p>

      <details className="vz-det card" style={{ marginTop: 18 }}>
        <summary>Qué significa cada cifra</summary>
        <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
          {CIFRAS.map((k) => <div key={k}><b>{GLOSARIO[k].titulo}</b> — {GLOSARIO[k].corto}{GLOSARIO[k].formula && <span className="muted" style={{ fontSize: 13 }}> · {GLOSARIO[k].formula}</span>}</div>)}
        </div>
      </details>
    </>
  )
}
