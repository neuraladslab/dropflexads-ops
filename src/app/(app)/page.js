import { Pagina } from '@/components/shell/Pagina'
import { itemDe } from '@/components/shell/nav'
import { VistaDashboard } from '@/components/datos/Vistas'
import { datosDashboard } from '@/lib/datos'
import { redirect } from 'next/navigation'
import { sesionActual } from '@/lib/sesion'

export const metadata = { title: 'Inicio · DropFlexAds Ops' }

export default async function Dashboard() {
  const s = await sesionActual()
  if (s.esSuperadmin) redirect('/empresas') // el superadmin no tiene Inicio: administra empresas
  return (
    <Pagina item={itemDe('/')}>
      <VistaDashboard d={await datosDashboard(s.ownerId)} />
    </Pagina>
  )
}
