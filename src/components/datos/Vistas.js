import { cop, corto, fmtN, diaCorto } from '@/lib/formato'
import { hoyBogota, sumarDias } from '@/domain/fechas.ts'
import Link from 'next/link'
import { TablaTarjeta, TablaBilletera, TablaPedidos, TablaDias, TablaGastoMeta, TablaCobrosMeta } from './TablasDatos'
import BilleteraVisual from './BilleteraVisual'
import TarjetaDropi from './TarjetaDropi'
import GraficaGanancia from './GraficaGanancia'
import { costoPorVenta, repartoDeCostos, costosDelDia } from '@/domain/porDia.ts'

// Vistas de solo lectura de los datos sincronizados. Componentes de servidor: reciben datos ya calculados (src/lib/datos.js + src/domain).
const Chip = ({ t, children }) => <span className={'chip ' + t}>{children}</span>
const Kpi = ({ l, v, nota, color }) => (
  <div className="card"><div className="kpi-l">{l}</div><div className="kpi-v" style={color ? { color: `var(--${color})` } : undefined}>{v}</div>{nota && <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{nota}</div>}</div>
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
          <Kpi l="Entregados sin pagar" v={fmtN(c.sin_pagar || 0)} nota="Dropi aún no los paga" color={c.sin_pagar ? 'gold-ink' : undefined} />
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
export function VistaGananciaDia({ d }) {
  if (!d.dias.length) return <Aviso tono="blue" titulo="Aún no hay datos para calcular tu ganancia">Sincroniza tu billetera y tu tarjeta en Mis cuentas → Dropi.</Aviso>
  const r = d.resumen
  const tono = r.veredicto === 'gana' ? 'ok' : r.veredicto === 'pierde' ? 'bad' : 'warn'
  const col = { ok: 'jade-ink', bad: 'coral-ink', warn: 'gold-ink' }[tono]
  const costos = [['Publicidad en Meta (con IVA)', r.total.meta], ['Otros gastos de la tarjeta', r.total.otrosGastos], ['Devoluciones', r.total.devoluciones], ['Comisiones y mantenimiento de la tarjeta', r.total.comisiones], ['Otros descuentos de Dropi', r.total.otrosDescuentos], ['Herramientas', r.herramientas]].filter((x) => x[1] > 0)
  const top = [...costos].sort((a, b) => b[1] - a[1])[0]
  const retorno = r.retornoPorPesoEnMeta
  return (
    <>
      <div className={'tint ' + tono} style={{ marginBottom: 16 }}>
        <b style={{ fontSize: 24, color: `var(--${col})` }}>{r.veredicto === 'gana' ? 'Estás GANANDO' : r.veredicto === 'pierde' ? 'Estás PERDIENDO' : 'Estás en equilibrio'}: {cop(r.neto)}</b>
        <div style={{ fontSize: 14.5, marginTop: 4 }}>
          Ganancias de pedidos entregados {cop(r.total.ganancia)} menos {cop(r.costos)} de costos, de {fmtN(d.dias.length)} {d.dias.length === 1 ? 'día' : 'días'} con movimientos.
          {retorno != null && <> Por cada <b>$1</b> en Meta recuperas <b>${retorno.toFixed(2)}</b> de ganancia.</>}
          {r.veredicto === 'pierde' && top && <> Lo que más pesa es <b>{top[0].toLowerCase()}</b> ({cop(top[1])}).</>}
        </div>
        <div className="muted only-learner" style={{ fontSize: 13, marginTop: 6 }}>La ganancia de un pedido entra a la billetera cuando se <b>entrega</b>: si pautas mucho ahora, los pedidos en camino todavía no cuentan y puede verse peor de lo que será.</div>
      </div>
      {!d.hayCobros && <Aviso titulo="Sin cobros de Meta cargados">El gasto en Meta aparece dentro de «otros gastos de la tarjeta». El total no cambia; cuando se conecte Meta se separa.</Aviso>}
      <div className="card" style={{ marginBottom: 16 }}>
        <b>Ganancia de cada día</b>
        <p className="muted only-learner" style={{ fontSize: 13.5, margin: '2px 0 8px' }}>Cada barra es lo que entró ese día por pedidos entregados menos lo que gastaste. Verde: te quedó plata. Roja: gastaste más de lo que entró. Pasa el mouse por una barra para ver el detalle.</p>
        <GraficaGanancia dias={[...d.dias].slice(0, 14).reverse()} />
      </div>
      <TablaDias dias={d.dias} />
      {d.herramientasPorDia > 0 && <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>Las herramientas ({cop(d.herramientasPorDia)} por día) se descuentan solo en el total, no en cada día.</p>}
    </>
  )
}

/* ---------- Caja ---------- */
export function VistaCaja({ d }) {
  const hace = d.tarjeta ? Math.max(1, Math.round((Date.now() - d.tarjeta.leido) / 60000)) : null
  return (
    <>
      {!d.tarjeta && <Aviso tono="blue" titulo="Aún no hay saldo de la tarjeta">Conecta Dropi y sincroniza: el saldo lo informa Dropi, no se calcula.</Aviso>}
      <div className="kpis">
        <Kpi l="Disponible en tu tarjeta" v={d.tarjeta ? cop(d.tarjeta.monto) : '—'} nota={d.tarjeta ? `según Dropi, leído hace ${hace < 60 ? hace + ' min' : Math.round(hace / 60) + ' h'}` : null} />
        <Kpi l="En tu billetera" v={d.billetera == null ? '—' : cop(d.billetera)} nota="según el último movimiento" />
        <Kpi l="Pedidos entregados" v={fmtN(d.entregados.n)} nota={`por ${cop(d.entregados.valor)} en total`} />
      </div>
      <p className="muted only-learner" style={{ fontSize: 14, marginTop: 14 }}>El saldo de la tarjeta lo informa Dropi y nunca se calcula: así no puede quedar en negativo por datos que faltan. Para saber para cuántos días alcanza falta el gasto diario de Meta (llega con la conexión a Meta Ads).</p>
    </>
  )
}

/* ---------- Dashboard ---------- */
/** Sigue tu plata de izquierda a derecha (diseño de las cajas con flechas de la app original): billetera → tarjeta → lo que gastaste → tus pedidos. */
function FlujoDinero({ d }) {
  const t = d.ganancia.resumen.total, c = d.pedidos.cuenta
  const dev = (c.devuelto || 0) + (c.devuelto_cobrado || 0), entregados = (c.pagado || 0) + (c.sin_pagar || 0) + (c.no_verificable || 0), enCurso = c.en_curso || 0
  const caja = (n, titulo, grande, sub, extra) => (
    <div className="card md-box">
      <div className="md-ttl"><span className="md-n">{n}</span>{titulo}</div>
      <div className="md-big">{grande}</div>
      <div className="md-sub">{sub}</div>
      {extra && <div style={{ marginTop: 10 }}>{extra}</div>}
    </div>
  )
  const flecha = <div className="md-warrow" aria-hidden="true">→</div>
  return (
    <>
      <div className="md-flow" style={{ marginTop: 16 }}>
        {caja(1, 'Billetera', d.caja.billetera == null ? '—' : cop(d.caja.billetera), 'Ganancias de tus ventas entregadas, en Dropi.')}
        {flecha}
        {caja(2, 'Tarjeta', d.caja.tarjeta ? cop(d.caja.tarjeta.monto) : '—', 'Con esto se paga la publicidad. El saldo lo informa Dropi.')}
        {flecha}
        {caja(3, 'Gastaste', cop(t.meta + t.otrosGastos), 'Salió de tu tarjeta.', d.hayCobros ? <Chip t="blue">Meta {cop(t.meta)} · otros {cop(t.otrosGastos)}</Chip> : <Chip t="idle">Meta se separa al conectarla</Chip>)}
        {flecha}
        {caja(4, 'Pedidos', fmtN(d.pedidos.lista.length), `${fmtN(d.pedidos.hoy)} hoy · ${fmtN(enCurso)} en curso · ${fmtN(entregados)} entregados · ${fmtN(dev)} devueltos`)}
      </div>
      <p className="md-how only-learner" style={{ margin: '0 0 4px' }}><b>Cómo leer esto:</b> sigue tu plata de izquierda a derecha. <b>1)</b> lo que ganas y llega a tu billetera, <b>2)</b> lo que pasas a la tarjeta, <b>3)</b> lo que gastas (publicidad y otros), <b>4)</b> los pedidos que lo generan.</p>
    </>
  )
}

