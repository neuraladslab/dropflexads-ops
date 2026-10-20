import { cop, fmtN, diaCorto, pct } from '@/lib/formato'
import CobrosMeta from '@/components/CobrosMeta'
import { hoyBogota } from '@/domain/fechas.ts'
import Link from 'next/link'
import { TablaTarjeta, TablaBilletera, TablaPedidos, TablaGastoMeta } from './TablasDatos'
import { PanelSalud } from './PanelSalud'
import { ResumenPeriodo } from './ResumenPeriodo'
import BilleteraVisual from './BilleteraVisual'
import TarjetaDropi from './TarjetaDropi'
import GraficaDias from '@/components/graficas/GraficaDias'
import Ayuda from '@/components/Ayuda'

// Vistas de solo lectura de los datos sincronizados. Componentes de servidor: reciben datos ya calculados (src/lib/datos.js + src/domain).
const Chip = ({ t, children }) => <span className={'chip ' + t}>{children}</span>
const Kpi = ({ l, v, nota, color, ayuda }) => (
  <div className="card"><div className="kpi-l">{l}{ayuda && <Ayuda t={ayuda} />}</div><div className="kpi-v" style={color ? { color: `var(--${color})` } : undefined}>{v}</div>{nota && <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{nota}</div>}</div>
)
const Aviso = ({ tono = 'warn', titulo, children }) => (
  <div className={'tint ' + tono} style={{ marginBottom: 16 }}><b style={{ color: `var(--${tono === 'warn' ? 'gold' : tono === 'bad' ? 'coral' : tono === 'ok' ? 'jade' : 'blue'}-ink)` }}>{titulo}</b><div style={{ fontSize: 14.5, marginTop: 2 }}>{children}</div></div>
)
/** Qué período cubren los datos cargados. Si empiezan después de que arrancó la tarjeta, los totales están incompletos y se dice. */
function Cobertura({ d }) {
  if (!d.desde) return null
  const tarde = d.desde > d.inicio
  return tarde
    ? <Aviso titulo={`Los datos empiezan el ${diaCorto(d.desde)}: faltan movimientos anteriores`}>Tu operación empezó el {diaCorto(d.inicio)}, así que los totales de abajo están <b>incompletos</b> (solo cubren del {diaCorto(d.desde)} al {diaCorto(d.hasta)}). Pulsa «Sincronizar» en el panel de Dropi (con «Sincronizar desde» en {diaCorto(d.inicio)}) para completarlos.</Aviso>
    : <p className="muted" style={{ fontSize: 13, margin: '0 0 12px' }}>Datos del {diaCorto(d.desde)} al {diaCorto(d.hasta)}.</p>
}

/* ---------- Tarjeta ---------- */
export function VistaTarjeta({ d }) {
  const cabecera = (
    <>
      <div className="sec-head" style={{ marginTop: 0 }}><h2>Mi tarjeta</h2></div>
      <p className="md-help" style={{ margin: '-4px 0 14px' }}>Aquí ves cuánto has recargado, en qué se gastó y cuánto te queda. Los datos vienen de Dropi.</p>
      <div style={{ marginBottom: 16 }}><TarjetaDropi t={d.tarjetaDropi} /></div>
    </>
  )
  if (!d.lista.length) return <>{cabecera}<Aviso tono="blue" titulo="Aún no hay movimientos de la tarjeta">Conecta Dropi y pulsa «Sincronizar» (arriba) para traerlos.</Aviso></>
  const t = d.totales
  const dif = Math.round((t.recargas - d.deBilletera.monto) * 100) / 100
  return (
    <>
      {cabecera}
      <Cobertura d={d} />
      {Math.abs(dif) >= 1 && <Aviso titulo={dif > 0 ? 'A la tarjeta entró más de lo que salió de la billetera' : 'De la billetera salió más de lo que entró a la tarjeta'}>De la billetera salieron <b>{cop(d.deBilletera.monto)}</b> ({fmtN(d.deBilletera.n)} {d.deBilletera.n === 1 ? 'recarga' : 'recargas'}) y a la tarjeta entraron <b>{cop(t.recargas)}</b>: diferencia de {cop(Math.abs(dif))}. {dif > 0 ? 'Esa parte pudo venir de otro medio (PSE, tarjeta bancaria) o falta sincronizar la billetera.' : 'Puede haber una recarga que aún no aparece en la tarjeta.'}</Aviso>}
      {!d.hayCobros && <Aviso titulo="Todavía no hay cobros de Meta cargados">Por eso ningún cargo cruza: todos los gastos aparecen como «otros». Cuando se conecte Meta (o cargues sus cobros), los que traen la misma referencia de pago pasan a «De Meta».</Aviso>}
      {t.repetidos > 0 && <Aviso tono="bad" titulo={`${t.repetidos} ${t.repetidos === 1 ? 'cargo repite' : 'cargos repiten'} la referencia de un cobro de Meta`}>Puede ser un cobro doble. Reclámalo a Dropi.</Aviso>}
      {d.cobrosSinTarjeta.length > 0 && <Aviso titulo={`${d.cobrosSinTarjeta.length} ${d.cobrosSinTarjeta.length === 1 ? 'cobro de Meta no aparece' : 'cobros de Meta no aparecen'} en la tarjeta`}>Suman {cop(d.cobrosSinTarjeta.reduce((a, c) => a + c.monto, 0))}. Revisa si los pagó otra tarjeta.</Aviso>}
      <div className="kpis" style={{ marginBottom: 16 }}>
        <Kpi l="Recargaste" v={cop(t.recargas)} color="jade-ink" />
        <Kpi l="Gastaste en Meta" v={cop(t.meta)} nota="solo lo que cruza por referencia de pago" />
        <Kpi l="Gastaste en otras cosas" v={cop(t.otros)} nota="no es de Meta" />
        <Kpi l="Rechazados por el banco" v={fmtN(t.rechazados)} nota="no movieron plata" />
        {t.ignorados > 0 && <Kpi l="Ignorados por ti" v={fmtN(t.ignorados)} nota="no cuentan en tus gastos" />}
      </div>
      <TablaTarjeta lista={d.lista} />
    </>
  )
}

