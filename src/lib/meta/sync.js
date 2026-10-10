import 'server-only'
// Sincroniza con Meta (solo lectura): gasto diario por campaña (insights, SIN IVA). Los cobros no vienen de la API (Meta ya no los entrega): se anotan o se importan en la pantalla de Meta. Idempotente.
import sql from '@/lib/db'
import { logActivity } from '@/lib/activity'
import { inicioOperacion } from '@/lib/inicio'
import { diaBogota, hoyBogota } from '@/domain/fechas.ts'
import { MetaError, metaGetAll } from './client'
import { tokenDe } from './conexion'
import { vincularCampanasMeta } from './vincular'
import { parseInsights, ventanaMeta } from './parse.mjs'

async function guardarGasto(uid, filas) {
  for (let i = 0; i < filas.length; i += 400) {
    const lote = filas.slice(i, i + 400).map((f) => ({ owner_id: uid, day: f.day, meta_campaign_id: f.campaignId, campaign_name: f.campaignName, spend: f.spend, impressions: f.impressions, clicks: f.clicks, purchases: f.purchases, purchase_value: f.purchaseValue }))
    await sql`INSERT INTO meta_spend_daily ${sql(lote, 'owner_id', 'day', 'meta_campaign_id', 'campaign_name', 'spend', 'impressions', 'clicks', 'purchases', 'purchase_value')}
              ON CONFLICT (owner_id, day, meta_campaign_id) DO UPDATE SET campaign_name = EXCLUDED.campaign_name, spend = EXCLUDED.spend, impressions = EXCLUDED.impressions, clicks = EXCLUDED.clicks,
                purchases = EXCLUDED.purchases, purchase_value = EXCLUDED.purchase_value, synced_at = NOW()`
  }
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
    await vincularCampanasMeta(uid)
    res = { ok: true, window: win, gasto: { filas: gasto.length, total: Math.round(gasto.reduce((a, g) => a + g.spend, 0)) } }
    await sql`UPDATE meta_connections SET sync_started_at = NULL, last_sync_at = NOW(), last_sync_ok_at = NOW(), state = 'ok', last_error = NULL, updated_at = NOW() WHERE owner_id = ${uid}`
    if (gasto.length) await logActivity(uid, `Sincronizaste Meta (${win.from} a ${win.to}): ${gasto.length} filas de gasto`)
  } catch (e) {
    const m = e instanceof MetaError ? e : new MetaError('inesperado', 'No se pudo sincronizar con Meta.')
    if (!(e instanceof MetaError)) console.error('[meta] sync', e && (e.code || e.name))
    await sql`UPDATE meta_connections SET sync_started_at = NULL, last_sync_at = NOW(), state = ${m.code === 'token' || m.code === 'permiso' ? 'reauth' : 'error'}, last_error = ${m.message.slice(0, 200)}, updated_at = NOW() WHERE owner_id = ${uid}`
    res = { ok: false, window: win, error: { code: m.code, message: m.message } }
  }
  return res
}
