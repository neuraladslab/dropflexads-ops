import { guard, ok, bad } from '@/lib/http'
import { probarClave } from '@/lib/ia/asistente'

export const runtime = 'nodejs'
export const maxDuration = 60

export const POST = guard(async (_req, _ctx, session) => { const r = await probarClave(session.userId); return r.ok ? ok(r) : bad(r.error, 502) })