/** La pregunta principal: ¿cuándo recupero la inversión? Cuánto invertiste, cuánto llevas recuperado, qué falta y cuándo (al ritmo de la última semana). */
function TarjetaRecuperacion({ rec, enCamino, vacio }) {
  if (vacio) return <Aviso tono="blue" titulo="¿Cuándo recupero mi inversión?">Todavía no hay datos. Conecta Dropi y sincroniza (Mis cuentas): aquí verás cuánto has invertido, cuánto llevas recuperado y cuándo lo recuperas.</Aviso>
  const ok = rec.estado === 'recuperada', mal = rec.estado === 'sin_ritmo'
  const color = ok ? '#10B981' : mal ? '#F59E0B' : '#3B82F6'
  const ink = ok ? 'var(--jade-ink)' : mal ? 'var(--gold-ink)' : 'var(--blue)'
  const fecha = rec.fecha ? new Date(rec.fecha + 'T12:00:00Z').toLocaleDateString('es-CO', { day: 'numeric', month: 'long', timeZone: 'UTC' }) : null
  const titulo = ok ? '¡Ya recuperaste tu inversión!' : `Has recuperado el ${rec.pct} % de lo que invertiste`
  return (
    <div className="card" style={{ borderColor: ok ? 'var(--jade-line)' : undefined }}>
      <div className="kpi-l">¿Cuándo recupero mi inversión?</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: ink, margin: '6px 0 14px', letterSpacing: '-.01em' }}>{titulo}</div>
      <div style={{ height: 18, borderRadius: 999, background: '#E2E8F0', overflow: 'hidden' }} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={rec.pct ?? 0} aria-label="Inversión recuperada">
        <div style={{ width: `${Math.max(rec.pct ?? 0, rec.pct ? 2 : 0)}%`, height: '100%', background: color, borderRadius: 999, transition: 'width .4s' }} />
      </div>
      <div style={{ display: 'flex', gap: '10px 34px', flexWrap: 'wrap', marginTop: 16 }}>
        <div><div className="muted" style={{ fontSize: 13 }}>Invertiste</div><div className="num" style={{ fontSize: 22, fontWeight: 700 }}>{cop(rec.invertido)}</div></div>
        <div><div className="muted" style={{ fontSize: 13 }}>Recuperaste</div><div className="num" style={{ fontSize: 22, fontWeight: 700, color: 'var(--jade-ink)' }}>{cop(rec.recuperado)}</div></div>
        <div><div className="muted" style={{ fontSize: 13 }}>{ok ? 'Ganancia después de recuperar' : 'Te faltan'}</div><div className="num" style={{ fontSize: 22, fontWeight: 700, color: ok ? 'var(--jade-ink)' : ink }}>{cop(ok ? rec.excedente : rec.faltan)}</div></div>
      </div>
      <div className={'tint ' + (ok ? 'ok' : mal ? 'warn' : 'blue')} style={{ marginTop: 16, padding: '12px 16px', fontSize: 14.5 }}>
        {ok && <>Tus ganancias ya cubren todo lo que has gastado desde el {diaCorto(rec.desde)}. Lo que entre de ahora en adelante es ganancia.</>}
        {rec.estado === 'en_camino' && <>Al ritmo de la última semana te quedan <b>{cop(rec.ritmo)} por día</b>: lo recuperas en unos <b>{rec.dias} {rec.dias === 1 ? 'día' : 'días'}</b>, hacia el <b>{fecha}</b>.</>}
        {mal && <>Con el ritmo de la última semana <b>todavía no se recupera</b>: estás gastando {cop(-rec.ritmo)} más por día de lo que entra. Revisa en qué se va la plata y qué campañas no están dejando.</>}
      </div>
      <p className="muted only-learner" style={{ fontSize: 13, margin: '12px 0 0' }}>
        <b>Invertiste</b> = publicidad, devoluciones, comisiones, otros gastos de la tarjeta y herramientas, desde el {diaCorto(rec.desde)}. <b>Recuperaste</b> = ganancias de pedidos entregados que ya entraron a tu billetera.
        {enCamino.n > 0 && <> Además hay {fmtN(enCamino.n)} {enCamino.n === 1 ? 'pedido' : 'pedidos'} en camino por {cop(enCamino.valor)} en total: su ganancia todavía no cuenta.</>}
      </p>
      <div style={{ marginTop: 10 }}><Link href="/contabilidad/a-donde-va-mi-plata" className="link" style={{ fontSize: 14 }}>Ver en qué se fue la plata →</Link></div>
    </div>
  )
}

