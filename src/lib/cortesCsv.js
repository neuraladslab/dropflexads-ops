import 'server-only'
// CSV de un corte para contabilidad: separado por «;» y con coma decimal (Excel en español), con BOM para las tildes.
// Los textos que vienen de fuera (descripciones de Dropi) se neutralizan contra fórmulas de Excel (= + - @).
import sql from '@/lib/db'
import { datosTarjeta, datosPedidos, datosCampanas } from '@/lib/datos'

const TIPO = {
  profit: ['Ganancia de pedido', true], return_fee: ['Cobro de devolución (flete)', true], card_fee: ['Mantenimiento de tarjeta', true], recharge_fee: ['Comisión de recarga', true],
  other_out: ['Otro descuento de Dropi', true], transfer_out: ['Pago a herramienta', true], to_card: ['Pase a la tarjeta (traslado)', false], withdrawal: ['Retiro', false],
  order_payment: ['Anticipo de pedido (no es gasto: se recupera al pagarse el pedido)', false], wallet_topup: ['Aporte propio a la billetera', false], reversal: ['Reverso', true], other_in: ['Otro ingreso', true],
}
const CLASE = { meta: 'Publicidad Meta', meta_monto: 'Publicidad Meta (por monto)', repetido: 'Posible cobro doble de Meta', otro: 'Otro gasto', recarga: 'Recarga de la tarjeta (traslado)', rechazado: 'Rechazado', ignorado: 'Ignorado' }
const CONTABLE = { pagado: 'Pagado', sin_pagar: 'Entregado sin pagar', no_verificable: 'Entregado, no verificable', en_curso: 'En curso', devuelto: 'Devuelto sin cobrar', devuelto_cobrado: 'Devuelto y cobrado' }

const txt = (v) => { let s = String(v ?? '').replace(/[\r\n\t]+/g, ' ').trim(); if (/^[=+\-@]/.test(s)) s = "'" + s; return /[;"]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s }
const num = (n) => (n == null || n === '' ? '' : String(Math.round(Number(n) * 100) / 100).replace('.', ','))
const fila = (a) => a.map((x) => (typeof x === 'number' ? num(x) : txt(x))).join(';')
const archivo = (cab, filas) => '﻿' + [fila(cab), ...filas.map(fila)].join('\r\n') + '\r\n'

export async function csvMovimientos(uid, c) {
  const [wal, tar] = await Promise.all([
    sql`SELECT tx_date::text AS d, kind, direction, amount::float8 AS a, description, order_ref, guide FROM wallet_movements WHERE owner_id = ${uid} AND tx_date BETWEEN ${c.desde} AND ${c.hasta} ORDER BY tx_at, id`,
    datosTarjeta(uid),
  ])
  const filas = []
  for (const w of wal) {
    const [nombre, cuenta] = TIPO[w.kind] || [w.kind, true]
    filas.push([w.d, 'Billetera Dropi', nombre, w.direction === 'in' ? w.a : '', w.direction === 'out' ? w.a : '', cuenta ? 'Sí' : 'No', w.description || '', w.order_ref || w.guide || ''])
  }
  for (const t of tar.lista.filter((x) => x.fecha >= c.desde && x.fecha <= c.hasta && x.clase !== 'rechazado' && x.clase !== 'ignorado').sort((a, b) => (a.fecha < b.fecha ? -1 : 1))) {
    const entra = t.clase === 'recarga'
    filas.push([t.fecha, 'Tarjeta Dropi', CLASE[t.clase] || t.clase, entra ? t.monto : '', entra ? '' : t.monto, entra ? 'No' : 'Sí', t.descripcion, t.refPago])
  }
  return archivo(['Fecha', 'Cuenta', 'Concepto', 'Entra', 'Sale', 'Cuenta en el resultado', 'Detalle', 'Referencia'], filas)
}

export async function csvPedidos(uid, c) {
  const [p, camp] = await Promise.all([datosPedidos(uid), datosCampanas(uid)])
  const filas = p.lista.filter((x) => x.creado && x.creado >= c.desde && x.creado <= c.hasta).sort((a, b) => (a.creado < b.creado ? -1 : 1)).map((x) => [
    x.idPedido, x.guia || '', x.producto || '', x.campana || '', x.estado, CONTABLE[x.contable] || x.contable, x.total ?? '', x.creado, x.entregadoDia || '', x.pagadoDia || '', x.devuelto || '', x.cobradoDia || '',
    camp.gananciaPorPedido.get(x.idPedido) ?? '',
  ])
  return archivo(['Pedido', 'Guía', 'Producto', 'Campaña', 'Estado en Dropi', 'Estado contable', 'Valor de venta', 'Creado', 'Entregado', 'Pagado a la billetera', 'Devuelto', 'Cobro de devolución', 'Ganancia real'], filas)
}
