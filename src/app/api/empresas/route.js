import { guard, ok, bad, readBody, isId } from '@/lib/http'
import { confirmIdentity } from '@/lib/auth/reauth'
import { logAuthEvent } from '@/lib/auth/session'
import { EmpresaError, cambiarClaveAdmin, cambiarEstado, cambiarEstadoAdmin, crearAdmin, crearEmpresa, listarAdmins, listarEmpresas, renombrarEmpresa } from '@/lib/empresas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const soloSuper = (session) => (session.esSuperadmin ? null : bad('No tienes permiso para esto.', 403))

/** Empresas (solo datos de administración) o, con ?empresa=ID, sus administradores. Nunca devuelve datos de la operación de una empresa. */
export const GET = guard(async (request, _ctx, session) => {
  const no = soloSuper(session); if (no) return no
  const id = new URL(request.url).searchParams.get('empresa')
  if (id !== null) return isId(id) ? ok({ admins: await listarAdmins(Number(id)) }) : bad('Empresa no válida.')
  return ok({ empresas: await listarEmpresas() })
})

/**
 * POST {action} · solo superadmin. Las marcadas † piden tu contraseña de la app (+ código si tienes dos pasos).
 *  · create †      {nombre, email}                                 → crea la empresa y su primer administrador, con contraseña automática (se devuelve UNA vez en `clave`).
 *  · rename        {empresaId, nombre}
 *  · set_active †  {empresaId, activa}                             → desactiva (sus usuarios no entran; no se borra nada) o reactiva.
 *  · add_admin †   {empresaId, email}                              → otro administrador para esa empresa (contraseña automática en `clave`).
 *  · reset_admin † {empresaId, userId}                             → contraseña automática nueva de un administrador (cierra sus sesiones) en `clave`.
 *  · set_admin †   {empresaId, userId, habilitado}                 → deshabilita o rehabilita a un administrador.
 */
export const POST = guard(async (request, _ctx, session) => {
  const no = soloSuper(session); if (no) return no
  const b = (await readBody(request)) || {}
  const SENSIBLES = ['create', 'set_active', 'add_admin', 'reset_admin', 'set_admin']
  try {
    if (b.action === 'rename') {
      if (!isId(b.empresaId)) return bad('Empresa no válida.')
      await renombrarEmpresa(Number(b.empresaId), b.nombre)
      return ok({ ok: true })
    }
    if (!SENSIBLES.includes(b.action)) return bad('Acción no válida.')
    const id = await confirmIdentity(session.userId, b)
    if (id) return bad(id.error, id.status)
    if (b.action === 'create') {
      const r = await crearEmpresa(session.userId, b)
      await logAuthEvent(request, 'company_create', session.userId)
      return ok(r, 201)
    }
    if (!isId(b.empresaId)) return bad('Empresa no válida.')
    const empresaId = Number(b.empresaId)
    if (b.action === 'set_active') {
      if (typeof b.activa !== 'boolean') return bad('Datos no válidos.')
      await cambiarEstado(empresaId, b.activa)
      await logAuthEvent(request, b.activa ? 'company_enable' : 'company_disable', session.userId)
    } else if (b.action === 'add_admin') {
      const r = await crearAdmin(empresaId, b)
      await logAuthEvent(request, 'company_admin_add', session.userId)
      return ok(r, 201)
    } else {
      if (!isId(b.userId)) return bad('Administrador no válido.')
      if (b.action === 'reset_admin') {
        const r = await cambiarClaveAdmin(empresaId, Number(b.userId))
        await logAuthEvent(request, 'company_admin_reset', session.userId)
        return ok(r)
      } else {
        if (typeof b.habilitado !== 'boolean') return bad('Datos no válidos.')
        await cambiarEstadoAdmin(empresaId, Number(b.userId), b.habilitado)
        await logAuthEvent(request, b.habilitado ? 'company_admin_enable' : 'company_admin_disable', session.userId)
      }
    }
    return ok({ ok: true })
  } catch (e) {
    if (e instanceof EmpresaError) return bad(e.message, e.status)
    throw e
  }
})
