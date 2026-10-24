import 'server-only'
// Un producto de Dropi por su ID (el mismo endpoint que usa nueva_version-next: Dropi no tiene listado masivo). Solo se guarda el nombre.
import sql from '@/lib/db'
import { DropiError, dropiRequest, inesperado } from './client'
import { getToken, recordReadFailure } from './session'

/** El «show» puede devolver el producto suelto o envuelto en `objects` / `data`. */
const desenvolver = (j) => (j && typeof j === 'object' ? (j.objects && typeof j.objects === 'object' ? j.objects : j.data && typeof j.data === 'object' ? j.data : j) : null)
const nombreDe = (p) => { for (const k of ['name', 'nombre', 'title']) if (p && typeof p[k] === 'string' && p[k].trim()) return p[k].trim().slice(0, 250); return null }

/** → { id, nombre }. Lanza DropiError. */
export async function agregarProductoPorId(uid, id, { ip = '', otp = '' } = {}) {
  try {
    const token = await getToken(uid, { ip, otp })
    const r = await dropiRequest('GET', `/api/products/productlist/v1/show/?id=${id}`, { token })
    if (r.status === 404) throw new DropiError('unexpected', 'Dropi no tiene un producto con ese ID.')
    if (r.status !== 200) throw inesperado('el producto', r)
    let j
    try { j = JSON.parse(r.text) } catch { throw new DropiError('unexpected', 'Dropi devolvió una respuesta que no se puede leer.') }
    const nombre = nombreDe(desenvolver(j))
    if (!nombre) throw new DropiError('unexpected', 'Dropi no devolvió datos para ese ID de producto.')
    await sql`INSERT INTO dropi_products (owner_id, product_id, name) VALUES (${uid}, ${id}, ${nombre}) ON CONFLICT (owner_id, product_id) DO UPDATE SET name = EXCLUDED.name`
    return { id, nombre }
  } catch (e) {
    await recordReadFailure(uid, e)
    throw e
  }
}
