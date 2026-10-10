import { cop, fmtN, diaCorto } from '@/lib/formato'

// Vistas de solo lectura de los datos sincronizados. Componentes de servidor: reciben datos ya calculados (src/lib/datos.js + src/domain).
const Chip = ({ t, children }) => <span className={'chip ' + t}>{children}</span>
const Tabla = ({ cols, children, vacio }) => (
  <div className="card tbl-card"><div className="scroll-x"><table className="tbl">
    <thead><tr>{cols.map(([c, st]) => <th key={c} className={st ? 'st' : undefined}>{c}</th>)}</tr></thead>
    <tbody>{children}</tbody>
  </table></div>{vacio && <p className="empty-note" style={{ padding: 18, margin: 0 }}>{vacio}</p>}</div>
)
const Kpi = ({ l, v, nota, color }) => (
  <div className="card"><div className="kpi-l">{l}</div><div className="kpi-v" style={color ? { color: `var(--${color})` } : undefined}>{v}</div>{nota && <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{nota}</div>}</div>
)
const Aviso = ({ tono = 'warn', titulo, children }) => (
  <div className={'tint ' + tono} style={{ marginBottom: 16 }}><b style={{ color: `var(--${tono === 'warn' ? 'gold' : tono === 'bad' ? 'coral' : tono === 'ok' ? 'jade' : 'blue'}-ink)` }}>{titulo}</b><div style={{ fontSize: 14.5, marginTop: 2 }}>{children}</div></div>
)
const LIMITE = 100
const Mas = ({ total }) => total > LIMITE ? <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>Mostrando los {LIMITE} más recientes de {fmtN(total)}.</p> : null

/* ---------- Tarjeta ---------- */
const CLASE = { meta: ['blue', 'De Meta · cruza con un cobro'], otro: ['idle', 'Otro gasto'], repetido: ['bad', 'Posible cobro doble'], recarga: ['ok', 'Recarga'], rechazado: ['warn', 'Rechazado por el banco'] }

export function VistaTarjeta({ d }) {
  if (!d.lista.length) return <Aviso tono="blue" titulo="Aún no hay movimientos de la tarjeta">Conecta Dropi y pulsa «Sincronizar ahora» (arriba) para traerlos.</Aviso>
  const t = d.totales
  return (
    <>
      {!d.hayCobros && <Aviso titulo="Todavía no hay cobros de Meta cargados">Por eso ningún cargo cruza: todos los gastos aparecen como «otros». Cuando se conecte Meta (o cargues sus cobros), los que traen la misma referencia de pago pasan a «De Meta».</Aviso>}
      {t.repetidos > 0 && <Aviso tono="bad" titulo={`${t.repetidos} ${t.repetidos === 1 ? 'cargo repite' : 'cargos repiten'} la referencia de un cobro de Meta`}>Puede ser un cobro doble. Reclámalo a Dropi.</Aviso>}
      {d.cobrosSinTarjeta.length > 0 && <Aviso titulo={`${d.cobrosSinTarjeta.length} ${d.cobrosSinTarjeta.length === 1 ? 'cobro de Meta no aparece' : 'cobros de Meta no aparecen'} en la tarjeta`}>Suman {cop(d.cobrosSinTarjeta.reduce((a, c) => a + c.monto, 0))}. Revisa si los pagó otra tarjeta.</Aviso>}
      <div className="kpis" style={{ marginBottom: 16 }}>
        <Kpi l="Recargaste" v={cop(t.recargas)} color="jade-ink" />
        <Kpi l="Gastaste en Meta" v={cop(t.meta)} nota="solo lo que cruza por referencia de pago" />
        <Kpi l="Gastaste en otras cosas" v={cop(t.otros)} nota="no es de Meta" />
        <Kpi l="Rechazados por el banco" v={fmtN(t.rechazados)} nota="no movieron plata" />
      </div>
      <Tabla cols={[['Fecha'], ['Descripción', 1], ['Referencia', 1], ['Valor'], ['Qué es', 1]]}>
        {d.lista.slice(0, LIMITE).map((x) => {
          const [tono, txt] = CLASE[x.clase]
          return <tr key={x.id}><td>{diaCorto(x.fecha)}</td><td className="txt">{x.descripcion || '—'}</td><td className="txt">{x.refPago || '—'}</td><td>{x.clase === 'recarga' ? '+' : '−'}{cop(x.monto)}</td><td className="st"><Chip t={tono}>{txt}</Chip></td></tr>
        })}
      </Tabla>
      <Mas total={d.lista.length} />
    </>
  )
}

/* ---------- Billetera ---------- */
const WK = { profit: ['ok', 'Ganancia'], to_card: ['ok', 'Recarga a tu tarjeta'], return_fee: ['bad', 'Devolución'], card_fee: ['warn', 'Mantenimiento'], withdrawal: ['idle', 'Retiro'], recharge_fee: ['warn', 'Comisión de recarga'], wallet_topup: ['idle', 'Recarga de tu billetera'], reversal: ['idle', 'Reverso'], other_in: ['idle', 'Otro ingreso'], other_out: ['warn', 'Otro descuento'] }