/* ---------- Billetera ---------- */

export function VistaBilletera({ d }) {
  if (!d.mov.length) return <Aviso tono="blue" titulo="Aún no hay movimientos de la billetera">Conecta Dropi y pulsa «Sincronizar ahora» (arriba) para traerlos.</Aviso>
  const T = d.totales, s = (k) => (T[k] ? T[k].sum : 0)
  return (
    <>
      <Cobertura d={d} />
      <BilleteraVisual d={d} />
      <div className="kpis" style={{ marginBottom: 16 }}>
        <Kpi l="Ganancias de pedidos" v={cop(s('profit'))} nota={`${fmtN(T.profit ? T.profit.n : 0)} pedidos`} color="jade-ink" />
        <Kpi l="Devoluciones" v={cop(s('return_fee'))} nota={`${fmtN(T.return_fee ? T.return_fee.n : 0)} cobros`} color="coral-ink" />
        <Kpi l="Pasado a tu tarjeta" v={cop(s('to_card'))} nota={`${fmtN(T.to_card ? T.to_card.n : 0)} recargas · del ${diaCorto(d.desde)} al ${diaCorto(d.hasta)}`} />
      </div>
      <TablaBilletera mov={d.mov} />
    </>
  )
}

/* ---------- Pedidos ---------- */

export function VistaPedidos({ d, vacio, ocultarCampana = false, sinKpis = false }) {
  if (!d.lista.length) return vacio || <Aviso tono="blue" titulo="Aún no hay pedidos">Conecta Dropi y pulsa «Sincronizar» (arriba): trae tus pedidos con su estado real (menos los cancelados).</Aviso>
  const c = d.cuenta
  return (
    <>
      {!sinKpis && (
        <div className="kpis" style={{ marginBottom: 16 }}>
          <Kpi l="Pedidos de hoy" v={fmtN(d.hoy)} />
          <Kpi l="Entregados y pagados" v={fmtN(c.pagado || 0)} color="jade-ink" />
          <Kpi ayuda="sin_pagar" l="Entregados sin pagar" v={fmtN(c.sin_pagar || 0)} nota="Dropi aún no los paga" color={c.sin_pagar ? 'gold-ink' : undefined} />
          <Kpi l="Devueltos" v={fmtN((c.devuelto || 0) + (c.devuelto_cobrado || 0))} color={c.devuelto || c.devuelto_cobrado ? 'coral-ink' : undefined} />
          <Kpi l="En curso" v={fmtN(c.en_curso || 0)} nota="en camino, novedad o pendientes" />
        </div>
      )}
      {c.no_verificable > 0 && <Aviso tono="blue" titulo={`${fmtN(c.no_verificable)} entregados no se pueden verificar`}>Se entregaron antes de lo que cubre la billetera sincronizada{d.billeteraDesde ? ` (desde el ${diaCorto(d.billeteraDesde)})` : ''}: no puedo decir si ya te pagaron.</Aviso>}
      <TablaPedidos lista={d.lista} ocultarCampana={ocultarCampana} />
    </>
  )
}

