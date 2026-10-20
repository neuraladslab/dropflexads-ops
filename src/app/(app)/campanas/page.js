import { Pagina } from '@/components/shell/Pagina'
import { itemDe } from '@/components/shell/nav'
import PanelMeta from '@/components/PanelMeta'
import Campanas from '@/components/Campanas'
import SelectorPeriodo from '@/components/datos/SelectorPeriodo'
import { diaCorto } from '@/lib/formato'
import { datosCampanas, periodoElegido } from '@/lib/datos'
import { usuarioActual } from '@/lib/sesion'

export const metadata = { title: 'Campañas · DropFlexAds Ops' }
const uno = (v) => (Array.isArray(v) ? v[0] : v)

// Por defecto se ven todos los pedidos (como siempre); el selector deja mirarlas por corte o por rango (pedidos creados en ese periodo y su gasto de Meta).
export default async function PaginaCampanas({ searchParams }) {
  const uid = await usuarioActual(), sp = await searchParams
  const { per, cortes, hoy, inicio } = await periodoElegido(uid, uno(sp.p) ?? 'todo')
  const rango = per.tipo === 'todo' ? null : { desde: per.desde, hasta: per.hasta }
  return (
    <Pagina item={itemDe('/campanas')}>
      <PanelMeta />
      <SelectorPeriodo cortes={cortes} param={per.param} tipo={per.tipo} desde={per.desde} hasta={per.hasta} hoy={hoy} inicio={inicio} ruta="/campanas" />
      {rango && <p className="muted" style={{ fontSize: 13.5, margin: '-6px 0 14px' }}>Mostrando los pedidos creados del {diaCorto(per.desde)} al {diaCorto(per.hasta)} y el gasto de Meta de esos días.</p>}
      <Campanas d={await datosCampanas(uid, new Map(), rango)} />
    </Pagina>
  )
}
