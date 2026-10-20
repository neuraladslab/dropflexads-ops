// «Foto de oro»: guarda el resultado completo de todos los cargadores de datos (solo lectura) para compararlo después de un cambio interno (p. ej. optimizar consultas).
// Uso: node ... scripts/foto-cifras.mjs guardar <archivo>   ·   node ... scripts/foto-cifras.mjs comparar <archivo>
import { writeFileSync, readFileSync } from 'node:fs'
import * as D from '../src/lib/datos.js'

const [modo, archivo] = process.argv.slice(2)
const uid = Number(process.env.USER_ID || 1)
const VOLATIL = new Set(['generado', 'ultimaSync', 'leido', 'hace']) // lo que cambia solo con el reloj
const limpiar = (v) => JSON.parse(JSON.stringify(v, (k, x) => (VOLATIL.has(k) ? undefined : x instanceof Map ? Object.fromEntries(x) : x)))
const foto = {}
for (const [n, f] of Object.entries({
  pedidos: () => D.datosPedidos(uid), campanas: () => D.datosCampanas(uid), tarjeta: () => D.datosTarjeta(uid), tarjetaDropi: () => D.datosTarjetaDropi(uid), billetera: () => D.datosBilletera(uid),
  ganancia: () => D.datosGananciaPorDia(uid), caja: () => D.datosCaja(uid), herramientas: () => D.datosHerramientas(uid), dashboard: () => D.datosDashboard(uid), recuperacion: () => D.datosRecuperacion(uid),
  meta: () => D.datosMeta(uid), cortes: () => D.datosCortes(uid),
})) foto[n] = limpiar(await f())
// Las campañas con su detalle
const camp = foto.campanas.campanas || []
for (const c of camp) foto['campana_' + c.id] = limpiar(await D.datosCampana(uid, c.id))
foto.campana_todos = limpiar(await D.datosCampana(uid, 'todos')); foto.campana_sin = limpiar(await D.datosCampana(uid, 'sin'))

if (modo === 'guardar') { writeFileSync(archivo, JSON.stringify(foto)); console.log('Foto guardada:', Object.keys(foto).length, 'bloques,', JSON.stringify(foto).length, 'bytes'); process.exit(0) }
const antes = JSON.parse(readFileSync(archivo, 'utf8'))
const difs = [], nuevos = []
const comparar = (a, b, ruta) => {
  if (a === undefined && b !== undefined) { nuevos.push(ruta); return } // algo NUEVO (un dato que antes no existía) no es una regresión
  if (typeof a === 'number' && typeof b === 'number') { if (Math.abs(a - b) > 0.005) difs.push(`${ruta}: ${a} → ${b}`); return }
  if (a && b && typeof a === 'object' && typeof b === 'object') { for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) comparar(a[k], b[k], ruta + '.' + k); return }
  if (a !== b) difs.push(`${ruta}: ${JSON.stringify(a)?.slice(0, 60)} → ${JSON.stringify(b)?.slice(0, 60)}`)
}
for (const k of new Set([...Object.keys(antes), ...Object.keys(foto)])) comparar(antes[k], foto[k], k)
if (nuevos.length) console.log(`  (+ ${nuevos.length} datos nuevos que antes no existían, p. ej. ${nuevos.slice(0, 3).join(', ')})`)
console.log(difs.length ? `✗ ${difs.length} diferencias:\n` + difs.slice(0, 25).join('\n') : `✓ NINGÚN dato anterior cambió: ${Object.keys(foto).length} bloques comparados`)
process.exit(difs.length ? 1 : 0)