/** Los últimos 7 días (todos, también los sin movimientos): cuánto te quedó cada día, con su monto y una explicación. */
function SemanaGrafica({ dias }) {
  const hoy = hoyBogota()
  const por = new Map(dias.map((x) => [x.dia, x]))
  const sem = Array.from({ length: 7 }, (_, i) => { const dia = sumarDias(hoy, i - 6); const x = por.get(dia); return { dia, neto: x ? x.neto : 0, ganancia: x ? x.ganancia : 0, hay: !!x } })
  const gano = sem.reduce((a, x) => a + x.ganancia, 0), neto = sem.reduce((a, x) => a + x.neto, 0), gasto = gano - neto
  const max = Math.max(1, ...sem.map((x) => Math.abs(x.neto))), MITAD = 78 // px disponibles por encima y por debajo de la línea del $0
  const alto = (v) => Math.max(5, Math.round((Math.abs(v) / max) * (MITAD - 20)))
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h2 style={{ fontSize: 18 }}>¿Cuánto te quedó cada día?</h2>
      <p className="muted only-learner" style={{ margin: '4px 0 0', fontSize: 14 }}>Cada barra es lo que entró ese día por pedidos entregados menos lo que gastaste. <b style={{ color: 'var(--jade-ink)' }}>Verde</b>: te quedó plata. <b style={{ color: 'var(--coral-ink)' }}>Roja</b>: gastaste más de lo que entró.</p>
      <div style={{ display: 'flex', gap: '6px 26px', flexWrap: 'wrap', margin: '14px 0 8px', fontSize: 14 }}>
        <span><span className="muted">Entró</span> <b className="num">{cop(gano)}</b></span>
        <span><span className="muted">Gastaste</span> <b className="num">{cop(gasto)}</b></span>
        <span><span className="muted">En 7 días te quedó</span> <b className="num" style={{ color: neto < 0 ? 'var(--coral-ink)' : 'var(--jade-ink)' }}>{cop(neto)}</b></span>
      </div>
      <div style={{ position: 'relative', display: 'flex', gap: 10 }} role="img" aria-label={`Neto de cada uno de los últimos 7 días: ${sem.map((x) => `${diaCorto(x.dia)} ${cop(x.neto)}`).join(', ')}`}>
        <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, top: MITAD, borderTop: '1px dashed #CBD5E1' }} />
        <span aria-hidden="true" className="muted" style={{ position: 'absolute', left: 0, top: MITAD - 17, fontSize: 11, background: '#fff', paddingRight: 4 }}>$0</span>
        {sem.map((x) => (
          <div key={x.dia} title={x.hay ? `${diaCorto(x.dia)}: ${cop(x.neto)}` : `${diaCorto(x.dia)}: sin movimientos`} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ height: MITAD, width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center' }}>
              {x.neto > 0 && <><b className="num" style={{ fontSize: 12.5, color: 'var(--jade-ink)', marginBottom: 3 }}>{corto(x.neto)}</b><div style={{ width: '62%', height: alto(x.neto), background: '#10B981', borderRadius: '6px 6px 0 0' }} /></>}
            </div>
            <div style={{ height: MITAD, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              {x.neto < 0 && <><div style={{ width: '62%', height: alto(x.neto), background: '#EF4444', borderRadius: '0 0 6px 6px' }} /><b className="num" style={{ fontSize: 12.5, color: 'var(--coral-ink)', marginTop: 3 }}>{corto(x.neto)}</b></>}
              {!x.hay && <span className="muted" style={{ fontSize: 12, marginTop: 6 }}>sin mov.</span>}
              {x.hay && x.neto === 0 && <b className="num muted" style={{ fontSize: 12.5, marginTop: 4 }}>$0</b>}
            </div>
            <div style={{ fontSize: 12.5, fontWeight: x.dia === hoy ? 700 : 500, color: x.dia === hoy ? 'var(--ink)' : 'var(--muted)' }}>{x.dia === hoy ? 'Hoy' : diaCorto(x.dia)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function VistaDashboard({ d }) {
  const vacio = !d.ganancia.dias.length
  return (
    <>
      <TarjetaRecuperacion rec={d.rec} enCamino={d.enCamino} vacio={vacio} />
      <FlujoDinero d={d} />

      {!vacio && <SemanaGrafica dias={d.ganancia.dias} />}

      <div className="sec-head" style={{ margin: '26px 0 12px' }}><h2>Qué mirar hoy</h2></div>
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

/* ---------- Costo por venta ---------- */
export function VistaCostoPorVenta({ d }) {
  if (!d.dias.length) return <Aviso tono="blue" titulo="Aún no hay datos">Sincroniza tu billetera y tu tarjeta en Mis cuentas → Dropi.</Aviso>
  const r = d.resumen, c = costoPorVenta(r.total, r.neto)
  return (
    <>
      {!d.hayCobros && <Aviso titulo="El costo por venta necesita el gasto en Meta">Hoy no hay cobros de Meta cargados, así que no puedo separar lo que gastaste en publicidad. Cuando se conecte Meta, aquí verás cuánto te cuesta conseguir cada pedido.</Aviso>}
      <div className="kpis">
        <Kpi l="Pedidos entregados" v={fmtN(c.entregas)} nota="los que ya te generaron ganancia" />
        <Kpi l="Costo por venta (CPA real)" v={c.cpa == null ? '—' : cop(c.cpa)} nota={c.cpa == null ? 'sin gasto de Meta identificado' : `${cop(c.gastoMeta)} de Meta entre ${fmtN(c.entregas)} pedidos`} />
        <Kpi l="Ganancia por pedido" v={c.gananciaPorPedido == null ? '—' : cop(c.gananciaPorPedido)} nota="antes de publicidad y demás costos" color="jade-ink" />
        <Kpi l="Te queda por pedido" v={c.quedaPorPedido == null ? '—' : cop(c.quedaPorPedido)} nota="ganancia − costo de la publicidad" color={c.quedaPorPedido != null ? (c.quedaPorPedido >= 0 ? 'jade-ink' : 'coral-ink') : undefined} />
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <div className="rowline"><span>Con <b>todos</b> los costos (devoluciones, comisiones, otros gastos, herramientas)</span><b className="num" style={{ color: c.netoPorPedido != null && c.netoPorPedido < 0 ? 'var(--coral-ink)' : 'var(--jade-ink)' }}>{c.netoPorPedido == null ? '—' : cop(c.netoPorPedido)} por pedido</b></div>
        <p className="muted only-learner" style={{ fontSize: 13.5, margin: '10px 0 0' }}>El costo por venta es lo que pagaste en anuncios dividido entre los pedidos <b>entregados</b> (no los generados): es el costo real de una venta que sí se cobró. Los pedidos devueltos no cuentan, pero su publicidad sí. Ojo: el gasto de un período y las entregas de ese mismo período no son los mismos pedidos (lo que entregaste hoy pudo anunciarse días antes), así que mide períodos largos, no un solo día.</p>
      </div>
    </>
  )
}

/* ---------- A dónde va mi plata ---------- */
const COLORES = ['#3B82F6', '#94A3B8', '#EF4444', '#F59E0B', '#0F172A', '#8B5CF6']
export function VistaDondeVaMiPlata({ d }) {
  if (!d.dias.length) return <Aviso tono="blue" titulo="Aún no hay datos">Sincroniza tu billetera y tu tarjeta en Mis cuentas → Dropi.</Aviso>
  const r = d.resumen, filas = repartoDeCostos(costosDelDia(r.total, r.herramientas), r.total.ganancia)
  const total = filas.reduce((a, f) => a + f.monto, 0)
  return (
    <>
      <div className="kpis" style={{ marginBottom: 16 }}>
        <Kpi l="Te entró (ganancias de pedidos)" v={cop(r.total.ganancia)} color="jade-ink" />
        <Kpi l="Se fue en costos" v={cop(total)} color="coral-ink" />
        <Kpi l={r.neto >= 0 ? 'Te quedó' : 'Perdiste'} v={cop(r.neto)} color={r.neto >= 0 ? 'jade-ink' : 'coral-ink'} />
      </div>
      {!d.hayCobros && <Aviso titulo="Sin cobros de Meta cargados">La publicidad aparece dentro de «otros gastos de la tarjeta». Cuando se conecte Meta se separa.</Aviso>}
      <div className="card">
        <h2 style={{ marginBottom: 14 }}>En qué se fue cada peso</h2>
        <div style={{ display: 'flex', height: 34, borderRadius: 8, overflow: 'hidden' }} role="img" aria-label="Reparto de los costos">
          {filas.map((f, i) => <div key={f.nombre} title={`${f.nombre}: ${cop(f.monto)}`} style={{ width: `${(f.monto / (total || 1)) * 100}%`, background: COLORES[i % COLORES.length], color: '#fff', fontSize: 12, fontWeight: 700, display: 'grid', placeItems: 'center', overflow: 'hidden', whiteSpace: 'nowrap' }}>{f.pctDelCosto >= 9 ? `${f.pctDelCosto}%` : ''}</div>)}
        </div>
        <div style={{ marginTop: 14 }}>
          {filas.map((f, i) => (
            <div key={f.nombre} className="rowline" style={{ alignItems: 'center' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: COLORES[i % COLORES.length] }} />{f.nombre}</span>
              <span style={{ display: 'inline-flex', gap: 16, alignItems: 'baseline' }}>
                <span className="muted" style={{ fontSize: 13 }}>{f.pctDelCosto} % de los costos{f.pctDeLaGanancia != null ? ` · ${f.pctDeLaGanancia} % de tu ganancia` : ''}</span>
                <b className="num">{cop(f.monto)}</b>
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

/* ---------- Cuándo recupero ---------- */
export function VistaCuandoRecupero({ d }) {
  const c = d.cuenta, aEsperar = d.lista.filter((p) => p.contable === 'sin_pagar' || p.contable === 'en_curso')
  if (!d.lista.length) return <Aviso tono="blue" titulo="Aún no hay pedidos">Sincroniza Dropi en Mis cuentas: trae los pedidos con su estado real (menos los cancelados).</Aviso>
  const sin = aEsperar.filter((p) => p.contable === 'sin_pagar'), curso = aEsperar.filter((p) => p.contable === 'en_curso')
  const valor = (arr) => arr.reduce((a, p) => a + (p.total || 0), 0)
  const masViejo = sin.reduce((m, p) => Math.max(m, p.dias || 0), 0)
  return (
    <>
      <div className="kpis" style={{ marginBottom: 16 }}>
        <Kpi l="Entregados sin pagar" v={fmtN(sin.length)} nota={`por ${cop(valor(sin))} en pedidos${masViejo ? ` · el más viejo hace ${masViejo} d` : ''}`} color={sin.length ? 'gold-ink' : undefined} />
        <Kpi l="En camino o pendientes" v={fmtN(curso.length)} nota={`por ${cop(valor(curso))} en pedidos`} />
        <Kpi l="Ya pagados" v={fmtN(c.pagado || 0)} nota="la ganancia ya está en tu billetera" color="jade-ink" />
      </div>
      {(c.no_verificable || 0) > 0 && <Aviso tono="blue" titulo={`${fmtN(c.no_verificable)} entregados no se pueden verificar`}>Se entregaron antes de lo que cubre la billetera sincronizada{d.billeteraDesde ? ` (desde el ${diaCorto(d.billeteraDesde)})` : ''}: no sé si ya te pagaron.</Aviso>}
      <p className="muted only-learner" style={{ fontSize: 14, margin: '0 0 12px' }}>Estos son los pedidos que todavía no se convirtieron en plata en tu billetera. «Sin pagar» = ya se entregó y Dropi no ha pagado la ganancia. El valor es el total del pedido, no tu ganancia.</p>
      <TablaPedidos lista={aEsperar} />
    </>
  )
}

/* ---------- Meta Ads ---------- */
export function VistaMeta({ d }) {
  if (!d.conectado) return <Aviso tono="blue" titulo="Aún no hay datos de Meta">Conecta tu cuenta en Configuración → Cuenta de Meta. Después, aquí verás el gasto de cada campaña y tus cobros.</Aviso>
  if (!d.filas.length && !d.cobros.length) return <Aviso tono="blue" titulo="Todavía no has traído datos">Pulsa «Sincronizar» (arriba): trae el gasto de tus campañas y tus cobros desde el {diaCorto(d.inicio)}.</Aviso>
  const t = d.tot
  return (
    <>
      <div className="kpis" style={{ marginBottom: 16 }}>
        <Kpi l="Gasto en Meta (sin IVA)" v={cop(t.spend)} nota={`${fmtN(t.dias)} ${t.dias === 1 ? 'día' : 'días'} desde el ${diaCorto(d.inicio)}`} />
        <Kpi l={`Con IVA (${d.vat} %)`} v={cop(t.conIva)} nota="lo que debería salir de tu tarjeta" />
        <Kpi l="Cobrado por Meta (con IVA)" v={cop(d.cobrado)} nota={d.sinTarjeta ? `${fmtN(d.sinTarjeta)} sin cargo en tu tarjeta` : 'todo cruza con tu tarjeta'} color={d.sinTarjeta ? 'gold-ink' : undefined} />
        <Kpi l="Clics" v={fmtN(Math.round(t.clicks))} nota={`${fmtN(Math.round(t.imp))} impresiones`} />
        <Kpi l="Compras según Meta" v={fmtN(t.compras)} nota={t.valorCompras ? `${cop(t.valorCompras)} en ventas` : null} />
      </div>
      <p className="muted only-learner" style={{ fontSize: 13.5, margin: '-4px 0 14px' }}>Meta cobra por umbral y no cada día, así que el gasto con IVA y lo cobrado casi nunca coinciden día a día; sí deberían acercarse con el tiempo. Las «compras según Meta» son las que ve el píxel: la verdad de tus ventas está en Dropi.</p>
      <div className="sec-head" style={{ margin: '0 0 10px' }}><h2 style={{ fontSize: 19 }}>Gasto por campaña y día</h2></div>
      <TablaGastoMeta filas={d.filas} />
      <div className="sec-head" style={{ margin: '24px 0 10px' }}><h2 style={{ fontSize: 19 }}>Cobros de Meta</h2></div>
      <TablaCobrosMeta cobros={d.cobros} />
    </>
  )
}