export function VistaBilletera({ d }) {
  if (!d.mov.length) return <Aviso tono="blue" titulo="Aún no hay movimientos de la billetera">Conecta Dropi y pulsa «Sincronizar ahora» (arriba) para traerlos.</Aviso>
  const T = d.totales, s = (k) => (T[k] ? T[k].sum : 0)
  return (
    <>
      <div className="kpis" style={{ marginBottom: 16 }}>
        <Kpi l="En tu billetera hay" v={d.saldo == null ? '—' : cop(d.saldo)} nota="según el último movimiento" />
        <Kpi l="Ganancias de pedidos" v={cop(s('profit'))} nota={`${fmtN(T.profit ? T.profit.n : 0)} pedidos`} color="jade-ink" />
        <Kpi l="Devoluciones" v={cop(s('return_fee'))} nota={`${fmtN(T.return_fee ? T.return_fee.n : 0)} cobros`} color="coral-ink" />
        <Kpi l="Pasado a tu tarjeta" v={cop(s('to_card'))} nota={`${fmtN(T.to_card ? T.to_card.n : 0)} recargas`} />
      </div>
      <Tabla cols={[['Fecha'], ['Qué fue', 1], ['Detalle', 1], ['Valor'], ['Saldo después']]}>
        {d.mov.slice(0, LIMITE).map((m) => {
          const [tono, txt] = WK[m.kind] || WK.other_in
          const despues = m.before == null ? null : m.before + (m.direction === 'in' ? m.amount : -m.amount)
          return <tr key={m.external_id}><td>{diaCorto(m.d)}</td><td className="st"><Chip t={tono}>{txt}</Chip></td><td className="txt">{m.kind === 'profit' ? `Pedido #${m.order_ref || '—'}` : m.description || ''}</td><td>{m.direction === 'in' ? '+' : '−'}{cop(m.amount)}</td><td>{despues == null ? '—' : cop(despues)}</td></tr>
        })}
      </Tabla>
      <Mas total={d.mov.length} />
    </>
  )
}

/* ---------- Pedidos ---------- */
const CONTABLE = { pagado: ['ok', 'Pagado'], sin_pagar: ['warn', 'Sin pagar'], no_verificable: ['idle', 'No verificable'], devuelto: ['bad', 'Devuelto'], devuelto_cobrado: ['bad', 'Devuelto · ya cobrado'], en_curso: ['blue', 'En curso'] }

export function VistaPedidos({ d }) {
  if (!d.lista.length) return <Aviso tono="blue" titulo="Aún no hay pedidos">Conecta Dropi y pulsa «Sincronizar ahora» (arriba): trae los pedidos con su estado real.</Aviso>
  const c = d.cuenta
  return (
    <>
      <div className="kpis" style={{ marginBottom: 16 }}>
        <Kpi l="Pedidos de hoy" v={fmtN(d.hoy)} />
        <Kpi l="Entregados y pagados" v={fmtN(c.pagado || 0)} color="jade-ink" />
        <Kpi l="Entregados sin pagar" v={fmtN(c.sin_pagar || 0)} nota="Dropi aún no los paga" color={c.sin_pagar ? 'gold-ink' : undefined} />
        <Kpi l="Devueltos" v={fmtN((c.devuelto || 0) + (c.devuelto_cobrado || 0))} color={c.devuelto || c.devuelto_cobrado ? 'coral-ink' : undefined} />
        <Kpi l="En curso" v={fmtN(c.en_curso || 0)} nota="en camino, novedad o pendientes" />
      </div>
      {c.no_verificable > 0 && <Aviso tono="blue" titulo={`${fmtN(c.no_verificable)} entregados no se pueden verificar`}>Se entregaron antes de lo que cubre la billetera sincronizada{d.billeteraDesde ? ` (desde el ${diaCorto(d.billeteraDesde)})` : ''}: no puedo decir si ya te pagaron.</Aviso>}
      <Tabla cols={[['Creado'], ['Pedido (ID Dropi)', 1], ['Producto', 1], ['Estado en Dropi', 1], ['Total'], ['Contabilidad', 1]]}>
        {d.lista.slice(0, LIMITE).map((p) => {
          const [tono, txt] = CONTABLE[p.contable]
          return <tr key={p.idPedido}><td>{diaCorto(p.creado)}</td><td className="txt"><b style={{ color: 'var(--ink)' }}>#{p.idPedido}</b>{p.guia ? ` · guía ${p.guia}` : ''}</td><td className="txt">{p.producto || '—'}</td><td className="txt">{p.estado}</td><td>{p.total == null ? '—' : cop(p.total)}</td><td className="st"><Chip t={tono}>{txt}{p.contable === 'sin_pagar' ? ` · ${p.dias} d` : ''}</Chip></td></tr>
        })}
      </Tabla>
      <Mas total={d.lista.length} />
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
      <Tabla cols={[['Día'], ['Ganancia'], ['Meta'], ['Otros gastos'], ['Dev. y comisiones'], ['Neto']]}>
        {d.dias.slice(0, LIMITE).map((x) => (
          <tr key={x.dia}><td>{diaCorto(x.dia)}</td><td style={{ color: 'var(--jade-ink)' }}>{x.ganancia ? '+' + cop(x.ganancia) : '—'}</td><td>{x.meta ? '−' + cop(x.meta) : '—'}</td><td>{x.otrosGastos ? '−' + cop(x.otrosGastos) : '—'}</td><td>{x.devoluciones + x.comisiones + x.otrosDescuentos ? '−' + cop(x.devoluciones + x.comisiones + x.otrosDescuentos) : '—'}</td><td><b style={{ color: x.neto < 0 ? 'var(--coral-ink)' : 'var(--jade-ink)' }}>{x.neto < 0 ? '−' : '+'}{cop(Math.abs(x.neto))}</b></td></tr>
        ))}
      </Tabla>
      <Mas total={d.dias.length} />
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
