import { test } from "node:test";
import assert from "node:assert/strict";
import { diaBogota, rangoUtcDelDia, sumarDias } from "./fechas.ts";
import { cruzar, type MovimientoTarjeta, type CobroMeta } from "./cruce.ts";
import { resultado } from "./ganancia.ts";

test("un pedido de las 19:30 en Bogotá cae en el día de Bogotá, no en el siguiente UTC", () => {
  assert.equal(diaBogota("2026-09-22T00:30:00Z"), "2026-09-21"); // 19:30 del 21 en Bogotá
  assert.equal(diaBogota("2026-09-21T05:00:00Z"), "2026-09-21"); // 00:00 del 21
  assert.equal(diaBogota("2026-09-21T04:59:59Z"), "2026-09-20");
});
test("rango UTC de un día de Bogotá", () => {
  const { desde, hasta } = rangoUtcDelDia("2026-09-21");
  assert.equal(desde.toISOString(), "2026-09-21T05:00:00.000Z");
  assert.equal(hasta.toISOString(), "2026-09-22T05:00:00.000Z");
  assert.equal(sumarDias("2026-09-30", 1), "2026-10-01");
});

const cargo = (id: string, monto: number, refPago: string | null, extra: Partial<MovimientoTarjeta> = {}): MovimientoTarjeta =>
  ({ id, tipo: "cargo", estado: "aprobado", monto, refPago, ...extra });
const cobro = (id: string, monto: number, refPago: string | null, estado: CobroMeta["estado"] = "pagado"): CobroMeta => ({ id, monto, refPago, estado });

test("solo cuenta como Meta lo que cruza por referencia de pago (sin importar mayúsculas)", () => {
  const r = cruzar(
    [cargo("1", 100000, "pz4xv8swf4"), cargo("2", 50000, "ZZZZZZZZZZ"), cargo("3", 30000, null)],
    [cobro("a", 100000, "PZ4XV8SWF4")],
  );
  assert.equal(r.totalMeta, 100000);
  assert.equal(r.totalOtros, 80000); // un cargo «FACEBK» sin cobro no se cuenta como Meta
});
test("rechazados y abonos no cuentan; un vínculo manual sí cruza", () => {
  const r = cruzar(
    [cargo("1", 10000, "AAAAAAAA11", { estado: "rechazado" }), { id: "2", tipo: "abono", estado: "aprobado", monto: 5000 }, cargo("3", 20000, null, { cobroManualId: "a" })],
    [cobro("a", 20000, null)],
  );
  assert.equal(r.totalMeta, 20000);
  assert.equal(r.totalOtros, 0);
});
test("misma referencia dos veces: ambos cuentan y el segundo se marca repetido", () => {
  const r = cruzar([cargo("1", 40000, "REPE000001"), cargo("2", 40000, "REPE000001")], [cobro("a", 40000, "REPE000001")]);
  assert.equal(r.totalMeta, 80000);
  assert.deepEqual(r.repetidos.map((x) => x.id), ["2"]);
});
test("cobros pagados de Meta que no están en la tarjeta se reportan", () => {
  const r = cruzar([], [cobro("a", 1000, "AAAAAAAA11"), cobro("b", 2000, "BBBBBBBB22", "pendiente")]);
  assert.deepEqual(r.cobrosSinTarjeta.map((c) => c.id), ["a"]);
});

test("ganancia: veredicto y retorno por peso gastado en Meta", () => {
  const costos = { meta: 675388, devoluciones: 0, comisionesTarjeta: 0, otrosDescuentosDropi: 0, otrosGastosTarjeta: 0, herramientas: 0 };
  assert.equal(resultado(500000, costos).veredicto, "pierde");
  assert.equal(resultado(900000, costos).veredicto, "gana");
  assert.equal(resultado(676000, costos).veredicto, "equilibrio");
  assert.ok(Math.abs(resultado(675388, costos).retornoPorPesoEnMeta! - 1) < 1e-9);
});

import { entradaRapida, rentabilidad, incrementoPorRoas, escalado } from "./calculadora.ts";

