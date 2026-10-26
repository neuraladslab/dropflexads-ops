import { guard, ok, bad, readBody } from '@/lib/http'
import { clientIp } from '@/lib/auth/session'
import { logActivity } from '@/lib/activity'
import { DropiError } from '@/lib/dropi/client'
import { agregarProductoPorId } from '@/lib/dropi/productos'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const HTTP = { reauth: 409, need_otp: 428, otp_rejected: 422, cooldown: 429, blocked: 429, busy: 429, no_connection: 409, network: 502, unexpected: 502 }

/** POST {id, otp?} → consulta el producto en Dropi por su ID y lo deja disponible para armar campañas. */
export const POST = guard(async (request, _ctx, session) => {
  const b = await readBody(request)
  const id = b && String(b.id == null ? '' : b.id).trim()
  if (!/^\d{1,12}$/.test(id)) return bad('El ID del producto son solo números (lo ves en la dirección del producto en Dropi).')
  const otp = typeof b.otp === 'string' ? b.otp.replace(/\s+/g, '') : ''
  if (otp && !/^\d{6}$/.test(otp)) return bad('El código debe tener 6 dígitos.')
  try {
    const p = await agregarProductoPorId(session.ownerId, id, { ip: clientIp(request), otp })
    await logActivity(session.ownerId, `Agregaste el producto «${p.nombre}» (${p.id}) desde Dropi`)
    return ok(p)
  } catch (e) {
    if (!(e instanceof DropiError)) throw e
    return Response.json({ error: e.message, code: e.code }, { status: HTTP[e.code] || 502 })
  }
})