/* ---------- Ganancia por día ---------- */
/* ---------- Dashboard ---------- */
/** La pregunta principal: ¿cuándo recupero la inversión? Cuánto invertiste, cuánto llevas recuperado, qué falta y cuándo (al ritmo de la última semana). */
function TarjetaRecuperacion({ rec, enCamino, vacio }) {
  if (vacio) return <Aviso tono="blue" titulo="¿Cuándo recupero mi inversión?">Todavía no hay datos. Conecta Dropi y sincroniza (Mis cuentas): aquí verás cuánto has invertido, cuánto llevas recuperado y cuándo lo recuperas.</Aviso>
  const ok = rec.estado === 'recuperada', mal = rec.estado === 'sin_ritmo'
  const color = ok ? '#10B981' : mal ? '#F59E0B' : '#3B82F6'
  const ink = ok ? 'var(--jade-ink)' : mal ? 'var(--gold-ink)' : 'var(--blue)'
  const fecha = rec.fecha ? new Date(rec.fecha + 'T12:00:00Z').toLocaleDateString('es-CO', { day: 'numeric', month: 'long', timeZone: 'UTC' }) : null
  const titulo = ok ? '¡Ya recuperaste tu inversión!' : `Ya te entró el ${rec.pct} % de lo que gastaste`
  return (
    <div className="card" style={{ borderColor: ok ? 'var(--jade-line)' : undefined }}>
      <div className="kpi-l">¿Cuándo recupero mi inversión?<Ayuda t="recuperacion" /></div>
      <div style={{ fontSize: 26, fontWeight: 800, color: ink, margin: '6px 0 14px', letterSpacing: '-.01em' }}>{titulo}</div>
      <div style={{ height: 18, borderRadius: 999, background: '#E2E8F0', overflow: 'hidden' }} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={rec.pct ?? 0} aria-label="Inversión recuperada">
        <div style={{ width: `${Math.max(rec.pct ?? 0, rec.pct ? 2 : 0)}%`, height: '100%', background: color, borderRadius: 999, transition: 'width .4s' }} />
      </div>
      <div className="rec-nums" style={{ display: 'flex', gap: '10px 34px', flexWrap: 'wrap', marginTop: 16 }}>
        <div><div className="muted" style={{ fontSize: 13 }}>Gastaste en total<Ayuda t="invertido" /></div><div className="num" style={{ fontSize: 22, fontWeight: 700 }}>{cop(rec.invertido)}</div></div>
        <div><div className="muted" style={{ fontSize: 13 }}>Entró en total<Ayuda t="recuperado" /></div><div className="num" style={{ fontSize: 22, fontWeight: 700, color: 'var(--jade-ink)' }}>{cop(rec.recuperado)}</div></div>
        <div><div className="muted" style={{ fontSize: 13 }}>{ok ? 'Ganancia después de recuperar' : 'Te faltan'}</div><div className="num" style={{ fontSize: 22, fontWeight: 700, color: ok ? 'var(--jade-ink)' : ink }}>{cop(ok ? rec.excedente : rec.faltan)}</div></div>
      </div>
      <div className={'tint ' + (ok ? 'ok' : mal ? 'warn' : 'blue')} style={{ marginTop: 16, padding: '12px 16px', fontSize: 14.5 }}>
        {ok && <>Tus ganancias ya cubren todo lo que has gastado desde el {diaCorto(rec.desde)}. Lo que entre de ahora en adelante es ganancia.</>}
        {rec.estado === 'en_camino' && <>Al ritmo de la última semana te quedan <b>{cop(rec.ritmo)} por día</b>: lo recuperas en unos <b>{rec.dias} {rec.dias === 1 ? 'día' : 'días'}</b>, hacia el <b>{fecha}</b>.</>}
        {mal && <>Con el ritmo de la última semana <b>todavía no se recupera</b>: estás gastando {cop(-rec.ritmo)} más por día de lo que entra. Revisa en qué se va la plata y qué campañas no están dejando.</>}
      </div>
      <p className="muted only-learner m-oculto" style={{ fontSize: 13, margin: '12px 0 0' }}>
        <b>Gastaste en total</b> = publicidad, devoluciones, comisiones, otros gastos de la tarjeta y herramientas, desde el {diaCorto(rec.desde)}. <b>Entró en total</b> = ganancias de pedidos entregados que ya entraron a tu billetera. Recuperas tu inversión cuando lo que entró iguala lo que gastaste.
        {enCamino.n > 0 && <> Además hay {fmtN(enCamino.n)} {enCamino.n === 1 ? 'pedido' : 'pedidos'} en camino por {cop(enCamino.valor)} en total: su ganancia todavía no cuenta.</>}
      </p>
      <div style={{ marginTop: 10 }}><Link href="/contabilidad" className="link" style={{ fontSize: 14 }}>Ver en qué se fue la plata →</Link></div>
    </div>
  )
}

export const VISTAS = (venta, caja, herr = 0) => [
  { clave: 'venta', etiqueta: 'Por día de venta', dias: venta.serie, nota: 'Cada pedido se cuenta el día que se vendió (cobrado = su ganancia real en tu billetera) y la publicidad el día que Meta la gastó, con IVA. Los pedidos en camino aún no suman ganancia: sus días pueden verse bajos hasta que se entreguen.' },
  { clave: 'pago', etiqueta: 'Por día de pago (caja)', dias: caja.map((x) => ({ ...x, gasto: x.gasto - herr })), nota: 'Cuenta la plata el día en que se mueve: la ganancia cuando Dropi la paga a tu billetera y el gasto cuando se carga a tu tarjeta. Dropi paga días después de la venta, por eso hay días rojos aunque las ventas sean buenas.' },
]

/** Resultado acumulado desde el inicio: cuando la línea cruza el $0 ya recuperaste. (El día por día está en Contabilidad → Cortes.) */
function GraficaAcumulado({ serie }) {
  if (serie.length < 2) return null
  return (
    <GraficaDias dias={serie} tipo="linea" metrica={{ tipo: 'ultimo', campo: 'acumulado' }} formato="cop" color="var(--blue)" termino="recuperacion"
      titularPos="Ya recuperaste tu inversión: llevas {v} de ganancia" titularNeg="Te faltan {v} para recuperar tu inversión" subtitulo="Resultado acumulado desde el inicio de la operación"
      ayuda="cada punto es lo que llevas ganado menos lo que llevas gastado hasta ese día. Cuando la línea sube por encima del $0, ya recuperaste lo invertido. Si baja, ese periodo gastaste más de lo que entró." />
  )
}