test("calculadora: ejemplo de la guía (producto 18.000, PVP 79.900, devoluciones 15 %)", () => {
  const r = rentabilidad({ costoProducto: 18000, flete: 14000, comision: 2500, precioVenta: 79900, devolucionesPct: 15, cpaMax: 20000 });
  assert.equal(r.costo, 34500);
  assert.equal(r.bruto, 45400);
  assert.equal(Math.round(r.colchon), 6810);
  assert.equal(Math.round(r.real), 38590);
  assert.equal(r.presupuestoDiario, 20000); // mínimo de $20.000
  assert.equal(r.gananciaNeta, 18590);
  assert.equal(r.rentable, true);
});
test("calculadora: modo rápido vende a 2,5× el costo operativo", () => {
  assert.equal(entradaRapida(18000).precioVenta, 86250); // ceil((18000+14000+2500) × 2,5)
});
test("escalado: incrementos por ROAS y condiciones para escalar", () => {
  assert.deepEqual([1.9, 2, 2.5, 3, 4].map(incrementoPorRoas), [0, 25, 50, 75, 100]);
  const e = escalado({ presupuesto: 30000, cpa: 20000, ventasPorDia: 2, margenPorVenta: 38900, cpaMax: 20000, diasRegistrados: 3 }, 19);
  assert.equal(e.puedeEscalar, true);
  assert.ok(e.roas > 2 && e.roas < 2.2);
  assert.equal(escalado({ presupuesto: 30000, cpa: 20000, ventasPorDia: 2, margenPorVenta: 38900, diasRegistrados: 2 }, 19).puedeEscalar, false); // faltan días
});

import { grupoEstado, esCancelado } from "./estadoPedido.ts";
import { clasificarPedidos } from "./pedidos.ts";

test("estados de Dropi por palabra clave (con tildes, mayúsculas y variantes)", () => {
  assert.equal(grupoEstado("ENTREGADO"), "entregado");
  assert.equal(grupoEstado("Devolución al remitente"), "devolucion");
  assert.equal(grupoEstado("DEVOLUCION"), "devolucion");
  assert.equal(grupoEstado("RECLAMO EN OFICINA"), "novedad");
  assert.equal(grupoEstado("EN REPARTO"), "transito");
  assert.equal(grupoEstado("GUIA_GENERADA"), "pendiente");
  assert.equal(grupoEstado("algo nuevo de Dropi"), "otro");
  assert.equal(grupoEstado(null), "otro");
});
test("pedidos: pagado, sin pagar, no verificable, devuelto y en curso", () => {
  const pedidos = [
    { idPedido: "1", estado: "ENTREGADO", entregadoDia: "2026-09-25" },
    { idPedido: "2", guia: "G2", estado: "ENTREGADO", entregadoDia: "2026-09-26" },
    { idPedido: "3", estado: "ENTREGADO", entregadoDia: "2026-09-27" },
    { idPedido: "4", estado: "ENTREGADO", entregadoDia: "2026-09-01" },
    { idPedido: "5", estado: "DEVOLUCION" },
    { idPedido: "6", estado: "DEVOLUCION" },
    { idPedido: "7", estado: "EN REPARTO" },
  ];
  const r = clasificarPedidos(pedidos, [{ idPedido: "1" }, { guia: "G2" }], [{ idPedido: "6" }], "2026-09-21", "2026-10-02");
  assert.deepEqual(r.map((p) => p.contable), ["pagado", "pagado", "sin_pagar", "no_verificable", "devuelto", "devuelto_cobrado", "en_curso"]);
  assert.equal(r[2].dias, 5);
});

import { diaVacio, resumirDias, netoDelDia, costoPorVenta, repartoDeCostos, costosDelDia } from "./porDia.ts";

test("ganancia por día: suma de días y veredicto del período", () => {
  const d1 = { ...diaVacio("2026-09-25"), ganancia: 300000, meta: 200000, devoluciones: 20000 };
  const d2 = { ...diaVacio("2026-09-26"), ganancia: 100000, meta: 250000, otrosGastos: 10000 };
  assert.equal(netoDelDia(d1).neto, 80000);
  assert.equal(netoDelDia(d2).veredicto, "pierde");
  const r = resumirDias([d1, d2], 1000);
  assert.equal(r.total.ganancia, 400000);
  assert.equal(r.herramientas, 2000);
  assert.equal(r.neto, 400000 - (450000 + 20000 + 10000 + 2000)); // -82000
  assert.equal(r.veredicto, "pierde");
});

