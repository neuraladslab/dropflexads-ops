// Coherencia de cifras entre pantallas: calcula la MISMA cifra por los distintos caminos del sistema y comprueba que coincida (solo lectura).
// Uso: npm run verificar:cifras        (usa la base de .env.local; USER_ID=1 por defecto)
import * as D from '../src/lib/datos.js'

const uid = Number(process.env.USER_ID || 1)
const r2 = (n) => Math.round(n * 100) / 100, cop = (n) => '$' + Math.round(n).toLocaleString('es-CO')
const suma = (l, f) => l.reduce((a, x) => a + f(x), 0)
let mal = 0
const igual = (nombre, a, b, tol = 1, fmt = cop) => { const ok = Math.abs(a - b) < tol; if (!ok) mal++; console.log((ok ? '  ✓ ' : '  ✗ DIFIERE ') + nombre.padEnd(60) + String(fmt(a)).padStart(14) + '  vs ' + String(fmt(b)).padStart(14)) }
const num = (n) => String(n)
const cierto = (nombre, cond) => { if (!cond) mal++; console.log((cond ? '  ✓ ' : '  ✗ FALLA ') + nombre) }

const m = new Map()
const [dash, cortes, caja, bil, gpd, camp, rec] = await Promise.all([D.datosDashboard(uid), D.datosCortes(uid), D.datosCaja(uid), D.datosBilletera(uid), D.datosGananciaPorDia(uid), D.datosCampanas(uid), D.datosRecuperacion(uid)])
const C = cortes.cortes, ab = C.find((c) => c.abierto) || C[0], s = cortes.salud

console.log('\n[Dinero] la misma ganancia, gasto y neto en todas las pantallas')
igual('Ganancia: Σ cortes  ≡  «Ganancia por día»', suma(C, (c) => c.total.ganancia), gpd.resumen.total.ganancia)
igual('Ganancia: «Ganancia por día»  ≡  Inicio («Recuperaste»)', gpd.resumen.total.ganancia, dash.rec.recuperado)
igual('Ganancia: «Cuándo recupero»  ≡  Inicio', rec.rec ? rec.rec.recuperado : 0, dash.rec.recuperado)
igual('Ganancia: Σ campañas  ≡  «Ganancia por día»', suma(camp.campanas, (c) => (c.r ? c.r.ganancia : 0)) + (camp.sinCampana ? camp.sinCampana.ganancia : 0), gpd.resumen.total.ganancia)
igual('Gastos: Σ cortes  ≡  «Ganancia por día»', suma(C, (c) => c.costos), gpd.resumen.costos)
igual('Gastos: Inicio («Invertiste»)  ≡  Σ cortes', dash.rec.invertido, suma(C, (c) => c.costos))
igual('Neto: Σ cortes  ≡  «Ganancia por día»', suma(C, (c) => c.neto), gpd.resumen.neto)

console.log('\n[Saldos] un solo saldo de billetera y de tarjeta')
igual('Billetera: Caja  ≡  Mis cuentas', caja.billetera, bil.saldo)
igual('Billetera: Mis cuentas  ≡  panel de salud', bil.saldo, s.saldo)
igual('Billetera: panel de salud  ≡  cierre del corte abierto', s.saldo, ab.flujo.saldoCierre)
igual('Tarjeta: Caja  ≡  piso del panel de salud', caja.tarjeta ? caja.tarjeta.monto : 0, s.piso.tarjeta)

console.log('\n[Pedidos] los mismos pedidos y estados')
igual('Pedidos: Inicio  ≡  Σ vendidos de los cortes', dash.pedidos.lista.length, suma(C, (c) => c.pedidos.vendidos.n), 0.5, num)
igual('Pedidos: Inicio  ≡  Σ campañas + sin campaña', dash.pedidos.lista.length, suma(camp.campanas, (c) => (c.r ? c.r.pedidos : 0)) + (camp.sinCampana ? camp.sinCampana.pedidos : 0), 0.5, num)
for (const [k, nombre] of [['pagado', 'Pagados'], ['en_curso', 'En curso'], ['sin_pagar', 'Entregados sin pagar'], ['devuelto', 'Devueltos sin cobrar']]) igual(`${nombre}: Inicio  ≡  Σ cortes`, dash.pedidos.cuenta[k] || 0, suma(C, (c) => c.pedidos.estado[k].n), 0.5, num)

