'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import TablaFiltrable from './TablaFiltrable'
import { cop, diaCorto, cpm, ctr, pct } from '@/lib/formato'

// Las cuatro tablas de datos reales, cada una con sus columnas y estados. Reciben datos simples (listas) desde el servidor.
const Chip = ({ t, children }) => <span className={'chip ' + t}>{children}</span>
const opciones = (mapa) => Object.entries(mapa).map(([valor, [, etiqueta]]) => ({ valor, etiqueta }))
const plano = (...p) => p.filter((x) => x != null && x !== '').join(' ') // texto para buscar (monto en dígitos sin puntos)

/* ---------- Tarjeta ---------- */
const CLASE = { meta: ['blue', 'De Meta · cruza con un cobro'], meta_monto: ['blue', 'De Meta · por monto y fecha'], otro: ['idle', 'Otro gasto'], repetido: ['bad', 'Posible cobro doble'], recarga: ['ok', 'Recarga'], rechazado: ['warn', 'Rechazado por el banco'], ignorado: ['idle', 'Ignorado · no cuenta'] }

export function TablaTarjeta({ lista }) {
  const router = useRouter()
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  // Un movimiento rechazado o ignorado no suma: aparece, pero no cuenta.
  const filas = lista.map((x) => ({ ...x, valor: x.clase === 'recarga' ? x.monto : x.clase === 'rechazado' || x.clase === 'ignorado' ? 0 : -x.monto, estado: x.clase, texto: plano(x.descripcion, x.refPago, x.monto, CLASE[x.clase][1]) }))
  const cambiar = async (ids, ignored) => {
    setOcupado(true); setError('')
    try {
      const res = await fetch('/api/tarjeta-movimientos', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'ignore', ids, ignored }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'No se pudo guardar el cambio.')
      router.refresh()
    } catch (e) { setError(e.message) } finally { setOcupado(false) }
  }
  const tachado = (f) => f.clase === 'rechazado' || f.clase === 'ignorado' ? { textDecoration: 'line-through', opacity: 0.6 } : undefined
  return (
    <>
      {error && <p className="empty-note" role="alert" style={{ color: 'var(--coral-ink)', margin: '0 0 10px' }}>{error}</p>}
      <TablaFiltrable filas={filas} estados={opciones(CLASE)} unidad="movimientos" vacio="Aún no hay movimientos de la tarjeta."
        acciones={(sel) => {
          const ids = filas.filter((f) => sel.has(f.id)), ign = ids.filter((f) => f.clase === 'ignorado'), act = ids.filter((f) => f.clase !== 'ignorado')
          return (
            <>
              {act.length > 0 && <button className="btn ghost sm" disabled={ocupado} onClick={() => cambiar(act.map((f) => f.id), true)}>Ignorar {act.length} (no contar)</button>}
              {ign.length > 0 && <button className="btn ghost sm" disabled={ocupado} onClick={() => cambiar(ign.map((f) => f.id), false)}>Volver a contar {ign.length}</button>}
            </>
          )
        }}
        columnas={[
          { titulo: 'Fecha', izq: true, celda: (f) => diaCorto(f.fecha) },
          { titulo: 'Descripción', txt: true, celda: (f) => f.descripcion || '—' },
          { titulo: 'Referencia', txt: true, celda: (f) => f.refPago || '—' },
          { titulo: 'Valor', celda: (f) => <span style={tachado(f)}>{f.clase === 'recarga' ? '+' : '−'}{cop(f.monto)}</span> },
          { titulo: 'Qué es', izq: true, celda: (f) => <Chip t={CLASE[f.clase][0]}>{CLASE[f.clase][1]}</Chip> },
          { titulo: 'Contabilidad', izq: true, celda: (f) => <button className="link" disabled={ocupado} onClick={() => cambiar([f.id], f.clase !== 'ignorado')}>{f.clase === 'ignorado' ? 'Volver a contar' : 'No contar'}</button> },
        ]} />
    </>
  )
}

