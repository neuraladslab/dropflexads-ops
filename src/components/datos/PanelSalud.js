import { Fragment } from 'react'
import Link from 'next/link'
import { cop, fmtN, diaCorto } from '@/lib/formato'
import Ayuda from '@/components/Ayuda'
import { BarraApilada, COLOR } from './Viz'

// ¿Cuánto puedo retirar hoy? Una respuesta grande, una barra que muestra en qué está la billetera y, plegado, el cálculo completo para revisarlo.
const ESTADO = {
  verde: { tint: 'ok', col: 'jade', icono: '✓', etiqueta: 'Puedes retirar hoy' },
  amarillo: { tint: 'warn', col: 'gold', icono: '!', etiqueta: 'Retira solo una parte' },
  rojo: { tint: 'bad', col: 'coral', icono: '✕', etiqueta: 'No retires por ahora' },
  gris: { tint: 'blue', col: 'blue', icono: 'i', etiqueta: 'Nada para retirar' },
}
const LIMITE = {
  plan: { frase: 'lo que les toca a los socios', corto: 'Lo que les toca', ayuda: 'Hoy puedes retirar todo lo que les corresponde a los socios y la billetera lo permite.' },
  necesidades: { frase: 'lo que sobra sobre el piso de liquidez', corto: 'Piso de liquidez', ayuda: 'En la billetera hay plata que ya tiene destino: la publicidad de la próxima semana, las devoluciones y lo que apartaste. Lo que les toca a los socios solo se puede sacar de lo que sobra por encima de eso; lo demás sigue siendo suyo y se libera cuando entra más plata. Abre «¿Por qué este monto?» para ver el ejemplo con tus cifras.' },
  utilidad: { frase: 'la ganancia neta que queda en la operación', corto: 'Ganancia neta', ayuda: 'Solo se retira ganancia neta, no el capital de la operación: hoy esa ganancia es el límite.' },
}

const conAnio = (d) => (d ? `${diaCorto(d)} ${String(d).slice(0, 4)}` : '')

/** Una ecuación en tarjetas: cada tarjeta es un valor, entre ellas el operador. `tono: 'ok'` resalta el resultado. */
const Eq = ({ items, etiqueta }) => (
  <div className="sal-eq" role="group" aria-label={etiqueta}>
    {items.map((x, i) => (
      <Fragment key={i}>
        {x.op && <i aria-hidden="true">{x.op}</i>}
        <div className={'sal-eq-b' + (x.ok ? ' sal-eq-ok' : '')}><span>{x.t}</span><b>{x.v}</b>{x.n && <small>{x.n}</small>}</div>
      </Fragment>
    ))}
  </div>
)

