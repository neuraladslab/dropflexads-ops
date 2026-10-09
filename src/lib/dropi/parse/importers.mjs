// Lectura tolerante de los archivos que sube el usuario: CSV de cobros de Meta y JSON de movimientos de la tarjeta.
// Funciones puras (sin I/O). El navegador las usa para la vista previa y el servidor revalida todo lo que recibe.

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Lee un valor en dinero: 1234567, "1.234.567", "$ 1.234.567,50", "1,234,567.50", "(120.000)", "-120.000". */
export function parseMoney(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (v == null) return null
  const raw = String(v).trim()
  if (!raw) return null
  const neg = /^[\s(]*[-−]|[-−]\s*$|^\(.*\)$/.test(raw)
  const s = raw.replace(/[^\d.,]/g, '')
  if (!/\d/.test(s)) return null
  const dots = (s.match(/\./g) || []).length
  const commas = (s.match(/,/g) || []).length
  let out
  if (dots && commas) {
    // El separador que aparece de último es el decimal.
    const dec = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ','
    out = s.split(dec === '.' ? ',' : '.').join('').replace(dec, '.')
  } else if (dots || commas) {
    const sep = dots ? '.' : ','
    const parts = s.split(sep)
    if (parts.length > 2) out = parts.join('') // 1.234.567
    else out = parts[1].length === 3 ? parts.join('') : parts[0] + '.' + parts[1] // 1.234 son miles (COP); 12,5 es decimal
  } else out = s
  const n = Number(out)
  if (!Number.isFinite(n)) return null
  return neg ? -n : n
}

const MONTHS = { ene: 1, jan: 1, feb: 2, mar: 3, abr: 4, apr: 4, may: 5, jun: 6, jul: 7, ago: 8, aug: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12, dec: 12 }
const validIso = (y, m, d) => {
  const iso = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  const t = new Date(iso + 'T12:00:00Z')
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === iso ? iso : null
}

/** Devuelve la fecha en ISO (AAAA-MM-DD) o null. Día primero cuando es ambiguo (formato colombiano). */
export function parseDate(v) {
  if (v == null || v === '') return null
  if (typeof v === 'number') {
    if (v > 1e11) return new Date(v - 5 * 3600e3).toISOString().slice(0, 10) // milisegundos, hora de Colombia
    if (v > 1e9) return new Date(v * 1000 - 5 * 3600e3).toISOString().slice(0, 10)
    return null
  }
  const s = String(v).trim()
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (m) return validIso(m[1], m[2], m[3])
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/)
  if (m) return validIso(m[3], m[2], m[1])
  m = norm(s).match(/^(\d{1,2}) (?:de )?([a-z]{3})[a-z]* (?:de )?(\d{4})/)
  if (m && MONTHS[m[2]]) return validIso(m[3], MONTHS[m[2]], m[1])
  return null
}

/** Busca la columna cuyo nombre coincide con alguno de los candidatos (primero exactos, luego «contiene»). */
function findKey(keys, names) {
  const n = keys.map((k) => ({ k, n: norm(k) }))
  for (const name of names) { const hit = n.find((x) => x.n === name); if (hit) return hit.k }
  for (const name of names) { if (name.length < 4) continue; const hit = n.find((x) => x.n.includes(name)); if (hit) return hit.k }
  return null
}

const ARRAY_KEYS = ['movimientos', 'transacciones', 'transactions', 'movements', 'data', 'items', 'results', 'registros']
const isObjList = (a) => Array.isArray(a) && a.some((x) => x && typeof x === 'object' && !Array.isArray(x))
function findArray(d, depth = 0) {
  if (Array.isArray(d)) return isObjList(d) ? d : null
  if (!d || typeof d !== 'object' || depth > 4) return null
  // Movimientos agrupados por día ({"2026-10-01": [...], "2026-09-30": [...]}): se unen en una sola lista.
  const groups = Object.keys(d).filter((k) => isObjList(d[k]))
  if (groups.length > 1 && groups.every((k) => /^\d{4}-\d{2}-\d{2}$|^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(k))) return groups.flatMap((k) => d[k])
  for (const k of Object.keys(d)) if (ARRAY_KEYS.includes(norm(k))) { const a = findArray(d[k], depth + 1); if (a) return a }
  for (const k of Object.keys(d)) { const a = findArray(d[k], depth + 1); if (a) return a }
  return null
}

