import { crearPagina } from '@/components/shell/crearPagina'
import Herramientas from '@/components/Herramientas'
import ConexionMeta from '@/components/ConexionMeta'
import CorteMes from '@/components/CorteMes'
import RepartoConfig from '@/components/RepartoConfig'
import { repartoDe } from '@/lib/reparto'
import { corteDia } from '@/lib/corte'
import { datosHerramientas } from '@/lib/datos'
import { usuarioActual } from '@/lib/sesion'

export const metadata = { title: 'Configuración · DropFlexAds Ops' }
export default crearPagina('/configuracion', {
  '': () => <ConexionMeta />,
  reparto: async () => { const r = await repartoDe(await usuarioActual()); return <RepartoConfig inicial={r.destinos} propio={r.propio} /> },
  corte: async () => <CorteMes dia={await corteDia(await usuarioActual())} />,
  herramientas: async () => <Herramientas lista={await datosHerramientas(await usuarioActual())} />,
})
