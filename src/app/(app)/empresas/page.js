import { notFound } from 'next/navigation'
import { Pagina } from '@/components/shell/Pagina'
import { itemDe } from '@/components/shell/nav'
import Empresas from '@/components/Empresas'
import { sesionActual } from '@/lib/sesion'
import { listarEmpresas } from '@/lib/empresas'

export const metadata = { title: 'Empresas · DropFlexAds Ops' }

export default async function PaginaEmpresas() {
  const s = await sesionActual()
  if (!s.esSuperadmin) notFound()
  return (
    <Pagina item={itemDe('/empresas')}>
      <Empresas lista={await listarEmpresas()} />
    </Pagina>
  )
}
