import { test } from 'node:test'
import assert from 'node:assert/strict'
import { payRefOf } from './importers.mjs'

test('payRefOf saca el código de pago de la descripción del banco', () => {
  assert.equal(payRefOf('Compra en FACEBK *PZ4XV8SWF4'), 'PZ4XV8SWF4')
  assert.equal(payRefOf('FACEBK* jr2d77ewf4'), 'JR2D77EWF4')
  assert.equal(payRefOf('Compra sin código'), '')
  assert.equal(payRefOf(''), '')
})
