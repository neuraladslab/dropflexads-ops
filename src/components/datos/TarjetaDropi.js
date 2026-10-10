import { cop, hace } from '@/lib/formato'

const SIN_CONTACTO = <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ opacity: 0.85 }}><path d="M8.5 8.5a5 5 0 0 1 0 7" /><path d="M12 6a8.5 8.5 0 0 1 0 12" /><path d="M15.5 3.5a12 12 0 0 1 0 17" /></svg>

/** La tarjeta virtual de Dropi (diseño de «Mi tarjeta» de la app original): disponible, de dónde sale el saldo, número y estado de la sincronización. */
export default function TarjetaDropi({ t }) {
  const tiene = t.saldo != null
  const num = /^\d{4}$/.test(t.last4 || '') ? `•••• •••• •••• ${t.last4}` : t.hint || '•••• •••• •••• ••••'
  const ok = t.conectada && t.estado === 'ok'
  const estado = !t.conectada ? 'Sin conectar' : ok ? (t.ultimaSync ? `Sincronizada ${hace(t.ultimaSync)}` : 'Conectada') : t.estado === 'reauth' ? 'Reconectar' : 'En pausa'
  return (
    <div className={'md-cc' + (tiene ? '' : ' empty')} role="img" aria-label={`Tarjeta virtual Dropi. Disponible: ${tiene ? cop(t.saldo) : 'sin leer'}`}>
      <div className="cc-top"><div className="cc-brand">DROPI<small>Tarjeta virtual</small></div>{SIN_CONTACTO}</div>
      <div className="cc-mid">
        <div className="cc-chip" aria-hidden="true" />
        <div className="cc-lab" style={{ marginTop: 14 }}>Disponible</div>
        <div className="cc-amt">{tiene ? cop(t.saldo) : '—'}</div>
        <div className="cc-note">{tiene ? `Saldo que informa Dropi · leído ${hace(t.leido)}` : 'Sincroniza con Dropi para ver tu disponible'}</div>
      </div>
      <div className="cc-bot">
        <div><div className="cc-lab">Número</div><div className="cc-num">{num}</div></div>
        <span className={'cc-st' + (ok ? '' : ' off')}><i />{estado}</span>
      </div>
    </div>
  )
}
