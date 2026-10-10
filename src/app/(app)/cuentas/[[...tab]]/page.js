import { crearPagina } from '@/components/shell/crearPagina'
import { Pendiente } from '@/components/shell/Pagina'
import ConexionDropi from '@/components/ConexionDropi'
import { VistaBilletera, VistaTarjeta } from '@/components/datos/Vistas'
import { datosBilletera, datosTarjeta } from '@/lib/datos'
import { usuarioActual } from '@/lib/sesion'

export const metadata = { title: 'Mis cuentas · DropFlexAds Ops' }

// La conexión con Dropi se muestra en las dos pestañas de Dropi (es una sola conexión); debajo, los datos de cada una.
export default crearPagina('/cuentas', {
  '': async () => (<><ConexionDropi /><VistaBilletera d={await datosBilletera(await usuarioActual())} /></>),
  'dropi-tarjeta': async () => (<><ConexionDropi /><VistaTarjeta d={await datosTarjeta(await usuarioActual())} /></>),
  'meta-ads': { titulo: 'Meta Ads', queMuestra: 'Gasto diario por campaña, cobros y facturas, y KPIs (CPM, CTR, CPC), todo por la API oficial de Meta en modo lectura.', fuente: 'Marketing API oficial de Meta (proyecto meta-ads).', fase: 'Fase 2' },
})
