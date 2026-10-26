import { crearPagina } from '@/components/shell/crearPagina'
import Aprender from '@/components/Aprender'
import GuiaConexion from '@/components/GuiaConexion'
import { usuarioActual, sesionActual } from '@/lib/sesion'
import { estadoConexiones } from '@/lib/empresas'
import { ventanaSync } from '@/lib/inicio'
import { diaCorto } from '@/lib/formato'

export const metadata = { title: 'Aprender · DropFlexAds Ops' }

export default crearPagina('/aprender', {
  '': () => <Aprender />,
  conexion: async () => {
    const uid = await usuarioActual(), s = await sesionActual(), v = await ventanaSync(uid)
    return <GuiaConexion estado={await estadoConexiones(uid)} empresa={s.empresa && s.empresa.nombre} inicio={v.inicioTexto || `el ${diaCorto(v.inicio)}`} />
  },
})