console.log('\n[Corte] cada corte cuadra consigo mismo')
for (const c of C) {
  const sinHerr = c.total.ganancia - c.costos
  igual(`${c.desde}: ganancia − gastos  ≡  neto`, sinHerr, c.neto)
  igual(`${c.desde}: reparto del corte suma exactamente su base`, suma(c.reparto.filas, (f) => f.monto), c.reparto.base, 0.05)
  igual(`${c.desde}: saldo al abrir + entró − salió  ≡  saldo al cerrar`, (c.flujo.saldoApertura ?? 0) + c.flujo.totalEntra - c.flujo.totalSale, c.flujo.saldoCierre ?? 0, 1)
}
igual('Reparto: Σ de todos los cortes  ≡  utilidad acumulada', suma(C, (c) => c.reparto.base), s.utilidadAcumulada)
{ const o = cortes.origen; igual('Paso a paso: Dropi pagó − cada gasto  ≡  ganancia neta acumulada', o.ingresos - o.publicidad - o.devoluciones - o.comisiones - o.otros - o.herramientas, o.neto, 0.05); igual('Paso a paso: ganancia neta  ≡  utilidad acumulada de la salud', o.neto, s.utilidadAcumulada, 0.05) }

console.log('\n[Salud] el retiro recomendado nunca pasa ninguno de sus tres límites')
igual('Apartado + libre  ≡  saldo de la billetera', s.bloqueado + s.libre, s.saldo)
cierto('Retiro ≤ lo que les toca a las socias (menos lo retirado)', s.retiroSeguro <= s.sociasPorRetirar + 0.01)
cierto('Retiro ≤ lo libre en la billetera', s.retiroSeguro <= Math.max(0, s.libre) + 0.01)
cierto('Retiro ≤ la ganancia neta que queda en la operación', s.retiroSeguro <= s.utilidadRetenida + 0.01)
const keyS = (x) => JSON.stringify([x.estado, x.saldo, x.retiroSeguro, x.libre, x.bloqueado, x.proyeccion, x.piso.pauta])
cierto('El panel de hoy y el corte abierto dan exactamente lo mismo', keyS(s) === keyS(ab.billetera))

console.log('\n[Periodos] cualquier forma de partir el tiempo da lo mismo que el total')
const hoyD = cortes.hoy, ini = cortes.inicio, mitad = (() => { const a = Date.parse(ini + 'T12:00:00Z'), b = Date.parse(hoyD + 'T12:00:00Z'); return new Date(Math.floor((a + b) / 2 / 864e5) * 864e5 + 12 * 3600e3).toISOString().slice(0, 10) })()
const sig = (d) => new Date(Date.parse(d + 'T12:00:00Z') + 864e5).toISOString().slice(0, 10)
const [pTodo, pA, pB] = await Promise.all([D.datosPeriodo(uid, 'todo'), D.datosPeriodo(uid, `${ini}_${mitad}`), D.datosPeriodo(uid, `${sig(mitad)}_${hoyD}`)])
igual('«Todo el tiempo»: Entró  ≡  Σ cortes', pTodo.c.total.ganancia, suma(C, (c) => c.total.ganancia))
igual('«Todo el tiempo»: Gastaste  ≡  Σ cortes', pTodo.c.costos, suma(C, (c) => c.costos))
igual('«Todo el tiempo»: Te quedó  ≡  Σ cortes', pTodo.c.neto, suma(C, (c) => c.neto))
igual(`Rango libre en dos mitades (${mitad}): Entró  ≡  todo`, pA.c.total.ganancia + pB.c.total.ganancia, pTodo.c.total.ganancia)
igual('Rango libre en dos mitades: Gastaste  ≡  todo', pA.c.costos + pB.c.costos, pTodo.c.costos)
igual('Rango libre en dos mitades: pedidos vendidos  ≡  todo', pA.c.pedidos.vendidos.n + pB.c.pedidos.vendidos.n, pTodo.c.pedidos.vendidos.n, 0.5, num)
const [cA, cB] = await Promise.all([D.datosCampanas(uid, new Map(), { desde: ini, hasta: mitad }), D.datosCampanas(uid, new Map(), { desde: sig(mitad), hasta: hoyD })])
const nCamp = (x) => suma(x.campanas, (c) => (c.r ? c.r.pedidos : 0)) + (x.sinCampana ? x.sinCampana.pedidos : 0)
igual('Campañas por periodo (dos mitades): pedidos  ≡  todo el tiempo', nCamp(cA) + nCamp(cB), nCamp(camp), 0.5, num)
igual('Campañas por periodo (dos mitades): ganancia  ≡  todo el tiempo', suma(cA.campanas, (c) => (c.r ? c.r.ganancia : 0)) + (cA.sinCampana ? cA.sinCampana.ganancia : 0) + suma(cB.campanas, (c) => (c.r ? c.r.ganancia : 0)) + (cB.sinCampana ? cB.sinCampana.ganancia : 0), suma(camp.campanas, (c) => (c.r ? c.r.ganancia : 0)) + (camp.sinCampana ? camp.sinCampana.ganancia : 0))

console.log(mal ? `\n✗ ${mal} comprobación(es) fallaron: hay cifras incoherentes entre pantallas.` : '\n✓ Todas las cifras son coherentes entre pantallas.')
process.exit(mal ? 1 : 0)
