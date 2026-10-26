import sql from '@/lib/db'
import { guard, ok, bad, readBody } from '@/lib/http'
import { logActivity } from '@/lib/activity'
import { parseTotpInput } from '@/lib/auth/totp.mjs'
import { confirmIdentity } from '@/lib/auth/reauth'
import { clientIp, logAuthEvent, lockedSeconds, recordFailure, throttleKey } from '@/lib/auth/session'
import { CARD_ID_RE } from '@/lib/dropi/config.mjs'
import { DropiError } from '@/lib/dropi/client'
import { connectDropi } from '@/lib/dropi/session'
import { sincronizarTodo } from '@/lib/dropi/sync-all'
import { validarRangoOperacion } from '@/domain/ventana.ts'
import { inicioConfigurado, inicioOperacion, SIN_INICIO, ventanaSync } from '@/lib/inicio'
import { todayCO } from '@/lib/util'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const HTTP = { reauth: 409, need_otp: 428, otp_rejected: 422, cooldown: 429, blocked: 429, busy: 429, no_connection: 409, network: 502, unexpected: 502 }
const OTP_RE = /^\d{6}$/
const fail = (e) => {
  const res = Response.json({ error: e.message, code: e.code, seconds: e.seconds || 0 }, { status: HTTP[e.code] || 502 })
  if (e.seconds) res.headers.set('Retry-After', String(Math.ceil(e.seconds)))
  return res
}

/** Estado de la conexión. NUNCA devuelve credenciales, token ni el ID completo de la tarjeta: solo pistas enmascaradas. */
export const GET = guard(async (_request, _ctx, session) => {
  const ventana = await ventanaSync(session.ownerId), opFrom = ventana.inicio // una sola lectura del ajuste
  const [c] = await sql`SELECT email_hint, card_hint, state, (totp_enc IS NULL) AS manual_otp, cooldown_until, last_sync_at, last_sync_ok_at, next_page, last_error, sync_started_at,
                               (token_exp IS NOT NULL AND token_exp > NOW()) AS session_ok FROM dropi_connections WHERE owner_id = ${session.ownerId}`
  if (!c) return ok({ connected: false, opFrom, ...ventana })
  const left = c.cooldown_until ? Math.max(0, Math.ceil((new Date(c.cooldown_until).getTime() - Date.now()) / 1000)) : 0
  return ok({
    opFrom, ...ventana, connected: true, emailHint: c.email_hint, cardHint: c.card_hint, state: c.state, cooldownSeconds: left,
    lastSyncAt: c.last_sync_at ? new Date(c.last_sync_at).getTime() : null, lastSyncOkAt: c.last_sync_ok_at ? new Date(c.last_sync_ok_at).getTime() : null,
    lastError: c.last_error || null, sessionActive: !!c.session_ok,
    // «otp»: no se guarda la clave del autenticador y, sin sesión activa, la persona escribe el código al sincronizar; «auto»: se genera solo.
    mode: c.manual_otp ? 'otp' : 'auto', needsOtp: !!c.manual_otp && !c.session_ok,
    syncing: !!c.sync_started_at && Date.now() - new Date(c.sync_started_at).getTime() < 120_000,
  })
})

/**
 * POST {action}
 *  · connect {appPassword, appCode?, email, password, cardId, otp | totp} → login de prueba en Dropi; guarda todo CIFRADO solo si funciona.
 *      `otp` = código de 6 dígitos de ahora (modo «código a mano»: NO se guarda la clave del autenticador); `totp` = clave del autenticador (modo automático).
 *  · sync {otp?, historico?, from?, to?}                            → incremental (lo nuevo); `historico` = desde el inicio de la operación; `from`/`to` = un día o un rango.
 *      `otp` solo hace falta cuando no hay sesión activa y la cuenta está en modo «código a mano»; no se guarda en ningún sitio.
 *  · disconnect {appPassword, appCode?}                             → borra las credenciales y el token.
 */