import { calcularVentana, validarRango } from "./ventana.ts";

test("ventana: primera vez y «histórico» parten del inicio de la operación", () => {
  const base = { hoy: "2026-10-10", inicioOperacion: "2026-09-26", hayDatos: false };
  assert.deepEqual(calcularVentana(base), { from: "2026-09-26", to: "2026-10-10" });
  assert.deepEqual(calcularVentana({ ...base, hayDatos: true, ultimaSyncDia: "2026-10-09", completo: true }), { from: "2026-09-26", to: "2026-10-10" });
});
test("ventana: incremental solapa 2 días y nunca pasa del inicio de la operación", () => {
  const e = { hoy: "2026-10-10", inicioOperacion: "2026-09-26", hayDatos: true };
  assert.deepEqual(calcularVentana({ ...e, ultimaSyncDia: "2026-10-09" }), { from: "2026-10-07", to: "2026-10-10" });
  assert.deepEqual(calcularVentana({ ...e, ultimaSyncDia: "2026-09-27" }), { from: "2026-09-26", to: "2026-10-10" });
});
test("ventana: un día o un rango exacto, con tope de 120 días", () => {
  const e = { hoy: "2026-10-10", inicioOperacion: "2026-09-26", hayDatos: true, ultimaSyncDia: "2026-10-09" };
  assert.deepEqual(calcularVentana({ ...e, from: "2026-09-30", to: "2026-09-30" }), { from: "2026-09-30", to: "2026-09-30" });
  assert.deepEqual(calcularVentana({ ...e, from: "2026-09-28" }), { from: "2026-09-28", to: "2026-10-10" });
  assert.equal(calcularVentana({ ...e, from: "2025-01-01" }).from, "2026-06-12"); // hoy − 120 días
});
test("validarRango: mensajes claros", () => {
  const hoy = "2026-10-10";
  assert.equal(validarRango("2026-09-26", "2026-10-02", hoy), null);
  assert.equal(validarRango("2026-09-26", "", hoy), null); // un día
  assert.match(validarRango("26/09/2026", "", hoy)!, /desde/);
  assert.match(validarRango("2026-10-05", "2026-10-01", hoy)!, /anterior/);
  assert.match(validarRango("2026-09-26", "2026-10-11", hoy)!, /futura/);
  assert.match(validarRango("2026-01-01", "2026-10-10", hoy)!, /120/);
});

import { validarInicio, dentroDeOperacion } from "./ventana.ts";

test("validarInicio: fecha desde la que se sincroniza", () => {
  const hoy = "2026-10-10";
  assert.equal(validarInicio("2026-09-26", hoy), null);
  assert.equal(validarInicio("2026-10-10", hoy), null);
  assert.match(validarInicio("2026-10-11", hoy)!, /futura/);
  assert.match(validarInicio("26/09/2026", hoy)!, /válida/);
  assert.match(validarInicio("2026-01-01", hoy)!, /120/);
  assert.match(validarInicio(undefined, hoy)!, /válida/);
});

test("costo por venta real y reparto de costos", () => {
  const dias = [
    { ...diaVacio("2026-09-26"), ganancia: 100000, meta: 40000, entregas: 2 },
    { ...diaVacio("2026-09-27"), ganancia: 50000, meta: 20000, entregas: 1, devoluciones: 15000, otrosGastos: 5000 },
  ];
  const r = resumirDias(dias, 0);
  const c = costoPorVenta(r.total, r.neto);
  assert.equal(c.entregas, 3);
  assert.equal(c.cpa, 20000); // 60.000 de Meta / 3 pedidos entregados
  assert.equal(c.gananciaPorPedido, 50000);
  assert.equal(c.quedaPorPedido, 30000);
  assert.equal(c.netoPorPedido, 23333.33); // (150.000 − 80.000 de costos) / 3
  const sinMeta = costoPorVenta({ ...r.total, meta: 0 }, r.neto);
  assert.equal(sinMeta.cpa, null); // no se inventa: sin gasto de Meta identificado
  assert.equal(costoPorVenta(diaVacio("x"), 0).gananciaPorPedido, null);
  const rep = repartoDeCostos(costosDelDia(r.total), r.total.ganancia);
  assert.deepEqual(rep.map((x) => x.nombre), ["Publicidad en Meta", "Devoluciones", "Otros gastos de la tarjeta"]);
  assert.equal(rep[0].pctDelCosto, 75); // 60.000 de 80.000
  assert.equal(rep[0].pctDeLaGanancia, 40);
});