/** Inicio: cuatro respuestas, en este orden: ¿cuánto puedo retirar? · ¿cómo voy en este corte? · ¿cuándo recupero mi inversión? · ¿qué tengo que revisar? */
export function VistaDashboard({ d }) {
  const vacio = !d.ganancia.dias.length, base = d.cortes
  const actual = base.cortes.find((c) => c.abierto) || base.cortes[0]
  return (
    <>
      {/* Los cuatro títulos van fuera de las tarjetas, con el mismo estilo: así se leen como una secuencia. */}
      {!vacio && <div className="sec-head" style={{ margin: '0 0 12px' }}><h2>1 · ¿Cuánto puedo retirar hoy? <Ayuda t="salud_billetera" /></h2></div>}
      {!vacio && <PanelSalud s={base.salud} origen={base.origen} inicio={base.inicio} hoy={base.hoy} ritmo={base.ritmoPauta} titulo={null} />}

      {!vacio && actual && <div className="sec-head" style={{ margin: '26px 0 12px' }}><h2>2 · ¿Cómo voy en este corte?</h2></div>}
      {!vacio && actual && <ResumenPeriodo c={actual} per={{ tipo: 'corte', id: actual.id, abierto: actual.abierto }} hoy={base.hoy} enlace={{ href: '/contabilidad', texto: 'Ver el detalle del dinero' }} />}

      <div className="sec-head" style={{ margin: vacio ? '0 0 12px' : '6px 0 12px' }}><h2>3 · ¿Cuándo recupero mi inversión?</h2></div>
      <TarjetaRecuperacion rec={d.rec} enCamino={d.enCamino} vacio={vacio} />
      {!vacio && <div style={{ marginTop: 16 }}><GraficaAcumulado serie={d.ganancia.serie} /></div>}

      <div className="sec-head" style={{ margin: '26px 0 12px' }}><h2>4 · ¿Qué tengo que revisar?</h2></div>
      {d.aviso.length === 0
        ? <Aviso tono="ok" titulo="Todo en orden">No veo nada raro: tus datos están al día y no hay cargos repetidos ni pedidos esperando pago.</Aviso>
        : d.aviso.map((a) => (
          <div key={a.texto} className={'tint ' + a.tono} style={{ marginBottom: 10, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ flex: 1, minWidth: 220, fontSize: 14.5 }}>{a.texto}</span>
            <Link href={a.href} className="btn ghost sm">{a.ir}</Link>
          </div>
        ))}
    </>
  )
}

