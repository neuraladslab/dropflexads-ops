import { Pagina } from '@/components/shell/Pagina'
import { itemDe } from '@/components/shell/nav'
import Aprender from '@/components/Aprender'

export const metadata = { title: 'Aprender · DropFlexAds Ops' }

export default function PaginaAprender() {
  return <Pagina item={itemDe('/aprender')}><Aprender /></Pagina>
}
