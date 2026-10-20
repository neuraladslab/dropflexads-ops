import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseInsights, parseInsightsAnuncios, parseTransacciones, estadoCobro, referenciaDe, diaDeInstante, ventanaMeta } from './parse.mjs'
import { rutaMetaPermitida, cuentaMeta } from './rutas.mjs'

test('insights: gasto, clics y compras por campaña y día', () => {
  const r = parseInsights([
    { campaign_id: '1200', campaign_name: 'Gafas | v1', date_start: '2026-10-01', spend: '52271.50', impressions: '9000', clicks: '210', actions: [{ action_type: 'link_click', value: '210' }, { action_type: 'omni_purchase', value: '3' }], action_values: [{ action_type: 'omni_purchase', value: '269700' }] },
    { campaign_id: 'x', date_start: '2026-10-01', spend: '1' }, // sin ID válido
    { campaign_id: '1300', date_start: 'ayer', spend: '1' }, // sin fecha válida
    { campaign_id: '1300', campaign_name: 'Faja', date_start: '2026-10-02', spend: '0' },
  ])
  assert.equal(r.length, 2)
  assert.deepEqual(r[0], { day: '2026-10-01', campaignId: '1200', campaignName: 'Gafas | v1', spend: 52271.5, impressions: 9000, clicks: 210, purchases: 3, purchaseValue: 269700 })
  assert.equal(r[1].purchases, 0)
})
test('cobros: importe, día de Bogotá, estado y referencia (si Meta la manda)', () => {
  const r = parseTransacciones([
    { id: '2886-2885', time: '2026-10-02T03:30:00+0000', amount: { amount: '52271', currency: 'COP' }, status: 'completed' }, // 22:30 del 1/oct en Bogotá
    { id: 'b', time: 1759400000, amount: '10000', status: 'failed', reference_number: 'pz4xv8swf4' },
    { id: 'c', time: '2026-10-02T10:00:00+0000', amount: { amount: '0' } }, // sin importe: se descarta
    { time: '2026-10-02T10:00:00+0000', amount: '5' }, // sin id: se descarta
  ])
  assert.equal(r.length, 2)
  assert.deepEqual([r[0].day, r[0].amount, r[0].status, r[0].paymentRef, r[0].currency], ['2026-10-01', 52271, 'paid', '', 'COP'])
  assert.deepEqual([r[1].status, r[1].paymentRef], ['failed', 'PZ4XV8SWF4'])
  assert.equal(diaDeInstante('2026-10-02T03:30:00+0000'), '2026-10-01')
})
test('estado y referencia', () => {
  for (const [s, e] of [['completed', 'paid'], ['SETTLED', 'paid'], ['Declined', 'failed'], ['pending', 'pending'], [undefined, 'paid']]) assert.equal(estadoCobro(s), e, String(s))
  assert.equal(referenciaDe({ reference: 'PZ4XV8SWF4' }), 'PZ4XV8SWF4')
  assert.equal(referenciaDe({ reference: '12345678901' }), '') // solo dígitos: es un número, no una referencia
  assert.equal(referenciaDe({ id: '28867994719554031-28863059346714241', tracking_id: 'abc' }), '')
})
test('rutas de Meta: solo lectura de la cuenta; el ID de cuenta se normaliza', () => {
  for (const p of ['/v23.0/act_941640195133155', '/v23.0/act_941640195133155/insights']) assert.equal(rutaMetaPermitida(p), true, p)
  assert.equal(rutaMetaPermitida('/v23.0/act_941640195133155/transactions'), false) // los cobros ya no se piden a Meta
  for (const p of ['/v23.0/me/adaccounts', '/v23.0/act_941640195133155/campaigns', '/v23.0/act_941640195133155/adsets', '/act_1/insights', '/v23.0/act_941640195133155/insights/extra']) assert.equal(rutaMetaPermitida(p), false, p)
  assert.equal(cuentaMeta('941640195133155'), 'act_941640195133155'); assert.equal(cuentaMeta(' act_941640195133155 '), 'act_941640195133155'); assert.equal(cuentaMeta('abc'), null)
})
test('ventana de Meta: desde el inicio; después, 7 días antes de la última sincronización', () => {
  assert.deepEqual(ventanaMeta({ hoy: '2026-10-10', inicio: '2026-09-21', ultimaSyncDia: null }), { from: '2026-09-21', to: '2026-10-10' })
  assert.deepEqual(ventanaMeta({ hoy: '2026-10-10', inicio: '2026-09-21', ultimaSyncDia: '2026-10-09' }), { from: '2026-10-02', to: '2026-10-10' })
  assert.equal(ventanaMeta({ hoy: '2026-10-10', inicio: '2026-09-21', ultimaSyncDia: '2026-09-23' }).from, '2026-09-21') // nunca antes del inicio
})

test('insights por anuncio: gasto, clics y compras por anuncio y día', () => {
  const r = parseInsightsAnuncios([
    { ad_id: '2300', ad_name: 'MASAJEADOR_DOLOR-CUELLO_VID_V01_20261019', campaign_id: '1200', date_start: '2026-10-20', spend: '30000.5', impressions: '4000', clicks: '90', actions: [{ action_type: 'omni_purchase', value: '2' }], action_values: [{ action_type: 'omni_purchase', value: '180000' }] },
    { ad_id: 'x', date_start: '2026-10-20', spend: '1' }, // sin ID válido
    { ad_id: '2400', date_start: 'ayer', spend: '1' }, // sin fecha válida
  ])
  assert.deepEqual(r, [{ day: '2026-10-20', adId: '2300', adName: 'MASAJEADOR_DOLOR-CUELLO_VID_V01_20261019', campaignId: '1200', spend: 30000.5, impressions: 4000, clicks: 90, purchases: 2, purchaseValue: 180000 }])
})
