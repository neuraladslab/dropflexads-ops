'use client'

import { useState } from 'react'
import { entradaRapida, rentabilidad, escalado } from '@/domain/calculadora.ts'

const cop = (n) => '$' + Math.round(n).toLocaleString('es-CO')
const num = (v) => { const n = Number(String(v).replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? n : 0 }

function Campo({ etiqueta, valor, onChange, sufijo, ayuda }) {
  return (
    <div className="field">
      <label>{etiqueta}</label>
      <div className="inp"><input type="text" inputMode="numeric" value={valor} onChange={(e) => onChange(e.target.value)} />{sufijo && <span className="muted" style={{ paddingRight: 12 }}>{sufijo}</span>}</div>
      {ayuda && <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{ayuda}</div>}
    </div>
  )
}
const Linea = ({ l, v, fuerte, color }) => (
  <div className="rowline" style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: fuerte ? '2px solid var(--ink)' : '1px solid var(--line)' }}>
    <span>{fuerte ? <b>{l}</b> : l}</span><b className="num" style={color ? { color: `var(--${color})` } : undefined}>{v}</b>
  </div>
)

function Rentabilidad() {
  const [modo, setModo] = useState('rapido')
  const [costo, setCosto] = useState('18000')
  const [flete, setFlete] = useState('14000')
  const [comision, setComision] = useState('2500')
  const [precio, setPrecio] = useState('79900')
  const [dev, setDev] = useState('15')
  const [cpaMax, setCpaMax] = useState('20000')
  const entrada = modo === 'rapido' ? entradaRapida(num(costo)) : { costoProducto: num(costo), flete: num(flete), comision: num(comision), precioVenta: num(precio), devolucionesPct: num(dev), cpaMax: num(cpaMax) }
  const r = rentabilidad(entrada)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 20, alignItems: 'start' }}>
      <div className="card">
        <div className="seg" style={{ marginBottom: 16 }}>
          <button className={modo === 'rapido' ? 'on' : ''} onClick={() => setModo('rapido')}>Rápido</button>
          <button className={modo === 'completo' ? 'on' : ''} onClick={() => setModo('completo')}>Completo</button>
        </div>
        <Campo etiqueta="Costo del producto en Dropi" valor={costo} onChange={setCosto} sufijo="COP" />
        {modo === 'completo' ? (
          <>
            <Campo etiqueta="Flete" valor={flete} onChange={setFlete} sufijo="COP" />
            <Campo etiqueta="Comisión" valor={comision} onChange={setComision} sufijo="COP" />
            <Campo etiqueta="Precio de venta" valor={precio} onChange={setPrecio} sufijo="COP" />
            <Campo etiqueta="Devoluciones" valor={dev} onChange={setDev} sufijo="%" />
            <Campo etiqueta="CPA máximo" valor={cpaMax} onChange={setCpaMax} sufijo="COP" />
          </>
        ) : <p className="muted" style={{ fontSize: 14 }}>Modo rápido: flete $14.000, comisión $2.500, 15 % de devoluciones, CPA máximo $20.000 y precio de venta a 2,5× el costo operativo ({cop(entrada.precioVenta)}).</p>}
      </div>
      <div className="card">
        <span className={'chip ' + (r.rentable ? 'ok' : 'bad')}>{r.rentable ? 'Rentable' : 'No es rentable con este CPA'}</span>
        <h2 style={{ margin: '12px 0 8px', fontSize: 18 }}>Una venta</h2>
        <Linea l="Precio de venta" v={cop(entrada.precioVenta)} />
        <Linea l="− Producto, flete y comisión" v={cop(r.costo)} />
        <Linea l="= Margen bruto" v={cop(r.bruto)} />
        <Linea l={`− Colchón de devoluciones (${entrada.devolucionesPct} %)`} v={cop(r.colchon)} />
        <Linea l="= Margen real" v={cop(r.real)} fuerte />
        <Linea l="− CPA máximo" v={cop(entrada.cpaMax)} />
        <Linea l="= Ganancia neta por venta" v={cop(r.gananciaNeta)} fuerte color={r.gananciaNeta >= 0 ? 'jade-ink' : 'coral-ink'} />
        <h2 style={{ margin: '18px 0 8px', fontSize: 18 }}>Para probar</h2>
        <Linea l="Presupuesto diario recomendado" v={cop(r.presupuestoDiario)} />
        <Linea l="Ventas por día para el CPA máximo" v={String(r.ventasPorDia)} />
        <Linea l="Ganancia estimada por mes" v={cop(r.gananciaMes)} color={r.gananciaMes >= 0 ? 'jade-ink' : 'coral-ink'} />
        <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>Es una <b>estimación</b> con los números que escribes. La ganancia real sale de Dropi y Meta en Contabilidad.</p>
      </div>
    </div>
  )
}

