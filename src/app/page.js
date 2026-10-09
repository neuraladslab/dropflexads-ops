import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth/session'

// Provisional: el Dashboard («¿gano o pierdo?») se construye en la Fase 4. Por ahora confirma que la sesión funciona.
export default async function Home() {
  const s = await getServerSession()
  if (!s) redirect('/login')
  return <main style={{ padding: 32 }}><h1>DropFlexAds Ops</h1><p>Sesión activa. Aquí irá el Dashboard.</p></main>
}
