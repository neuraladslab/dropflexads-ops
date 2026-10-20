import 'server-only'
// Herramientas de SOLO LECTURA que la IA puede llamar. Cada una consulta los mismos cargadores que las pantallas (así las cifras son las mismas) y devuelve un resumen compacto con números;
// nunca nombres, teléfonos ni direcciones de clientes (el sistema ni siquiera los guarda). Todas quedan amarradas al usuario que pregunta: la IA no puede pedir datos de otro.
import { datosPeriodo, datosCortes, datosCampanas, datosEscalado, datosPedidos } from '@/lib/datos'
import { GLOSARIO } from '@/lib/glosario'

const pesos = (n) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : n) // dinero de escalar: pesos enteros, sin centavos
const r2 = (n) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 100) / 100 : n)
const corto = (s, n = 280) => (typeof s === 'string' ? s.slice(0, n) : s)
const ESTADOS = ['pagado', 'en_curso', 'sin_pagar', 'no_verificable', 'devuelto', 'devuelto_cobrado']

export const DEFINICIONES = [
  { name: 'obtener_salud_billetera', description: 'Estado de la billetera de Dropi HOY: saldo, cuánto pueden retirar las socias (retiro recomendado), lo que debe quedar (pauta de 7 días, devoluciones, imprevistos/ahorro/impuestos), utilidad acumulada y lo ya retirado. El retiro y la proyección son estimaciones sobre datos reales.', input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false } },
  { name: 'obtener_periodo', description: 'Resumen del dinero de un periodo: Entró, Gastaste, Te quedó, Por cobrar (estimado), pedidos por estado, a dónde se fue el dinero y costo por venta. `periodo` es "actual" (corte actual), "anterior", "todo", el día de cierre de un corte (AAAA-MM-DD) o un rango "AAAA-MM-DD_AAAA-MM-DD".', input_schema: { type: 'object', properties: { periodo: { type: 'string', description: 'actual | anterior | todo | AAAA-MM-DD | AAAA-MM-DD_AAAA-MM-DD' } }, required: ['periodo'], additionalProperties: false } },
  { name: 'listar_cortes', description: 'Todos los cortes (periodos que cierran cada mes) con lo que entró, lo que se gastó, lo que quedó, pedidos pendientes y si están sellados.', input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false } },
  { name: 'listar_campanas', description: 'Las campañas con su resultado: pedidos por estado, ganancia real, tasa de devolución y devolución esperada. Incluye el id de cada campaña.', input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false } },
  { name: 'obtener_escalado', description: 'Análisis probabilístico de escalar la pauta de una campaña: presupuesto actual, acción recomendada, tabla de presupuestos con probabilidad de ganar y casos pesimista/mediano/optimista, liquidez, ruta por pasos, alertas de salida y calidad de la evidencia. Todo es ESTIMADO. `presupuesto_diario` = otro presupuesto (sin IVA) para comparar, o 0 si no hay.', input_schema: { type: 'object', properties: { campana_id: { type: 'string', description: 'id de la campaña (de listar_campanas)' }, presupuesto_diario: { type: 'integer', description: '0 si no se quiere comparar otro presupuesto' } }, required: ['campana_id', 'presupuesto_diario'], additionalProperties: false } },
  { name: 'obtener_pedidos', description: 'Cantidad y valor de venta de TODOS los pedidos por estado contable (pagado, en curso, entregado sin pagar, devuelto, etc.). No trae datos de clientes.', input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false } },
  { name: 'obtener_avisos', description: 'Los avisos de cuadre y calidad de datos del corte actual (billetera que no cuadra, datos desactualizados, herramientas sin cargar, anticipos…).', input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false } },
  { name: 'buscar_glosario', description: 'Definición oficial de un término o cifra del sistema (Entró, Gastaste, Te quedó, Por cobrar, Retirable, ROAS, CPA…).', input_schema: { type: 'object', properties: { termino: { type: 'string' } }, required: ['termino'], additionalProperties: false } },
].map((d) => ({ ...d, strict: true }))

const PERIODO = /^(actual|anterior|todo|\d{4}-\d{2}-\d{2}(_\d{4}-\d{2}-\d{2})?)$/

