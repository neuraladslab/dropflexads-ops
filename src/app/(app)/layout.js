import { sesionActual } from '@/lib/sesion'
import AppShell from '@/components/shell/AppShell'
import CambiarClave from '@/components/auth/CambiarClave'

export default async function AppLayout({ children }) {
  const s = await sesionActual()
  // Contraseña inicial puesta por el superadmin: hasta que la cambie no se ve ninguna otra pantalla.
  if (s.mustChange) return <main className="login-wrap"><CambiarClave obligatorio email={s.email} /></main>
  return <AppShell email={s.email} empresa={s.empresa} esSuperadmin={s.esSuperadmin}>{children}</AppShell>
}
