import { createHash } from 'node:crypto'
import sql from '@/lib/db'
import { guard, ok, bad, readBody, isDate, maxDate, num, isId } from '@/lib/http'
import { logActivity } from '@/lib/activity'
import { dentroDeOperacion } from '@/domain/ventana.ts'
import { inicioOperacion } from '@/lib/inicio'

export const runtime = 'nodejs'

const FORMATO = 'dropflexads-meta-charges' // el mismo archivo que exporta y lee la calculadora
const MAX_IMPORT = 2000
const clip = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '')
const monto = (v) => num(v, { min: 0.01, max: 1e10 })

function validar(r, hoy) {
  const amount = monto(r && r.amount), reference = clip(r && r.reference, 80), paymentRef = clip(r && r.paymentRef, 24).toUpperCase()
  if (!r || !isDate(r.date) || r.date > hoy || amount == null) return null
  if ((reference && !/^[A-Za-z0-9_-]{1,80}$/.test(reference)) || (paymentRef && !/^[A-Z0-9]{6,24}$/.test(paymentRef))) return null
  const status = r.status === 'failed' ? 'failed' : r.status === 'pending' ? 'pending' : 'paid'
  const vat = clip(r.vatInvoice, 40), last4 = String(r.cardLast4 ?? ''), notes = clip(r.notes, 300)
  // Llave de no-duplicado: la transacción manda; luego la referencia de pago; si no hay ninguna, una huella de los datos.
  const huella = createHash('sha256').update([r.date, amount, status, notes].join('|')).digest('hex').slice(0, 32)
  const key = reference ? 'r:' + reference.toLowerCase() : paymentRef ? 'p:' + paymentRef.toLowerCase() : 'x:' + huella
  return { charged_date: r.date, amount, status, reference: reference || null, payment_ref: paymentRef || null, notes: notes || null, vat_invoice: /^[A-Za-z0-9._-]{1,40}$/.test(vat) ? vat : null, card_last4: /^\d{4}$/.test(last4) ? last4 : null, external_key: key }
}

async function insertar(uid, filas, fuente) {
  let nuevos = 0
  for (const f of filas) {
    try {
      const r = await sql`INSERT INTO meta_charges (owner_id, charged_date, amount, status, reference, payment_ref, notes, vat_invoice, card_last4, external_key, source)
        VALUES (${uid}, ${f.charged_date}, ${f.amount}, ${f.status}, ${f.reference}, ${f.payment_ref}, ${f.notes}, ${f.vat_invoice}, ${f.card_last4}, ${f.external_key}, ${fuente})
        ON CONFLICT DO NOTHING RETURNING id`
      nuevos += r.length
    } catch (e) { if (!(e && e.code === '23505')) throw e } // misma referencia de pago en otro cobro: se omite
  }
  return nuevos
}

/** POST {action:'add', date, amount, reference?, paymentRef?, status?, notes?} · {action:'import', format, charges:[…]} · {action:'set_ref', id, paymentRef} · {action:'delete', ids:[…]} */
export const POST = guard(async (request, _ctx, session) => {
  const uid = session.ownerId, b = await readBody(request)
  if (!b) return bad('Cuerpo de la solicitud inválido.')
  const hoy = maxDate()

  if (b.action === 'add') {
    const f = validar(b, hoy)
    if (!f) return bad('Revisa la fecha (no futura), el valor (mayor a 0) y la referencia (letras y números).')
    if (!(await insertar(uid, [f], 'manual'))) return bad('Ya registraste un cobro con esa referencia.', 409)
    await logActivity(uid, `Registraste un cobro de Meta por $${Math.round(f.amount).toLocaleString('es-CO')}`)
    return ok({ ok: true }, 201)
  }

  if (b.action === 'import') {
    if (b.format !== FORMATO || !Array.isArray(b.charges)) return bad('Este archivo no es una exportación de cobros de Meta.')
    if (!b.charges.length) return bad('El archivo no trae cobros.')
    if (b.charges.length > MAX_IMPORT) return bad(`Máximo ${MAX_IMPORT} cobros por vez.`)
    const inicio = await inicioOperacion(uid), vistos = new Set(), filas = []
    let invalidos = 0, anteriores = 0
    for (const r of b.charges) {
      const f = validar(r, hoy)
      if (!f) { invalidos++; continue }
      if (!dentroDeOperacion(f.charged_date, inicio)) { anteriores++; continue }
      if (vistos.has(f.external_key)) continue
      vistos.add(f.external_key); filas.push(f)
    }
    if (!filas.length) return bad(anteriores ? 'Todos los cobros son anteriores al inicio de tu operación.' : 'Ninguna fila era válida.')
    const nuevos = await insertar(uid, filas, 'archivo')
    if (nuevos) await logActivity(uid, `Importaste ${nuevos} ${nuevos === 1 ? 'cobro' : 'cobros'} de Meta`)
    return ok({ imported: nuevos, skipped: filas.length - nuevos, invalid: invalidos, before: anteriores }, 201)
  }

  if (b.action === 'set_ref') {
    // La referencia de pago («FACEBK *PZ4XV8SWF4» → PZ4XV8SWF4) es la llave para cruzar el cobro con la tarjeta de Dropi. Vacía = quitarla.
    if (!isId(b.id)) return bad('Cobro no válido.')
    const ref = clip(b.paymentRef, 24).toUpperCase()
    if (ref && !/^[A-Z0-9]{6,24}$/.test(ref)) return bad('La referencia son 6 a 24 letras y números (sin espacios ni «FACEBK *»).')
    try {
      const r = await sql`UPDATE meta_charges SET payment_ref = ${ref || null} WHERE owner_id = ${uid} AND id = ${Number(b.id)} RETURNING id`
      if (!r.length) return bad('Ese cobro no existe.', 404)
    } catch (e) { if (e && e.code === '23505') return bad('Esa referencia ya está en otro cobro.', 409); throw e }
    await logActivity(uid, ref ? `Pusiste la referencia ${ref} a un cobro de Meta` : 'Quitaste la referencia de un cobro de Meta')
    return ok({ ok: true })
  }

  if (b.action === 'delete') {
    const ids = Array.isArray(b.ids) ? b.ids.filter(isId).map(Number).slice(0, 500) : []
    if (!ids.length) return bad('No hay cobros seleccionados.')
    const r = await sql`DELETE FROM meta_charges WHERE owner_id = ${uid} AND id IN ${sql(ids)} RETURNING id`
    if (r.length) await logActivity(uid, `Quitaste ${r.length} ${r.length === 1 ? 'cobro' : 'cobros'} de Meta`)
    return ok({ deleted: r.length })
  }
  return bad('Acción no válida.')
})
