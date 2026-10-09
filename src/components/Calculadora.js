'use client'

import { useState } from 'react'
import { MODO_RAPIDO, entradaRapida, rentabilidad, escalado } from '@/domain/calculadora.ts'

// Misma interfaz de la calculadora original de DropFlexAds (pestañas, formulario + resultado en vivo, barra de distribución,
// medidor de salud). Los números salen del dominio puro: src/domain/calculadora.ts.
const cop = (n) => (n < 0 ? '−' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('es-CO')
const x1 = (n) => (Math.round(n * 100) / 100).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const kf = (n) => '$' + (n >= 1000 ? (Math.round(n / 100) / 10).toLocaleString('es-CO') + 'k' : Math.round(n).toLocaleString('es-CO'))
const pctN = (v) => Math.round(v)
const DIAS_CARTERA = 7 // días hasta que Dropi paga (se hará configurable)

/** Campo numérico con separador de miles (dinero) o decimal (%). Guarda el número; muestra el texto formateado mientras se escribe. */
function Campo({ id, etiqueta, valor, onChange, tipo = 'dinero', ayuda }) {
  const texto = tipo === 'dinero' ? Number(valor || 0).toLocaleString('es-CO') : String(valor ?? '').replace('.', ',')
  const cambio = (e) => {
    const s = e.target.value
    if (tipo === 'dinero') onChange(Number(s.replace(/\D/g, '')) || 0)
    else { const n = Number(s.replace(',', '.').replace(/[^\d.]/g, '')); onChange(Number.isFinite(n) ? n : 0) }
  }
  return (
    <div className="field">
      <label htmlFor={id}>{etiqueta}</label>
      <div className="inp">
        {tipo === 'dinero' && <span className="pre">$</span>}
        <input id={id} type="text" inputMode={tipo === 'dinero' ? 'numeric' : 'decimal'} autoComplete="off" data-num={tipo === 'dinero' ? 'money' : 'dec'} value={texto} onChange={cambio} />
        {tipo === 'porcentaje' && <span className="pre">%</span>}
      </div>
      {ayuda && <div className="muted" style={{ fontSize: 13 }}>{ayuda}</div>}
    </div>
  )
}
const Linea = ({ l, v, color, nota }) => (
  <div className="rowline"><span>{l}{nota && <> <span className="muted">{nota}</span></>}</span><b className="num" style={color ? { color: `var(--${color})` } : undefined}>{v}</b></div>
)

function ResultadoRentabilidad({ e, r }) {
  const tono = r.rentable ? 'ok' : 'bad'
  const etiqueta = r.rentable ? (r.real >= e.cpaMax * 1.5 ? 'Altamente rentable' : 'Rentable') : 'No rentable'
  const total = e.precioVenta > 0 ? e.precioVenta : 1
  const partes = [
    ['Dropi', e.costoProducto, '#0F172A', kf(e.costoProducto)], ['Flete', e.flete, '#3B82F6', kf(e.flete)], ['Comisión', e.comision, '#94A3B8', kf(e.comision)],
    ['Colchón', r.colchon, '#F59E0B', 'Colch.'], ['Ganancia', Math.max(0, r.real), '#10B981', 'Libre: ' + kf(Math.max(0, r.real))],
  ].filter((x) => x[1] > 0)
  const plan = r.rentable
    ? `Gasta ${cop(r.presupuestoDiario)} al día en Meta para probar. Si el CPA llega hasta ${cop(r.real)} sigues saliendo en positivo; tu meta es ${cop(e.cpaMax)} o menos. Revisa a las 48 a 72 horas y, si logras 2 o más ventas con CPA bajo, pasa al «Planificador de Escalado».`
    : `Tu ganancia por venta (${cop(r.real)}) es menor que el CPA máximo (${cop(e.cpaMax)}). Sube el precio de venta, busca un producto más barato en Dropi, reduce devoluciones confirmando por WhatsApp o elige un producto con mayor margen.`
  return (
    <div className="card">
      <h2 style={{ marginBottom: 18 }}>Rentabilidad calculada</h2>
      <div className={'tint ' + tono} style={{ textAlign: 'center' }}>
        <div style={{ fontWeight: 600, color: r.rentable ? 'var(--jade-ink)' : 'var(--coral-ink)' }}>Ganancia libre por venta (antes de pauta)</div>
        <div className="num" style={{ fontSize: 44, fontWeight: 800, margin: '10px 0' }}>{cop(r.real)}</div>
        <span className="chip" style={{ borderRadius: 999, padding: '6px 16px', background: r.rentable ? '#10B981' : '#EF4444', color: '#fff', borderColor: 'transparent' }}>{etiqueta}</span>
      </div>
      <div className="muted" style={{ marginTop: 22, fontSize: 14 }}>Factor de multiplicación sugerido</div>
      <div style={{ fontWeight: 700, fontSize: 17, margin: '4px 0 22px' }}>Vendes a {x1(r.multiplo)} veces el costo de Dropi ({cop(e.costoProducto)})</div>
      <div className="muted" style={{ marginBottom: 8, fontSize: 14 }}>Distribución de cada venta ({cop(e.precioVenta)})</div>
      <div style={{ display: 'flex', height: 34, borderRadius: 8, overflow: 'hidden' }} role="img" aria-label="Distribución de cada venta">
        {partes.map((x) => { const w = (x[1] / total) * 100; return <div key={x[0]} style={{ width: w + '%', background: x[2], color: '#fff', fontSize: 12, fontWeight: 700, display: 'grid', placeItems: 'center', whiteSpace: 'nowrap', overflow: 'hidden' }}>{w > 9 ? x[3] : ''}</div> })}
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 10, fontSize: 13, color: '#475569' }}>
        {partes.map((x) => <span key={x[0]} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: x[2] }} />{x[0]} ({pctN((x[1] / total) * 100)}%)</span>)}
      </div>
      <h3 style={{ margin: '26px 0 12px', fontSize: 17 }}>Presupuesto Meta recomendado</h3>
      <div className="graybox">
        <Linea l="Gasto diario mínimo para testear" v={cop(r.presupuestoDiario)} />
        <Linea l="CPA óptimo objetivo" v={cop(e.cpaMax)} color="jade-ink" />
        <Linea l="Ventas estimadas/día con pauta base" v={`${r.ventasPorDia} ${r.ventasPorDia === 1 ? 'pedido' : 'pedidos'}`} />
      </div>
      <div className="graybox" style={{ marginTop: 12 }}>
        <Linea l="Ganancia estimada por día" v={cop(r.gananciaDia)} color={r.gananciaDia > 0 ? 'jade-ink' : 'coral-ink'} />
        <Linea l="Ganancia estimada por mes (30 días)" v={cop(r.gananciaMes)} />
      </div>
      <div className="infobox" style={{ marginTop: 20 }}><b>Plan de acción sugerido:</b><p style={{ marginTop: 6, fontSize: 14.5, lineHeight: 1.55 }}>{plan}</p></div>
      <p className="muted" style={{ fontSize: 13, marginTop: 14 }}>Es una <b>estimación</b> con los números que escribes. La ganancia real sale de Dropi y Meta en Contabilidad.</p>
    </div>
  )
}