import { recuperacion } from "./recuperacion.ts";

test("recuperación de la inversión: porcentaje, lo que falta y la fecha estimada", () => {
  const hoy = "2026-10-10";
  const a = recuperacion(1000000, 400000, 50000, hoy); // faltan 600.000 a 50.000 por día → 12 días
  assert.equal(a.estado, "en_camino"); assert.equal(a.pct, 40); assert.equal(a.faltan, 600000); assert.equal(a.dias, 12); assert.equal(a.fecha, "2026-10-22");
  const b = recuperacion(1000000, 1250000, 10000, hoy); // ya la recuperó y va 250.000 por encima
  assert.equal(b.estado, "recuperada"); assert.equal(b.pct, 100); assert.equal(b.excedente, 250000); assert.equal(b.faltan, 0);
  const c = recuperacion(1000000, 400000, -20000, hoy); // gastando más de lo que entra: no se recupera a este ritmo
  assert.equal(c.estado, "sin_ritmo"); assert.equal(c.dias, null); assert.equal(c.fecha, null);
  assert.equal(recuperacion(0, 0, 0, hoy).estado, "sin_datos");
  assert.equal(recuperacion(1000000, 999999.5, 100000, hoy).pct, 99); // nunca redondea hacia arriba un 99,9 %
});

test("pagos a herramientas desde la billetera cuentan como Herramientas; la nueva orden con pago anticipado no es costo", () => {
  const d = { ...diaVacio("2026-10-07"), ganancia: 200000, meta: 50000, pagosHerramientas: 136558 };
  const r = resumirDias([d], 3000);
  assert.equal(costosDelDia(d, 3000).herramientas, 139558); // 3.000 fijos del día + 136.558 de la transferencia
  assert.equal(r.costos, 50000 + 139558);
  const rep = repartoDeCostos(costosDelDia(r.total, r.herramientas), r.total.ganancia);
  assert.equal(rep.find((x) => x.nombre === "Herramientas")!.monto, 139558);
});

import { atribuir, resumenPorCampana } from "./campanas.ts";

test("campañas: el pedido va a la primera campaña con alguno de sus productos; si no, «sin campaña»", () => {
  const camps = [{ id: "A", productIds: ["10", "11"] }, { id: "B", productIds: ["11", "20"] }];
  const a = atribuir([
    { idPedido: "1", productIds: ["10"] }, { idPedido: "2", productIds: ["20"] }, { idPedido: "3", productIds: ["11"] }, // 11 está en A y B: gana A (la más antigua)
    { idPedido: "4", productIds: ["99"] }, { idPedido: "5", productIds: [] },
  ], camps);
  assert.deepEqual([...a.entries()], [["1", "A"], ["2", "B"], ["3", "A"], ["4", null], ["5", null]]);
});
test("campañas: resultado por campaña con la ganancia real y la tasa de devolución", () => {
  const ped = [
    { idPedido: "1", contable: "pagado" }, { idPedido: "2", contable: "pagado" }, { idPedido: "3", contable: "sin_pagar" },
    { idPedido: "4", contable: "devuelto_cobrado" }, { idPedido: "5", contable: "en_curso" }, { idPedido: "6", contable: "pagado" },
  ];
  const asig = new Map<string, string | null>([["1", "A"], ["2", "A"], ["3", "A"], ["4", "A"], ["5", "A"], ["6", null]]);
  const m = resumenPorCampana(ped, asig, new Map([["1", 50000], ["2", 40000], ["6", 30000]]), new Map([["4", 15000]]));
  const A = m.get("A")!;
  assert.deepEqual([A.pedidos, A.entregados, A.pagados, A.sinPagar, A.devueltos, A.enCurso], [5, 3, 2, 1, 1, 1]);
  assert.equal(A.ganancia, 90000); assert.equal(A.costoDevoluciones, 15000);
  assert.equal(A.tasaDevolucion, 25); // 1 devuelto de 4 que ya terminaron
  assert.equal(m.get("sin")!.ganancia, 30000);
  assert.equal(m.get("sin")!.tasaDevolucion, 0);
});

