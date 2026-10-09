import { guard, ok } from '@/lib/http'

export const runtime = 'nodejs'

const info = (session) => ok({ email: session.email, expiresAt: session.expiresAt, idleSeconds: session.idleSeconds, now: Date.now() })

/** Comprobación pasiva: verifica que la sesión siga viva SIN renovar el tiempo de inactividad. */
export const GET = guard(async (_request, _ctx, session) => info(session), { passive: true })

/** Latido: la interfaz lo envía solo mientras hay actividad real del usuario, para no vencer por inactividad. */
export const POST = guard(async (_request, _ctx, session) => info(session))