/* ---------- Billetera ---------- */
const WK = { profit: ['ok', 'Ganancia'], to_card: ['ok', 'Recarga a tu tarjeta'], return_fee: ['bad', 'Devolución'], card_fee: ['warn', 'Mantenimiento'], withdrawal: ['idle', 'Retiro'], recharge_fee: ['warn', 'Comisión de recarga'], wallet_topup: ['idle', 'Recarga de tu billetera'], reversal: ['idle', 'Reverso'], other_in: ['idle', 'Otro ingreso'], other_out: ['warn', 'Otro descuento'], transfer_out: ['warn', 'Pago a herramienta o tercero'], order_payment: ['idle', 'Pago de pedido (pago anticipado)'] }

export function TablaBilletera({ mov }) {
  const filas = mov.map((m) => {
    const kind = WK[m.kind] ? m.kind : 'other_in'
    return { ...m, id: m.external_id, fecha: m.d, estado: kind, valor: m.direction === 'in' ? m.amount : -m.amount,
      despues: m.before == null ? null : m.before + (m.direction === 'in' ? m.amount : -m.amount),
      texto: plano(m.description, m.order_ref, m.amount, WK[kind][1]) }
  })
  return (
    <TablaFiltrable filas={filas} estados={opciones(WK)} unidad="movimientos" vacio="Aún no hay movimientos de la billetera."
      columnas={[
        { titulo: 'Fecha', izq: true, celda: (f) => diaCorto(f.fecha) },
        { titulo: 'Qué fue', izq: true, celda: (f) => <Chip t={WK[f.estado][0]}>{WK[f.estado][1]}</Chip> },
        { titulo: 'Detalle', txt: true, celda: (f) => (f.estado === 'profit' ? `Pedido #${f.order_ref || '—'}` : f.description || '') },
        { titulo: 'Valor', celda: (f) => <>{f.direction === 'in' ? '+' : '−'}{cop(f.amount)}</> },
        { titulo: 'Saldo después', celda: (f) => (f.despues == null ? '—' : cop(f.despues)) },
      ]} />
  )
}

/* ---------- Pedidos ---------- */
const CONTABLE = { pagado: ['ok', 'Pagado'], sin_pagar: ['warn', 'Sin pagar'], no_verificable: ['idle', 'No verificable'], devuelto: ['bad', 'Devuelto'], devuelto_cobrado: ['bad', 'Devuelto · ya cobrado'], en_curso: ['blue', 'En curso'] }

