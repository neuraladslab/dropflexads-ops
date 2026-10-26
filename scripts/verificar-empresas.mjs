// Comprueba el aislamiento entre empresas y los límites del superadmin contra la base de DESARROLLO: crea una empresa temporal con dos administradores
// y un superadmin temporal, prueba los accesos y lo borra todo al terminar. Uso: npm run verificar:empresas   (NO la corras contra producción)
import sql from '../src/lib/db.js'
import { createSession, loadSession } from '../src/lib/auth/session.js'
import { crearEmpresa, crearAdmin, cambiarEstado, cambiarClaveAdmin, cambiarEstadoAdmin, listarEmpresas, listarAdmins } from '../src/lib/empresas.js'
import { inicioConfigurado, inicioOperacion } from '../src/lib/inicio.js'
import { guard } from '../src/lib/http.js'
import { NextRequest } from 'next/server'

let fallos = 0
const chequea = (nombre, ok, detalle = '') => { console.log((ok ? '✔' : '✖') + ' ' + nombre + (detalle ? ' · ' + detalle : '')); if (!ok) fallos++ }
let empId, superId
const usuarios = []
try {
  [{ id: superId }] = await sql`INSERT INTO users (email, password_hash, role) VALUES ('tmp-super@example.com', 'x', 'superadmin') RETURNING id`
  usuarios.push(superId)
  const creada = await crearEmpresa(superId, { nombre: 'Empresa Prueba Temp', email: 'tmp-admin1@example.com' })
  empId = creada.empresaId
  chequea('la contraseña inicial se genera sola (16 caracteres en 4 grupos)', /^([A-Za-z0-9]{4}-){3}[A-Za-z0-9]{4}$/.test(creada.clave))
  chequea('la contraseña generada es aleatoria (dos altas distintas)', creada.clave !== (await crearAdmin(empId, { email: 'tmp-extra@example.com' })).clave)
  const [{ owner_id: owner }] = await sql`SELECT owner_id FROM companies WHERE id = ${empId}`
  usuarios.push(owner)
  const mesActual = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 7)
  chequea('una empresa nueva empieza el día 1 del mes de registro', (await inicioConfigurado(owner)) && (await inicioOperacion(owner)) === mesActual + '-01', await inicioOperacion(owner))
  chequea('Portal x conserva el suyo', await inicioConfigurado((await sql`SELECT owner_id FROM companies WHERE lower(name) = 'portal x'`)[0].owner_id))
  await crearAdmin(empId, { email: 'tmp-admin2@example.com' })
  const [{ id: admin2 }] = await sql`SELECT id FROM users WHERE email = 'tmp-admin2@example.com'`
  const [{ id: extra }] = await sql`SELECT id FROM users WHERE email = 'tmp-extra@example.com'`
  usuarios.push(admin2, extra)

  const a1 = await loadSession((await createSession(owner, 'test')).token)
  const a2 = await loadSession((await createSession(admin2, 'test')).token)
  chequea('los dos administradores ven los mismos datos', a1.ownerId === owner && a2.ownerId === owner, `owner ${owner}`)
  chequea('un administrador no es superadmin', !a1.esSuperadmin)
  const sa = await loadSession((await createSession(superId, 'test')).token)
  chequea('el superadmin no tiene empresa ni datos de empresa', sa.esSuperadmin && sa.empresa === null && sa.ownerId !== owner)

  const lista = await listarEmpresas()
  chequea('la lista de empresas solo trae datos de administración', Object.keys(lista[0]).sort().join() === 'activa,admins,creada,id,nombre')
  chequea('lista los administradores', (await listarAdmins(empId)).length === 3)

  // El superadmin solo puede llamar a /api/empresas y /api/auth; a lo demás, 403.
  const llamar = (path, ses) => guard(async () => Response.json({ ok: 1 }))(new NextRequest('http://x' + path, { method: 'GET', headers: { origin: 'http://x', host: 'x', cookie: `dfa_session=${ses}` } }), {})
  const tok = (await createSession(superId, 'test')).token
  chequea('superadmin → /api/campanas: 403', (await llamar('/api/campanas', tok)).status === 403)
  chequea('superadmin → /api/dropi: 403', (await llamar('/api/dropi', tok)).status === 403)
  chequea('superadmin → /api/empresas: permitido', (await llamar('/api/empresas', tok)).status === 200)
  const tokA = (await createSession(owner, 'test')).token
  chequea('contraseña inicial sin cambiar: /api/campanas → 403', (await llamar('/api/campanas', tokA)).status === 403)
  chequea('contraseña inicial sin cambiar: puede cambiarla', (await llamar('/api/auth/password', tokA)).status === 200)
  await sql`UPDATE users SET must_change_password = FALSE WHERE id = ${owner}` // lo que hace el cambio de contraseña
  chequea('administrador con contraseña propia → /api/campanas: permitido', (await llamar('/api/campanas', tokA)).status === 200)

  const tok2 = (await createSession(admin2, 'test')).token
  const nueva = await cambiarClaveAdmin(empId, admin2)
  chequea('restablecer devuelve una contraseña automática y exige cambiarla', /^([A-Za-z0-9]{4}-){3}[A-Za-z0-9]{4}$/.test(nueva.clave) && (await sql`SELECT must_change_password m FROM users WHERE id = ${admin2}`)[0].m)
  chequea('nueva contraseña cierra las sesiones del administrador', (await loadSession(tok2)) === null)
  await cambiarEstadoAdmin(empId, admin2, false)
  const rows = await sql`SELECT disabled_at FROM users WHERE id = ${admin2}`
  chequea('deshabilitar a un administrador', !!rows[0].disabled_at)
  let ajeno = ''
  try { await cambiarClaveAdmin(empId, superId) } catch (e) { ajeno = e.message }
  chequea('no se puede tocar a un usuario que no es administrador de la empresa', ajeno !== '', ajeno)

  const m = await createSession(owner, 'test')
  await cambiarEstado(empId, false)
  chequea('empresa desactivada: sus administradores quedan sin acceso', (await loadSession(m.token)) === null)
  let dup = ''
  try { await crearEmpresa(superId, { nombre: 'empresa prueba temp', email: 'otro@example.com' }) } catch (e) { dup = e.message }
  chequea('nombre de empresa repetido se rechaza', dup !== '', dup)
} finally {
  if (empId) await sql`DELETE FROM companies WHERE id = ${empId}`
  if (usuarios.length) await sql`DELETE FROM users WHERE id = ANY(${usuarios})`
  await sql.end()
}
console.log(fallos ? `\n${fallos} comprobación(es) fallaron.` : '\nTodo bien.')
process.exitCode = fallos ? 1 : 0