export const POST = guard(async (request, _ctx, session) => {
  const uid = session.ownerId
  const b = await readBody(request)
  const action = b?.action
  if (!['connect', 'sync', 'reset_card', 'disconnect'].includes(action)) return bad('Acción no válida.')

  if (action === 'sync' || action === 'reset_card') {
    if (!(await inicioConfigurado(uid))) return bad(SIN_INICIO, 409, 'sin_inicio')
    // Tope por hora además del intervalo mínimo de la propia sincronización.
    const key = throttleKey('dropisync', String(uid))
    const wait = await lockedSeconds([key])
    if (wait > 0) return bad(`Demasiadas sincronizaciones. Espera ${Math.ceil(wait / 60)} min.`, 429, 'locked')
    await recordFailure(key, 20, { windowSeconds: 3600, lockSeconds: 3600 })
    const otp = typeof b.otp === 'string' ? b.otp.replace(/\s+/g, '') : ''
    if (otp && !OTP_RE.test(otp)) return bad('El código debe tener 6 dígitos.')
    const ip = clientIp(request)
    let modo = action === 'reset_card' ? 'reset' : b.historico === true ? 'historico' : 'incremental', from = null, to = null
    if (action === 'sync' && b.from) { // sincronizar un día o entre fechas
      const err = validarRangoOperacion(b.from, b.to, todayCO(), await inicioOperacion(uid))
      if (err) return bad(err)
      modo = 'rango'; from = b.from; to = b.to || b.from
    }
    const r = await sincronizarTodo(uid, { ip, otp, modo, from, to })
    if (action === 'reset_card' && r.ok) await logActivity(uid, r.replaced ? `Reiniciaste la tarjeta del ${r.window.from} al ${r.window.to} (lo anterior se conservó): ${r.inserted} movimientos` : 'Intentaste reiniciar la tarjeta pero Dropi no devolvió movimientos: no se borró nada')
    return ok(r)
  }

  // Primero lo barato (validar el cuerpo); la contraseña de la app usa scrypt (caro) y va después.
  let creds = null
  if (action === 'connect') {
    const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : ''
    const password = typeof b.password === 'string' ? b.password : ''
    const cardId = typeof b.cardId === 'string' ? b.cardId.trim() : ''
    if (!/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(email) || email.length > 254) return bad('El correo de Dropi no es válido.')
    if (!password || password.length > 128) return bad('Escribe la contraseña de Dropi.')
    if (!CARD_ID_RE.test(cardId)) return bad('El ID de la tarjeta debe verse como «car_…» (cópialo de la dirección de la API de movimientos).')
    // Con clave del autenticador → modo automático. Sin ella → modo «código a mano»: hace falta el código de 6 dígitos de ahora.
    const hasKey = typeof b.totp === 'string' && b.totp.trim() !== ''
    const otp = typeof b.otp === 'string' ? b.otp.replace(/\s+/g, '') : ''
    let totp = null
    if (hasKey) { totp = parseTotpInput(b.totp); if (totp.error) return bad(totp.error) }
    else if (!OTP_RE.test(otp)) return bad('Escribe el código de 6 dígitos que muestra tu autenticador de Dropi ahora mismo.')
    creds = { email, password, totp, otp, cardId }
  }

  const id = await confirmIdentity(session.userId, b)
  if (id) return bad(id.error, id.status)

  if (action === 'disconnect') {
    const rows = await sql`DELETE FROM dropi_connections WHERE owner_id = ${uid} RETURNING owner_id`
    if (rows.length) { await logAuthEvent(request, 'dropi_disconnect', session.userId); await logActivity(uid, 'Desconectaste tu cuenta de Dropi') }
    return ok({ connected: false })
  }

  // connect
  try {
    await connectDropi(uid, creds, { ip: clientIp(request) })
  } catch (e) {
    if (e instanceof DropiError) return fail(e)
    throw e
  }
  await logAuthEvent(request, 'dropi_connect', session.userId)
  await logActivity(uid, 'Conectaste tu cuenta de Dropi')
  return ok({ connected: true }, 201)
})