export function TablaPedidos({ lista, ocultarCampana = false }) {
  // `estado` es el que filtra (contable); el texto crudo que manda Dropi se conserva aparte para mostrarlo y buscarlo.
  const filas = lista.map((p) => ({ ...p, id: p.idPedido, fecha: p.creado, estadoDropi: p.estado, estado: p.contable, valor: p.total || 0, texto: plano(p.idPedido, p.guia, p.producto, p.campana, p.estado, p.total, CONTABLE[p.contable][1]) }))
  return (
    <TablaFiltrable filas={filas} neutro estados={opciones(CONTABLE)} unidad="pedidos" buscar="Buscar por ID de pedido, guía, producto, campaña o estado…" vacio="Aún no hay pedidos."
      columnas={[
        { titulo: 'Creado', izq: true, celda: (f) => diaCorto(f.creado) },
        { titulo: 'Pedido (ID Dropi)', txt: true, celda: (f) => <><b style={{ color: 'var(--ink)' }}>#{f.idPedido}</b>{f.guia ? ` · guía ${f.guia}` : ''}</> },
        { titulo: 'Producto', txt: true, celda: (f) => f.producto || '—' },
        ...(ocultarCampana ? [] : [{ titulo: 'Campaña', txt: true, celda: (f) => f.campana || <span className="muted">sin campaña</span> }]),
        { titulo: 'Estado en Dropi', txt: true, celda: (f) => f.estadoDropi || '' },
        { titulo: 'Total', celda: (f) => (f.total == null ? '—' : cop(f.total)) },
        { titulo: 'Contabilidad', izq: true, celda: (f) => <Chip t={CONTABLE[f.contable][0]}>{CONTABLE[f.contable][1]}{f.contable === 'sin_pagar' ? ` · ${f.dias} d` : ''}</Chip> },
      ]} />
  )
}

/* ---------- Ganancia por día ---------- */
const GANA = { gana: ['ok', 'Día con ganancia'], pierde: ['bad', 'Día en pérdida'] }

export function TablaDias({ dias }) {
  const filas = dias.map((d) => ({ ...d, id: d.dia, fecha: d.dia, valor: d.neto, estado: d.neto >= 0 ? 'gana' : 'pierde', texto: plano(d.dia, diaCorto(d.dia), d.neto) }))
  return (
    <TablaFiltrable filas={filas} estados={opciones(GANA)} unidad="días" buscar="Buscar un día…" vacio="Aún no hay días con movimientos."
      columnas={[
        { titulo: 'Día', izq: true, celda: (f) => diaCorto(f.dia) },
        { titulo: 'Ganancia', celda: (f) => <span style={{ color: 'var(--jade-ink)' }}>{f.ganancia ? '+' + cop(f.ganancia) : '—'}</span> },
        { titulo: 'Meta', celda: (f) => (f.meta ? '−' + cop(f.meta) : '—') },
        { titulo: 'Otros gastos', celda: (f) => (f.otrosGastos ? '−' + cop(f.otrosGastos) : '—') },
        { titulo: 'Dev. y comisiones', celda: (f) => { const v = f.devoluciones + f.comisiones + f.otrosDescuentos; return v ? '−' + cop(v) : '—' } },
        { titulo: 'Neto', celda: (f) => <b style={{ color: f.neto < 0 ? 'var(--coral-ink)' : 'var(--jade-ink)' }}>{f.neto < 0 ? '−' : '+'}{cop(Math.abs(f.neto))}</b> },
      ]} />
  )
}

/* ---------- Meta Ads ---------- */
const COBRO = { cruza: ['ok', 'Cruza con tu tarjeta'], sin_tarjeta: ['warn', 'Sin cargo en tu tarjeta'], fallido: ['bad', 'Cobro fallido'], pendiente: ['idle', 'Pendiente'] }

export function TablaGastoMeta({ filas }) {
  const rows = filas.map((x) => ({ ...x, id: x.d, fecha: x.d, valor: x.spend, estado: 'x', texto: plano(x.spend, x.d) }))
  return (
    <TablaFiltrable filas={rows} neutro unidad="días" buscar="Buscar por monto…" vacio="Aún no hay gasto de Meta."
      columnas={[
        { titulo: 'Día', izq: true, celda: (f) => diaCorto(f.fecha) },
        { titulo: 'Gastado (sin IVA)', celda: (f) => cop(f.spend) },
        { titulo: 'Con IVA', celda: (f) => cop(f.conIva) },
        { titulo: 'CPM', celda: (f) => (f.imp > 0 ? cop(cpm(f.spend, f.imp)) : '—') },
        { titulo: 'CTR', celda: (f) => (f.imp > 0 ? pct(ctr(f.clicks, f.imp)) : '—') },
        { titulo: 'Impresiones', celda: (f) => Math.round(f.imp).toLocaleString('es-CO') },
        { titulo: 'Clics', celda: (f) => Math.round(f.clicks).toLocaleString('es-CO') },
      ]} />
  )
}

export function TablaCobrosMeta({ cobros, onQuitar }) {
  const rows = cobros.map((c) => ({ ...c, valor: c.monto, texto: plano(c.ref, c.transaccion, c.monto, c.fecha, COBRO[c.estado][1]) }))
  return (
    <TablaFiltrable filas={rows} neutro estados={opciones(COBRO)} unidad="cobros" buscar="Buscar por referencia, monto o estado…" vacio="Aún no hay cobros de Meta."
      columnas={[
        { titulo: 'Fecha', izq: true, celda: (f) => diaCorto(f.fecha) },
        { titulo: 'Referencia de pago', txt: true, celda: (f) => f.ref || <span className="muted">sin referencia: se cruza por monto y fecha</span> },
        { titulo: 'Transacción', txt: true, celda: (f) => f.transaccion || <span className="muted">—</span> },
        { titulo: 'Importe (con IVA)', celda: (f) => cop(f.monto) },
        { titulo: 'Con tu tarjeta', izq: true, celda: (f) => <Chip t={COBRO[f.estado][0]}>{COBRO[f.estado][1]}</Chip> },
        ...(onQuitar ? [{ titulo: '', izq: true, celda: (f) => <button className="btn ghost sm" onClick={() => onQuitar(f.id)}>Quitar</button> }] : []),
      ]} />
  )
}
