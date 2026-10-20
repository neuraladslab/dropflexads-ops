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
const LIMITE = { plan: 'lo que les toca a las socias', necesidades: 'lo que sobra sobre el piso de liquidez', utilidad: 'la ganancia neta que queda en la operación' }
const Fila = ({ t, v, nota, fuerte }) => (
  <tr><td>{fuerte ? <b>{t}</b> : t}{nota && <div className="muted" style={{ fontSize: 12.5 }}>{nota}</div>}</td><td>{fuerte ? <b>{v}</b> : v}</td></tr>
)

export function PanelSalud({ s, titulo = 'Salud de la billetera', ritmo, proyectar = true }) {
  const e = ESTADO[s.estado], p = s.piso
  const socias = s.filas.filter((f) => f.tipo === 'socio'), sumaPct = socias.reduce((a, f) => a + f.pct, 0)
  const porSocia = s.retiroSeguro > 0 && sumaPct > 0 ? socias.map((f) => ({ nombre: f.nombre, monto: Math.round((s.retiroSeguro * f.pct) / sumaPct) })) : []
  const hayRetiro = s.retiroSeguro > 0
  return (
    <section style={{ marginBottom: 20 }}>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="kpi-l">{titulo}<Ayuda t="salud_billetera" /></div>
          <span className="vz-estado" style={{ background: `var(--${e.col}-soft, var(--panel))`, color: `var(--${e.col}-ink, var(--ink))` }}><i style={{ background: `var(--${e.col})` }} aria-hidden="true">{e.icono}</i>{e.etiqueta}</span>
        </div>

        <div style={{ margin: '10px 0 4px' }}>
          {hayRetiro
            ? <><div className="vz-hero" style={{ color: `var(--${e.col === 'gold' ? 'gold-ink' : e.col === 'jade' ? 'jade-ink' : e.col})` }}>{cop(s.retiroSeguro)}</div>
                <div className="muted" style={{ fontSize: 15, marginTop: 2 }}>{s.estado === 'verde' ? 'es lo que pueden retirar hoy las socias' : 'es lo máximo que pueden retirar hoy las socias'}
                  {porSocia.length > 0 && <> · {porSocia.map((x, i) => <span key={x.nombre}>{i ? ' · ' : ''}<b style={{ color: 'var(--ink)' }}>{cop(x.monto)}</b> {x.nombre}</span>)}</>}</div></>
            : <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.25 }}>{s.titulo}</div>}
        </div>
        <div style={{ fontSize: 14.5, marginTop: 6 }}>{hayRetiro ? s.detalle : s.detalle}</div>
        {s.sociasPorRetirar > s.retiroSeguro && hayRetiro && <div className="muted" style={{ fontSize: 13.5, marginTop: 2 }}>A las socias les tocan {cop(s.sociasPorRetirar)} en total: el resto queda pendiente hasta que sobre más en la billetera.</div>}
        {proyectar && s.proyeccion && (
          <div style={{ fontSize: 14.5, marginTop: 8 }}>
            Hacia el <b>{diaCorto(s.proyeccion.fecha)}</b>, cuando llegue lo que viene en camino, el total retirable podría subir a <b>{cop(s.proyeccion.retiro)}</b> <span className="chip warn" style={{ fontSize: 12 }}>Estimado</span>
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
                { etiqueta: 'Para retirar (socias)', valor: Math.min(Math.max(0, s.libre), s.retiroSeguro), color: COLOR.jade },
              ]} />
            <p className="muted only-learner" style={{ fontSize: 13.5, margin: '10px 0 0' }}>Lo azul, ámbar y violeta debe quedarse en la billetera: paga la publicidad de la próxima semana, las devoluciones que se esperan y lo que apartaste. Lo verde claro es margen que sobra y no es de nadie; el verde fuerte es lo que pueden retirar las socias (lo que les toca, hasta donde alcance lo libre).</p>
          </div>
        )}

        {s.saldo != null && (
          <details className="vz-det" style={{ marginTop: 12 }}>
            <summary>Ver cómo se calcula</summary>
            <div className="card tbl-card" style={{ marginTop: 8 }}><div className="scroll-x"><table className="tbl">
              <thead><tr><th>Paso</th><th>Valor</th></tr></thead>
              <tbody>
                <Fila t="Lo que hay en la billetera" v={cop(s.saldo)} fuerte />
                <Fila t="Debe quedar: pauta de 7 días" v={cop(p.pauta)} nota={`ritmo real de Meta ${cop(p.ritmo)} por día activo (con IVA) × 7${p.deudaMeta > 0 ? ` + ${cop(p.deudaMeta)} que Meta ya gastó y aún no cobra` : ''}${p.tarjeta > 0 ? ` − ${cop(p.tarjeta)} que ya tiene la tarjeta` : ''}`} />
                <Fila t="Debe quedar: devoluciones esperadas" v={cop(p.devoluciones)} nota="de los pedidos que siguen en camino, con tu % de devolución por campaña" />
                <Fila t="Debe quedar: imprevistos, ahorro e impuestos" v={cop(s.seQueda)} nota="su parte de la utilidad acumulada; la reinversión extra en pauta ya está cubierta por el piso de 7 días" />
                <Fila t="Libre: lo máximo que podría salir sin dejar corta la billetera" v={cop(s.libre)} fuerte />
                <Fila t="Utilidad acumulada (ganancia neta desde el inicio)" v={cop(s.utilidadAcumulada)} nota="los ingresos de la billetera menos los gastos reales; si venías en pérdida, primero se recupera" />
                <Fila t="Les toca a las socias" v={cop(s.sociasAcumulado)} />
                <Fila t="Ya retirado" v={cop(s.retirado)} />
                <Fila t="Pendiente de retirar" v={cop(s.sociasPorRetirar)} />
                <Fila t="Retiro recomendado" v={cop(s.retiroSeguro)} fuerte nota={s.retiroSeguro > 0 && s.limitadoPor ? `el menor de los tres límites; hoy lo limita ${LIMITE[s.limitadoPor]}` : undefined} />
              </tbody>
            </table></div></div>
            <div className="only-pro muted" style={{ fontSize: 13.5, marginTop: 8 }}>
              {p.diasCubiertos != null && <>Días de pauta que cubre lo disponible para publicidad: <b>{String(p.diasCubiertos).replace('.', ',')}</b> (objetivo 7). </>}
              {ritmo && ritmo.diasActivos > 0 && <>Ritmo: promedio de la semana {cop(ritmo.promedio7)} · últimos 3 días activos {cop(ritmo.ultimos3)} · se usa el mayor ({cop(ritmo.ritmo)}), {fmtN(ritmo.diasActivos)} días activos. </>}
              Los porcentajes se cambian en <Link href="/configuracion/reparto" className="link">Configuración → Reparto</Link>.
            </div>
          </details>
        )}
      </div>
    </section>
  )
}
