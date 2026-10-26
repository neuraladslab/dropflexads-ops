import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import sql from '@/lib/db'
import { guard, bad, readBody } from '@/lib/http'
import { clientIp, createSession, lockedSeconds, logAuthEvent, recordFailure, rememberIp, throttleKey } from '@/lib/auth/session'
import { abrirCuenta } from '@/lib/auth/cuentas'
import { escribirCookie, leerCookie, olvidar, usar } from '@/lib/auth/dispositivos'
import { THROTTLE } from '@/lib/auth/config.mjs'

export const runtime = 'nodejs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Entrar desde un dispositivo recordado (sin contraseña), desde la pantalla de inicio de sesión. Pública: la prueba es el secreto de la cookie httpOnly.
 *  · resume {id} → abre sesión, rota el secreto del dispositivo.
 *  · forget {id} → el dispositivo se elimina de este navegador y de la base.
 */
export const POST = guard(async (request) => {
  const b = (await readBody(request)) || {}
  if (!['resume', 'forget'].includes(b.action) || typeof b.id !== 'string' || !UUID.test(b.id)) return bad('Acción no válida.')
  const lista = leerCookie(request)
  const entrada = lista.find((e) => e.id === b.id.toLowerCase())
  const ipKey = throttleKey('dev', clientIp(request) || 'unknown')
  const sinEntrada = async (quitar) => {
    await recordFailure(ipKey, THROTTLE.maxPerIp)
    const res = NextResponse.json({ error: 'Este dispositivo ya no está recordado. Inicia sesión con tu contraseña.', code: 'device' }, { status: 401 })
    escribirCookie(res, lista.filter((e) => e.id !== quitar))
    return res
  }

  if (b.action === 'forget') {
    // Solo quien tiene la cookie (el secreto) puede olvidarlo desde aquí; la lista de la cookie se actualiza siempre.
    if (entrada) await olvidarPorSecreto(entrada)
    const res = NextResponse.json({ ok: true })
    escribirCookie(res, lista.filter((e) => e.id !== b.id.toLowerCase()))
    return res
  }

  if ((await lockedSeconds([ipKey])) > 0) return bad('Demasiados intentos. Espera unos minutos.', 429, 'locked')
  if (!entrada) return sinEntrada(b.id.toLowerCase())
  const r = await usar(entrada)
  if (!r) return sinEntrada(entrada.id)
  await rememberIp(r.userId, clientIp(request) || 'unknown')
  const { token, maxAge } = await createSession(r.userId, request.headers.get('user-agent') || '')
  await logAuthEvent(request, 'login_device', r.userId)
  const res = NextResponse.json({ ok: true, expiresAt: Date.now() + maxAge * 1000 })
  await abrirCuenta(request, res, token, r.userId, maxAge)
  escribirCookie(res, [r.entrada, ...lista.filter((e) => e.id !== entrada.id)])
  return res
}, { auth: false })

async function olvidarPorSecreto(entrada) {
  const h = createHash('sha256').update(entrada.secret).digest('hex')
  const [d] = await sql`SELECT user_id FROM trusted_devices WHERE id = ${entrada.id} AND (secret_hash = ${h} OR prev_hash = ${h})`
  if (d) await olvidar(d.user_id, entrada.id)
}
