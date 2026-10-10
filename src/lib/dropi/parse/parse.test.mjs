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
import { motivoDropi } from './errores.mjs'
import { classifyWallet } from './billetera.mjs'

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
  assert.deepEqual(r.rows[0].productNames, ['Gafas']) // alineados con los IDs y sin repetir
  assert.equal(r.rows[0].units, 2) // dos líneas del mismo producto: 2 unidades (1x + 1x)
  assert.equal(r.rows[1].units, null) // sin detalle no se inventa
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

test('motivoDropi: solo el mensaje de Dropi, recortado y sin tokens', () => {
  assert.equal(motivoDropi('{"isSuccess":false,"message":"Parámetro inválido: status"}'), 'Parámetro inválido: status')
  assert.equal(motivoDropi('{"error":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9abcdefghijklmnopqrstuv malo"}'), 'Bearer … malo')
  assert.equal(motivoDropi('<html>502</html>'), '')
  assert.equal(motivoDropi('{"message":"' + 'x '.repeat(100) + '"}').length <= 90, true)
})

test('billetera: la transferencia a una herramienta y el pago anticipado de una orden se clasifican aparte', () => {
  const mov = (o) => classifyWallet({ id: 1, type: 'SALIDA', created_at: '2026-10-07T14:39:00Z', amount: 1000, ...o }).row
  assert.equal(mov({ identification_code: 1031, description: 'SALIDA POR TRANSFERENCIA DE WALLET AL USUARIO wallet@chateapro.com', amount: 136558 }).kind, 'transfer_out')
  assert.equal(mov({ identification_code: 1000, description: 'SALIDA POR NUEVA ORDEN: 92580306', amount: 34369 }).kind, 'order_payment')
  assert.equal(mov({ identification_code: 1045, description: 'MANTENIMIENTO MENSUAL' }).kind, 'card_fee') // lo anterior no cambió
  assert.equal(mov({ identification_code: 9999, description: 'algo nuevo' }).kind, 'other_out') // lo desconocido sigue siendo «otro»
})

import { rutaPermitida, walletPath } from '../rutas.mjs'

test('las rutas que arma el código pasan la lista cerrada de Dropi (la lista no bloquea lo propio)', () => {
  const orders = ordersPath({ userId: 77, start: 0, from: '2026-07-12', until: '2026-10-10' })
  assert.equal(rutaPermitida(orders), true, 'pedidos: ' + orders)
  assert.match(orders, /FECHA%20DE%20CREADO/) // espacios como %20, no «+»
  assert.equal(rutaPermitida(walletPath({ userId: 77, start: 40, from: '2026-09-21', until: '2026-10-10' })), true)
  assert.equal(rutaPermitida('/api/login'), true)
  assert.equal(rutaPermitida('/api/credit-cards/balances/car_034RqjrY2hiiRZa6t98iW0'), true)
  assert.equal(rutaPermitida('/api/credit-cards/list-card-transactions/car_034RqjrY2hiiRZa6t98iW0/1/20'), true)
})
test('la lista cerrada rechaza lo que no es una de las rutas de lectura', () => {
  assert.equal(rutaPermitida('/api/orders/myorders'), false) // crear pedidos: nunca
  assert.equal(rutaPermitida('/api/otra/cosa'), false)
  const raro = ordersPath({ userId: 77, start: 0, from: '2026-07-12', until: '2026-10-10' }).replace('status=null', 'status=BORRAR')
  assert.equal(rutaPermitida(raro), false)
})

import { limpiarProductos } from '../../campanas.js'

test('limpiarProductos: solo IDs numéricos, sin repetir, con tope', () => {
  assert.deepEqual(limpiarProductos(['10', 11, '10']), ['10', '11'])
  assert.equal(limpiarProductos(['10', 'abc']), null)
  assert.equal(limpiarProductos('10'), null)
  assert.equal(limpiarProductos(Array.from({ length: 51 }, (_, i) => String(i))), null)
  assert.deepEqual(limpiarProductos([]), [])
})
