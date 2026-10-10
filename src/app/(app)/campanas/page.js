import { Pagina } from '@/components/shell/Pagina'
import { itemDe } from '@/components/shell/nav'
import PanelMeta from '@/components/PanelMeta'
import Campanas from '@/components/Campanas'
import { datosCampanas } from '@/lib/datos'
import { usuarioActual } from '@/lib/sesion'

export const metadata = { title: 'Campañas · DropFlexAds Ops' }

export default async function PaginaCampanas() {
  return (
    <Pagina item={itemDe('/campanas')}>
      <PanelMeta />
      <Campanas d={await datosCampanas(await usuarioActual())} />
    </Pagina>
  )
}
