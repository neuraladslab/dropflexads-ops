import { diaCorto } from '@/lib/formato'

// Configuración → Inicio de la operación (solo informativo). La operación de cada empresa empieza el día 1 del mes en que se registra: no se elige.
// Desde ahí se sincroniza Dropi y Meta por mes, y como mucho el mes actual y los 2 anteriores, sin pasar nunca por encima del inicio.
export default function InicioOperacion({ v }) {
  const desde = v.inicioTexto ? v.inicioTexto : `el ${diaCorto(v.inicio)}`
  return (
    <section className="card" style={{ maxWidth: 680 }} aria-labelledby="op-inicio">
      <b id="op-inicio" style={{ fontSize: 18 }}>Tu operación empieza en {v.inicioTexto || diaCorto(v.inicio)}</b>
      <p className="muted" style={{ fontSize: 14, margin: '6px 0 12px' }}>
        La operación de cada empresa arranca el <b>día 1 del mes en que se registró</b>; no se elige. Desde {desde} se traen los pedidos, la tarjeta y la billetera de Dropi y el gasto de Meta.
      </p>
      <b style={{ fontSize: 15 }}>Meses que puedes sincronizar ahora</b>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '8px 0 12px' }}>
        {v.meses.map((m) => <span key={m.mes} className="chip ok">{m.etiqueta}</span>)}
      </div>
      <p className="muted" style={{ fontSize: 13.5, margin: 0 }}>
        Se sincroniza <b>un mes completo a la vez</b> con el botón <b>Sincronizar</b> de la barra superior: eliges el mes y se trae todo lo de ese mes. Solo cuentan el mes actual y los 2 anteriores, y nunca días anteriores al inicio de tu operación.
        Lo que ya se guardó no se borra. Cada noche se actualiza solo lo reciente.
      </p>
    </section>
  )
}
