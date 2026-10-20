import { guard, bad } from '@/lib/http'
import { datosCortes } from '@/lib/datos'
import { csvMovimientos, csvPedidos } from '@/lib/cortesCsv'

export const runtime = 'nodejs'

/** GET /api/cortes/2026-10-12/csv?tabla=movimientos|pedidos → CSV del corte que cierra ese día. Solo del propio usuario. */
export const GET = guard(async (request, ctx, session) => {
  const { id } = await ctx.params
  if (!/^\d{4}-\d{2}-\d{2}$/.test(id)) return bad('Corte no válido.', 404)
  const tabla = new URL(request.url).searchParams.get('tabla') === 'pedidos' ? 'pedidos' : 'movimientos'
  const c = (await datosCortes(session.userId)).cortes.find((x) => x.id === id)
  if (!c) return bad('No encontré ese corte.', 404)
  const cuerpo = tabla === 'pedidos' ? await csvPedidos(session.userId, c) : await csvMovimientos(session.userId, c)
  return new Response(cuerpo, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="corte-${c.hasta}-${tabla}.csv"` } })
})
