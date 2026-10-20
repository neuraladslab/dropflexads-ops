import Link from 'next/link'
import { cop, fmtN, diaCorto } from '@/lib/formato'
import Ayuda from '@/components/Ayuda'
import { Tile } from './Viz'
import { AbanicoResultados } from './AbanicoResultados'
import { ConfigEscalado, ProbarPresupuesto } from './ConfigEscalado'
import { VistaEscalar } from './Vistas'
import { PanelIA } from '@/components/ia/PanelIA'

// «Escalar» con probabilidades: qué presupuesto diario conviene, cuánta plata se pone en juego, en cuántos pasos llegar y cuándo frenar. Todos los números salen del motor
// (src/domain/escalado.ts, determinista y con pruebas); aquí solo se muestran. Modo Aprendiz: explica cada bloque. Avanzado: agrega los parámetros estimados.
const coma = (v) => String(v).replace('.', ',')
const pc = (x) => `${Math.round(x * 100)} %`
const sg = (n) => (n < 0 ? '−' : '+') + cop(Math.abs(n))
const Seccion = ({ titulo, ayuda, children }) => <section style={{ marginTop: 24 }}><div className="sec-head" style={{ marginTop: 0 }}><h2>{titulo}{ayuda && <Ayuda t={ayuda} />}</h2></div>{children}</section>
const Aviso = ({ tono = 'blue', titulo, children }) => (
  <div className={'tint ' + tono} style={{ marginBottom: 16 }}><b style={{ color: `var(--${tono === 'warn' ? 'gold' : tono === 'bad' ? 'coral' : 'blue'}-ink, var(--blue))` }}>{titulo}</b><div style={{ fontSize: 14.5, marginTop: 2 }}>{children}</div></div>
)
const CALIDAD = { alta: ['ok', 'Evidencia alta'], media: ['warn', 'Evidencia media'], baja: ['bad', 'Evidencia baja'] }

function Veredicto({ e }) {
  if (e.aprobado) return <span className="chip ok" style={{ whiteSpace: 'nowrap' }}>✓ Se puede hacer ya</span>
  if (e.alcanzable && e.presupuesto > 0 && !e.esActual) return <span className="chip blue" style={{ whiteSpace: 'nowrap' }} title={e.motivos.join('; ')}>En varios pasos</span>
  if (e.esActual) return <span className="chip idle">Actual</span>
  return <span className="chip bad" style={{ whiteSpace: 'nowrap' }} title={e.motivos.join('; ')}>✕ No recomendado</span>
}

