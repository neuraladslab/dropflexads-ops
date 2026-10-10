import { crearPagina } from '@/components/shell/crearPagina'
import Herramientas from '@/components/Herramientas'
import ConexionMeta from '@/components/ConexionMeta'
import { datosHerramientas } from '@/lib/datos'
import { usuarioActual } from '@/lib/sesion'

export const metadata = { title: 'Configuración · DropFlexAds Ops' }
export default crearPagina('/configuracion', {
  '': () => <ConexionMeta />,
  herramientas: async () => <Herramientas lista={await datosHerramientas(await usuarioActual())} />,
})