// Movimientos que ENTRAN a la tarjeta (recargas, abonos, devoluciones) y los que SALEN (compras, retenciones…). Se reconocen en español e inglés.
const CREDIT_TYPE = /abono|devol|reverso|refund|reversal|reembols|a favor|credit|credito|deposit|deposito|recarga|recharge|top ?up|topup|fondeo|fund|ingreso|income|transfer in|cash ?in|load/
const DEBIT_TYPE = /debit|debito|purchase|compra|hold|retenc|release|liberac|captur|auth|fee|comision|withdraw|retiro|charge|cargo|spend/
const RECHARGE_DESC = /recarga|recharge|deposit|deposito|abono|top ?up|topup|fondeo|reembols|refund|devolucion/
const DECLINED = /declin|rechaz|reject|denied|denegad|fail|fall|cancel|anulad/

/** Busca el objeto de paginación del banco ({page_size, page_number, total_pages, total_items}). */
function findPagination(d, depth = 0) {
  if (!d || typeof d !== 'object' || depth > 4) return null
  for (const k of Object.keys(d)) {
    if (/pagina/i.test(k) && d[k] && typeof d[k] === 'object' && !Array.isArray(d[k])) {
      const p = d[k], n = (...ks) => { for (const x of ks) if (p[x] != null && Number.isFinite(Number(p[x]))) return Number(p[x]); return null }
      const out = { page: n('page_number', 'page', 'pagina'), pages: n('total_pages', 'pages', 'paginas'), total: n('total_items', 'total', 'count'), size: n('page_size', 'size', 'per_page') }
      if (out.total != null || out.pages != null) return out
    }
  }
  for (const k of Object.keys(d)) { const r = findPagination(d[k], depth + 1); if (r) return r }
  return null
}

/**
 * JSON de movimientos de la tarjeta → {rows:[{date, amount, kind, description, reference, last4}], errors, columns, sign}.
 * Acepta una lista o un objeto que la contenga (movimientos, transactions, data…). Los nombres de campo se reconocen en español e inglés.
 * Signo: si la mayoría de los montos son negativos, el banco muestra las compras en negativo y los abonos en positivo.
 */