export function PanelSalud({ s, origen, inicio, hoy, titulo = 'Salud de la billetera', ritmo, proyectar = true }) {
  const e = ESTADO[s.estado], p = s.piso
  const socios = s.filas.filter((f) => f.tipo === 'socio'), sumaPct = socios.reduce((a, f) => a + f.pct, 0)
  const porSocio = s.retiroSeguro > 0 && sumaPct > 0 ? socios.map((f) => ({ nombre: f.nombre, monto: Math.round((s.retiroSeguro * f.pct) / sumaPct) })) : []
  const hayRetiro = s.retiroSeguro > 0
  // Lo que les toca, partido en «retirable hoy» y «pendiente» (el pendiente espera a que sobre más en la billetera).
  const toca = s.sociasPorRetirar, ahora = Math.min(s.retiroSeguro, toca), pendiente = Math.max(0, toca - s.retiroSeguro)
  const pctHoy = toca > 0 ? Math.round((ahora / toca) * 100) : 0
  const lim = hayRetiro && pendiente > 0 && s.limitadoPor ? LIMITE[s.limitadoPor] : null
  return (
    <section style={{ marginBottom: 20 }}>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="kpi-l">{titulo}<Ayuda t="salud_billetera" /></div>
          <span className="vz-estado" style={{ background: `var(--${e.col}-soft, var(--panel))`, color: `var(--${e.col}-ink, var(--ink))` }}><i style={{ background: `var(--${e.col})` }} aria-hidden="true">{e.icono}</i>{e.etiqueta}</span>
        </div>

        <div className="sal-grid">
          <div className="sal-tile sal-main">
            <div className="kpi-l">Puedes retirar hoy</div>
            {hayRetiro ? <div className="vz-hero">{cop(s.retiroSeguro)}</div> : <div style={{ fontSize: 21, fontWeight: 700, lineHeight: 1.25, marginTop: 4 }}>{s.titulo}</div>}
            {!hayRetiro && <div className="muted" style={{ fontSize: 14, marginTop: 6 }}>{s.detalle}</div>}
          </div>
          {s.saldo != null && (
            <div className="sal-tile">
              <div className="kpi-l">Disponible en la billetera</div>
              <div className="vz-hero" style={{ fontSize: 34 }}>{cop(s.saldo)}</div>
              <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>de esto se puede retirar {cop(s.retiroSeguro)}</div>
            </div>
          )}
        </div>

        {hayRetiro && toca > 0 && (
          <div style={{ marginTop: 16 }}>
            <div className="vz-t"><span>Les tocan a los socios</span><b>{cop(toca)}</b></div>
            <div className="sal-prog" role="img" aria-label={`De ${cop(toca)} que les tocan, ${cop(ahora)} se pueden retirar hoy (${pctHoy} %) y ${cop(pendiente)} quedan pendientes`}>
              <div style={{ flexGrow: Math.max(ahora, 1), background: 'var(--jade)' }} />
              {pendiente > 0 && <div style={{ flexGrow: pendiente, background: 'repeating-linear-gradient(135deg, var(--line2) 0 6px, var(--panel) 6px 12px)' }} />}
            </div>
            <div className="sal-prog-l">
              <span><i style={{ background: 'var(--jade)' }} />Hoy <b>{cop(ahora)}</b> · {pctHoy} %</span>
              {pendiente > 0 && <span><i style={{ background: 'var(--line2)' }} />Pendiente <b>{cop(pendiente)}</b><Ayuda texto="No se pierde: sigue siendo de los socios. Se podrá retirar cuando sobre más plata en la billetera, por ejemplo cuando Dropi pague lo que viene en camino." titulo="Pendiente" /></span>}
              {lim && <span className="chip idle" style={{ fontSize: 12.5 }}>Límite hoy: {lim.corto}<Ayuda texto={lim.ayuda} titulo={lim.corto} /></span>}
            </div>
          </div>
        )}

        {(porSocio.length > 0 || (proyectar && s.proyeccion)) && (
          <div className="sal-cards">
            {porSocio.map((x) => <div key={x.nombre} className="sal-mini"><div className="kpi-l">{x.nombre}</div><b>{cop(x.monto)}</b></div>)}
            {proyectar && s.proyeccion && (
              <div className="sal-mini sal-proy"><div className="kpi-l">Hacia el {diaCorto(s.proyeccion.fecha)} <span className="chip warn" style={{ fontSize: 11.5, padding: '1px 7px' }}>Estimado</span></div><b>{cop(s.proyeccion.retiro)}</b><span className="muted" style={{ fontSize: 12.5 }}>cuando llegue lo que viene en camino</span></div>
            )}
          </div>
        )}

        {s.saldo != null && (
          <div style={{ marginTop: 18 }}>
            <BarraApilada
              titulo="¿En qué está tu billetera?" total={s.saldo}
              marca={s.libre < 0 ? { valor: s.saldo, etiqueta: `Hay ${cop(s.saldo)}` } : null}
              segmentos={[
                { etiqueta: 'Pauta de 7 días', valor: p.pauta, color: COLOR.azul },
                { etiqueta: 'Devoluciones esperadas', valor: p.devoluciones, color: COLOR.ambar },
                { etiqueta: 'Imprevistos, ahorro e impuestos', valor: s.seQueda, color: COLOR.violeta },
                { etiqueta: 'Margen libre', valor: Math.max(0, s.libre - s.retiroSeguro), color: 'var(--jade-line)' },
                { etiqueta: 'Para retirar (socios)', valor: Math.min(Math.max(0, s.libre), s.retiroSeguro), color: COLOR.jade },
              ]} />
          </div>
        )}

        {s.saldo != null && (
          <details className="vz-det" style={{ marginTop: 14 }}>
            <summary>{hayRetiro ? '¿Por qué este monto? · paso a paso' : 'Ver el cálculo paso a paso'}</summary>
            {inicio && hoy && <div className="sal-rango"><b>Periodo de la cuenta:</b> desde el inicio de la operación ({conAnio(inicio)}) hasta hoy ({conAnio(hoy)}). No depende del corte: suma todo lo que ha pasado.</div>}
            <ol className="sal-pasos">

              <li>
                <h4><i>1</i>¿Cuánto has ganado en total?<span>{inicio && hoy ? `${diaCorto(inicio)} → ${diaCorto(hoy)}` : 'desde el inicio'}</span></h4>
                {origen && origen.ingresos > 0 && (
                  <BarraApilada titulo={`Dropi te pagó ${cop(origen.ingresos)} y se repartió así`} segmentos={[
                    { etiqueta: 'Publicidad en Meta (con IVA)', valor: origen.publicidad, color: COLOR.azul },
                    { etiqueta: 'Devoluciones', valor: origen.devoluciones, color: COLOR.ambar },
                    { etiqueta: 'Herramientas, comisiones y otros', valor: origen.herramientas + origen.comisiones + origen.otros, color: COLOR.violeta },
                    { etiqueta: 'Ganancia neta', valor: Math.max(0, origen.neto), color: COLOR.jade },
                  ]} />
                )}
                <Eq etiqueta="Ganancia neta acumulada: lo que Dropi pagó menos los gastos reales" items={origen ? [
                  { t: 'Dropi te pagó', v: cop(origen.ingresos), n: 'pedidos entregados' },
                  { op: '−', t: 'Gastos reales', v: cop(origen.publicidad + origen.devoluciones + origen.herramientas + origen.comisiones + origen.otros), n: 'publicidad, devoluciones y demás' },
                  { op: '=', t: 'Ganancia neta', v: cop(origen.neto), ok: origen.neto > 0 },
                ] : [{ t: 'Ganancia neta acumulada', v: cop(s.utilidadAcumulada), ok: true }]} />
              </li>

              <li>
                <h4><i>2</i>¿Cuánto de esa ganancia es de los socios?<span>tu reparto</span></h4>
                {s.utilidadAcumulada > 0 && (
                  <BarraApilada titulo={`La ganancia neta de ${cop(s.utilidadAcumulada)} se reparte así`} segmentos={[
                    ...socios.map((x, i) => ({ etiqueta: x.nombre, valor: (s.utilidadAcumulada * x.pct) / 100, color: [COLOR.jade, COLOR.teal || 'var(--jade-line)', COLOR.ambar, COLOR.coral][i % 4] })),
                    { etiqueta: 'Se queda en la operación', valor: Math.max(0, s.utilidadAcumulada - (s.utilidadAcumulada * sumaPct) / 100), color: COLOR.azul },
                  ]} />
                )}
                <Eq etiqueta="Lo que les toca a los socios" items={[
                  { t: `Les toca (${(Math.round(sumaPct * 100) / 100).toLocaleString('es-CO')} %)`, v: cop(s.sociasAcumulado), n: 'de la ganancia neta' },
                  { op: '−', t: 'Ya retirado', v: cop(s.retirado) },
                  { op: '=', t: 'Les toca y aún no retiran', v: cop(s.sociasPorRetirar), ok: true },
                ]} />
                <p className="muted">Los porcentajes salen de <Link href="/configuracion/reparto" className="link">Configuración → Reparto</Link>.</p>
              </li>

              <li>
                <h4><i>3</i>¿Cuánta plata sobra en la billetera?<span>{hoy ? `saldo al ${diaCorto(hoy)}` : 'hoy'}</span></h4>
                <Eq etiqueta="De la billetera se resta lo que debe quedarse" items={[
                  { t: 'En la billetera', v: cop(s.saldo), n: 'saldo que informa Dropi' },
                  { op: '−', t: 'Debe quedarse (piso de liquidez)', v: cop(s.bloqueado), n: 'el mínimo para que la operación siga' },
                  { op: '=', t: s.libre >= 0 ? 'Sobra' : 'Falta', v: cop(Math.abs(s.libre)), ok: s.libre > 0 },
                ]} />
                <ul className="sal-piso">
                  <li><i style={{ background: COLOR.azul }} /><span><b>Pauta de 7 días · {cop(p.pauta)}</b><em>la publicidad de la próxima semana: {cop(p.ritmo)} por día activo × 7{p.deudaMeta > 0 ? `, más ${cop(p.deudaMeta)} que Meta ya gastó y aún no cobra` : ''}{p.tarjeta > 0 ? `, menos ${cop(p.tarjeta)} que ya tiene la tarjeta` : ''}</em></span></li>
                  <li><i style={{ background: COLOR.ambar }} /><span><b>Devoluciones esperadas · {cop(p.devoluciones)}</b><em>lo que Dropi te cobraría por los pedidos en camino que se devolverán</em></span></li>
                  <li><i style={{ background: COLOR.violeta }} /><span><b>Imprevistos, ahorro e impuestos · {cop(s.seQueda)}</b><em>la parte de la ganancia que apartaste en tu reparto</em></span></li>
                </ul>
                <div className="tint blue" style={{ marginTop: 10, fontSize: 14 }}>
                  <b style={{ color: 'var(--blue)' }}>¿Por qué el piso limita lo de los socios?</b> Porque su ganancia <b>está dentro de la misma billetera</b> que paga la operación: si la sacaran toda, no alcanzaría para la publicidad de la próxima semana ni para las devoluciones.
                  {pendiente > 0 && s.limitadoPor === 'necesidades' && <> Con tus cifras: retirar los {cop(toca)} dejaría la billetera {cop(s.bloqueado - (s.saldo - toca))} por debajo del mínimo; para retirar todo tendría que llegar a <b>{cop(s.bloqueado + toca)}</b>.</>}
                </div>
              </li>

              <li>
                <h4><i>4</i>¿Cuánto se puede retirar hoy?<span>el menor de tres límites</span></h4>
                <div className="sal-lim">
                  {[['plan', 'Paso 2 · lo que les toca', s.sociasPorRetirar], ['necesidades', 'Paso 3 · lo que sobra sobre el piso', Math.max(0, s.libre)], ['utilidad', 'Paso 1 · ganancia neta que sigue en la operación', s.utilidadRetenida]].map(([k, t, v]) => (
                    <div key={k} className={'sal-lim-i' + (hayRetiro && s.limitadoPor === k ? ' on' : '')}><span>{t}</span><b>{cop(v)}</b>{hayRetiro && s.limitadoPor === k && <em>el que limita hoy</em>}</div>
                  ))}
                </div>
                <div className="sal-fin"><span>Retiro de hoy</span><b>{cop(s.retiroSeguro)}</b></div>
                {pendiente > 0 && <p className="muted">Lo que no sale hoy ({cop(pendiente)}) no se pierde: sigue siendo de los socios y se libera cuando entra más plata.</p>}
              </li>
            </ol>
            <div className="only-pro muted" style={{ fontSize: 13.5, marginTop: 8 }}>
              {p.diasCubiertos != null && <>Días de pauta que cubre lo disponible para publicidad: <b>{String(p.diasCubiertos).replace('.', ',')}</b> (objetivo 7). </>}
              {ritmo && ritmo.diasActivos > 0 && <>Ritmo: promedio de la semana {cop(ritmo.promedio7)} · últimos 3 días activos {cop(ritmo.ultimos3)} · se usa el mayor ({cop(ritmo.ritmo)}), {fmtN(ritmo.diasActivos)} días activos.</>}
            </div>
          </details>
        )}
      </div>
    </section>
  )
}
