import 'server-only'
// Creativos: arma la pantalla con los creativos del usuario y el gasto por anuncio que ya trajo Meta. Solo lectura del gasto; los creativos los escribe la persona.
import sql from '@/lib/db'
import { hoyBogota } from '@/domain/fechas.ts'
import { leerCreativo, referenciaDe, llaveNombre, ESTADOS } from '@/domain/creativos.ts'

const num = (v) => Number(v) || 0
const r2 = (n) => Math.round(n * 100) / 100
const SIN_TABLA = '42P01' // Postgres: la tabla no existe (falta correr la migración)

/** → { sinMigracion } | { hoy, campanas, creativos[], resumen{porAngulo, porFormato}, sinEnlazar[], angulosPorCampana, conteo }.
 *  Con `campanaId` solo trae los creativos (y los anuncios sin enlazar) de esa campaña: la lectura sigue comparándose con todos los de la campaña. */
export async function datosCreativos(uid, { campanaId = null } = {}) {
  let cr, dias
  try {
    ;[cr, dias] = await Promise.all([
      sql`SELECT id, campaign_id, campaign_label, angle, format, version, made_on::text AS made_on, name, status, status_changed_at, drive_url, hook, notes, meta_ad_id, created_at FROM creatives WHERE owner_id = ${uid} ORDER BY created_at DESC, id DESC`,
      sql`SELECT day::text AS day, meta_ad_id, ad_name, adset_id, adset_name, meta_campaign_id, spend, impressions, clicks, purchases FROM meta_ad_spend_daily WHERE owner_id = ${uid} AND day >= (CURRENT_DATE - 365)`,
    ])
  } catch (e) {
    if (e && e.code === SIN_TABLA) return { sinMigracion: true }
    throw e
  }
  const camp = await sql`SELECT id, name, active, meta_campaign_id FROM campaigns WHERE owner_id = ${uid} ORDER BY active DESC, name`
  const hoy = hoyBogota()

  // Gasto por anuncio, agrupado por id de anuncio y por nombre (el nombre es la llave principal; el id sirve para enlaces manuales).
  const porAd = new Map()
  for (const d of dias) {
    const a = porAd.get(d.meta_ad_id) || { id: d.meta_ad_id, nombre: d.ad_name || '', metaCamp: d.meta_campaign_id, ultimoDia: d.day, gasto: 0, dias: [], conjunto: null }
    if (d.day >= a.ultimoDia) { a.ultimoDia = d.day; a.nombre = d.ad_name || a.nombre }
    if (d.adset_id && (!a.conjunto || d.day >= a.conjunto.dia)) a.conjunto = { id: d.adset_id, nombre: d.adset_name || 'Conjunto ' + d.adset_id, dia: d.day }
    a.gasto += num(d.spend)
    a.dias.push({ dia: d.day, gasto: num(d.spend), impresiones: num(d.impressions), clics: num(d.clicks), compras: num(d.purchases) })
    porAd.set(d.meta_ad_id, a)
  }
  const idsPorNombre = new Map()
  for (const a of porAd.values()) { const k = llaveNombre(a.nombre); if (k) idsPorNombre.set(k, [...(idsPorNombre.get(k) || []), a.id]) }
  const diasDe = (c) => {
    const ids = new Set([...(idsPorNombre.get(llaveNombre(c.name)) || []), ...(c.meta_ad_id ? [c.meta_ad_id] : [])])
    const porDia = new Map()
    for (const id of ids) for (const d of (porAd.get(id)?.dias || [])) { const x = porDia.get(d.dia) || { dia: d.dia, gasto: 0, impresiones: 0, clics: 0, compras: 0 }; x.gasto += d.gasto; x.impresiones += d.impresiones; x.clics += d.clics; x.compras += d.compras; porDia.set(d.dia, x) }
    // Conjunto de anuncios: el del anuncio enlazado con gasto más reciente (null si aún no se sincronizó con esa información).
    const conjunto = [...ids].map((id) => porAd.get(id)?.conjunto).filter(Boolean).sort((a, b) => b.dia.localeCompare(a.dia))[0] || null
    return { ids, dias: [...porDia.values()], conjunto: conjunto && { id: conjunto.id, nombre: conjunto.nombre } }
  }
  const unidos = cr.map((c) => ({ c, ...diasDe(c) }))
  const usados = new Set(unidos.flatMap((u) => [...u.ids]))

  // Referencia por campaña: todos los creativos de la misma campaña (los archivados con datos también cuentan como comparación).
  const refPorCamp = new Map()
  for (const k of new Set(unidos.map((u) => u.c.campaign_id ?? 'sin'))) refPorCamp.set(k, referenciaDe(unidos.filter((u) => (u.c.campaign_id ?? 'sin') === k).map((u) => u.dias)))

  const creativos = unidos.map(({ c, dias: dd, conjunto }) => {
    const l = leerCreativo(dd, refPorCamp.get(c.campaign_id ?? 'sin'), c.status, hoy)
    return { id: String(c.id), campanaId: c.campaign_id ? String(c.campaign_id) : null, campana: c.campaign_label, angulo: c.angle, formato: c.format, version: c.version, fecha: c.made_on, nombre: c.name, estado: c.status, estadoDesde: c.status_changed_at, drive: c.drive_url, gancho: c.hook, notas: c.notes, metaAdId: c.meta_ad_id, conjunto, lectura: l }
  })

  // Si se pidió una campaña, todo lo que sigue (resumen, conteos, sin enlazar) es solo de ella.
  const metaDe = campanaId ? (camp.find((c) => String(c.id) === String(campanaId)) || {}).meta_campaign_id || null : null
  const vis = campanaId ? creativos.filter((c) => c.campanaId === String(campanaId)) : creativos
  // Resumen: qué ángulo y qué formato rinde mejor (solo creativos con gasto).
  const agrupar = (clave) => {
    const m = new Map()
    for (const c of vis) {
      const k = clave(c), l = c.lectura, x = m.get(k) || { clave: k, creativos: 0, conDatos: 0, funcionan: 0, refrescar: 0, gasto: 0, clics: 0, impresiones: 0, compras: 0 }
      x.creativos++; if (l.gasto > 0) x.conDatos++; if (l.etiqueta === 'funciona') x.funcionan++; if (l.etiqueta === 'refrescar') x.refrescar++
      x.gasto += l.gasto; x.clics += l.clics; x.impresiones += l.impresiones; x.compras += l.compras; m.set(k, x)
    }
    return [...m.values()].map((x) => ({ ...x, gasto: r2(x.gasto), ctr: x.impresiones ? x.clics / x.impresiones : null, cpc: x.clics ? r2(x.gasto / x.clics) : null, costoCompra: x.compras ? r2(x.gasto / x.compras) : null })).sort((a, b) => b.gasto - a.gasto)
  }
  const sinEnlazar = [...porAd.values()].filter((a) => !usados.has(a.id) && a.gasto > 0 && (!campanaId || (metaDe && a.metaCamp === metaDe))).sort((a, b) => b.ultimoDia.localeCompare(a.ultimoDia)).slice(0, 60).map((a) => ({ id: a.id, nombre: a.nombre, ultimoDia: a.ultimoDia, gasto: r2(a.gasto) }))
  const angulosPorCampana = {}
  for (const c of vis) if (c.campanaId) (angulosPorCampana[c.campanaId] ||= new Set()).add(c.angulo)
  const conteo = Object.fromEntries(Object.keys(ESTADOS).map((k) => [k, vis.filter((c) => c.estado === k).length]))
  return {
    hoy, campanas: camp.filter((c) => !campanaId || String(c.id) === String(campanaId)).map((c) => ({ id: String(c.id), nombre: c.name, activa: c.active })), creativos: vis, sinEnlazar,
    angulosPorCampana: Object.fromEntries(Object.entries(angulosPorCampana).map(([k, v]) => [k, [...v]])), conteo,
    resumen: { porAngulo: agrupar((c) => c.angulo.toUpperCase()), porFormato: agrupar((c) => c.formato) },
    hayGastoPorAnuncio: dias.length > 0,
  }
}
