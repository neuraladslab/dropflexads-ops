import { timingSafeEqual } from 'node:crypto'
import sql from '@/lib/db'
import { sincronizarTodo } from '@/lib/dropi/sync-all'
import { logActivity } from '@/lib/activity'
import { sincronizarMeta } from '@/lib/meta/sync'
import { inicioConfigurado } from '@/lib/inicio'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const igual = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y) }

/**
 * Sincronización diaria con Dropi. La llama el cron de Vercel (vercel.json: 04:30 UTC = 11:30 p. m. en Colombia) con `Authorization: Bearer $CRON_SECRET`.
 * No usa sesión de usuario (el proxy deja pasar esta ruta); el secreto es lo único que la protege. Sin CRON_SECRET configurado, responde 401 siempre.
 * Solo sincroniza cuentas que pueden entrar solas: modo automático (se guarda la clave del autenticador) o con una sesión de Dropi todavía vigente.
 * Las demás se omiten y queda anotado en la bitácora: en modo «código a mano» el servidor no puede iniciar sesión sin ti.
 * Después sincroniza Meta (gasto) de quien lo tenga conectado. Cada empresa es un `owner_id` distinto, así que todas se sincronizan solas; las desactivadas se saltan.
 */
export async function GET(request) {
  const secret = process.env.CRON_SECRET
  if (!secret || !igual(request.headers.get('authorization') || '', `Bearer ${secret}`)) return Response.json({ error: 'no autorizado' }, { status: 401 })

  const conexiones = await sql`
    SELECT owner_id, (totp_enc IS NOT NULL) AS auto, (token_exp IS NOT NULL AND token_exp > NOW()) AS sesion
    FROM dropi_connections
    WHERE state <> 'reauth' AND (cooldown_until IS NULL OR cooldown_until < NOW())
      AND NOT EXISTS (SELECT 1 FROM companies c WHERE c.owner_id = dropi_connections.owner_id AND NOT c.active) ORDER BY owner_id`
  const resultado = []
  for (const c of conexiones) {
    if (!(await inicioConfigurado(c.owner_id))) { resultado.push({ usuario: c.owner_id, omitido: 'sin día de inicio de la operación' }); continue }
    if (!c.auto && !c.sesion) {
      await logActivity(c.owner_id, 'La sincronización diaria no se hizo: tu sesión de Dropi venció y necesito tu código. Entra a Mis cuentas y sincroniza.')
      resultado.push({ usuario: c.owner_id, omitido: 'necesita código de Dropi' })
      continue
    }
    try {
      const r = await sincronizarTodo(c.owner_id, { modo: 'incremental' })
      resultado.push({
        usuario: c.owner_id, ok: !!r.ok, ventana: r.window || null, tarjeta: r.inserted ?? 0,
        billetera: r.wallet && r.wallet.ok ? r.wallet.inserted : null, pedidos: r.orders && r.orders.ok ? r.orders.read : null,
        error: r.ok ? undefined : (r.error && r.error.message) || 'falló',
      })
    } catch (e) {
      console.error('[cron dropi]', e && (e.code || e.name))
      resultado.push({ usuario: c.owner_id, ok: false, error: 'error inesperado' })
    }
  }
  // Meta no necesita código ni sesión: el token guardado basta, así que corre solo cada noche (si el token venció, queda anotado en la conexión).
  const metas = await sql`SELECT owner_id FROM meta_connections WHERE state <> 'reauth'
    AND NOT EXISTS (SELECT 1 FROM companies c WHERE c.owner_id = meta_connections.owner_id AND NOT c.active) ORDER BY owner_id`
  const meta = []
  for (const m of metas) {
    if (!(await inicioConfigurado(m.owner_id))) { meta.push({ usuario: m.owner_id, omitido: 'sin día de inicio de la operación' }); continue }
    try { const r = await sincronizarMeta(m.owner_id); meta.push({ usuario: m.owner_id, ok: !!r.ok, gasto: r.gasto ? r.gasto.filas : null, error: r.ok ? undefined : r.error && r.error.message }) }
    catch (e) { console.error('[cron meta]', e && (e.code || e.name)); meta.push({ usuario: m.owner_id, ok: false, error: 'error inesperado' }) }
  }
  return Response.json({ at: new Date().toISOString(), usuarios: resultado.length, resultado, meta })
}
