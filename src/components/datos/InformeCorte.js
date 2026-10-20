import { cop, fmtN, diaCorto } from '@/lib/formato'
import AccionesCorte from './AccionesCorte'
import HojaInforme from './HojaInforme'
import { BarraApilada, COLOR, desgloseCorte } from './Viz'
import { TIPOS } from '@/domain/reparto.ts'

// Informe de cierre de un corte, con el diseño del «informe para reclamos ante Dropi»: una hoja de documento (título, tabla de identificación, resumen con puntos a revisar,
// secciones numeradas con tablas simples) y una barra de controles. Todo el texto que viene de fuera pasa por React, que lo escapa.
const fechaLarga = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const fechaHora = (ms) => new Date(ms).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'long', timeStyle: 'short' })
const signo = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + cop(Math.abs(n))
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) + ' %' : '—')
const menos = (v) => (v ? '−' + cop(v) : '—')

const T = ({ cab, filas, vacio = 'Sin datos.' }) => filas.length
  ? <table><thead><tr>{cab.map(([h, n]) => <th key={h} className={n ? 'n' : undefined}>{h}</th>)}</tr></thead><tbody>{filas}</tbody></table>
  : <p className="sub">{vacio}</p>
const Td = ({ children, n }) => <td className={n ? 'n' : undefined}>{children}</td>
const F2 = ({ t, v, fuerte, nota }) => <tr><td>{fuerte ? <b>{t}</b> : t}{nota && <div className="sub" style={{ fontSize: 11.5 }}>{nota}</div>}</td><td className="n">{fuerte ? <b>{v}</b> : v}</td></tr>

