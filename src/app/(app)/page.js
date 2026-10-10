import { Pagina } from '@/components/shell/Pagina'
import { itemDe } from '@/components/shell/nav'
import { VistaDashboard } from '@/components/datos/Vistas'
import { datosDashboard } from '@/lib/datos'
import { usuarioActual } from '@/lib/sesion'

export const metadata = { title: 'Dashboard · DropFlexAds Ops' }

export default async function Dashboard() {
  return (
    <Pagina item={itemDe('/')}>
      <VistaDashboard d={await datosDashboard(await usuarioActual())} />
    </Pagina>
  )
}
