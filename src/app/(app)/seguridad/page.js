import { Pagina } from '@/components/shell/Pagina'
import { itemDe } from '@/components/shell/nav'
import Seguridad from '@/components/Seguridad'
import { sesionActual } from '@/lib/sesion'

export const metadata = { title: 'Seguridad · DropFlexAds Ops' }

export default async function PaginaSeguridad() {
  const s = await sesionActual()
  return (
    <Pagina item={itemDe('/seguridad')}>
      <Seguridad email={s.email} puedeRecordar={!s.mustChange} />
    </Pagina>
  )
}