function Rentabilidad() {
  const [completo, setCompleto] = useState(false)
  const [f, setF] = useState({ costoProducto: 18000, flete: 14000, comision: 2500, precioVenta: 79900, devolucionesPct: 15, cpaMax: 20000 })
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }))
  const e = completo ? f : entradaRapida(f.costoProducto)
  const r = rentabilidad(e)
  return (
    <div className="grid g-form">
      <div className="card">
        <div className="sec-head">
          <h2>Variables del producto</h2>
          <div className="seg" role="group" aria-label="Modo">
            <button className={completo ? '' : 'on'} onClick={() => setCompleto(false)}>Rápido</button>
            <button className={completo ? 'on' : ''} onClick={() => setCompleto(true)}>Completo</button>
          </div>
        </div>
        {completo ? (
          <div className="two" style={{ rowGap: 20 }}>
            <Campo id="c-sale" etiqueta="Precio de venta al público *" valor={f.precioVenta} onChange={set('precioVenta')} />
            <Campo id="c-price" etiqueta="Costo del producto en Dropi *" valor={f.costoProducto} onChange={set('costoProducto')} />
            <Campo id="c-flete" etiqueta="Flete promedio Colombia *" valor={f.flete} onChange={set('flete')} />
            <Campo id="c-comm" etiqueta="Comisión Dropi o pasarela *" valor={f.comision} onChange={set('comision')} />
            <Campo id="c-dev" etiqueta="Devoluciones estimadas (%) *" valor={f.devolucionesPct} onChange={set('devolucionesPct')} tipo="porcentaje" />
            <Campo id="c-cpa" etiqueta="Tu CPA Máximo tolerable *" valor={f.cpaMax} onChange={set('cpaMax')} />
          </div>
        ) : (
          <>
            <Campo id="c-price" etiqueta="Costo del producto en Dropi *" valor={f.costoProducto} onChange={set('costoProducto')} />
            <dl className="dl" style={{ marginTop: 18 }}>
              <div><dt>Flete promedio</dt><dd className="num">{cop(MODO_RAPIDO.flete)}</dd></div>
              <div><dt>Comisión Dropi</dt><dd className="num">{cop(MODO_RAPIDO.comision)}</dd></div>
              <div><dt>Devoluciones</dt><dd>{MODO_RAPIDO.devolucionesPct} % de la ganancia</dd></div>
              <div><dt>CPA máximo</dt><dd className="num">{cop(MODO_RAPIDO.cpaMax)}</dd></div>
              <div><dt>Precio de venta</dt><dd>Costo total × 2,5 <span className="muted">(se calcula solo)</span></dd></div>
            </dl>
            <p className="muted only-learner" style={{ marginTop: 14, fontSize: 14 }}>La calculadora rápida usa valores típicos de la guía. Cambia a completa para poner los tuyos.</p>
          </>
        )}
      </div>
      <div className="live"><ResultadoRentabilidad e={e} r={r} /></div>
    </div>
  )
}