function Escalado() {
  const [presupuesto, setPresupuesto] = useState('30000')
  const [cpa, setCpa] = useState('20000')
  const [ventas, setVentas] = useState('2')
  const [margen, setMargen] = useState('38590')
  const [dias, setDias] = useState('3')
  const [iva, setIva] = useState('19')
  const e = escalado({ presupuesto: num(presupuesto), cpa: num(cpa), ventasPorDia: num(ventas), margenPorVenta: num(margen), cpaMax: null, diasRegistrados: num(dias) }, num(iva))
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 20, alignItems: 'start' }}>
      <div className="card">
        <Campo etiqueta="Presupuesto diario en Meta (sin IVA)" valor={presupuesto} onChange={setPresupuesto} sufijo="COP" />
        <Campo etiqueta="CPA actual" valor={cpa} onChange={setCpa} sufijo="COP" />
        <Campo etiqueta="Ventas por día" valor={ventas} onChange={setVentas} />
        <Campo etiqueta="Margen real por venta" valor={margen} onChange={setMargen} sufijo="COP" />
        <Campo etiqueta="Días con datos" valor={dias} onChange={setDias} />
        <Campo etiqueta="IVA de Meta" valor={iva} onChange={setIva} sufijo="%" />
      </div>
      <div className="card">
        <span className={'chip ' + (e.puedeEscalar ? 'ok' : 'warn')}>{e.puedeEscalar ? `Puedes escalar: sube ${e.incremento} %` : 'Todavía no escales'}</span>
        <h2 style={{ margin: '12px 0 8px', fontSize: 18 }}>Lectura</h2>
        <Linea l="ROAS de margen (con IVA)" v={e.roas.toFixed(2) + '×'} fuerte />
        <Linea l="Puntaje" v={`${e.puntaje} / 100`} />
        <Linea l="Ganancia diaria actual" v={cop(e.gananciaActual)} color={e.gananciaActual >= 0 ? 'jade-ink' : 'coral-ink'} />
        {e.puedeEscalar && <><Linea l="Nuevo presupuesto" v={cop(e.nuevoPresupuesto)} /><Linea l="Ganancia diaria esperada" v={cop(e.gananciaNueva)} color="jade-ink" /></>}
        {!e.puedeEscalar && <p className="muted" style={{ fontSize: 14, marginTop: 10 }}>Para escalar hace falta ROAS de margen ≥ 2×, al menos 2 ventas por día y 3 días con datos.</p>}
      </div>
    </div>
  )
}

export default function Calculadora() {
  const [tab, setTab] = useState('rent')
  return (
    <>
      <div className="seg" style={{ marginBottom: 20 }}>
        <button className={tab === 'rent' ? 'on' : ''} onClick={() => setTab('rent')}>Rentabilidad</button>
        <button className={tab === 'esc' ? 'on' : ''} onClick={() => setTab('esc')}>Escalado</button>
      </div>
      {tab === 'rent' ? <Rentabilidad /> : <Escalado />}
    </>
  )
}
