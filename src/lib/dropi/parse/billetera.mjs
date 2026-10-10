// Billetera de Dropi: lectura, clasificación y cuentas. Funciones puras (sin red ni base), para poder probarlas con datos de ejemplo.
const r2 = (n) => Math.round(n * 100) / 100
const num = (v) => { const n = Number(String(v ?? '').replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : null }
const coDate = (ms) => new Date(ms - 5 * 3600e3).toISOString().slice(0, 10)

export const KIND_LABEL = {
  profit: 'Ganancia de un pedido', return_fee: 'Cobro por devolución', card_fee: 'Mantenimiento de la tarjeta', to_card: 'Recarga a tu tarjeta',
  withdrawal: 'Retiro a tu banco', reversal: 'Reverso', other_in: 'Otro ingreso', other_out: 'Otro descuento',
  recharge_fee: 'Comisión por recargar la tarjeta', wallet_topup: 'Recarga de tu billetera (pasarela de pago)',
}

/**
 * Tipo de movimiento según el código de Dropi (`identification_code`), que es lo único que Dropi garantiza; la descripción solo sirve de respaldo.
 * Códigos vistos en datos reales: 1002 ganancia de un pedido · 1038 salida por recarga de la tarjeta · 1102 «servicio de dispersión» (comisión de esa recarga, 0.4 %)
 * · 1031 transferencia de la billetera a otro usuario (p. ej. el pago a una herramienta como ChatePro: cuenta como inversión en herramientas) · 1000 salida por nueva orden con pago anticipado (compra de un pedido que el cliente ya pagó: NO es inversión)
 * · 1045 mantenimiento mensual de la tarjeta · 1068 recarga de la billetera por pasarela de pago (plata tuya del banco, no una ganancia) · 1014 cobro de devolución por entrega no efectiva · 1020 retiro de saldo a tu banco.
 */
export const KIND_BY_CODE = { 1002: 'profit', 1038: 'to_card', 1102: 'recharge_fee', 1045: 'card_fee', 1068: 'wallet_topup', 1014: 'return_fee', 1020: 'withdrawal', 1031: 'transfer_out', 1000: 'order_payment' }
export const kindByCode = (code) => KIND_BY_CODE[String(code || '').trim()] || null

/** Un movimiento de `historywallet` → fila normalizada, o { error }. */
export function classifyWallet(o) {
  if (!o || typeof o !== 'object') return { error: 'no es un movimiento' }
  const id = o.id != null ? String(o.id).slice(0, 40) : ''
  const amount = num(o.amount), at = Date.parse(o.created_at)
  const type = String(o.type || '').toUpperCase()
  if (!/^\d{1,20}$/.test(id)) return { error: 'sin identificador' }
  if (amount == null || amount < 0) return { error: 'monto no válido' }
  if (!Number.isFinite(at)) return { error: 'fecha no válida' }
  if (type !== 'ENTRADA' && type !== 'SALIDA') return { error: 'tipo desconocido «' + type.slice(0, 20) + '»' }
  const dir = type === 'ENTRADA' ? 'in' : 'out'
  const description = String(o.description || '').replace(/\s+/g, ' ').trim().slice(0, 300)
  const before = num(o.previous_amount)
  const code = o.identification_code != null ? String(o.identification_code).slice(0, 10) : ''
  const guide = String((o.order && o.order.shipping_guide) || (/GUIA:\s*\*?(\d{6,40})/i.exec(description) || [])[1] || '').replace(/\D/g, '').slice(0, 40)
  const orderRef = String(o.order_id ?? (o.order && o.order.id) ?? '').replace(/\D/g, '').slice(0, 30)
  const reverses = o.reverses_history_wallet_id != null ? String(o.reverses_history_wallet_id).slice(0, 40) : ''
  let kind
  if (reverses) kind = 'reversal'
  else if (kindByCode(code)) kind = kindByCode(code)
  else if (dir === 'in' && /GANANCIA EN LA ORDEN/i.test(description)) kind = 'profit'
  else if (/MANTENIMIENTO/i.test(description)) kind = 'card_fee'
  else if (dir === 'out' && /DEVOLUCI/i.test(description)) kind = 'return_fee'
  else if (o.withdrawal_request_id != null || /RETIRO/i.test(description)) kind = 'withdrawal'
  else if (dir === 'out' && /TARJETA|RECARGA/i.test(description)) kind = 'to_card'
  else kind = dir === 'in' ? 'other_in' : 'other_out'
  return { row: { externalId: id, at: new Date(at).toISOString(), date: coDate(at), dir, amount: r2(amount), before: before == null ? null : r2(before), kind, description, orderRef, guide, code, reverses } }
}

/** JSON de `historywallet` (o una lista suelta) → { rows, errors, total }. */
export function parseWalletJson(text) {
  let j
  try { j = typeof text === 'string' ? JSON.parse(text) : text } catch { return { error: 'El texto no es un JSON válido.' } }
  const list = Array.isArray(j) ? j : j && Array.isArray(j.objects) ? j.objects : j && j.data && Array.isArray(j.data.objects) ? j.data.objects : null
  if (!list) return { error: 'No encontré la lista de movimientos de la billetera («objects»).' }
  const rows = [], errors = [], seen = new Set()
  for (const o of list) {
    const c = classifyWallet(o)
    if (c.error) { errors.push(c.error); continue }
    if (seen.has(c.row.externalId)) continue
    seen.add(c.row.externalId); rows.push(c.row)
  }
  return { rows, errors, total: list.length }
}

const dayDiff = (a, b) => Math.abs(Date.parse(a + 'T12:00:00Z') - Date.parse(b + 'T12:00:00Z')) / 864e5

/**
 * Posibles coincidencias entre las recargas que entraron a la tarjeta y lo que salió de la billetera: mismo monto y fechas a máximo 3 días. Uno a uno.
 * Es SOLO informativo: no cambia el tipo de ningún movimiento (lo que Dropi dice que es, es lo que es). Si el descuento ya se llama «recarga/tarjeta»
 * la coincidencia es firme; si no, queda como «posible» (`sure: false`) para que la persona la vea y no la dé por hecha.
 */
export function crossWithCard(rows, recharges) {
  const out = rows.map((r) => ({ ...r }))
  const used = new Set(), pairs = [], unmatched = []
  const cand = out.filter((r) => r.dir === 'out' && (r.kind === 'to_card' || r.kind === 'other_out'))
  for (const c of [...recharges].sort((a, b) => a.date.localeCompare(b.date))) {
    let best = null, bd = 99
    for (const w of cand) {
      if (used.has(w.externalId) || Math.abs(w.amount - c.amount) >= 1) continue
      const d = dayDiff(w.date, c.date)
      if (d <= 3 && d < bd) { best = w; bd = d }
    }
    if (best) { used.add(best.externalId); best.cardId = c.id; best.sure = best.kind === 'to_card'; pairs.push({ walletId: best.externalId, cardId: c.id, amount: c.amount, walletDate: best.date, cardDate: c.date, sure: best.sure }) }
    else unmatched.push(c)
  }
  return { rows: out, pairs, unmatched }
}

/**
 * Cuentas de la billetera. El saldo lo informa Dropi en cada movimiento («saldo anterior» ± monto), así que no se estima: se lee del último movimiento.
 * Verificación de coherencia: el saldo anterior de cada movimiento debe ser el saldo que dejó el anterior; si no, faltan movimientos en medio.
 * No se inventa el «origen» del dinero: Dropi no lo informa.
 */
export function buildWalletLedger(rows) {
  const sorted = [...rows].sort((a, b) => a.at.localeCompare(b.at) || Number(a.externalId) - Number(b.externalId))
  const signed = (r) => (r.dir === 'in' ? r.amount : -r.amount)
  const breaks = []
  let prevAfter = null, prevAt = null
  const totals = {}
  for (const r of sorted) {
    r.after = r.before == null ? null : r2(r.before + signed(r))
    if (prevAfter != null && r.before != null && Math.abs(r.before - prevAfter) > 0.5) breaks.push({ from: prevAt, to: r.at, missing: r2(r.before - prevAfter) })
    if (r.before != null) { prevAfter = r.after; prevAt = r.at }
    const t = totals[r.kind] || (totals[r.kind] = { n: 0, sum: 0 }); t.n++; t.sum = r2(t.sum + r.amount)
  }
  const first = sorted.find((r) => r.before != null)
  const last = [...sorted].reverse().find((r) => r.after != null)
  // Recargas a la tarjeta: lo que Dropi llama recarga/tarjeta, más lo que coincide en monto y fecha con una recarga de la tarjeta (marcado como posible).
  const transfers = sorted.filter((r) => r.kind === 'to_card' || r.cardId).map((r) => ({ id: r.externalId, date: r.date, at: r.at, amount: r.amount, cardId: r.cardId || null, sure: r.kind === 'to_card' })).reverse()
  return {
    balance: last ? last.after : null, asOf: last ? last.at : null, openingBalance: first ? first.before : null,
    movements: [...sorted].reverse(), totals, transfers, breaks,
    consistent: breaks.length === 0 && sorted.every((r) => r.before != null),
  }
}

/** Todo junto: clasifica, busca coincidencias con la tarjeta y hace las cuentas. */
export function buildWalletView(rows, recharges) {
  const x = crossWithCard(rows, recharges)
  const led = buildWalletLedger(x.rows)
  return { ...led, cardPairs: x.pairs, rechargesWithoutWallet: x.unmatched }
}
