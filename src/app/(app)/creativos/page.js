import { Pagina } from '@/components/shell/Pagina'
import { itemDe } from '@/components/shell/nav'
import Creativos from '@/components/Creativos'
import { datosCreativos } from '@/lib/creativos'
import { usuarioActual } from '@/lib/sesion'

export const metadata = { title: 'Creativos · DropFlexAds Ops' }

export default async function PaginaCreativos() {
  const d = await datosCreativos(await usuarioActual())
  return <Pagina item={itemDe('/creativos')}><Creativos d={d} /></Pagina>
}
