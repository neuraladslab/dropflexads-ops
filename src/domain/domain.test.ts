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