/** `ejecutar(nombre, entrada)` → objeto JSON-able. Nunca lanza: un fallo se devuelve como { error } para que la IA diga «no tengo ese dato». */
export function crearHerramientas(uid, m = new Map()) {
  const impl = {
    async obtener_salud_billetera() {
      const b = await datosCortes(uid, m), s = b.salud
      return { fuente: 'obtener_salud_billetera', estado: s.estado, titulo: s.titulo, saldoBilletera: s.saldo, retiroRecomendado: s.retiroSeguro, limitadoPor: s.limitadoPor, libreSobreElPiso: s.libre, debeQuedar: s.bloqueado,
        piso: { pautaSieteDias: s.piso.pauta, ritmoDiarioConIva: s.piso.ritmo, deudaConMeta: s.piso.deudaMeta, saldoTarjeta: s.piso.tarjeta, devolucionesEsperadas: s.piso.devoluciones, diasDePautaQueCubre: s.piso.diasCubiertos },
        imprevistosAhorroImpuestos: s.seQueda, utilidadAcumulada: s.utilidadAcumulada, lesTocaALasSocias: s.sociasAcumulado, yaRetirado: s.retirado, pendienteDeRetirar: s.sociasPorRetirar,
        proyeccionEstimada: s.proyeccion ? { fecha: s.proyeccion.fecha, retiroPosible: s.proyeccion.retiro } : null, nota: 'Saldo, utilidad y retirado son reales; retiro recomendado y proyección son cálculo del sistema.' }
    },
    async obtener_periodo({ periodo }) {
      if (!PERIODO.test(String(periodo))) return { error: 'periodo no válido' }
      const d = await datosPeriodo(uid, periodo, m), c = d.c, e = c.pedidos.estado, est = c.estimacion
      return { fuente: 'obtener_periodo', periodo: { desde: d.per.desde, hasta: d.per.hasta, tipo: d.per.tipo, abierto: d.per.abierto }, entro: r2(c.total.ganancia), gastaste: r2(c.costos), teQuedo: r2(c.neto), veredicto: c.veredicto,
        porCobrarEstimado: r2(est.gananciaEsperada - est.costoDevoluciones), pedidosPagadosPorDropi: c.total.entregas,
        pedidos: { vendidos: c.pedidos.vendidos.n, pagados: e.pagado.n, enCurso: e.en_curso.n, entregadosSinPagar: e.sin_pagar.n, noVerificables: e.no_verificable.n, devueltos: e.devuelto.n + e.devuelto_cobrado.n, pendientes: c.pedidos.pendientes.n, valorDeVentaPendiente: r2(c.pedidos.pendientes.valor) },
        aDondeVaLaPlata: d.desglose.map((f) => ({ concepto: f.nombre, monto: r2(f.monto), pctDeLoQueGastaste: f.pctDelCosto, pctDeLoQueEntro: f.pctDeLaGanancia })),
        costoPorVenta: { pedidosVendidos: d.costoVenta.ventas, costoPorPedidoEntregado: r2(d.costoVenta.cpaEntrega), gananciaPorPedido: r2(d.costoVenta.gananciaPorPedido), quedaPorPedidoEntregado: r2(d.costoVenta.quedaPorEntrega) },
        retirosEnElPeriodo: r2(c.flujo.retiros), saldoAlCerrar: r2(c.flujo.saldoCierre) }
    },
    async listar_cortes() {
      const b = await datosCortes(uid, m)
      return { fuente: 'listar_cortes', diaDeCorte: b.corte, inicioOperacion: b.inicio, cortes: b.cortes.map((c) => ({ desde: c.desde, hasta: c.hasta, abierto: c.abierto, entro: r2(c.total.ganancia), gastaste: r2(c.costos), teQuedo: r2(c.neto), pedidosPendientes: c.pedidos.pendientes.n, sellado: !!c.cierre })) }
    },
    async listar_campanas() {
      const d = await datosCampanas(uid, m)
      return { fuente: 'listar_campanas', campanas: d.campanas.map((c) => ({ id: c.id, nombre: corto(c.nombre, 80), activa: c.activa, vinculadaAMeta: !!c.metaId, devolucionEsperadaPct: c.devolucionPct, pedidos: c.r ? c.r.pedidos : 0, entregados: c.r ? c.r.entregados : 0, pagados: c.r ? c.r.pagados : 0, devueltos: c.r ? c.r.devueltos : 0, enCurso: c.r ? c.r.enCurso : 0, gananciaReal: c.r ? r2(c.r.ganancia) : 0, tasaDevolucionRealPct: c.r ? c.r.tasaDevolucion : null })) }
    },
    async obtener_escalado({ campana_id, presupuesto_diario }) {
      if (!/^\d{1,9}$/.test(String(campana_id))) return { error: 'campaña no válida' }
      const d = await datosEscalado(uid, String(campana_id), { presupuesto: Number(presupuesto_diario) || null }, m)
      if (!d) return { error: 'la campaña no existe o no está vinculada a Meta' }
      if (d.sinDatos) return { error: 'todavía no hay gasto de Meta de esta campaña' }
      const a = d.analisis, b = a.base, esc = (e) => e && ({ presupuestoDiarioSinIva: e.presupuesto, cambioPct: e.cambioPct, probabilidadDeGanarPct: Math.round(e.pGanar * 1000) / 10, peorCasoUnoDeCada20: pesos(e.p5), casoMediano: pesos(e.mediana), mejorCasoUnoDeCada10: pesos(e.p90), probabilidadDePerderMasDelLimitePct: Math.round(e.pPerdidaMayor * 1000) / 10, pedidosPorDia: r2(e.pedidosDia), costoPorPedidoConIva: e.cpa ? r2(e.cpa) : null, sobraEnBilletera: pesos(e.liquidez.libre), retiroPosible: pesos(e.liquidez.retiroResultante), sePuedeHacerYa: e.aprobado, motivosSiNo: e.motivos })
      return { fuente: 'obtener_escalado', TODO_ES_ESTIMADO: true, horizonteDeLasEstimacionesEnDias: a.horizonte, campana: d.campana, presupuestoActualConfirmado: d.confirmado, presupuestoActualDiarioSinIva: b.presupuestoActual, accion: a.accion, recomendado: esc(a.recomendado), objetivoAlcanzable: esc(a.objetivo), techoDeLiquidezDiario: a.techoLiquidez,
        calidadDeLaEvidencia: a.calidad, motivosDeLaCalidad: a.motivosCalidad, riesgoTolerado: { perdidaMaxima7Dias: a.riesgo.perdidaMaxima, probabilidadMinimaDeGanarPct: Math.round(a.riesgo.probGanarMin * 100), probabilidadMaximaDePerderMasDeEsaCifraPct: Math.round(a.riesgo.probPerdidaMax * 100), subidaMaximaPorPasoPct: Math.round(a.riesgo.pasoMax * 100), diasDeEsperaEntreCambios: a.riesgo.esperaDias },
        base: { pedidosPorClicPct: r2(b.crPedidosPorClic * 100), probabilidadDeEntregaPct: r2(b.pEntrega * 100), gananciaPorPedidoEntregado: r2(b.gananciaMedia), costoPorClicSinIva: r2(b.cpc0), elasticidadDelCosto: r2(b.elasticidad), fuenteDeLaElasticidad: b.elasticidadFuente, irregularidadDeLosLotesDePedidos: r2(b.dispersion), costoPorPedidoDeEquilibrio: r2(b.cpaEquilibrio), costoPorPedidoActual: b.cpaActual ? r2(b.cpaActual) : null },
        datos: d.resumen && { diasConPauta: d.resumen.diasConPauta, pedidos: d.resumen.pedidos, entregados: d.resumen.entregados, devueltos: d.resumen.devueltos, clics: d.resumen.clics, ultimoDiaConPauta: d.resumen.ultimoDia },
        escenarios: a.escenarios.map(esc), ruta: a.ruta.map((p) => ({ paso: p.orden, desdeElDia: p.desdeDia, presupuestoDiarioSinIva: p.presupuesto, cambioPct: p.cambioPct, probabilidadDeGanarPct: Math.round(p.pGanar * 1000) / 10 })),
        alertasDeSalida: a.guardas.map((g) => ({ que: g.titulo, umbral: g.umbral, detalle: g.detalle })), reglasDeLaCalculadora: d.reglas ? { veredicto: d.reglas.veredicto, checks: (d.reglas.checks || []).map((x) => ({ regla: x.clave, cumple: x.ok })) } : null }
    },
    async obtener_pedidos() {
      const p = await datosPedidos(uid, m), por = Object.fromEntries(ESTADOS.map((k) => [k, { pedidos: 0, valorDeVenta: 0 }]))
      for (const x of p.lista) { const t = por[x.contable]; if (t) { t.pedidos++; t.valorDeVenta = r2(t.valorDeVenta + (x.total || 0)) } }
      return { fuente: 'obtener_pedidos', totalPedidos: p.lista.length, creadosHoy: p.hoy, porEstado: por, nota: 'El valor de venta es lo que paga el cliente, no la ganancia.' }
    },
    async obtener_avisos() {
      const b = await datosCortes(uid, m), c = b.cortes[0]
      return { fuente: 'obtener_avisos', corte: { desde: c.desde, hasta: c.hasta }, avisos: c.chequeos.map((x) => ({ tipo: x.tono, titulo: corto(x.titulo), detalle: corto(x.detalle) })) }
    },
    async buscar_glosario({ termino }) {
      const t = String(termino || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').slice(0, 60), sin = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      const r = Object.entries(GLOSARIO).filter(([k, g]) => t && (sin(g.titulo).includes(t) || sin(k).includes(t) || sin(g.corto).includes(t))).slice(0, 3).map(([, g]) => ({ termino: g.titulo, definicion: g.corto, detalle: g.largo || null, formula: g.formula || null }))
      return r.length ? { fuente: 'buscar_glosario', resultados: r } : { fuente: 'buscar_glosario', resultados: [], nota: 'No hay una definición con ese nombre en el glosario.' }
    },
  }
  return {
    defs: DEFINICIONES,
    async ejecutar(nombre, entrada) {
      const f = impl[nombre]
      if (!f) return { error: 'herramienta desconocida' }
      try { return await f(entrada || {}) } catch (e) { console.error('[ia] herramienta', nombre, e && (e.code || e.name), String((e && e.message) || '').slice(0, 160)); return { error: 'no se pudo obtener ese dato' } }
    },
  }
}
