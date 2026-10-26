import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth/session'

// Una sola lectura de la sesión por petición (el layout y la página la piden y cada lectura es una consulta a la base de datos).
const cargar = cache(() => getServerSession())

/** Dueño de los datos de la sesión actual = la empresa con la que se trabaja (para páginas de servidor). Sin sesión → login. */
export async function usuarioActual() {
  const s = await cargar()
  if (!s) redirect('/login')
  if (s.esSuperadmin) redirect('/empresas') // el superadmin no ve datos de empresas
  return s.ownerId
}

/** Sesión completa (usuario real + empresa). Sin sesión → login. */
export async function sesionActual() {
  const s = await cargar()
  if (!s) redirect('/login')
  return s
}
