// Pedidos de Dropi (todos los estados): lectura de lo necesario. La clasificación contable vive en src/domain/pedidos.ts. Funciones puras.
const str = (v, n) => String(v ?? '').trim().slice(0, n)
const day = (v) => (/^\d{4}-\d{2}-\d{2}/.test(String(v || '')) ? String(v).slice(0, 10) : null)

/**
 * Un pedido de `myorders/v2` → fila mínima, o { error }. Descarta TODO lo demás (nombre, teléfono, dirección, facturas en PDF…).
 * Día de entrega: el último movimiento de la transportadora que diga «ENTREGAD…»; si no hay, queda sin fecha (no se inventa).
 */
export function classifyOrder(o) {
  if (!o || typeof o !== 'object') return { error: 'no es un pedido' }
  const id = str(o.id, 30).replace(/\D/g, '')
  if (!id) return { error: 'sin identificador' }
  const status = str(o.status, 30).toUpperCase()
  if (!status) return { error: 'sin estado' }
  const mv = (Array.isArray(o.servientrega_movements) ? o.servientrega_movements : []).filter((m) => /ENTREGAD/i.test(String(m && m.nom_mov)) && day(m.created_at))
  const delivered = mv.map((m) => day(m.created_at)).sort().pop() || null
  const names = [...new Set((Array.isArray(o.orderdetails) ? o.orderdetails : []).map((d) => str(d && d.product && d.product.name, 200)).filter(Boolean))]
  const returnedMv = (Array.isArray(o.servientrega_movements) ? o.servientrega_movements : []).filter((m) => /DEVOL/i.test(String(m && m.nom_mov)) && day(m.created_at))
  const returned = returnedMv.map((m) => day(m.created_at)).sort()[0] || null // primer movimiento de devolución
  const productIds = [...new Set((Array.isArray(o.orderdetails) ? o.orderdetails : []).map((d) => str((d && d.product && d.product.id) ?? (d && d.product_id), 30).replace(/\D/g, '')).filter(Boolean))]
  const total = Number(o.total_order)
  return { row: { orderId: id, guide: str(o.shipping_guide, 40).replace(/\D/g, ''), status, product: names.join(' + ').slice(0, 200), total: Number.isFinite(total) && total >= 0 ? Math.round(total * 100) / 100 : null, created: day(o.created_at), delivered, returned, productIds } }
}

/** JSON de `myorders/v2` → { rows, errors, total }. */
export function parseOrdersJson(text) {
  let j
  try { j = typeof text === 'string' ? JSON.parse(text) : text } catch { return { error: 'El texto no es un JSON válido.' } }
  const list = Array.isArray(j) ? j : j && Array.isArray(j.objects) ? j.objects : null
  if (!list) return { error: 'No encontré la lista de pedidos («objects»).' }
  const rows = [], errors = [], seen = new Set()
  for (const o of list) {
    const c = classifyOrder(o)
    if (c.error) { errors.push(c.error); continue }
    if (seen.has(c.row.orderId)) continue
    seen.add(c.row.orderId); rows.push(c.row)
  }
  return { rows, errors, total: list.length }
}