export function InformeCorte({ c, anterior, d }) {
  const t = c.total, f = c.flujo, p = c.pedidos, e = p.estado, est = c.estimacion, r = c.reparto, v = c.ventas, b = c.billetera
  const esperado = Math.round(est.gananciaEsperada - est.costoDevoluciones)
  const resultadoVentas = Math.round((v.cobrado + est.gananciaEsperada - est.costoDevoluciones - v.publicidad) * 100) / 100
  const sellado = c.cierre
  const alertas = c.chequeos.filter((x) => x.tono !== 'ok'), correctos = c.chequeos.filter((x) => x.tono === 'ok')
  const socias = r.filas.filter((x) => x.tipo === 'socio'), seQueda = r.filas.filter((x) => x.tipo !== 'socio').reduce((a, x) => a + x.monto, 0)
  const sumaPct = socias.reduce((a, x) => a + x.pct, 0)
  const COL_SOCIAS = [COLOR.jade, COLOR.violeta, COLOR.ambar, COLOR.coral]
  const { segmentos, marca } = desgloseCorte(c)
  const faltan = Math.max(0, Math.round((Date.parse(c.hasta + 'T12:00:00Z') - Date.parse(d.hoy + 'T12:00:00Z')) / 864e5))
  const gastos = [['Publicidad en Meta (con IVA)', t.meta], ['Otros gastos de la tarjeta', t.otrosGastos], ['Devoluciones (flete cobrado por Dropi)', t.devoluciones], ['Comisiones y mantenimiento de la tarjeta', t.comisiones], ['Otros descuentos de Dropi', t.otrosDescuentos], ['Herramientas (pagos desde la billetera y costos fijos)', c.herramientas + t.pagosHerramientas]].filter(([, x]) => x > 0)
  const dias = [...c.dias].sort((a, b2) => (a.dia < b2.dia ? -1 : 1))
  const retiroPorSocia = b.retiroSeguro > 0 && sumaPct > 0 ? socias.map((x) => `${x.nombre} ${cop((b.retiroSeguro * x.pct) / sumaPct)}`).join(' · ') : null

  const puntos = alertas.map((x) => `${x.titulo}. ${x.detalle}`)
  const intro = (
    <>
      <p>Este informe resume el corte del <b>{fechaLarga(c.desde)}</b> al <b>{fechaLarga(c.hasta)}</b> ({fmtN(c.diasCalendario)} días{c.abierto ? `; sigue abierto${faltan ? `, cierra en ${fmtN(faltan)} ${faltan === 1 ? 'día' : 'días'}` : ', hoy cierra'}` : ''}).
        En el periodo entraron <b>{cop(t.ganancia)}</b> a la billetera de Dropi por {fmtN(t.entregas)} pedidos pagados y se gastaron <b>{cop(c.costos)}</b> (publicidad, devoluciones, comisiones y herramientas), por lo que el corte dejó <b>{signo(c.neto)}</b>.
        {p.pendientes.n > 0 && <> Quedan {fmtN(p.pendientes.n)} pedidos de este corte por resolver, con una ganancia esperada de unos {cop(esperado)} (estimado).</>}</p>
      {sellado && <p>Las cifras de este corte se <b>sellaron el {fechaHora(sellado.cerradoEn)}</b> (versión {sellado.versiones}){sellado.nota ? `: «${sellado.nota}»` : ''}.
        {sellado.cambios.length > 0
          ? <> Desde entonces cambió: {sellado.cambios.map((x, i) => <span key={x.campo}>{i ? '; ' : ''}{x.etiqueta.toLowerCase()} {x.campo === 'pendientesN' ? `${fmtN(x.antes)} → ${fmtN(x.despues)}` : `${cop(x.antes)} → ${cop(x.despues)} (${signo(x.dif)})`}</span>)}. Suele ser un pago o cobro tardío.</>
          : ' No ha cambiado desde entonces.'}</p>}
      <p className="sub">{puntos.length ? 'Puntos a revisar:' : 'Todas las comprobaciones de cuadre salieron bien.'}</p>
    </>
  )

  const secciones = [
    { id: 'resultado', titulo: 'Resultado: a dónde se fue lo que entró', nodo: (
      <>
        <BarraApilada total={t.ganancia} segmentos={segmentos} marca={marca} />
        <div style={{ height: 10 }} />
        <T cab={[['Concepto'], ['Valor', 1], ['% de lo que entró', 1]]} filas={[
          <tr key="g"><td><b>Ganancia de pedidos pagados por Dropi</b></td><Td n><b>{cop(t.ganancia)}</b></Td><Td n>100 %</Td></tr>,
          ...gastos.map(([n, x]) => <tr key={n}><td>{n}</td><Td n>−{cop(x)}</Td><Td n>{pct(x, t.ganancia)}</Td></tr>),
          <tr key="n"><th>Neto del corte (te quedó)</th><th className="n">{signo(c.neto)}</th><th className="n">{pct(c.neto, t.ganancia)}</th></tr>]} />
        <p className="sub only-learner">«Entró» cuenta la plata cuando Dropi la paga a la billetera, no cuando se vende. La publicidad incluye el IVA que cobra Meta. Las devoluciones se restan cuando Dropi cobra el flete de regreso.</p>
      </>) },
    { id: 'billetera', titulo: 'Billetera de Dropi', nodo: (
      <>
        <T cab={[['Movimiento'], ['Valor', 1]]} filas={[
          <F2 key="a" t="Saldo al abrir el corte" v={f.saldoApertura != null ? cop(f.saldoApertura) : '—'} />,
          <F2 key="b" t="Entró: ganancia de pedidos" v={f.gananciaEntro ? cop(f.gananciaEntro) : '—'} />,
          <F2 key="c" t="Entró: aportes y otros" v={f.otrasEntradas ? cop(f.otrasEntradas) : '—'} />,
          <F2 key="d" t="Salió: pasado a la tarjeta" v={menos(f.aTarjeta)} nota="traslado a la tarjeta de Dropi: no es gasto hasta que se usa en publicidad" />,
          <F2 key="e" t="Salió: descuentos (devoluciones, comisiones, pagos)" v={menos(f.descuentos)} />,
          <F2 key="f" t="Salió: retiros" v={menos(f.retiros)} nota="plata de las socias que se sacó: no es gasto ni ganancia" />,
          <F2 key="g" t={c.abierto ? 'Saldo hoy' : 'Saldo al cerrar el corte'} v={f.saldoCierre != null ? cop(f.saldoCierre) : '—'} fuerte />]} />
        <p className="sub only-learner">El saldo no se corta: lo que queda pasa completo al siguiente corte, porque esa plata paga campañas hasta que se decida retirarla.{c.abierto && d.saldoTarjeta != null && ` Saldo de la tarjeta hoy: ${cop(d.saldoTarjeta)}.`}</p>
      </>) },
    { id: 'pedidos', titulo: 'Pedidos vendidos en el corte', nodo: (
      <>
        <BarraApilada unidad="n" titulo="Cómo van hoy" total={p.vendidos.n} segmentos={[
          { etiqueta: 'Pagados', valor: e.pagado.n, color: COLOR.jade }, { etiqueta: 'En curso', valor: e.en_curso.n, color: COLOR.azul },
          { etiqueta: 'Entregados sin pagar', valor: e.sin_pagar.n, color: COLOR.ambar }, { etiqueta: 'No verificables', valor: e.no_verificable.n, color: COLOR.violeta },
          { etiqueta: 'Devueltos', valor: e.devuelto.n + e.devuelto_cobrado.n, color: COLOR.coral }]} />
        <div style={{ height: 10 }} />
        <T cab={[['Estado'], ['Pedidos', 1], ['Valor de venta', 1]]} filas={[
          ...[['Pagados', e.pagado], ['En curso', e.en_curso], ['Entregados sin pagar', e.sin_pagar], ['Devueltos sin cobrar', e.devuelto], ['Devueltos ya cobrados', e.devuelto_cobrado], ['No verificables', e.no_verificable]].filter(([, x]) => x.n > 0).map(([n, x]) => <tr key={n}><td>{n}</td><Td n>{fmtN(x.n)}</Td><Td n>{cop(x.valor)}</Td></tr>),
          <tr key="v"><th>Vendidos en el corte</th><th className="n">{fmtN(p.vendidos.n)}</th><th className="n">{cop(p.vendidos.valor)}</th></tr>,
          <tr key="s"><td>Siguen pendientes de resolver</td><Td n>{fmtN(p.pendientes.n)}</Td><Td n>{cop(p.pendientes.valor)}</Td></tr>,
          <tr key="a"><td>Ventas de cortes anteriores que se pagaron en este corte</td><Td n>{fmtN(p.cierranAnteriores.n)}</Td><Td n>{cop(p.cierranAnteriores.valor)}</Td></tr>]} />
        {est.pedidosEstimados > 0 && <p>Lo pendiente dejaría, con una devolución esperada de {d.pctDevolucion} % (estimado): ganancia {cop(est.gananciaEsperada)}, menos {cop(est.costoDevoluciones)} de costo de devoluciones = <b>{signo(esperado)}</b>.</p>}
        <p className="sub only-learner">El valor de venta es lo que paga el cliente, no la ganancia. Los estados son los de hoy, no los del día del corte. Lo estimado nunca se suma a lo que ya entró a la billetera.</p>
      </>) },
    { id: 'reparto', titulo: 'Reparto de la utilidad y retiro', nodo: (
      <>
        <T cab={[['Cascada del corte'], ['Valor', 1]]} filas={[
          <F2 key="a" t="Ingresos de la billetera (pagos de Dropi en el corte)" v={cop(t.ganancia)} />,
          <F2 key="b" t="Gastos reales del corte" v={menos(c.costos)} />,
          <F2 key="c" t="Utilidad neta del corte" v={signo(c.neto)} fuerte />,
          <F2 key="d" t="Utilidad acumulada hasta el cierre" v={cop(Math.max(0, c.acumulado))} nota={c.acumulado < 0 ? 'las pérdidas de cortes anteriores se recuperan primero' : 'ya descuenta las pérdidas de cortes anteriores'} />,
          <F2 key="e" t="Lo que este corte suma para repartir" v={cop(r.base)} fuerte />]} />
        {r.base > 0 ? (
          <>
            <div style={{ height: 10 }} />
            <BarraApilada titulo="Reparto de lo que suma este corte" total={r.base} segmentos={[{ etiqueta: 'Se queda en la operación', valor: seQueda, color: COLOR.azul }, ...socias.map((x, i) => ({ etiqueta: x.nombre, valor: x.monto, color: COL_SOCIAS[i % COL_SOCIAS.length] }))]} />
            <div style={{ height: 10 }} />
            <T cab={[['Destino'], ['Tipo'], ['%', 1], ['Monto', 1]]} filas={r.filas.map((x) => <tr key={x.id}><td>{x.nombre}</td><td>{TIPOS[x.tipo]}</td><Td n>{x.pct} %</Td><Td n>{cop(x.monto)}</Td></tr>)} />
          </>
        ) : <p>Este corte no suma utilidad nueva para repartir{c.acumulado < 0 ? ': las pérdidas de cortes anteriores se recuperan primero.' : ': todo lo ganado ya estaba repartido en cortes anteriores.'}</p>}
        <p style={{ marginTop: 12 }}><b>{c.abierto ? 'Billetera hoy' : 'Billetera al cerrar el corte'}:</b> {b.titulo}. {b.detalle}</p>
        {b.saldo != null && (
          <T cab={[['Cómo sale el retiro recomendado'], ['Valor', 1]]} filas={[
            <F2 key="a" t="Lo que hay en la billetera" v={cop(b.saldo)} fuerte />,
            <F2 key="b" t="Debe quedar: pauta de 7 días" v={cop(b.piso.pauta)} nota={`ritmo real de Meta ${cop(b.piso.ritmo)} por día activo (con IVA) × 7${b.piso.deudaMeta > 0 ? ` + ${cop(b.piso.deudaMeta)} que Meta ya gastó y aún no cobra` : ''}${b.piso.tarjeta > 0 ? ` − ${cop(b.piso.tarjeta)} de la tarjeta` : ''}`} />,
            <F2 key="c" t="Debe quedar: devoluciones esperadas" v={cop(b.piso.devoluciones)} />,
            <F2 key="d" t="Debe quedar: imprevistos, ahorro e impuestos" v={cop(b.seQueda)} />,
            <F2 key="e" t="Libre (lo máximo que podría salir)" v={cop(b.libre)} fuerte />,
            <F2 key="f" t="Les toca a las socias (acumulado) menos lo ya retirado" v={cop(b.sociasPorRetirar)} nota={`acumulado ${cop(b.sociasAcumulado)} − retirado ${cop(b.retirado)}`} />,
            <F2 key="g" t="Retiro recomendado" v={cop(b.retiroSeguro)} fuerte nota={retiroPorSocia || undefined} />]} />
        )}
        <p className="sub only-learner">Es una sugerencia: parte de la utilidad (no de todo lo que entró), exige que la billetera siga cubriendo 7 días de pauta y nunca supera la ganancia neta que queda en la operación. Los porcentajes se cambian en Configuración → Reparto.{!d.reparto.propio && ' Hoy usa el reparto sugerido.'}</p>
      </>) },
    { id: 'ventas', titulo: 'Rendimiento de las ventas del corte (estimado)', nodo: (
      <>
        <T cab={[['Ventas del corte, por día de venta'], ['Valor', 1]]} filas={[
          <F2 key="a" t={`Pedidos vendidos (${fmtN(v.pagados)} pagados · ${fmtN(v.enCamino)} en camino · ${fmtN(v.devueltos)} devueltos)`} v={fmtN(v.ventas)} />,
          <F2 key="b" t="Ganancia ya cobrada de esas ventas" v={cop(v.cobrado)} />,
          <F2 key="c" t="Publicidad gastada en esos días (con IVA)" v={menos(v.publicidad)} />,
          <F2 key="d" t="Resultado estimado de las ventas" v={signo(resultadoVentas)} fuerte nota="incluye lo esperado de lo que sigue en camino; sin comisiones ni herramientas. El número oficial para repartir es el de caja" />]} />
        <div className="only-pro">
          <div style={{ height: 8 }} />
          <T cab={[['Indicador'], ['Este corte', 1], ['Corte anterior', 1]]} filas={[
            <tr key="a"><td>ROAS de caja (ganancia ÷ publicidad)</td><Td n>{t.meta > 0 ? (t.ganancia / t.meta).toFixed(2) : '—'}</Td><Td n>{anterior && anterior.total.meta > 0 ? (anterior.total.ganancia / anterior.total.meta).toFixed(2) : '—'}</Td></tr>,
            <tr key="b"><td>Publicidad por pedido pagado</td><Td n>{t.meta > 0 && t.entregas > 0 ? cop(t.meta / t.entregas) : '—'}</Td><Td n>{anterior && anterior.total.meta > 0 && anterior.total.entregas > 0 ? cop(anterior.total.meta / anterior.total.entregas) : '—'}</Td></tr>,
            <tr key="c"><td>Margen (te quedó ÷ entró)</td><Td n>{pct(c.neto, t.ganancia)}</Td><Td n>{anterior ? pct(anterior.neto, anterior.total.ganancia) : '—'}</Td></tr>,
            <tr key="d"><td>Devolución real vs esperada ({d.pctDevolucion} %)</td><Td n>{c.tasaDevolucion != null ? c.tasaDevolucion + ' %' : '—'}</Td><Td n>{anterior && anterior.tasaDevolucion != null ? anterior.tasaDevolucion + ' %' : '—'}</Td></tr>,
            <tr key="e"><td>Días promedio de la venta al pago</td><Td n>{c.diasPago != null ? String(c.diasPago).replace('.', ',') : '—'}</Td><Td n>{anterior && anterior.diasPago != null ? String(anterior.diasPago).replace('.', ',') : '—'}</Td></tr>]} />
        </div>
      </>) },
    { id: 'avisos', titulo: 'Cuadre y avisos', nodo: (
      <>
        {alertas.length > 0 && <ul style={{ margin: '4px 0 8px', paddingLeft: 20 }}>{alertas.map((x) => <li key={x.clave}><b>{x.titulo}.</b> {x.detalle}</li>)}</ul>}
        {correctos.length > 0 && <p className="sub">{correctos.map((x) => `✓ ${x.titulo}`).join(' · ')}</p>}
      </>) },
    { id: 'dias', titulo: 'Día por día', nodo: (
      <T cab={[['Día'], ['Entró', 1], ['Publicidad', 1], ['Otros gastos', 1], ['Te quedó', 1]]} vacio="Sin movimientos."
        filas={[...dias.map((x) => <tr key={x.dia}><td>{diaCorto(x.dia)}</td><Td n>{x.ganancia ? cop(x.ganancia) : '—'}</Td><Td n>{menos(x.meta + x.otrosGastos)}</Td><Td n>{menos(x.devoluciones + x.comisiones + x.otrosDescuentos + x.pagosHerramientas)}</Td><Td n>{signo(x.neto)}</Td></tr>),
          <tr key="t"><th>Total (sin herramientas fijas)</th><th className="n">{cop(t.ganancia)}</th><th className="n">{menos(t.meta + t.otrosGastos)}</th><th className="n">{menos(t.devoluciones + t.comisiones + t.otrosDescuentos + t.pagosHerramientas)}</th><th className="n">{signo(dias.reduce((a, x) => a + x.neto, 0))}</th></tr>]} />
    ) },
  ]

  const texto = [
    `INFORME DE CIERRE DEL CORTE · ${fechaLarga(c.desde)} al ${fechaLarga(c.hasta)}${c.abierto ? ' (abierto)' : ''}`,
    `Entró a la billetera ${cop(t.ganancia)} · gastos ${cop(c.costos)} · neto ${signo(c.neto)} · pedidos pagados ${fmtN(t.entregas)}.`,
    `Pendientes: ${fmtN(p.pendientes.n)} pedidos (valor de venta ${cop(p.pendientes.valor)}); ganancia esperada ≈ ${cop(esperado)} (estimado).`,
    `Reparto del corte: ${cop(r.base)}${r.base > 0 ? ' → ' + r.filas.map((x) => `${x.nombre} ${cop(x.monto)}`).join(' · ') : ''}.`,
    `Billetera ${c.abierto ? 'hoy' : 'al cierre'}: ${b.saldo != null ? cop(b.saldo) : '—'} · ${b.titulo}${retiroPorSocia ? ' (' + retiroPorSocia + ')' : ''}.`,
    puntos.length ? 'Puntos a revisar:' : 'Cuadre: todo correcto.', ...puntos.map((x, i) => `${i + 1}. ${x}`),
  ].join('\n')

  return (
    <div className="informe">
      {!d.cierresListos && <div className="tint warn no-print" style={{ marginBottom: 16 }}><b style={{ color: 'var(--gold-ink)' }}>Falta una actualización de la base de datos</b><div style={{ fontSize: 14.5, marginTop: 2 }}>Para sellar cortes aplícala con <code>npm run db:migrate</code>.</div></div>}
      <HojaInforme
        titulo="Informe de cierre del corte" subtitulo="DropFlexAds · contabilidad de la operación"
        titularInicial={socias.map((x) => x.nombre).join(' y ')}
        filasId={[['Período del corte', `${fechaLarga(c.desde)} al ${fechaLarga(c.hasta)}`], ['Estado', c.abierto ? 'Abierto' : sellado ? `Cerrado y sellado (versión ${sellado.versiones})` : 'Cerrado, sin sellar'], ['Día de cierre', `Cada ${d.corte} del mes`], ['Informe generado', fechaHora(d.generado)]]}
        intro={intro} puntos={puntos} secciones={secciones} texto={texto}
        pie="Informe generado con DropFlexAds a partir de los movimientos de la billetera y la tarjeta sincronizados con Dropi, el gasto y los cobros de Meta y los pedidos de Dropi. Las cifras marcadas como estimado usan promedios propios y el % de devolución esperado de cada campaña; nunca se suman a lo que ya entró a la billetera."
        acciones={<AccionesCorte id={c.id} abierto={c.abierto} sellado={!!sellado} puedeSellar={d.cierresListos} />} />
    </div>
  )
}