test("pedidos cancelados: se detectan con cualquier variante y no se confunden con devoluciones", () => {
  for (const e of ["CANCELADO", "Cancelada", "PEDIDO CANCELADO POR EL CLIENTE", "cancelación", "CANCELED"]) assert.equal(esCancelado(e), true, e);
  assert.equal(grupoEstado("CANCELADO"), "cancelado");
  for (const e of ["ENTREGADO", "DEVOLUCION AL REMITENTE", "RECHAZADO", "EN REPARTO", "GUIA_GENERADA", "", null]) assert.equal(esCancelado(e), false, String(e));
  assert.equal(grupoEstado("RECHAZADO"), "devolucion"); // lo rechazado sigue siendo plata perdida
});

import { seImporta } from "./estadoPedido.ts";

test("se importan todos los pedidos menos los cancelados", () => {
  for (const e of ["ENTREGADO", "DEVOLUCION AL REMITENTE", "RECHAZADO", "EN REPARTO", "GUIA_GENERADA", "PENDIENTE CONFIRMACION", "RECLAMO EN OFICINA", "EN TRANSITO", "algo nuevo", "", null]) assert.equal(seImporta(e), true, String(e));
  for (const e of ["CANCELADO", "Cancelada", "PEDIDO CANCELADO POR EL CLIENTE"]) assert.equal(seImporta(e), false, e);
});

test("estados reales de Dropi: todo entra salvo CANCELADO; las entregas a la transportadora siguen en curso", () => {
  const real = ["ENTREGADO", "DEVOLUCION", "RECHAZADO", "ENTREGADA A CONEXIONES", "RECLAME EN OFICINA", "EN PROCESAMIENTO", "PREPARADO PARA TRANSPORTADORA", "EN BODEGA ORIGEN", "NOVEDAD", "REENVÍO", "PENDIENTE", "GUIA_GENERADA"];
  for (const e of real) assert.equal(seImporta(e), true, e);
  assert.equal(seImporta("CANCELADO"), false);
  assert.equal(grupoEstado("ENTREGADA A CONEXIONES"), "transito"); // no es entrega al cliente final
  assert.equal(grupoEstado("RECLAME EN OFICINA"), "novedad");
});

test("lo anterior al inicio de la operación no cuenta (un pedido del 9 de agosto con inicio 21/09)", () => {
  assert.equal(dentroDeOperacion("2026-08-09", "2026-09-21"), false);
  assert.equal(dentroDeOperacion("2026-09-20", "2026-09-21"), false);
  assert.equal(dentroDeOperacion("2026-09-21", "2026-09-21"), true);
  assert.equal(dentroDeOperacion("2026-10-02", "2026-09-21"), true);
  assert.equal(dentroDeOperacion(null, "2026-09-21"), true);
});

import { combosVendidos } from "./combos.ts";

test("combos: ventas, precio, facturado y ganancia real por unidades del pedido", () => {
  const p = [
    { idPedido: "1", unidades: 1, total: 89900, contable: "pagado", creado: "2026-10-01" },
    { idPedido: "2", unidades: 1, total: 89900, contable: "pagado", creado: "2026-10-02" },
    { idPedido: "3", unidades: 1, total: 79900, contable: "sin_pagar", creado: "2026-10-03" }, // entregado pero aún sin ganancia en la billetera
    { idPedido: "4", unidades: 2, total: 129900, contable: "pagado", creado: "2026-10-02" },
    { idPedido: "5", unidades: 2, total: 129900, contable: "devuelto", creado: "2026-10-02" }, // devuelto: no es venta
    { idPedido: "6", unidades: null, total: 50000, contable: "pagado" }, // sin cantidad: no se puede ubicar
    { idPedido: "7", unidades: 3, total: 169900, contable: "en_curso" }, // en camino: no es venta todavía
  ];
  const r = combosVendidos(p, new Map([["1", 49900], ["2", 49900], ["4", 64900], ["6", 1000]]));
  assert.deepEqual(r.filas.map((f) => [f.unidades, f.ventas, f.pctVentas]), [[1, 3, 75], [2, 1, 25]]);
  assert.equal(r.filas[0].precio, 89900); // el precio más frecuente (2 de 3)
  assert.equal(r.filas[0].facturado, 259700);
  assert.equal(r.filas[0].gananciaTotal, 99800); assert.equal(r.filas[0].conGanancia, 2); assert.equal(r.filas[0].gananciaPorVenta, 49900); // el sin pagar no promedia
  assert.equal(r.filas[1].gananciaPorVenta, 64900);
  assert.deepEqual(r.total, { ventas: 4, facturado: 389600, gananciaTotal: 164700, conGanancia: 3, gananciaPorVenta: 54900 });
  assert.equal(r.sinCantidad, 1);
  assert.deepEqual(combosVendidos([], new Map()).filas, []);
});

