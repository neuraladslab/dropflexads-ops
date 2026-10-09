import { Pagina } from '@/components/shell/Pagina'
import { itemDe } from '@/components/shell/nav'
import Calculadora from '@/components/Calculadora'

export const metadata = { title: 'Calculadora · DropFlexAds Ops' }
export default function PaginaCalculadora() {
  return <Pagina item={itemDe('/calculadora')}><Calculadora /></Pagina>
}
