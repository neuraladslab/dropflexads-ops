import { crearPagina } from '@/components/shell/crearPagina'
import { Pendiente } from '@/components/shell/Pagina'
import ConexionDropi from '@/components/ConexionDropi'

export const metadata = { title: 'Mis cuentas · DropFlexAds Ops' }

// La conexión con Dropi se muestra en las dos pestañas de Dropi (es una sola conexión); debajo irá el detalle de cada una.
const conDropi = (pendiente) => () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
    <ConexionDropi />
    <Pendiente {...pendiente} />
  </div>
)

export default crearPagina('/cuentas', {
  '': conDropi({ titulo: 'Movimientos de la billetera', queMuestra: 'Ganancias por pedido, devoluciones, comisiones y recargas a la tarjeta, con el ID del pedido de Dropi.', fuente: 'API de Dropi (solo lectura).', fase: 'Siguiente paso' }),
  'dropi-tarjeta': conDropi({ titulo: 'Movimientos de la tarjeta', queMuestra: 'Movimientos desde el 21 de septiembre y su cruce con los cobros de Meta por referencia de pago. Lo que no cruza queda como «otros».', fuente: 'API de Dropi.', fase: 'Siguiente paso' }),
  'meta-ads': { titulo: 'Meta Ads', queMuestra: 'Gasto diario por campaña, cobros y facturas, y KPIs (CPM, CTR, CPC), todo por la API oficial de Meta en modo lectura.', fuente: 'Marketing API oficial de Meta (proyecto meta-ads).', fase: 'Fase 2' },
})
