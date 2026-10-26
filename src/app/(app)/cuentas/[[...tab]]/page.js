import { crearPagina } from '@/components/shell/crearPagina'
import ConexionDropi from '@/components/ConexionDropi'
import { VistaBilletera, VistaTarjeta, VistaMeta } from '@/components/datos/Vistas'
import { datosBilletera, datosTarjeta, datosMeta } from '@/lib/datos'
import { usuarioActual } from '@/lib/sesion'

export const metadata = { title: 'Mis cuentas · DropFlexAds Ops' }

// La conexión con Dropi se muestra en las dos pestañas de Dropi (es una sola conexión); debajo, los datos de cada una.
export default crearPagina('/cuentas', {
  '': async () => (<><ConexionDropi /><VistaBilletera d={await datosBilletera(await usuarioActual())} /></>),
  'dropi-tarjeta': async () => (<><ConexionDropi /><VistaTarjeta d={await datosTarjeta(await usuarioActual())} /></>),
  'meta-ads': async () => <VistaMeta d={await datosMeta(await usuarioActual())} />,
}, { guia: '/aprender/conexion' }) // la guía de conexión ahora vive en Aprender (el enlace viejo sigue funcionando)
