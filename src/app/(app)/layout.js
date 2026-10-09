import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth/session'
import AppShell from '@/components/shell/AppShell'

export default async function AppLayout({ children }) {
  const s = await getServerSession()
  if (!s) redirect('/login')
  return <AppShell email={s.email}>{children}</AppShell>
}
