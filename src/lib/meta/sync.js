import 'server-only'
// Sincroniza con Meta (solo lectura): gasto diario por campaña (insights, SIN IVA) y cobros (transacciones, con IVA). Idempotente: repetirlo no duplica.
import sql from '@/lib/db'
import { logActivity } from '@/lib/activity'
import { inicioOperacion } from '@/lib/inicio'
import { diaBogota, hoyBogota } from '@/domain/fechas.ts'
import { dentroDeOperacion } from '@/domain/ventana.ts'
import { MetaError, metaGetAll } from './client'
import { tokenDe } from './conexion'
import { parseInsights, parseTransacciones, ventanaMeta } from './parse.mjs'

async function guardarGasto(uid, filas) {
  for (let i = 0; i < filas.length; i += 400) {
    const lote = filas.slice(i, i + 400).map((f) => ({ owner_id: uid, day: f.day, meta_campaign_id: f.campaignId, campaign_name: f.campaignName, spend: f.spend, impressions: f.impressions, clicks: f.clicks, purchases: f.purchases, purchase_value: f.purchaseValue }))
    await sql`INSERT INTO meta_spend_daily ${sql(lote, 'owner_id', 'day', 'meta_campaign_id', 'campaign_name', 'spend', 'impressions', 'clicks', 'purchases', 'purchase_value')}
              ON CONFLICT (owner_id, day, meta_campaign_id) DO UPDATE SET campaign_name = EXCLUDED.campaign_name, spend = EXCLUDED.spend, impressions = EXCLUDED.impressions, clicks = EXCLUDED.clicks,
                purchases = EXCLUDED.purchases, purchase_value = EXCLUDED.purchase_value, synced_at = NOW()`
  }
}

async function guardarCobros(uid, cobros) {
  let nuevos = 0, actualizados = 0
  for (const c of cobros) {
    const key = 'tx:' + c.id
    const [ya] = await sql`SELECT id FROM meta_charges WHERE owner_id = ${uid} AND external_key = ${key}`
    const poner = async (ref) => sql`INSERT INTO meta_charges (owner_id, charged_date, amount, status, payment_ref, external_key, source) VALUES (${uid}, ${c.day}, ${c.amount}, ${c.status}, ${ref || null}, ${key}, 'api')
      ON CONFLICT (owner_id, external_key) DO UPDATE SET charged_date = EXCLUDED.charged_date, amount = EXCLUDED.amount, status = EXCLUDED.status, payment_ref = COALESCE(EXCLUDED.payment_ref, meta_charges.payment_ref)`
    try { await poner(c.paymentRef) } catch (e) { if (e && e.code === '23505' && c.paymentRef) await poner('') ; else throw e } // misma referencia en dos cobros: el segundo queda sin referencia
    ya ? actualizados++ : nuevos++
  }
  return { nuevos, actualizados }
}

/** → { ok, window, gasto?, cobros?, error? }. Nunca lanza por errores de Meta: los devuelve. `from`/`to` piden un rango exacto. */
export async function sincronizarMeta(uid, { from = null, to = null } = {}) {
  const claim = await sql`UPDATE meta_connections SET sync_started_at = NOW() WHERE owner_id = ${uid} AND (sync_started_at IS NULL OR sync_started_at < NOW() - interval '2 minutes') RETURNING ad_account_id, last_sync_ok_at`
  if (!claim.length) return { ok: false, error: { code: 'busy', message: 'Meta no está conectado o ya se está sincronizando. Espera un momento.' } }
  const hoy = hoyBogota(), inicio = await inicioOperacion(uid)
  const win = from ? { from, to: to || hoy } : ventanaMeta({ hoy, inicio, ultimaSyncDia: claim[0].last_sync_ok_at ? diaBogota(claim[0].last_sync_ok_at) : null })
  let res
  try {
    const t = await tokenDe(uid)
    if (!t) throw new MetaError('token', 'Meta no está conectado.')
    const cuenta = claim[0].ad_account_id
    // 1) Gasto diario por campaña
    const rows = await metaGetAll(t.token, t.version, `${cuenta}/insights`, { level: 'campaign', time_increment: '1', time_range: JSON.stringify({ since: win.from, until: win.to }), fields: 'campaign_id,campaign_name,spend,impressions,clicks,actions,action_values', limit: '500' }, { maxPaginas: 30 })
    const gasto = parseInsights(rows)
    await guardarGasto(uid, gasto)
    // 2) Cobros: si falla (p. ej. falta un permiso de facturación) NO se pierde el gasto
    let cobros = { ok: true, nuevos: 0, actualizados: 0 }
    try {
      const tx = parseTransacciones(await metaGetAll(t.token, t.version, `${cuenta}/transactions`, { limit: '100' }, { maxPaginas: 8 })).filter((c) => dentroDeOperacion(c.day, inicio))
      cobros = { ok: true, ...(await guardarCobros(uid, tx)) }
    } catch (e) { cobros = { ok: false, nuevos: 0, actualizados: 0, error: e instanceof MetaError ? e.message : 'No se pudieron leer los cobros.' } }
    res = { ok: true, window: win, gasto: { filas: gasto.length, total: Math.round(gasto.reduce((a, g) => a + g.spend, 0)) }, cobros }
    await sql`UPDATE meta_connections SET sync_started_at = NULL, last_sync_at = NOW(), last_sync_ok_at = NOW(), state = 'ok', last_error = ${cobros.ok ? null : String(cobros.error).slice(0, 200)}, updated_at = NOW() WHERE owner_id = ${uid}`
    if (gasto.length || cobros.nuevos) await logActivity(uid, `Sincronizaste Meta (${win.from} a ${win.to}): ${gasto.length} filas de gasto y ${cobros.nuevos} cobros nuevos`)
  } catch (e) {
    const m = e instanceof MetaError ? e : new MetaError('inesperado', 'No se pudo sincronizar con Meta.')
    if (!(e instanceof MetaError)) console.error('[meta] sync', e && (e.code || e.name))
    await sql`UPDATE meta_connections SET sync_started_at = NULL, last_sync_at = NOW(), state = ${m.code === 'token' || m.code === 'permiso' ? 'reauth' : 'error'}, last_error = ${m.message.slice(0, 200)}, updated_at = NOW() WHERE owner_id = ${uid}`
    res = { ok: false, window: win, error: { code: m.code, message: m.message } }
  }
  return res
}