import { flujoPorDia } from "./billetera.ts";

test("billetera: lo que entra y lo que sale cada día, por tipo (la billetera es de paso)", () => {
  const dias = flujoPorDia([
    { dia: "2026-10-02", kind: "wallet_topup", direction: "in", monto: 50000 },
    { dia: "2026-10-02", kind: "to_card", direction: "out", monto: 50000 },
    { dia: "2026-10-01", kind: "profit", direction: "in", monto: 40000 },
    { dia: "2026-10-01", kind: "profit", direction: "in", monto: 12000 },
    { dia: "2026-10-01", kind: "return_fee", direction: "out", monto: 14000 },
    { dia: "2026-10-01", kind: "recharge_fee", direction: "out", monto: 200 },
    { dia: "2026-10-01", kind: "withdrawal", direction: "out", monto: 5000 },
  ]);
  assert.deepEqual(dias.map((d) => d.dia), ["2026-10-01", "2026-10-02"]); // ascendente
  assert.deepEqual(dias[0].entra, { ganancia: 52000, propia: 0, otros: 0 });
  assert.deepEqual(dias[0].sale, { tarjeta: 0, descuentos: 14200, retiros: 5000 });
  assert.equal(dias[0].totalEntra, 52000); assert.equal(dias[0].totalSale, 19200);
  assert.deepEqual([dias[1].entra.propia, dias[1].sale.tarjeta, dias[1].totalEntra, dias[1].totalSale], [50000, 50000, 50000, 50000]);
});

test("cruce de respaldo: un cobro de Meta sin referencia se empareja por monto y fecha (0,3 % de diferencia, un día después)", () => {
  const tarjeta = [
    { id: "a", tipo: "cargo" as const, estado: "aprobado" as const, monto: 52428, fecha: "2026-10-02" },
    { id: "b", tipo: "cargo" as const, estado: "aprobado" as const, monto: 35000, fecha: "2026-10-02" }, // otra cosa
    { id: "c", tipo: "cargo" as const, estado: "aprobado" as const, monto: 32390, fecha: "2026-09-29" },
    { id: "d", tipo: "cargo" as const, estado: "aprobado" as const, monto: 32390, fecha: "2026-09-29" },
  ];
  const cobros = [
    { id: "1", fecha: "2026-10-01", monto: 52271, estado: "pagado" as const }, // → a
    { id: "2", fecha: "2026-09-29", monto: 32300, estado: "pagado" as const }, // → c
    { id: "3", fecha: "2026-09-29", monto: 32300, estado: "pagado" as const }, // → d (cada cargo se usa una sola vez)
    { id: "4", fecha: "2026-09-20", monto: 99999, estado: "pagado" as const }, // sin cargo parecido
  ];
  const r = cruzar(tarjeta, cobros);
  assert.deepEqual(r.meta.map((m) => m.id).sort(), ["a", "c", "d"]);
  assert.deepEqual(r.porMonto.map((m) => m.id).sort(), ["a", "c", "d"]);
  assert.deepEqual(r.otros.map((m) => m.id), ["b"]); // los 35.000 no se parecen a ningún cobro: siguen siendo «otro gasto»
  assert.deepEqual(r.cobrosSinTarjeta.map((c) => c.id), ["4"]);
  // fuera de la ventana de fechas o de la tolerancia, no se empareja
  assert.equal(cruzar([{ id: "x", tipo: "cargo", estado: "aprobado", monto: 52428, fecha: "2026-10-12" }], [{ id: "9", fecha: "2026-10-01", monto: 52271, estado: "pagado" }]).meta.length, 0);
  assert.equal(cruzar([{ id: "x", tipo: "cargo", estado: "aprobado", monto: 60000, fecha: "2026-10-02" }], [{ id: "9", fecha: "2026-10-01", monto: 52271, estado: "pagado" }]).meta.length, 0);
});
test("cruce: la referencia de pago manda; el respaldo solo toca cobros sin referencia", () => {
  const r = cruzar(
    [{ id: "a", tipo: "cargo", estado: "aprobado", monto: 100000, refPago: "PZ4XV8SWF4", fecha: "2026-10-02" }, { id: "b", tipo: "cargo", estado: "aprobado", monto: 100000, fecha: "2026-10-02" }],
    [{ id: "1", fecha: "2026-10-01", monto: 100000, refPago: "PZ4XV8SWF4", estado: "pagado" }, { id: "2", fecha: "2026-10-01", monto: 100000, refPago: "OTRA000000", estado: "pagado" }],
  );
  assert.deepEqual(r.meta.map((m) => m.id), ["a"]); // el cobro 2 trae su referencia y esa no existe en la tarjeta: no se fuerza por monto
  assert.deepEqual(r.porMonto, []);
  assert.deepEqual(r.cobrosSinTarjeta.map((c) => c.id), ["2"]);
});

