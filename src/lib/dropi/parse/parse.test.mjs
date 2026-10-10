import { test } from 'node:test'
import assert from 'node:assert/strict'
import { payRefOf } from './importers.mjs'

test('payRefOf saca el código de pago de la descripción del banco', () => {
  assert.equal(payRefOf('Compra en FACEBK *PZ4XV8SWF4'), 'PZ4XV8SWF4')
  assert.equal(payRefOf('FACEBK* jr2d77ewf4'), 'JR2D77EWF4')
  assert.equal(payRefOf('Compra sin código'), '')
  assert.equal(payRefOf(''), '')
})

import { parseOrdersJson, ordersPath } from './pedidos.mjs'

test('parseOrdersJson: estado, devolución, productos y sin datos del cliente', () => {
  const r = parseOrdersJson(JSON.stringify({ objects: [
    { id: 111, status: 'DEVOLUCION', shipping_guide: 'ABC123456', total_order: 79900, created_at: '2026-09-22T10:00:00Z', client_name: 'Secreto', phone: '300',
      servientrega_movements: [{ nom_mov: 'DEVOLUCION AL REMITENTE', created_at: '2026-09-28T09:00:00Z' }],
      orderdetails: [{ product: { id: 555, name: 'Gafas' } }, { product: { id: 555, name: 'Gafas' } }] },
    { id: 112, status: 'ENTREGADO', total_order: 50000, servientrega_movements: [{ nom_mov: 'ENTREGADO', created_at: '2026-09-26T12:00:00Z' }], orderdetails: [] },
  ] }))
  assert.equal(r.rows.length, 2)
  assert.equal(r.rows[0].status, 'DEVOLUCION')
  assert.equal(r.rows[0].returned, '2026-09-28')
  assert.deepEqual(r.rows[0].productIds, ['555'])
  assert.equal(r.rows[0].guide, '123456')
  assert.equal(r.rows[1].delivered, '2026-09-26')
  assert.ok(!JSON.stringify(r.rows).includes('Secreto')) // nada del cliente
})

test('ordersPath: todos los estados con el texto «null» (un status vacío lo rechaza Dropi)', () => {
  const u = new URL('https://x' + ordersPath({ userId: 77, start: 25, from: '2026-07-01', until: '2026-10-09' }))
  assert.equal(u.pathname, '/api/orders/myorders/v2')
  assert.equal(u.searchParams.get('status'), 'null')
  assert.equal(u.searchParams.get('seller'), 'null')
  assert.equal(u.searchParams.get('user_id'), '77')
  assert.equal(u.searchParams.get('start'), '25')
  assert.equal(u.searchParams.get('from'), '2026-07-01')
})