/* ---------- Cuándo recupero ---------- */
const fechaLarga = (f) => new Date(f + 'T12:00:00Z').toLocaleDateString('es-CO', { day: 'numeric', month: 'long', timeZone: 'UTC' })
export function VistaCuandoRecupero({ d }) {
  const { rec, proy, pedidos } = d, c = pedidos.cuenta
  if (rec.estado === 'sin_datos' && !pedidos.lista.length) return <Aviso tono="blue" titulo="Aún no hay datos">Sincroniza Dropi en Mis cuentas: trae pedidos, billetera y tarjeta para calcular cuándo recuperas.</Aviso>
  const pendientes = pedidos.lista.filter((p) => p.contable === 'sin_pagar' || p.contable === 'en_curso')
  const sin = pendientes.filter((p) => p.contable === 'sin_pagar').length, curso = pendientes.length - sin
  const medio = proy && proy.escenarios.find((e) => e.tasa === proy.tasaBase), g = d.gananciaPorPedido
  const falta = rec.faltan, ya = rec.estado === 'recuperada'
  const tono = ya ? 'ok' : medio && medio.cubre ? 'blue' : 'warn'
  return (
    <>
      <div className={'tint ' + tono} style={{ marginBottom: 16 }}>
        <b style={{ fontSize: 21, color: `var(--${ya ? 'jade' : tono === 'blue' ? 'blue' : 'gold'}-ink)` }}>
          {ya ? `Ya recuperaste tu inversión y llevas ${cop(rec.excedente)} de ganancia.`
            : !proy ? `Te faltan ${cop(falta)} para recuperar tu inversión.`
            : medio.cubre ? `Con lo que ya vendiste recuperas tu inversión hacia el ${fechaLarga(medio.fecha)}.`
            : `Con lo que ya vendiste todavía no alcanzas: te faltarían ${cop(-medio.sobra)}.`}
        </b>
        <div style={{ fontSize: 14.5, marginTop: 4 }}>
          {ya ? 'Tus ganancias cobradas ya cubren todo lo que has gastado desde el inicio de la operación.'
            : !proy ? 'Todavía no hay pedidos pagados para estimar cuánto deja cada pedido ni cuándo paga Dropi.'
            : <>Te faltan <b>{cop(falta)}</b>. Tienes <b>{fmtN(sin)}</b> {sin === 1 ? 'pedido entregado' : 'pedidos entregados'} sin pagar y <b>{fmtN(curso)}</b> en camino. Cada pedido pagado te dejó <b>{cop(g)}</b> en promedio y Dropi suele pagar a los <b>{d.lagDias} días</b> de la venta ({fmtN(d.lagN)} pedidos medidos). {medio.cubre ? `Contando que se entregue el ${Math.round(proy.tasaBase * 100)} % de los que van en camino.` : 'Necesitas seguir vendiendo para cubrir lo que falta.'} No cuenta la publicidad que gastes de ahora en adelante.</>}
        </div>
      </div>
      <div className="kpis" style={{ marginBottom: 16 }}>
        <Kpi ayuda="recuperacion" l="Te faltan" v={cop(falta)} nota={`gastaste ${cop(rec.invertido)} · entró ${cop(rec.recuperado)}`} color={ya ? 'jade-ink' : 'gold-ink'} />
        <Kpi ayuda="sin_pagar" l="Entregados sin pagar" v={fmtN(sin)} nota={g && sin ? `≈ ${cop(sin * g)} que Dropi te debe` : 'ya entregados, esperando el pago'} color={sin ? 'gold-ink' : undefined} />
        <Kpi ayuda="en_curso" l="En camino o pendientes" v={fmtN(curso)} nota={g && curso ? `≈ ${cop(Math.round(curso * g * (proy ? proy.tasaBase : 1)))} si se entrega el ${proy ? Math.round(proy.tasaBase * 100) : 100} %` : 'su ganancia aún no cuenta'} />
        <Kpi l="Ya pagados" v={fmtN(c.pagado || 0)} nota="la ganancia ya está en tu billetera" color="jade-ink" />
      </div>
      {(c.no_verificable || 0) > 0 && <Aviso tono="blue" titulo={`${fmtN(c.no_verificable)} entregados no se pueden verificar`}>Se entregaron antes de lo que cubre la billetera sincronizada{pedidos.billeteraDesde ? ` (desde el ${diaCorto(pedidos.billeteraDesde)})` : ''}: no sé si ya te pagaron.</Aviso>}
      {proy && !ya && (
        <>
          <GraficaDias dias={proy.serie} tipo="linea" metrica={{ tipo: 'ultimo', campo: 'acumulado' }} formato="cop" color="var(--blue)" termino="recuperacion"
            titularPos={`Con tus pedidos pendientes recuperas la inversión y te sobran {v}`} titularNeg={`Con tus pedidos pendientes aún te faltarían {v}`} subtitulo={`Si se entrega el ${Math.round(proy.tasaBase * 100)} % de los que van en camino`}
            ayuda="la línea parte de lo que te falta (negativo) y sube cada día que se espera un pago. Cuando cruza el $0, recuperaste. La fecha de cada pago es la venta + la demora habitual de Dropi." />
          <div className="card" style={{ marginBottom: 16 }}>
            <b style={{ fontSize: 17 }}>¿Y si se entregan menos?</b>
            <p className="muted" style={{ fontSize: 14, margin: '4px 0 10px' }}>Los entregados sin pagar se cuentan completos; solo varía cuántos de los que van en camino llegan a entregarse.</p>
            {proy.escenarios.map((e) => (
              <div key={e.tasa} className="rowline" style={{ alignItems: 'center' }}>
                <span>Se entrega el <b>{Math.round(e.tasa * 100)} %</b> de los que van en camino</span>
                <span style={{ display: 'inline-flex', gap: 16, alignItems: 'baseline', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <span className="muted" style={{ fontSize: 13.5 }}>recibirías {cop(e.esperado)}</span>
                  {e.cubre ? <Chip t="ok">Recuperas el {fechaLarga(e.fecha)}</Chip> : <Chip t="warn">Faltarían {cop(-e.sobra)}</Chip>}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
      <p className="muted only-learner" style={{ fontSize: 14, margin: '0 0 12px' }}>Estos son los pedidos que todavía no se convirtieron en plata en tu billetera. «Sin pagar» = ya se entregó y Dropi no ha pagado la ganancia. Lo estimado usa el promedio real de tus pedidos ya pagados: es una proyección, no una promesa.</p>
      <TablaPedidos lista={pendientes} />
    </>
  )
}

/* ---------- Meta Ads ---------- */
// Mis cuentas → Meta Ads (sin sincronizar: eso va en Campañas): solo lo contable (los cobros con su referencia). El gasto, CPM y CTR por día viven dentro de cada campaña.
export function VistaMeta({ d }) {
  if (!d.conectado) return <Aviso tono="blue" titulo="Aún no hay datos de Meta">Conecta tu cuenta en Configuración → Cuenta de Meta. El gasto, el CPM y el CTR de cada campaña aparecen dentro de la campaña; aquí anotas tus cobros.</Aviso>
  return (
    <>
      <div className="kpis" style={{ marginBottom: 16 }}>
        <Kpi l="Cobrado por Meta (con IVA)" v={cop(d.cobrado)} nota={d.cobros.length ? (d.sinTarjeta ? `${fmtN(d.sinTarjeta)} sin cargo en tu tarjeta` : 'todo cruza con tu tarjeta') : 'aún no has anotado cobros'} color={d.sinTarjeta ? 'gold-ink' : undefined} />
      </div>
      <p className="muted only-learner" style={{ fontSize: 13.5, margin: '-4px 0 14px' }}>Anota o importa los cobros de tu extracto de facturación de Meta, con su referencia de pago: así cada cargo de tu tarjeta se cruza de forma exacta. El gasto por día, CPM y CTR están en <Link href="/campanas" className="link">Campañas</Link>, dentro de cada una.</p>
      <div className="sec-head" style={{ margin: '0 0 10px' }}><h2 style={{ fontSize: 19 }}>Cobros de Meta</h2></div>
      <CobrosMeta cobros={d.cobros} />
    </>
  )
}

/* Dentro de una campaña: lo que gastó en Meta cada día (sin IVA), con CPM y CTR. */
export function VistaGastoCampana({ m, inicio }) {
  if (!m.vinculada) return <Aviso tono="blue" titulo="Esta campaña aún no está unida a una de Meta">Cuando una campaña de Meta tenga el mismo nombre que esta, o la sincronices (botón «Sincronizar», arriba), su gasto aparece aquí.</Aviso>
  if (!m.filas.length) return <Aviso tono="blue" titulo="Todavía no hay gasto de Meta">Pulsa «Sincronizar» (arriba): trae el gasto desde el {diaCorto(inicio)}.</Aviso>
  const r = m.resumen, f = (x) => diaCorto(x.dia), serie = m.serie, con = serie.filter((x) => x.gasto > 0)
  const ultimo = con[con.length - 1], previo = con[con.length - 2]
  const sube = ultimo && previo && ultimo.cpm != null && previo.cpm != null ? ultimo.cpm - previo.cpm : null
  return (
    <>
      <div className="tint blue" style={{ marginBottom: 16 }}>
        <b style={{ color: 'var(--blue)' }}>Gastaste {cop(r.gasto)} sin IVA ({cop(Math.round(r.gasto * (1 + m.vat / 100)))} con IVA) en {fmtN(r.dias)} {r.dias === 1 ? 'día' : 'días'}: {cop(Math.round(r.promedioDia))} por día en promedio.</b>
        <div style={{ fontSize: 14.5, marginTop: 4 }}>
          Mil impresiones te cuestan <b>{r.cpm == null ? '—' : cop(r.cpm)}</b> (CPM) y <b>{r.ctr == null ? '—' : pct(r.ctr)}</b> de quienes lo ven hace clic (CTR).
          {r.mejorCpm && <> El CPM más barato fue el {f(r.mejorCpm)} ({cop(r.mejorCpm.cpm)}) y el más caro el {f(r.peorCpm)} ({cop(r.peorCpm.cpm)}).</>}
          {r.mejorCtr && <> El mejor CTR fue el {f(r.mejorCtr)} ({pct(r.mejorCtr.ctr)}).</>}
          {sube != null && Math.abs(sube) >= 1 && <> El último día con gasto ({f(ultimo)}) el CPM {sube > 0 ? 'subió' : 'bajó'} {cop(Math.abs(sube))} frente al día anterior.</>}
        </div>
      </div>
      <div className="kpis" style={{ marginBottom: 16 }}>
        <Kpi l="Gastado (sin IVA)" v={cop(r.gasto)} nota={`${fmtN(r.dias)} ${r.dias === 1 ? 'día' : 'días'} con gasto desde el ${diaCorto(inicio)}`} />
        <Kpi ayuda="gasto_iva" l={`Con IVA (${m.vat} %)`} v={cop(Math.round(r.gasto * (1 + m.vat / 100)))} nota="lo que debería salir de tu tarjeta" />
        <Kpi ayuda="cpm" l="CPM" v={r.cpm == null ? '—' : cop(r.cpm)} nota="costo por mil impresiones (sin IVA)" />
        <Kpi ayuda="ctr" l="CTR" v={r.ctr == null ? '—' : pct(r.ctr)} nota={`${fmtN(Math.round(r.clics))} clics · ${fmtN(Math.round(r.impresiones))} impresiones`} />
      </div>
      <GraficaDias dias={serie} tipo="barras" metrica={{ tipo: 'suma', campo: 'gasto' }} formato="cop" titulo="Gastado en Meta" subtitulo="Gasto diario, sin IVA" termino="gasto_iva"
        ayuda="cuánto gastó la campaña cada día. Los días sin barra no hubo gasto. Con IVA, súmale el 19 %." />
      <GraficaDias dias={serie} tipo="linea" metrica={{ tipo: 'cpm' }} formato="cop" color="var(--blue)" titulo="CPM" subtitulo="Costo por mil impresiones" termino="cpm"
        ayuda="cuánto pagas por cada mil veces que se muestra el anuncio. Si sube varios días seguidos, el anuncio se está cansando o hay más competencia." />
      <GraficaDias dias={serie} tipo="linea" metrica={{ tipo: 'ctr' }} formato="pct" color="var(--jade)" titulo="CTR" subtitulo="De cada 100 veces que se vio, cuántas hicieron clic" termino="ctr"
        ayuda="qué porcentaje de quienes ven el anuncio hace clic. Si baja con el CPM estable, el creativo está perdiendo fuerza." />
      <TablaGastoMeta filas={m.filas} />
    </>
  )
}

/* ---------- Cuándo escalar (dentro de una campaña) ---------- */
export function VistaEscalar({ e, nombre, vinculada }) {
  if (!vinculada) return <Aviso tono="blue" titulo="Esta campaña aún no está unida a una de Meta">Para decidir si escalar necesito su gasto diario de Meta. Sincroniza en Campañas (arriba) o revisa que el nombre coincida con el de Meta.</Aviso>
  if (!e || e.veredicto === 'sin_datos') return <Aviso tono="blue" titulo="Todavía no hay datos para decidir">Necesito días con gasto en Meta y al menos un pedido ya pagado de esta campaña para saber cuánto te deja cada venta. Asigna los productos a la campaña y sincroniza Dropi.</Aviso>
  const tono = { escalar: 'ok', vigilar: 'warn', pausar: 'bad' }[e.veredicto], col = { ok: 'jade-ink', warn: 'gold-ink', bad: 'coral-ink' }[tono]
  const titular = e.veredicto === 'escalar' ? `Puedes escalar «${nombre}»: sube el presupuesto ${e.incremento} %`
    : e.veredicto === 'pausar' ? `Pausa «${nombre}» y revísala` : `Vigila «${nombre}»: todavía no cumple para escalar`
  const fallan = e.checks.filter((c) => !c.ok)
  return (
    <>
      <div className={'tint ' + tono} style={{ marginBottom: 16 }}>
        <b style={{ fontSize: 21, color: `var(--${col})` }}>{titular}</b>
        <div style={{ fontSize: 14.5, marginTop: 4 }}>
          {e.veredicto === 'escalar' && <>Pasa de {cop(Math.round(e.presupuesto))} a <b>{cop(Math.round(e.nuevoPresupuesto))}</b> por día (sin IVA) y espera <b>3 días</b> antes de volver a subir. Si el costo por venta se dispara, vuelve al presupuesto anterior.</>}
          {e.veredicto === 'vigilar' && <>Falta: {fallan.map((c) => c.texto.split(':')[0].toLowerCase()).join('; ')}. No subas el presupuesto todavía.</>}
          {e.veredicto === 'pausar' && <>Por cada $1 que pones, recuperas ${e.roasPrudente.toFixed(2)} de ganancia (con entrega prudente): estás perdiendo plata. Revisa el anuncio o el producto antes de gastar más.</>}
        </div>
      </div>
      <div className="kpis" style={{ marginBottom: 16 }}>
        <Kpi l="Presupuesto diario" v={cop(Math.round(e.presupuesto))} nota={`promedio de los últimos ${e.n} ${e.n === 1 ? 'día' : 'días'} con gasto (sin IVA)`} />
        <Kpi l="Ventas por día" v={String(e.conv).replace('.', ',')} nota="pedidos vendidos por día, en esos días" />
        <Kpi ayuda="cpa" l="Costo por venta" v={e.cpa == null ? '—' : cop(e.cpa)} nota={`máximo recomendado ${cop(e.cpaMax)}`} color={e.cpa != null && e.cpa <= e.cpaMax ? 'jade-ink' : 'coral-ink'} />
        <Kpi ayuda="roas" l="ROAS de margen" v={`${String(e.roasPrudente).replace('.', ',')}×`} nota={`con todo lo vendido sería ${String(e.roas).replace('.', ',')}×`} color={e.roasPrudente >= 2 ? 'jade-ink' : e.roasPrudente >= 1 ? 'gold-ink' : 'coral-ink'} />
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <b style={{ fontSize: 17 }}>Las cinco reglas para escalar<Ayuda t="escalar" /></b>
        <div style={{ marginTop: 10 }}>
          {e.checks.map((c) => (
            <div key={c.clave} className="rowline" style={{ alignItems: 'center' }}>
              <span>{c.texto}</span>
              <Chip t={c.ok ? 'ok' : 'warn'}>{c.ok ? 'Cumple' : 'Falta'}</Chip>
            </div>
          ))}
        </div>
        <p className="muted only-learner" style={{ fontSize: 13.5, margin: '12px 0 0' }}>
          El <b>ROAS de margen</b> es lo que recuperas de ganancia por cada peso (con IVA) que pones en anuncios: ventas × lo que te deja cada venta ({cop(Math.round(e.margen))}, promedio real de tus pedidos pagados) ÷ el gasto. Como una parte de lo vendido todavía va en camino o puede devolverse, para decidir cuento solo el {Math.round(e.tasa * 100)} % de las ventas; por eso el ROAS que ves es el prudente. El incremento sugerido es 25 % desde 2×, 50 % desde 2,5×, 75 % desde 3× y 100 % desde 4×.
        </p>
      </div>
    </>
  )
}

/* ---------- Informe de pedidos por día (Dropi × Meta) ---------- */
export function VistaInformeDiario({ filas, nombre }) {
  const con = filas.filter((x) => x.ventas > 0 || x.publicidad > 0)
  if (!con.length) return <Aviso tono="blue" titulo="Aún no hay pedidos por día">Sincroniza Dropi (y Meta) para ver cuántos pedidos sacas cada día.</Aviso>
  const t = (k) => filas.reduce((a, x) => a + x[k], 0), dias = filas.length
  const ult7 = filas.slice(-7), v7 = ult7.reduce((a, x) => a + x.ventas, 0)
  const mejor = filas.reduce((m, x) => (x.ventas > m.ventas ? x : m), filas[0]), pub = t('publicidad')
  const sinPedidos = filas.filter((x) => x.ventas === 0 && x.dia < hoyBogota()).length
  return (
    <>
      <div className="tint blue" style={{ marginBottom: 16 }}>
        <b style={{ color: 'var(--blue)', fontSize: 19 }}>{nombre ? `«${nombre}»` : 'Tus campañas'} saca {String(Math.round((t('ventas') / dias) * 10) / 10).replace('.', ',')} pedidos por día en promedio ({fmtN(t('ventas'))} en {fmtN(dias)} {dias === 1 ? 'día' : 'días'}).</b>
        <div style={{ fontSize: 14.5, marginTop: 4 }}>
          En los últimos 7 días fueron <b>{fmtN(v7)}</b> ({String(Math.round((v7 / ult7.length) * 10) / 10).replace('.', ',')} por día). El mejor día fue el <b>{diaCorto(mejor.dia)}</b> con <b>{fmtN(mejor.ventas)}</b> pedidos
          {pub > 0 && t('ventas') > 0 && <>; cada pedido vendido te costó <b>{cop(Math.round(pub / t('ventas')))}</b> en publicidad (con IVA)</>}.
          {sinPedidos > 0 && <> Hubo {fmtN(sinPedidos)} {sinPedidos === 1 ? 'día' : 'días'} sin pedidos.</>}
        </div>
      </div>
      <div className="kpis" style={{ marginBottom: 16 }}>
        <Kpi l="Pedidos vendidos" v={fmtN(t('ventas'))} nota="creados en Dropi, sin cancelados" />
        <Kpi ayuda="sin_pagar" l="Entregados" v={fmtN(t('entregados'))} nota={`${fmtN(t('pagados'))} ya pagados por Dropi`} color="jade-ink" />
        <Kpi ayuda="en_curso" l="En camino" v={fmtN(t('enCamino'))} nota="su ganancia aún no cuenta" />
        <Kpi ayuda="devolucion" l="Devueltos" v={fmtN(t('devueltos'))} color={t('devueltos') ? 'coral-ink' : undefined} nota={t('entregados') + t('devueltos') ? `${Math.round((t('devueltos') / (t('entregados') + t('devueltos'))) * 100)} % de los que terminaron` : null} />
      </div>
      <GraficaDias dias={filas} tipo="barras" metrica={{ tipo: 'suma', campo: 'ventas' }} formato="n" titulo="Pedidos vendidos" subtitulo="Pedidos creados cada día (sin cancelados)"
        ayuda="cuántos pedidos entraron cada día, según Dropi. Pasa el cursor para ver cuántos van entregados, en camino o devueltos." />
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px 8px' }}><b style={{ fontSize: 17 }}>Día por día</b></div>
        <div style={{ maxHeight: 560, overflow: 'auto' }}>
          <table className="tbl" style={{ minWidth: 760 }}>
            <thead><tr><th className="st">Día</th><th>Pedidos</th><th>Entregados</th><th>En camino</th><th>Devueltos</th><th>Publicidad (con IVA)</th><th>Costo por pedido</th><th>Ganancia cobrada</th></tr></thead>
            <tbody>
              {[...filas].reverse().map((x) => (
                <tr key={x.dia}>
                  <td className="st">{diaCorto(x.dia)}</td><td><b>{fmtN(x.ventas)}</b></td><td>{fmtN(x.entregados)}</td><td>{fmtN(x.enCamino)}</td><td style={{ color: x.devueltos ? 'var(--coral-ink)' : undefined }}>{fmtN(x.devueltos)}</td>
                  <td>{x.publicidad ? cop(x.publicidad) : '—'}</td><td>{x.publicidad && x.ventas ? cop(x.publicidad / x.ventas) : '—'}</td><td style={{ color: x.entro ? 'var(--jade-ink)' : undefined }}>{x.entro ? cop(x.entro) : '—'}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 700 }}><td className="st">Total</td><td>{fmtN(t('ventas'))}</td><td>{fmtN(t('entregados'))}</td><td>{fmtN(t('enCamino'))}</td><td>{fmtN(t('devueltos'))}</td><td>{cop(pub)}</td><td>{t('ventas') ? cop(pub / t('ventas')) : '—'}</td><td>{cop(t('entro'))}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      <p className="muted only-learner" style={{ fontSize: 13.5, margin: '10px 0 0' }}>Cada pedido se cuenta el día en que se creó en Dropi. «Ganancia cobrada» es la que Dropi ya pagó a tu billetera por los pedidos de ese día; la de los que van en camino llegará después. La publicidad es la que Meta gastó ese día (con IVA).</p>
    </>
  )
}
