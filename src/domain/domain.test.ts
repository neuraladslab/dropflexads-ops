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

import { grupoEstado } from "./estadoPedido.ts";
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

import { diaVacio, resumirDias, netoDelDia } from "./porDia.ts";

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