import { acumuladoPorDia, serieMeta, resumenMeta } from "./series.ts";

test("acumulado por día: el último valor es recuperado − invertido, con herramientas por día calendario", () => {
  const a = { ...diaVacio("2026-09-21"), ganancia: 100000, meta: 40000 };
  const b = { ...diaVacio("2026-09-23"), ganancia: 20000, meta: 70000, devoluciones: 5000 };
  const s = acumuladoPorDia([a, b], 1000, "2026-09-21", "2026-09-23"); // el 22 no tiene movimientos
  assert.deepEqual(s.map((x) => x.dia), ["2026-09-21", "2026-09-22", "2026-09-23"]);
  assert.equal(s[0].neto, 59000); assert.equal(s[1].neto, -1000); assert.equal(s[2].neto, -56000);
  const recuperado = 120000, invertido = 40000 + 70000 + 5000 + 3 * 1000;
  assert.equal(s[2].acumulado, recuperado - invertido);
  assert.equal(s[0].entro, 100000); assert.equal(s[0].gasto, 41000);
});
test("serie y resumen de Meta: CPM = gasto/impresiones×1000 y CTR = clics/impresiones", () => {
  const filas = [{ d: "2026-10-01", spend: 27254, imp: 3500, clicks: 70 }, { d: "2026-10-03", spend: 20000, imp: 10000, clicks: 500 }];
  const s = serieMeta(filas, "2026-10-01", "2026-10-03");
  assert.equal(s[0].cpm, 7786.86); assert.equal(s[0].ctr, 2); assert.equal(s[1].gasto, 0); assert.equal(s[1].cpm, null); assert.equal(s[2].ctr, 5);
  const r = resumenMeta(filas);
  assert.equal(r.gasto, 47254); assert.equal(r.dias, 2); assert.equal(r.promedioDia, 23627);
  assert.equal(r.cpm, 3500.3); assert.equal(r.ctr, 4.22); assert.equal(r.mejorCpm?.dia, "2026-10-03"); assert.equal(r.peorCpm?.dia, "2026-10-01"); assert.equal(r.mejorCtr?.dia, "2026-10-03");
});

import { gananciaPorVenta, costoPorVentaReal } from "./porVenta.ts";
test("por día de venta: la ganancia va al día en que se vendió, no al día que Dropi pagó", () => {
  const pedidos = [
    { creado: "2026-09-28", contable: "pagado", ganancia: 60000 }, { creado: "2026-09-28", contable: "en_curso", ganancia: 0 },
    { creado: "2026-09-29", contable: "sin_pagar", ganancia: 0 }, { creado: "2026-09-29", contable: "devuelto", ganancia: 0 },
  ];
  const s = gananciaPorVenta(pedidos, [{ dia: "2026-09-28", publicidad: 51000, otros: 1000 }], "2026-09-28", "2026-09-29");
  assert.equal(s[0].ventas, 2); assert.equal(s[0].entro, 60000); assert.equal(s[0].enCamino, 1); assert.equal(s[0].neto, 8000);
  assert.equal(s[1].ventas, 2); assert.equal(s[1].entregados, 1); assert.equal(s[1].devueltos, 1); assert.equal(s[1].entro, 0); assert.equal(s[1].neto, 0);
  const c = costoPorVentaReal(s);
  assert.equal(c.ventas, 4); assert.equal(c.entregados, 2); assert.equal(c.costoPorPedido, 12750); assert.equal(c.cpaEntrega, 25500);
  assert.equal(c.gananciaPorPedido, 60000); assert.equal(c.quedaPorEntrega, 34500); assert.equal(c.mejorCaso, 17000); // 51.000 ÷ (2 entregados + 1 en camino)
});

