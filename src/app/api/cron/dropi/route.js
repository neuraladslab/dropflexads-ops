import { timingSafeEqual } from 'node:crypto'
import sql from '@/lib/db'
import { sincronizarTodo } from '@/lib/dropi/sync-all'
import { logActivity } from '@/lib/activity'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const igual = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y) }

/**
 * Sincronización diaria con Dropi. La llama el cron de Vercel (vercel.json: 04:30 UTC = 11:30 p. m. en Colombia) con `Authorization: Bearer $CRON_SECRET`.
 * No usa sesión de usuario (el proxy deja pasar esta ruta); el secreto es lo único que la protege. Sin CRON_SECRET configurado, responde 401 siempre.
 * Solo sincroniza cuentas que pueden entrar solas: modo automático (se guarda la clave del autenticador) o con una sesión de Dropi todavía vigente.
 * Las demás se omiten y queda anotado en la bitácora: en modo «código a mano» el servidor no puede iniciar sesión sin ti.
 */
export async function GET(request) {
  const secret = process.env.CRON_SECRET
  if (!secret || !igual(request.headers.get('authorization') || '', `Bearer ${secret}`)) return Response.json({ error: 'no autorizado' }, { status: 401 })

  const conexiones = await sql`
    SELECT owner_id, (totp_enc IS NOT NULL) AS auto, (token_exp IS NOT NULL AND token_exp > NOW()) AS sesion
    FROM dropi_connections
    WHERE state <> 'reauth' AND (cooldown_until IS NULL OR cooldown_until < NOW()) ORDER BY owner_id`
  const resultado = []
  for (const c of conexiones) {
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
  return Response.json({ at: new Date().toISOString(), usuarios: resultado.length, resultado })
}
