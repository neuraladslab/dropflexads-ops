// Cierre sellado de un corte y chequeos de calidad. El sellado guarda una foto PLANA de las cifras (JSON); después se compara con lo que sale hoy de los datos
// para mostrar «cambió +$X desde el cierre» sin tocar nunca lo sellado.
export type Foto = {
  v: 2; desde: string; hasta: string;
  ganancia: number; publicidad: number; otrosGastos: number; devoluciones: number; comisiones: number; otrosDescuentos: number; herramientas: number; costos: number; neto: number;
  pagados: number; saldoApertura: number | null; saldoCierre: number | null; entro: number; salio: number; retiros: number;
  vendidos: number; pendientesN: number; pendientesValor: number; gananciaEsperada: number; costoDevolucionesEsperado: number;
  base: number; retiroSeguro: number; reparto: { id: string; nombre: string; pct: number; monto: number }[];
};

const CAMPOS: [keyof Foto, string][] = [
  ["ganancia", "Ganancia de pedidos"], ["costos", "Gastos del corte"], ["neto", "Neto del corte"], ["saldoCierre", "Saldo de la billetera al cerrar"],
  ["retiros", "Retiros"], ["pendientesN", "Pedidos pendientes"], ["pendientesValor", "Valor de venta pendiente"], ["retiroSeguro", "Retiro seguro para las socias"],
];
export type Cambio = { campo: string; etiqueta: string; antes: number; despues: number; dif: number };

/** Qué cambió entre lo sellado y lo que dan hoy los datos (solo diferencias de $1 o más). */
export function cambiosDesdeCierre(sellado: Foto, vivo: Foto): Cambio[] {
  const out: Cambio[] = [];
  for (const [k, etiqueta] of CAMPOS) {
    const a = sellado[k] as number | null, b = vivo[k] as number | null;
    if (a == null || b == null) continue;
    const dif = Math.round((b - a) * 100) / 100;
    if (Math.abs(dif) >= 1) out.push({ campo: k, etiqueta, antes: a, despues: b, dif });
  }
  return out;
}

export type Chequeo = { clave: string; tono: "ok" | "warn" | "bad" | "info"; titulo: string; detalle: string };
export type EntradaChequeos = {
  abierto: boolean; saldoApertura: number | null; entro: number; salio: number; saldoCierre: number | null;
  herramientasMensual: number; pagosHerramientas: number; anticipos: { n: number; monto: number }; horasDropi: number | null; horasMeta: number | null;
  noVerificables: number; cobrosMetaSinTarjeta: number; cargosRepetidos: number;
  devolucionReal: number | null; devolucionEsperada: number; sinReferencia: number; sumaCortes: number; totalDias: number;
};
const pl = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
const cop = (n: number) => (n < 0 ? "−" : "") + "$" + Math.abs(Math.round(n)).toLocaleString("es-CO");

export function chequear(e: EntradaChequeos): Chequeo[] {
  const c: Chequeo[] = [];
  if (e.abierto) c.push({ clave: "abierto", tono: "info", titulo: "El corte sigue abierto", detalle: "Las cifras cambian cada día hasta que cierre. Sella el corte después de su último día." });
  if (e.saldoApertura != null && e.saldoCierre != null) {
    const dif = Math.round((e.saldoApertura + e.entro - e.salio - e.saldoCierre) * 100) / 100;
    c.push(Math.abs(dif) < 1
      ? { clave: "saldo", tono: "ok", titulo: "La billetera cuadra", detalle: "Saldo al abrir + lo que entró − lo que salió = saldo al cerrar." }
      : { clave: "saldo", tono: "bad", titulo: `La billetera no cuadra: diferencia de ${cop(dif)}`, detalle: "Falta o sobra algún movimiento. Sincroniza Dropi de nuevo antes de repartir." });
  } else c.push({ clave: "saldo", tono: "warn", titulo: "Sin saldo para comprobar la billetera", detalle: "Dropi no informó el saldo de algún movimiento." });
  c.push(Math.abs(e.sumaCortes - e.totalDias) < 1
    ? { clave: "suma", tono: "ok", titulo: "Los cortes suman el total", detalle: "La suma de todos los cortes es igual a la de «Ganancia por día»." }
    : { clave: "suma", tono: "bad", titulo: "Los cortes no suman el total", detalle: `Diferencia de ${cop(e.sumaCortes - e.totalDias)} entre los cortes y «Ganancia por día».` });
  if (e.pagosHerramientas > 0) c.push({ clave: "herramientas", tono: "ok", titulo: `Pagos a herramientas contados: ${cop(e.pagosHerramientas)}`, detalle: "Salieron de tu billetera y ya restan del neto. No las repitas en Configuración → Herramientas." });
  else if (e.herramientasMensual <= 0) c.push({ clave: "herramientas", tono: "warn", titulo: "No hay herramientas cargadas", detalle: "Si pagas WhatsApp, IA u otras herramientas cada mes, agrégalas en Configuración: sin ellas el neto sale más alto de lo real." });
  if (e.anticipos.n > 0) c.push({ clave: "anticipos", tono: "info", titulo: `${pl(e.anticipos.n, "anticipo pagado", "anticipos pagados")} a Dropi por ${cop(e.anticipos.monto)}`, detalle: "Pagaste por adelantado un pedido desde la billetera y su valor entró a tu cuenta, así que Dropi no lo paga. Ese pedido cuenta como pagado, pero ni el anticipo ni lo que entró a tu cuenta están en el neto: súmalos a mano si quieres su ganancia real." });
  const viejo = (h: number | null) => h == null || h > 36;
  if (viejo(e.horasDropi)) c.push({ clave: "dropi", tono: "warn", titulo: "Dropi sin sincronizar hace más de un día", detalle: "Puede faltar la ganancia de los últimos pedidos." });
  if (viejo(e.horasMeta)) c.push({ clave: "meta", tono: "warn", titulo: "Meta Ads sin sincronizar hace más de un día", detalle: "Puede faltar el gasto de publicidad reciente." });
  if (e.noVerificables > 0) c.push({ clave: "noverif", tono: "warn", titulo: `${pl(e.noVerificables, "pedido no se puede verificar", "pedidos no se pueden verificar")}`, detalle: "Se entregaron antes de lo que cubre la billetera sincronizada: no se sabe si se pagaron." });
  if (e.cobrosMetaSinTarjeta > 0) c.push({ clave: "cobros", tono: "warn", titulo: `${pl(e.cobrosMetaSinTarjeta, "cobro de Meta no aparece", "cobros de Meta no aparecen")} en la tarjeta`, detalle: "Revísalos en Mis cuentas → Tarjeta." });
  if (e.cargosRepetidos > 0) c.push({ clave: "repetidos", tono: "bad", titulo: pl(e.cargosRepetidos, "posible cobro doble", "posibles cobros dobles"), detalle: "Un cargo repite la referencia de un cobro de Meta. Reclámalo a Dropi." });
  if (e.devolucionReal != null && e.devolucionReal > e.devolucionEsperada)
    c.push({ clave: "devol", tono: "warn", titulo: `Devolución real ${e.devolucionReal} % (esperabas ${e.devolucionEsperada} %)`, detalle: "La ganancia esperada de los pedidos en curso puede estar sobreestimada." });
  if (e.sinReferencia > 0) c.push({ clave: "sinref", tono: "warn", titulo: `${pl(e.sinReferencia, "pedido pendiente sin estimar", "pedidos pendientes sin estimar")}`, detalle: "Aún no hay pedidos pagados de su campaña para calcular su ganancia esperada." });
  return c;
}
