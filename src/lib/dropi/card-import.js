import 'server-only'
// Guarda movimientos de la tarjeta ya leídos (del JSON pegado o de la sincronización con Dropi). Idempotente: un movimiento con identificador
// del banco se reconoce al volver a cargarlo y se ACTUALIZA (una retención que se liquida, un rechazo que pasa a aprobado) en vez de duplicarse;
// lo que corregiste a mano (¿es de Meta?, vínculo con un cobro) se conserva. Todo queda ligado al usuario (owner_id).
import sql from '@/lib/db'
import { payRefOf } from './parse/importers.mjs'
import { okDate, okAmount, clip, keyer } from '@/lib/util'

export async function importCardRows(uid, input, { batch = crypto.randomUUID() } = {}) {
  const key = keyer()
  const today = new Date(Date.now() + 36 * 3600e3).toISOString().slice(0, 10)
  const rows = []
  let invalid = 0
  for (const r of input) {
    const amount = okAmount(r?.amount)
    if (!okDate(r?.date) || r.date > today || amount == null) { invalid++; continue }
    const description = clip(r.description, 200), reference = clip(r.reference, 80)
    rows.push({
      tx_date: r.date, amount, kind: r.kind === 'refund' ? 'refund' : 'charge',
      description: description || null, reference: reference || null,
      last4: /^\d{4}$/.test(r.last4 || '') ? r.last4 : null,
      pay_ref: payRefOf(description) || null,
      op_type: clip(r.opType, 30) || null, op_state: clip(r.opState, 30) || null,
      status: r.status === 'declined' ? 'declined' : 'approved', decline_reason: r.status === 'declined' ? clip(r.declineReason, 200) || null : null,
      // Con identificador del banco la clave no incluye monto ni fecha: así una retención ajustada se reconoce como el mismo movimiento.
      external_key: key(reference ? 'r:' + reference : `k:${description.slice(0, 40)}|${r.date}|${amount}`),
      batch_id: batch, owner_id: uid,
    })
  }
  if (!rows.length) return { error: 'Ningún movimiento tenía fecha y monto válidos.', invalid }
  const { inserted, updated } = await sql.begin(async (tx) => {
    let ins = 0, upd = 0
    for (let i = 0; i < rows.length; i += 500) {
      // xmax = 0 distingue las filas nuevas de las actualizadas; las que no cambiaron no devuelven nada.
      const out = await tx`INSERT INTO card_transactions ${tx(rows.slice(i, i + 500), 'tx_date', 'amount', 'kind', 'description', 'reference', 'last4', 'pay_ref', 'status', 'decline_reason', 'op_type', 'op_state', 'external_key', 'batch_id', 'owner_id')}
        ON CONFLICT (owner_id, external_key) DO UPDATE SET tx_date = EXCLUDED.tx_date, amount = EXCLUDED.amount, kind = EXCLUDED.kind, description = EXCLUDED.description, last4 = EXCLUDED.last4, pay_ref = EXCLUDED.pay_ref, status = EXCLUDED.status, decline_reason = EXCLUDED.decline_reason, op_type = EXCLUDED.op_type, op_state = EXCLUDED.op_state
        WHERE card_transactions.amount IS DISTINCT FROM EXCLUDED.amount OR card_transactions.tx_date IS DISTINCT FROM EXCLUDED.tx_date OR card_transactions.kind IS DISTINCT FROM EXCLUDED.kind OR card_transactions.status IS DISTINCT FROM EXCLUDED.status OR card_transactions.op_type IS DISTINCT FROM EXCLUDED.op_type OR card_transactions.op_state IS DISTINCT FROM EXCLUDED.op_state
        RETURNING id, (xmax = 0) AS inserted`
      for (const o of out) o.inserted ? ins++ : upd++
    }
    return { inserted: ins, updated: upd }
  })
  return { batch, inserted, updated, duplicated: rows.length - inserted - updated, invalid }
}