export function parseCardJson(text) {
  let data
  try { data = JSON.parse(text) } catch { return { error: 'El archivo no es un JSON válido.' } }
  const list = findArray(data)
  if (!list) return { error: 'No encontré una lista de movimientos en el JSON.' }
  const keys = [...new Set(list.slice(0, 50).flatMap((x) => (x && typeof x === 'object' ? Object.keys(x) : [])))]
  const kDate = findKey(keys, ['fecha', 'date', 'fecha movimiento', 'fecha transaccion', 'fecha compra', 'posted', 'booking', 'timestamp']),
    kAmount = findKey(keys, ['monto', 'valor', 'importe', 'amount', 'total', 'valor compra', 'valor transaccion']),
    kDesc = findKey(keys, ['descripcion', 'description', 'detalle', 'concepto', 'comercio', 'establecimiento', 'merchant', 'nombre', 'memo']),
    kRef = findKey(keys, ['numero autorizacion', 'autorizacion', 'referencia', 'reference', 'transaction id', 'codigo', 'id']),
    kType = findKey(keys, ['operation type', 'tipo', 'type', 'naturaleza', 'movimiento']),
    kState = findKey(keys, ['state', 'estado', 'status']),
    kReason = findKey(keys, ['declination reason', 'decline reason', 'motivo de rechazo', 'motivo', 'razon', 'reason']),
    kCard = findKey(keys, ['ultimos 4', 'last4', 'ultimos digitos', 'tarjeta', 'card'])
  if (!kDate || !kAmount) return { error: 'No encontré los campos de fecha y monto en los movimientos (esperaba algo como «fecha» y «monto»).', keys }
  const raw = list.filter((x) => x && typeof x === 'object' && !Array.isArray(x)).map((x) => ({ x, amt: parseMoney(x[kAmount]) }))
  const negs = raw.filter((r) => r.amt != null && r.amt < 0).length, poss = raw.filter((r) => r.amt != null && r.amt > 0).length
  const negIsCharge = negs > poss
  const rows = [], errors = [], types = new Map()
  raw.forEach(({ x, amt }, n) => {
    const line = n + 1
    const date = parseDate(x[kDate])
    if (!date) return errors.push({ line, msg: 'Fecha no válida: «' + String(x[kDate] ?? '').slice(0, 30) + '»' })
    if (amt == null || amt === 0) return errors.push({ line, msg: 'Monto no válido: «' + String(x[kAmount] ?? '').slice(0, 30) + '»' })
    const typed = kType ? norm(x[kType]) : ''
    // Un cobro rechazado no mueve plata: se guarda con su estado y motivo (sirve para cruzar con lo que dice Meta), pero no cuenta como cargo.
    const declined = !!(kState && DECLINED.test(norm(x[kState])))
    const declineReason = declined && kReason && x[kReason] != null ? String(x[kReason]).trim().slice(0, 200) : ''
    // Tarjetas con retenciones: la compra pasa de «hold» (reserva) a «release» y el cobro real es el débito del historial.
    let value = amt
    if (/release|liberac/.test(typed) && Array.isArray(x.previous_states)) {
      const deb = [...x.previous_states].reverse().find((p) => p && /debit|debito/.test(norm(p[kType || 'operation_type'] ?? p.operation_type)) && parseMoney(p[kAmount]) != null)
      if (deb) value = parseMoney(deb[kAmount])
    }
    const pending = !declined && /\bhold\b|retenc|pendiente/.test(typed)
    // ¿Entra o sale plata? Primero el tipo de operación; si es desconocido, la descripción («Recarga…»); y si tampoco, el signo del monto.
    const desc = kDesc ? norm(x[kDesc]) : ''
    const refund = CREDIT_TYPE.test(typed) ? true : DEBIT_TYPE.test(typed) ? false : RECHARGE_DESC.test(desc) ? true : (negIsCharge ? amt > 0 : amt < 0)
    const tk = typed || '(sin tipo)', tc = types.get(tk) || { n: 0, refund: 0 }; tc.n++; if (refund) tc.refund++; types.set(tk, tc)
    const card = kCard ? String(x[kCard] ?? '').replace(/\D/g, '').slice(-4) : ''
    rows.push({
      date, amount: Math.abs(value), kind: refund ? 'refund' : 'charge', pending, status: declined ? 'declined' : 'approved', declineReason,
      opType: typed.slice(0, 30), opState: kState && x[kState] != null ? norm(x[kState]).slice(0, 30) : '', // lo que Dropi dice que es (hold, release, debit…)
      description: kDesc ? String(x[kDesc] ?? '').trim().slice(0, 200) : '',
      reference: kRef && x[kRef] != null ? String(x[kRef]).trim().slice(0, 80) : '',
      last4: card.length === 4 ? card : '',
    })
  })
  // `types`: qué tipos de operación vio y cómo los clasificó (sirve para detectar un tipo nuevo mal clasificado).
  const typeList = [...types].map(([type, v]) => ({ type, n: v.n, kind: v.refund === v.n ? 'refund' : v.refund === 0 ? 'charge' : 'mixed' })).sort((a, b) => b.n - a.n).slice(0, 12)
  return { rows, errors, types: typeList, columns: { date: kDate, amount: kAmount, description: kDesc, reference: kRef, type: kType, card: kCard }, sign: kType ? 'tipo' : negIsCharge ? 'negativo' : 'positivo', meta: { pagination: findPagination(data) } }
}

/* ---------- referencia del método de pago: la llave exacta entre Meta y la tarjeta ---------- */

/** Código que el banco pone en la descripción («Compra en FACEBK *PZ4XV8SWF4», «FACEBK* JR2D77EWF4»). En mayúsculas, o '' si no hay. */
export const payRefOf = (description) => { const m = String(description || '').match(/\*\s*([A-Za-z0-9]{8,12})\b/); return m ? m[1].toUpperCase() : '' }
