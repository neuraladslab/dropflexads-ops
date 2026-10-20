import { notFound } from 'next/navigation'
import { Pagina } from '@/components/shell/Pagina'
import { itemDe } from '@/components/shell/nav'
import { InformeCorte } from '@/components/datos/InformeCorte'
import { datosCortes } from '@/lib/datos'
import { usuarioActual } from '@/lib/sesion'

export const metadata = { title: 'Informe de corte · DropFlexAds Ops' }

export default async function PaginaInforme({ params }) {
  const { id } = await params
  if (!/^\d{4}-\d{2}-\d{2}$/.test(id)) notFound()
  const d = await datosCortes(await usuarioActual())
  const i = d.cortes.findIndex((c) => c.id === id)
  if (i < 0) notFound()
  return (
    <Pagina item={itemDe('/contabilidad')} slug="">
      <InformeCorte c={d.cortes[i]} anterior={d.cortes[i + 1] || null} d={d} />
    </Pagina>
  )
}