import { proyectarRecuperacion } from "./proyeccion.ts";
test("proyección: lo pendiente paga el promedio real en la fecha habitual y se cruza el cero cuando cubre lo que falta", () => {
  const p = proyectarRecuperacion({ faltan: 100000, gananciaPorPedido: 50000, lagDias: 7, hoy: "2026-10-10", tasas: [0.5, 1],
    pendientes: [{ creado: "2026-10-01", contable: "sin_pagar" }, { creado: "2026-10-05", contable: "en_curso" }, { creado: "2026-10-09", contable: "en_curso" }, { creado: "2026-10-09", contable: "devuelto" }] });
  assert.ok(p);
  assert.equal(p.pendientes, 3); assert.equal(p.seguras, 1);
  // sin_pagar: hoy (el 8 ya pasó) → 50.000; en camino del 5 → 12/oct; del 9 → 16/oct
  const [medio, pleno] = p.escenarios;
  assert.equal(medio.esperado, 50000 + 25000 + 25000); assert.equal(medio.cubre, true); assert.equal(medio.fecha, "2026-10-16");
  assert.equal(pleno.esperado, 150000); assert.equal(pleno.sobra, 50000); assert.equal(pleno.fecha, "2026-10-12");
  assert.equal(p.serie[0].acumulado, -50000); // arranca con lo que falta menos lo ya seguro de hoy
  assert.equal(proyectarRecuperacion({ faltan: 1, gananciaPorPedido: null, lagDias: 7, pendientes: [], hoy: "2026-10-10" }), null);
});

import { evaluarEscalado, diasDesdeCambio, incrementoPara } from "./escalar.ts";
test("escalado: reglas de la calculadora con entrega prudente", () => {
  const dias = (g: number, v: number) => Array.from({ length: 7 }, (_, k) => ({ dia: `2026-10-0${k + 1}`, gasto: g, ventas: v }));
  const bien = evaluarEscalado({ dias: dias(50000, 5), margen: 50000 }); // ROAS = 35×50000/(350000×1,19) ≈ 4,2 → prudente 2,52
  assert.equal(bien.veredicto, "escalar"); assert.equal(bien.incremento, 50); assert.equal(bien.nuevoPresupuesto, 75000);
  assert.equal(evaluarEscalado({ dias: dias(50000, 3), margen: 50000 }).veredicto, "vigilar"); // 1,8 ventas/día prudentes y ROAS 1,51
  assert.equal(evaluarEscalado({ dias: dias(50000, 1), margen: 50000 }).veredicto, "pausar"); // ROAS prudente 0,50
  assert.equal(evaluarEscalado({ dias: dias(50000, 5), margen: null }).veredicto, "sin_datos");
  assert.equal(evaluarEscalado({ dias: dias(50000, 5).slice(0, 2), margen: 50000 }).veredicto, "vigilar"); // menos de 3 días
  assert.equal(incrementoPara(1.99), 0); assert.equal(incrementoPara(2), 25); assert.equal(incrementoPara(4), 100);
  assert.equal(diasDesdeCambio([30000, 30000, 30000, 30000, 60000, 60000]), 2); // saltó hace 2 días
  assert.equal(diasDesdeCambio([30000, 31000, 29000, 30500]), null);
  const reciente = evaluarEscalado({ dias: [...dias(30000, 5).slice(0, 5), { dia: "2026-10-06", gasto: 60000, ventas: 9 }, { dia: "2026-10-07", gasto: 60000, ventas: 9 }], margen: 50000 });
  assert.equal(reciente.veredicto, "vigilar"); assert.equal(reciente.checks?.find((c) => c.clave === "espera")?.ok, false);
});
