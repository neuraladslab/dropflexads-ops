// Lectura de lo que devuelve Meta (puro, sin red ni base de datos). El gasto de insights viene SIN IVA; el importe de un cobro (transacción) incluye el IVA.
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const r2 = (n) => Math.round(n * 100) / 100

/** Día en Bogotá (YYYY-MM-DD) de un instante (ISO con zona, o segundos desde 1970). */
export function diaDeInstante(t) {
  const ms = typeof t === 'number' ? (t < 1e12 ? t * 1000 : t) : Date.parse(String(t).replace(/([+-]\d{2})(\d{2})$/, '$1:$2'))
  return Number.isFinite(ms) ? new Date(ms - 5 * 3600e3).toISOString().slice(0, 10) : null
}

/** Filas de /insights (nivel campaña, un día por fila) → filas para guardar. */
export function parseInsights(rows) {
  const out = []
  for (const r of rows || []) {
    const id = String(r.campaign_id || '').replace(/\D/g, '').slice(0, 40), day = /^\d{4}-\d{2}-\d{2}$/.test(r.date_start || '') ? r.date_start : null
    if (!id || !day) continue
    const compra = (arr) => (Array.isArray(arr) ? arr.find((a) => a.action_type === 'omni_purchase') || arr.find((a) => a.action_type === 'purchase') : null)
    out.push({
      day, campaignId: id, campaignName: String(r.campaign_name || '').slice(0, 200), spend: r2(num(r.spend)),
      impressions: Math.round(num(r.impressions)), clicks: Math.round(num(r.clicks)),
      purchases: Math.round(num((compra(r.actions) || {}).value)), purchaseValue: r2(num((compra(r.action_values) || {}).value)),
    })
  }
  return out
}

/** Filas de /insights a nivel ANUNCIO (un día por fila) → filas para guardar. */
export function parseInsightsAnuncios(rows) {
  const out = []
  for (const r of rows || []) {
    const id = String(r.ad_id || '').replace(/\D/g, '').slice(0, 40), day = /^\d{4}-\d{2}-\d{2}$/.test(r.date_start || '') ? r.date_start : null
    if (!id || !day) continue
    const compra = (arr) => (Array.isArray(arr) ? arr.find((a) => a.action_type === 'omni_purchase') || arr.find((a) => a.action_type === 'purchase') : null)
    out.push({
      day, adId: id, adName: String(r.ad_name || '').slice(0, 250), campaignId: String(r.campaign_id || '').replace(/\D/g, '').slice(0, 40) || null, spend: r2(num(r.spend)),
      impressions: Math.round(num(r.impressions)), clicks: Math.round(num(r.clicks)),
      purchases: Math.round(num((compra(r.actions) || {}).value)), purchaseValue: r2(num((compra(r.action_values) || {}).value)),
    })
  }
  return out
}

/** Estado de un cobro según el texto que mande Meta. */
export const estadoCobro = (s) => { const t = String(s || '').toLowerCase(); return /fail|declin|refus|reject|cancel|error/.test(t) ? 'failed' : /pend|process|wait|hold|progress/.test(t) ? 'pending' : 'paid' }

/** Referencia de pago (como «PZ4XV8SWF4») si Meta la entrega en algún campo: 8–12 letras y números con al menos una letra y un dígito. */
export function referenciaDe(tx) {
  const prioridad = ['payment_reference', 'reference_number', 'reference', 'ref', 'payment_ref']
  const ok = (v) => typeof v === 'string' && /^[A-Z0-9]{8,12}$/.test(v.toUpperCase()) && /[A-Z]/i.test(v) && /\d/.test(v)
  for (const k of prioridad) if (ok(tx && tx[k])) return tx[k].toUpperCase()
  return ''
}

/** Filas de /transactions → cobros. Se descartan los que no traen importe o fecha. */
export function parseTransacciones(rows) {
  const out = []
  for (const t of rows || []) {
    const id = String(t.id || '').slice(0, 80), day = diaDeInstante(t.time ?? t.created_time)
    const a = t.amount && typeof t.amount === 'object' ? t.amount.amount : t.amount
    const amount = r2(num(a))
    if (!id || !day || amount <= 0) continue
    out.push({ id, day, amount, status: estadoCobro(t.status), paymentRef: referenciaDe(t), currency: t.amount && t.amount.currency ? String(t.amount.currency).slice(0, 8) : null })
  }
  return out
}

/** Ventana de gasto: parte del inicio de la operación; si ya se sincronizó, desde 7 días antes de la última vez (Meta ajusta las cifras de la última semana). */
export function ventanaMeta({ hoy, inicio, ultimaSyncDia }) {
  const sumar = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10)
  const ini = inicio > hoy ? hoy : inicio
  if (!ultimaSyncDia) return { from: ini, to: hoy }
  const d = sumar(ultimaSyncDia, -7)
  return { from: d < ini ? ini : d, to: hoy }
}