function Medidor({ puntaje, color }) {
  const R = 44, C = 2 * Math.PI * R
  return (
    <svg width="110" height="110" viewBox="0 0 110 110" role="img" aria-label={`Salud ${puntaje} de 100`}>
      <circle cx="55" cy="55" r={R} fill="none" stroke="#E2E8F0" strokeWidth="10" />
      <circle cx="55" cy="55" r={R} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${((C * puntaje) / 100).toFixed(1)} ${C.toFixed(1)}`} transform="rotate(-90 55 55)" />
      <text x="55" y="62" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontWeight="800" fontSize="24" fill="#0F172A">{puntaje}</text>
    </svg>
  )
}

function ResultadoEscalado({ m, o }) {
  const tono = o.puntaje >= 70 ? 'ok' : o.puntaje >= 50 ? 'warn' : 'bad'
  const color = { ok: '#10B981', warn: '#F59E0B', bad: '#EF4444' }[tono]
  const tinta = { ok: 'var(--jade-ink)', warn: 'var(--gold-ink)', bad: 'var(--coral-ink)' }[tono]
  const fase = ['Aprendizaje (0 a 2 ventas por día)', 'Crecimiento temprano (2 a 5)', 'Crecimiento (5 a 10)', 'Escalado (10 o más)'][o.fase]
  const razones = []
  if (o.roas < 2 - 1e-9) razones.push(['ROAS de margen muy bajo', `Tu ROAS es ${x1(o.roas)}× y necesitas 2× o más.`, 'Optimiza el video o el público antes de escalar.'])
  if (m.ventasPorDia < 2 - 1e-9) razones.push(['Pocas ventas por día', `Tienes ${m.ventasPorDia} ${m.ventasPorDia === 1 ? 'venta' : 'ventas'} por día y necesitas 2 o más.`, 'Espera de 7 a 10 días con 2 ventas diarias constantes.'])
  if (!o.diasOk) razones.push(['Pocos días de datos', `Tienes ${m.diasRegistrados} ${m.diasRegistrados === 1 ? 'día registrado' : 'días registrados'} y necesitas 3 o más.`, 'Registra al menos 3 días antes de decidir.'])
  if (o.gananciaActual < 0) razones.push(['Ganancia diaria negativa', `Hoy pierdes ${cop(-o.gananciaActual)} al día.`, 'Baja el presupuesto a $5.000 o $10.000 diarios y mejora los videos.'])
  const chequeo = [['ROAS de margen de 2× o más', o.roas >= 2 - 1e-9], ['2 o más ventas por día', m.ventasPorDia >= 2 - 1e-9], ['Ganancia diaria positiva', o.gananciaActual > 0], ['3 o más días de datos', o.diasOk]]
  return (
    <div className="card">
      <h2 style={{ marginBottom: 16 }}>Salud de la campaña</h2>
      <div className={'tint ' + tono} style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
        <Medidor puntaje={o.puntaje} color={color} />
        <div style={{ flex: 1, minWidth: 180 }}>
          <div className="muted" style={{ fontSize: 13 }}>de 100</div>
          <b style={{ color: tinta, fontSize: 17 }}>{o.puntaje >= 70 ? 'Excelente: lista para escalar.' : o.puntaje >= 50 ? 'Moderada: espera a tener más ventas.' : 'Baja: optimiza antes de escalar.'}</b>
        </div>
      </div>
      <div className="graybox" style={{ marginTop: 14 }}>
        <Linea l="ROAS de margen" nota="(meta 2,5× o más)" v={x1(o.roas) + '×'} />
        <div className="rowline"><span>Fase</span><b>{fase}</b></div>
        <Linea l="Ganancia diaria hoy" v={cop(o.gananciaActual)} color={o.gananciaActual >= 0 ? 'jade-ink' : 'coral-ink'} />
      </div>
      {o.puedeEscalar ? (
        <>
          <div className="sec-head" style={{ margin: '26px 0 12px' }}><h3 style={{ fontSize: 18 }}>Sí puedes escalar</h3><span className="chip ok">Aumenta {o.incremento} %</span></div>
          <div className="graybox">
            <Linea l="Nuevo presupuesto" v={cop(o.nuevoPresupuesto) + ' /día'} />
            <Linea l="Ventas proyectadas" v={o.nuevasVentas + ' por día'} />
            <Linea l="ROAS proyectado" v={x1(o.nuevoRoas) + '×'} />
            <Linea l="Ganancia diaria proyectada" v={cop(o.gananciaNueva)} color="jade-ink" />
          </div>
          <h3 style={{ margin: '26px 0 12px', fontSize: 18 }}>Cómo subirlo</h3>
          <div className="grid g-3" style={{ gap: 12 }}>
            {[['Día 1 a 3', m.presupuesto], ['Día 4 a 6', m.presupuesto * (1 + (o.incremento * 0.5) / 100)], ['Día 7 en adelante', o.nuevoPresupuesto]].map((x, i) => (
              <div key={x[0]} className="graybox" style={i === 2 ? { background: 'var(--blue-soft)', borderColor: '#C9D9FF' } : undefined}>
                <div className="muted" style={{ fontSize: 13 }}>{x[0]}</div><div className="num" style={{ fontWeight: 700, fontSize: 18, marginTop: 4 }}>{cop(x[1])}</div>
              </div>
            ))}
          </div>
          <div className="tint warn" style={{ marginTop: 16 }}><b style={{ color: 'var(--gold-ink)' }}>Cuida tu caja</b><div style={{ fontSize: 14.5, marginTop: 2 }}>Con {DIAS_CARTERA} días de cartera, gastar {cop(o.nuevoPresupuesto)} al día puede dejar hasta {cop(o.nuevoPresupuesto * DIAS_CARTERA)} atrapados en pauta antes de tu primer cobro de Dropi.</div></div>
        </>
      ) : (
        <>
          <div className="sec-head" style={{ margin: '26px 0 12px' }}><h3 style={{ fontSize: 18 }}>Todavía no escales</h3><span className="chip bad">Espera</span></div>
          {razones.map((r) => (
            <div key={r[0]} className="tint bad" style={{ marginBottom: 10 }}>
              <b style={{ color: 'var(--coral-ink)' }}>{r[0]}</b><div style={{ fontSize: 14.5, marginTop: 2 }}>{r[1]}</div><div style={{ fontSize: 14.5, marginTop: 4 }}><b>Acción:</b> {r[2]}</div>
            </div>
          ))}
        </>
      )}
      <details className="md-flat" open>
        <summary>Antes de escalar, confirma</summary>
        <div className="graybox">
          {chequeo.map((c) => <div key={c[0]} className="rowline"><span>{c[0]}</span><span className={'chip ' + (c[1] ? 'ok' : 'bad')}>{c[1] ? 'Cumple' : 'Falta'}</span></div>)}
          <div className="rowline"><span>Datos de 7 a 14 días y CPA estable (sin variar más de 30 % al día)</span><span className="chip idle">Revisa tú</span></div>
        </div>
      </details>
      <details className="md-flat">
        <summary>Reglas de seguridad <span className="md-sm">5 reglas</span></summary>
        <div className="graybox">
          {[['No pases de 100 %', 'Nunca escales más de 100 % en una semana: el algoritmo necesita adaptarse.'], ['Fatiga del anuncio', 'Con CTR bajo 0,5 %, detén todo y crea un video nuevo antes de subir presupuesto.'], ['Vigila a diario', 'Las primeras 2 semanas, si el CPA sube 30 %, apaga y reduce.'], ['Fondo de reserva', 'Guarda 30 días de presupuesto como fondo de emergencia.'], ['Mejor jugada', 'El retargeting da 50 a 100 % más ventas con el mismo presupuesto.']].map((r) => (
            <div key={r[0]} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}><b>{r[0]}</b><div className="muted" style={{ fontSize: 14 }}>{r[1]}</div></div>
          ))}
        </div>
      </details>
    </div>
  )
}

function Escalado() {
  const [m, setM] = useState({ presupuesto: 30000, cpa: 20000, ventasPorDia: 2, margenPorVenta: 38900, cpaMax: null, diasRegistrados: null })
  const set = (k) => (v) => setM((p) => ({ ...p, [k]: v }))
  const o = escalado(m, 19)
  return (
    <div className="grid g-form">
      <div className="card">
        <h2 style={{ marginBottom: 20 }}>Números para simular</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <Campo id="s-budget" etiqueta="Presupuesto diario actual" valor={m.presupuesto} onChange={set('presupuesto')} />
          <Campo id="s-cpa" etiqueta="CPA actual" valor={m.cpa} onChange={set('cpa')} />
          <div className="two">
            <Campo id="s-conv" etiqueta="Ventas por día" valor={m.ventasPorDia} onChange={set('ventasPorDia')} tipo="decimal" />
            <Campo id="s-margin" etiqueta="Ganancia por venta" valor={m.margenPorVenta} onChange={set('margenPorVenta')} />
          </div>
        </div>
        <p className="muted only-learner" style={{ marginTop: 20, fontSize: 14 }}>Con estas cuatro cifras calculamos la salud de tu campaña y cuánto puedes subir el presupuesto sin quemar plata. Cuando las campañas estén conectadas, estos números se cargarán solos.</p>
      </div>
      <div className="live"><ResultadoEscalado m={m} o={o} /></div>
    </div>
  )
}

export default function Calculadora() {
  const [tab, setTab] = useState('rent')
  return (
    <>
      <div className="tabs" role="tablist" style={{ marginTop: 0 }}>
        <button className={'tab' + (tab === 'rent' ? ' on' : '')} role="tab" aria-selected={tab === 'rent'} onClick={() => setTab('rent')}>Rentabilidad</button>
        <button className={'tab' + (tab !== 'rent' ? ' on' : '')} role="tab" aria-selected={tab !== 'rent'} onClick={() => setTab('scale')}>Planificador de Escalado</button>
      </div>
      {tab === 'rent' ? <Rentabilidad /> : <Escalado />}
    </>
  )
}