export function VistaEscalado({ d, s, nombre, tieneIA = false }) {
  if (!d) return <Aviso titulo="Esta campaña no está vinculada a Meta">Vincúlala en Campañas (campo de campaña de Meta) para traer el gasto y los clics: sin ellos no hay con qué calcular probabilidades.</Aviso>
  if (d.sinDatos) return <Aviso titulo="Todavía no hay gasto de Meta de esta campaña">Sincroniza Meta (Campañas) y vuelve cuando haya al menos unos días con pauta.</Aviso>
  const a = d.analisis, b = a.base, rec = a.recomendado, act = a.escenarios.find((e) => e.esActual) || a.escenarios[0]
  const sel = a.escenarios.find((e) => e.presupuesto === s) || rec || act
  const [tonoC, etqC] = CALIDAD[a.calidad]
  const cercano = a.escenarios.filter((e) => e.presupuesto > act.presupuesto).sort((x, y) => x.presupuesto - y.presupuesto)[0] // el primer escalón: sirve para decir por qué no se sube
  const tono = a.accion === 'escalar' ? 'ok' : a.accion === 'mantener' ? 'blue' : a.accion === 'reducir' ? 'warn' : 'bad'
  const ver = (e) => `${pc(e.pGanar)} de ganar`
  return (
    <>
      <div className="no-print">{d.confirmado
        ? <details className="vz-det card" style={{ marginBottom: 16 }}><summary>Presupuesto actual: {cop(b.presupuestoActual)} por día (sin IVA) · cambiar o ajustar mi tolerancia al riesgo</summary><div style={{ marginTop: 10 }}><ConfigEscalado campanaId={d.campana.id} presupuesto={b.presupuestoActual} confirmado riesgo={a.riesgo} /></div></details>
        : <ConfigEscalado campanaId={d.campana.id} presupuesto={b.presupuestoActual} confirmado={false} riesgo={a.riesgo} />}</div>

      <div className={'tint ' + tono} style={{ marginBottom: 16 }}>
        {a.accion === 'escalar' && rec && <>
          <b style={{ fontSize: 24, color: 'var(--jade-ink)' }}>Sube a {cop(rec.presupuesto)} por día ({rec.cambioPct > 0 ? '+' : ''}{coma(rec.cambioPct)} %)</b>
          <div style={{ fontSize: 15, marginTop: 6 }}>Probabilidad de ganar en los próximos 7 días: <b>{pc(rec.pGanar)}</b>. Peor caso razonable: <b>{sg(rec.p5)}</b> · caso mediano <b>{sg(rec.mediana)}</b> · mejor caso <b>{sg(rec.p90)}</b>.<Ayuda t="prob_ganar" /></div>
          <div style={{ fontSize: 14.5, marginTop: 6 }}>No lo cambies de nuevo durante <b>{a.riesgo.esperaDias} días</b>. {a.ruta.length > 1 ? <>Si pasan sin alertas, el siguiente paso es <b>{cop(a.ruta[1].presupuesto)}</b>, y {a.objetivo ? <>puedes llegar hasta unos <b>{cop(a.objetivo.presupuesto)}</b> por día con tu billetera.</> : 'así hasta el objetivo.'}</> : a.objetivo && a.objetivo.presupuesto > rec.presupuesto ? <>Tu billetera aguanta hasta unos <b>{cop(a.objetivo.presupuesto)}</b> por día.</> : null}</div>
        </>}
        {a.accion === 'mantener' && <>
          <b style={{ fontSize: 24, color: 'var(--blue)' }}>Mantén {cop(act.presupuesto)} por día por ahora</b>
          <div style={{ fontSize: 15, marginTop: 6 }}>Con ese presupuesto tienes <b>{pc(act.pGanar)}</b> de probabilidad de ganar en 7 días.{cercano && !cercano.aprobado && <> No conviene subir a {cop(cercano.presupuesto)} todavía: {cercano.motivos.join('; ') || 'falta evidencia'}.</>}</div>
        </>}
        {(a.accion === 'reducir' || a.accion === 'pausar') && <>
          <b style={{ fontSize: 24, color: a.accion === 'pausar' ? 'var(--coral-ink)' : 'var(--gold-ink)' }}>{a.accion === 'pausar' ? 'Pausa la campaña' : 'Baja el presupuesto'}</b>
          <div style={{ fontSize: 15, marginTop: 6 }}>Con {cop(act.presupuesto)} por día solo hay <b>{pc(act.pGanar)}</b> de probabilidad de ganar{act.cumple.liquidez ? '' : ' y la billetera no cubre 7 días de pauta a ese ritmo'}. Revisa el anuncio y el costo por pedido antes de gastar más.</div>
        </>}
        <div style={{ marginTop: 10 }}><span className={'chip ' + tonoC}>{etqC}</span> <span className="muted" style={{ fontSize: 13.5 }}>{a.motivosCalidad.length ? a.motivosCalidad.join(' · ') : 'Hay datos suficientes para estimar con confianza.'}<Ayuda t="evidencia" /></span></div>
      </div>

      <Seccion titulo="Compara presupuestos" ayuda="peor_caso">
        <ProbarPresupuesto valor={s && !a.escenarios.some((e) => e.presupuesto === s && e.esActual) ? s : null} />
        <div className="card tbl-card"><div className="scroll-x"><table className="tbl tbl-esc" style={{ minWidth: 760 }}>
          <thead><tr>
            <th>Presupuesto por día<div className="muted" style={{ fontWeight: 400, fontSize: 11.5 }}>sin IVA · con IVA</div></th><th>Cambio</th><th>Prob. de ganar<Ayuda t="prob_ganar" /></th><th>Peor caso</th><th>Mediano</th><th>Mejor caso</th>
            <th className="only-pro">Pedidos/día</th><th className="only-pro">Costo por pedido</th><th className="only-pro">Sobra en la billetera</th><th className="only-pro">Retiro posible</th><th>¿Hacerlo?</th>
          </tr></thead>
          <tbody>
            {a.escenarios.map((e) => (
              <tr key={e.presupuesto} className="row" style={{ background: rec && e.presupuesto === rec.presupuesto ? 'var(--jade-soft)' : sel && e.presupuesto === sel.presupuesto && !(rec && e.presupuesto === rec.presupuesto) ? 'var(--blue-soft)' : undefined }}>
                <td><b>{cop(e.presupuesto)}</b>{rec && e.presupuesto === rec.presupuesto && <span className="chip ok" style={{ marginLeft: 8 }}>Recomendado</span>}<div className="muted" style={{ fontSize: 12 }}>con IVA {cop(e.presupuesto * (1 + d.resumen.vat / 100))}</div></td>
                <td>{e.esActual ? '—' : (e.cambioPct > 0 ? '+' : '') + coma(e.cambioPct) + ' %'}</td>
                <td><b>{pc(e.pGanar)}</b></td><td style={{ color: e.p5 < 0 ? 'var(--coral-ink)' : undefined }}>{sg(e.p5)}</td><td>{sg(e.mediana)}</td><td style={{ color: 'var(--jade-ink)' }}>{sg(e.p90)}</td>
                <td className="only-pro">{e.pedidosDia.toFixed(1).replace('.', ',')}</td><td className="only-pro">{e.cpa ? cop(e.cpa) : '—'}</td><td className="only-pro" style={{ color: e.liquidez.libre < 0 ? 'var(--coral-ink)' : undefined }}>{cop(e.liquidez.libre)}</td><td className="only-pro">{cop(e.liquidez.retiroResultante)}</td>
                <td><Veredicto e={e} />{!e.aprobado && !e.esActual && e.motivos.length > 0 && <div className="muted" style={{ fontSize: 11.5, marginTop: 4, maxWidth: 230, whiteSpace: 'normal' }}>{e.motivos[0]}</div>}</td>
              </tr>
            ))}
          </tbody>
        </table></div></div>
        <p className="muted only-learner" style={{ fontSize: 13.5, margin: '10px 0 0' }}>Cada fila es una simulación de miles de futuros posibles para los próximos 7 días con ese presupuesto. «Peor caso» es lo que solo pasaría 1 de cada 20 veces; «mejor caso», lo que pasaría 1 de cada 10 veces por arriba. Fíjate que al subir el presupuesto la probabilidad de ganar casi no cambia, pero el peor caso sí se hace más profundo: es plata que pones en juego.</p>
      </Seccion>

      {sel && (
        <Seccion titulo={`Con ${cop(sel.presupuesto)} por día: qué puede pasar`} ayuda="peor_caso">
          <div className="vz-tiles" style={{ marginBottom: 14 }}>
            <Tile l="Probabilidad de ganar" ayuda="prob_ganar" v={pc(sel.pGanar)} color={sel.pGanar >= a.riesgo.probGanarMin ? 'jade-ink' : 'gold-ink'} n="en los próximos 7 días" />
            <Tile l="Peor caso razonable" ayuda="peor_caso" v={sg(sel.p5)} color={sel.p5 < 0 ? 'coral-ink' : 'jade-ink'} n={`${pc(sel.pPerdidaMayor)} de perder más de ${cop(a.riesgo.perdidaMaxima)}`} />
            <Tile l="Caso mediano" v={sg(sel.mediana)} n={`≈ ${sel.pedidosDia.toFixed(1).replace('.', ',')} pedidos por día`} />
            <Tile l="Mejor caso" v={sg(sel.p90)} color="jade-ink" n="1 de cada 10 veces" />
          </div>
          <div className="card"><AbanicoResultados abanico={sel.abanico} /></div>
          <p style={{ fontSize: 14.5, margin: '12px 0 0' }}>
            <b>Billetera:</b> a ese ritmo deben quedar {cop(sel.liquidez.pisoPauta)} para 7 días de pauta; te sobran <b style={{ color: sel.liquidez.libre < 0 ? 'var(--coral-ink)' : undefined }}>{cop(sel.liquidez.libre)}</b> y lo que podrían retirar los socios pasaría de {cop(d.saludHoy.retiroSeguro)} a <b>{cop(sel.liquidez.retiroResultante)}</b>.
          </p>
        </Seccion>
      )}

      {a.ruta.length > 0 && (
        <Seccion titulo="Cómo llegar paso a paso">
          <div className="card" style={{ display: 'grid', gap: 10 }}>
            {a.ruta.map((p) => (
              <div key={p.orden} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
                <span className="chip blue">{p.orden === 1 ? 'Hoy' : `Día ${p.desdeDia}`}</span>
                <b>{cop(p.presupuesto)} por día</b><span className="muted">(+{coma(p.cambioPct)} %) · {pc(p.pGanar)} de ganar</span>
                <span className="muted" style={{ fontSize: 13 }}>{p.condicion}</span>
              </div>
            ))}
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>Cada paso se vuelve a calcular con los datos nuevos: si en el camino empeora el costo por pedido, el sistema dejará de recomendar el siguiente.</p>
          </div>
        </Seccion>
      )}

      <Seccion titulo="Cuándo frenar" ayuda="cpa_equilibrio">
        <div className="card" style={{ display: 'grid', gap: 10 }}>
          {a.guardas.map((g) => (
            <div key={g.clave} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span className={'chip ' + (g.accion === 'pausar' ? 'bad' : g.accion === 'volver' ? 'warn' : 'idle')} style={{ whiteSpace: 'nowrap' }}>{g.accion === 'pausar' ? 'Pausar' : g.accion === 'volver' ? 'Volver atrás' : 'Vigilar'}</span>
              <div><b>{g.titulo}</b><div className="muted" style={{ fontSize: 13.5 }}>{g.detalle}</div></div>
            </div>
          ))}
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>Se mide con ventana de {a.riesgo.esperaDias} días y no con un día suelto: los pedidos llegan a lotes y un día sin pedidos no significa que la campaña falle.</p>
        </div>
      </Seccion>

      <Seccion titulo="Segunda opinión de la IA">
        <PanelIA campanaId={d.campana.id} presupuesto={s} tieneClave={tieneIA} />
      </Seccion>

      <Seccion titulo="En qué se basa" ayuda="evidencia">
        <div className="only-learner card" style={{ display: 'grid', gap: 8, marginBottom: 12 }}>{a.explicacion.map((t) => <p key={t} style={{ margin: 0, fontSize: 14.5 }}>{t}</p>)}</div>
        <div className="vz-tiles">
          <Tile l="Pedidos por clic" v={`${(b.crPedidosPorClic * 100).toFixed(2).replace('.', ',')} %`} n={`rango probable ${(b.crIC[0] * 100).toFixed(2).replace('.', ',')}–${(b.crIC[1] * 100).toFixed(2).replace('.', ',')} %`} />
          <Tile l="Probabilidad de entrega" v={pc(b.pEntrega)} n={`rango probable ${pc(b.pIC[0])}–${pc(b.pIC[1])}`} />
          <Tile l="Ganancia por pedido entregado" v={cop(b.gananciaMedia)} n={`${fmtN(d.resumen.pedidos)} pedidos · ${fmtN(d.resumen.entregados)} entregados · ${fmtN(d.resumen.devueltos)} devueltos`} />
          <Tile l="Costo por pedido de equilibrio" ayuda="cpa_equilibrio" v={cop(b.cpaEquilibrio)} n={b.cpaActual ? `hoy te cuesta ≈ ${cop(b.cpaActual)}` : 'con IVA'} color="jade-ink" />
        </div>
        <div className="only-pro" style={{ marginTop: 12 }}>
          <div className="vz-tiles">
            <Tile l="Costo por clic normal" v={cop(b.cpc0)} n="sin IVA, mediana de los últimos días" />
            <Tile l="Elasticidad del costo" ayuda="elasticidad" v={b.elasticidad.toFixed(2).replace('.', ',')} n={b.elasticidadFuente === 'historial' ? 'medida en tu historial' : 'supuesta (poca variación de gasto)'} />
            <Tile l="Dispersión de pedidos" v={b.dispersion.toFixed(1).replace('.', ',')} n="1 = parejos · más = a lotes" />
            <Tile l="Días con pauta" v={fmtN(d.resumen.diasConPauta)} n={`${fmtN(d.resumen.clics)} clics · hasta el ${diaCorto(d.resumen.ultimoDia)}`} />
          </div>
        </div>
        <details className="vz-det" style={{ marginTop: 12 }}><summary>Supuestos del cálculo</summary><ul style={{ margin: '8px 0 0', paddingLeft: 20, fontSize: 14 }}>{a.supuestos.map((t) => <li key={t}>{t}</li>)}</ul></details>
      </Seccion>

      <Seccion titulo="Reglas básicas de la calculadora">
        <details className="vz-det"><summary>Ver el checklist de reglas fijas</summary><div style={{ marginTop: 10 }}><VistaEscalar e={d.reglas} nombre={nombre || d.campana.nombre} vinculada /></div></details>
        <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>Son las reglas de siempre (ROAS ≥ 2×, costo bajo el máximo, ≥ 3 días, ≥ 2 ventas al día). El análisis de arriba las complementa con probabilidades y con tu liquidez. <Link href="/aprender" className="link">Aprender más</Link></p>
      </Seccion>
    </>
  )
}
