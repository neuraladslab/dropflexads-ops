import 'server-only'
import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth/session'

/** Id del usuario de la sesión actual (para páginas de servidor). Sin sesión → login. */
export async function usuarioActual() {
  const s = await getServerSession()
  if (!s) redirect('/login')
  return s.userId
}
