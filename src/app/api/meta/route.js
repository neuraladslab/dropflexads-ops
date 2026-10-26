import sql from '@/lib/db'
import { guard, ok, bad, readBody, num } from '@/lib/http'
import { logActivity } from '@/lib/activity'
import { confirmIdentity } from '@/lib/auth/reauth'
import { lockedSeconds, recordFailure, throttleKey, logAuthEvent } from '@/lib/auth/session'
import { cuentaMeta } from '@/lib/meta/rutas.mjs'
import { MetaError } from '@/lib/meta/client'
import { conectarMeta, desconectarMeta, guardarIva, leerConexion } from '@/lib/meta/conexion'
import { sincronizarMeta } from '@/lib/meta/sync'
import { validarRangoOperacion } from '@/domain/ventana.ts'
import { todayCO } from '@/lib/util'
import { inicioConfigurado, inicioOperacion, SIN_INICIO, ventanaSync } from '@/lib/inicio'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ms = (c) => (c ? { ...c, lastSyncAt: c.last_sync_at ? new Date(c.last_sync_at).getTime() : null, lastSyncOkAt: c.last_sync_ok_at ? new Date(c.last_sync_ok_at).getTime() : null } : null)

/** Estado de la conexión con Meta. NUNCA devuelve el token: solo sus últimos 4 caracteres. */
export const GET = guard(async (_req, _ctx, session) => {
  const c = await leerConexion(session.ownerId)
  const ventana = await ventanaSync(session.ownerId), opFrom = ventana.inicio // una sola lectura del ajuste
  if (!c) return ok({ connected: false, opFrom, ...ventana })
  return ok({ connected: true, opFrom, ...ventana, adAccountId: c.ad_account_id, accountName: c.account_name, currency: c.currency, tokenHint: c.token_hint, vatPct: c.vat, state: c.state, lastError: c.last_error, syncing: c.syncing, lastSyncAt: ms(c).lastSyncAt, lastSyncOkAt: ms(c).lastSyncOkAt })
})

/**
 * POST {action}
 *  · connect {adAccountId, token, vatPct, appPassword, appCode?}  → valida el token con Meta (solo lectura) y lo guarda cifrado. Pide tu contraseña de la app.
 *  · disconnect {appPassword, appCode?}                            → borra el token. Lo ya sincronizado (gasto y cobros) se queda.
 *  · set_vat {vatPct}                                              → cambia el IVA que Meta cobra encima del gasto.
 *  · sync {from?, to?}                                             → trae gasto y cobros desde el inicio de la operación (o el rango pedido).
 */
export const POST = guard(async (request, _ctx, session) => {
  const uid = session.ownerId
  const b = (await readBody(request)) || {}
  const action = b.action
  if (!['connect', 'disconnect', 'set_vat', 'sync'].includes(action)) return bad('Acción no válida.')

  if (action === 'set_vat') {
    const v = num(b.vatPct, { min: 0, max: 30 })
    if (v == null) return bad('El IVA debe ser un número entre 0 y 30.')
    const r = await guardarIva(uid, v)
    return r.length ? ok({ vatPct: v }) : bad('Meta no está conectado.', 409)
  }

  if (action === 'sync') {
    if (!(await inicioConfigurado(uid))) return bad(SIN_INICIO, 409, 'sin_inicio')
    const key = throttleKey('metasync', String(uid))
    const wait = await lockedSeconds([key])
    if (wait > 0) return bad(`Demasiadas sincronizaciones. Espera ${Math.ceil(wait / 60)} min.`, 429, 'locked')
    await recordFailure(key, 20, { windowSeconds: 3600, lockSeconds: 3600 })
    let from = null, to = null
    if (b.from) { const e = validarRangoOperacion(b.from, b.to, todayCO(), await inicioOperacion(uid)); if (e) return bad(e); from = b.from; to = b.to || b.from }
    return ok(await sincronizarMeta(uid, { from, to }))
  }

  // Acciones delicadas: confirman que eres tú (contraseña de la app y, si lo activaste, el código de dos pasos).
  let datos = null
  if (action === 'connect') {
    const cuenta = cuentaMeta(b.adAccountId), token = typeof b.token === 'string' ? b.token.trim() : ''
    const iva = b.vatPct === undefined || b.vatPct === '' ? 19 : num(b.vatPct, { min: 0, max: 30 })
    if (!cuenta) return bad('El ID de la cuenta publicitaria son solo números (puede empezar con «act_»).')
    if (token.length < 20 || token.length > 700 || !/^[A-Za-z0-9_\-|.]+$/.test(token)) return bad('El token no tiene el formato esperado: es una cadena larga de letras y números, sin espacios.')
    if (iva == null) return bad('El IVA debe ser un número entre 0 y 30.')
    datos = { cuenta, token, vatPct: iva }
  }
  const id = await confirmIdentity(session.userId, b)
  if (id) return bad(id.error, id.status)

  if (action === 'disconnect') {
    const r = await desconectarMeta(uid)
    if (r.length) { await logAuthEvent(request, 'meta_disconnect', session.userId); await logActivity(uid, 'Desconectaste tu cuenta de Meta') }
    return ok({ connected: false })
  }

  try {
    const info = await conectarMeta(uid, datos)
    await logAuthEvent(request, 'meta_connect', session.userId)
    await logActivity(uid, `Conectaste la cuenta de Meta ${datos.cuenta}`)
    return ok({ connected: true, accountName: info.nombre, currency: info.moneda }, 201)
  } catch (e) {
    if (e instanceof MetaError) return bad(e.message, e.code === 'red' ? 502 : 422)
    throw e
  }
})
