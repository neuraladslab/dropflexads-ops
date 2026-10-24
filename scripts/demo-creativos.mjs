// Datos de PRUEBA para ver la pantalla de Creativos con gasto, conjuntos de anuncios y lecturas. No toca tus creativos reales:
// crea la campaña «DEMO | Prueba creativos» con sus propios creativos y gasto ficticio por anuncio.
// Uso: npm run demo:creativos        (crea; si ya existe lo rehace)
//      npm run demo:creativos -- borrar   (quita todo lo de la prueba)
import { connect } from './_auth-cli.mjs'
import { nombreCreativo } from '../src/domain/creativos.ts'
import { hoyBogota } from '../src/domain/fechas.ts'
import { sumarDias } from '../src/domain/fechas.ts'

const CAMPANA = 'DEMO | Prueba creativos', PREFIJO = 'DEMO-PRUEBA-CREATIVOS%', ADS = '91000000%'
const sql = connect()

async function borrar(uid) {
  await sql`DELETE FROM meta_ad_spend_daily WHERE owner_id = ${uid} AND meta_ad_id LIKE ${ADS}`
  await sql`DELETE FROM creatives WHERE owner_id = ${uid} AND name LIKE ${PREFIJO}`
  await sql`DELETE FROM campaigns WHERE owner_id = ${uid} AND name = ${CAMPANA}`
}

// Cada anuncio: días atrás de inicio y fin, gasto/día, impresiones, CTR inicial y final, compras por día (promedio).
const CONJUNTOS = { A: { id: '91100000001', nombre: 'Intereses 25-45 | Colágeno' }, B: { id: '91100000002', nombre: 'Amplio Colombia' } }
const CASOS = [
  { n: 1, angulo: 'Dolor de articulaciones', formato: 'video', estado: 'circulando', conj: 'A', desde: 12, hasta: 1, gasto: 25000, imp: 3200, ctr: [0.026, 0.025], compras: 1.6 },   // funciona
  { n: 2, angulo: 'Piel firme', formato: 'imagen', estado: 'circulando', conj: 'A', desde: 12, hasta: 1, gasto: 22000, imp: 3000, ctr: [0.018, 0.017], compras: 0.9 },              // regular
  { n: 3, angulo: 'Cansancio y fatiga', formato: 'video', estado: 'circulando', conj: 'B', desde: 12, hasta: 1, gasto: 30000, imp: 3600, ctr: [0.024, 0.009], compras: 0.5 },       // se cansó: refrescar
  { n: 4, angulo: 'Energía natural', formato: 'imagen', estado: 'circulando', conj: 'B', desde: 2, hasta: 1, gasto: 12000, imp: 1800, ctr: [0.02, 0.02], compras: 0 },              // probando
  { n: 5, angulo: 'Piel firme', formato: 'video', estado: 'apagado', conj: 'A', desde: 20, hasta: 8, gasto: 15000, imp: 2400, ctr: [0.012, 0.012], compras: 0.3 },                  // viejo, apagado
  { n: 6, angulo: 'Sueño reparador', formato: 'imagen', estado: 'pausado', conj: null },                                                                                          // sin gasto ni conjunto
]

try {
  const [u] = await sql`SELECT id, email FROM users WHERE disabled_at IS NULL ORDER BY id LIMIT 1`.catch(() => sql`SELECT id, email FROM users ORDER BY id LIMIT 1`)
  if (!u) throw new Error('No hay usuarios.')
  const uid = u.id
  await borrar(uid)
  if (process.argv.includes('borrar')) { console.log('Prueba borrada.'); process.exit(0) }
  const hoy = hoyBogota()
  const [camp] = await sql`INSERT INTO campaigns (owner_id, name, product_ids) VALUES (${uid}, ${CAMPANA}, ${[]}) RETURNING id`
  for (const k of CASOS) {
    const nombre = nombreCreativo({ campana: CAMPANA, angulo: k.angulo, formato: k.formato, version: k.n === 5 ? 1 : 1, fecha: sumarDias(hoy, -(k.desde || 3)) })
    await sql`INSERT INTO creatives (owner_id, campaign_id, campaign_label, angle, format, version, made_on, name, status, drive_url, hook)
              VALUES (${uid}, ${camp.id}, ${CAMPANA}, ${k.angulo}, ${k.formato}, 1, ${sumarDias(hoy, -(k.desde || 3))}, ${nombre}, ${k.estado}, ${'https://drive.google.com/drive/folders/demo'}, ${'Gancho de ejemplo ' + k.n})`
    if (!k.conj) continue
    const dias = []
    const total = k.desde - k.hasta + 1
    for (let i = 0; i < total; i++) {
      const dia = sumarDias(hoy, -(k.desde - i)), t = total > 1 ? i / (total - 1) : 0
      const imp = Math.round(k.imp * (0.9 + ((i * 7) % 5) / 25)), ctr = k.ctr[0] + (k.ctr[1] - k.ctr[0]) * t
      const compras = Math.floor(k.compras) + ((i * 3) % 10 < (k.compras % 1) * 10 ? 1 : 0)
      dias.push({ owner_id: uid, day: dia, meta_ad_id: `${91000000000 + k.n}`, ad_name: nombre, adset_id: CONJUNTOS[k.conj].id, adset_name: CONJUNTOS[k.conj].nombre, meta_campaign_id: '91200000001',
        spend: Math.round(k.gasto * (0.92 + ((i * 5) % 7) / 40)), impressions: imp, clicks: Math.round(imp * ctr), purchases: compras, purchase_value: compras * 89900 })
    }
    await sql`INSERT INTO meta_ad_spend_daily ${sql(dias, 'owner_id', 'day', 'meta_ad_id', 'ad_name', 'adset_id', 'adset_name', 'meta_campaign_id', 'spend', 'impressions', 'clicks', 'purchases', 'purchase_value')}`
  }
  console.log(`Prueba creada para ${u.email}: campaña «${CAMPANA}» con ${CASOS.length} creativos en 2 conjuntos. Ábrela en Creativos. Para quitarla: npm run demo:creativos -- borrar`)
} catch (e) {
  console.error('Error:', e.message); process.exitCode = 1
} finally {
  await sql.end()
}
