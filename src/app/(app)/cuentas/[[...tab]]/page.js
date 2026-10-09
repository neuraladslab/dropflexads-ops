import { crearPagina } from '@/components/shell/crearPagina'

export const metadata = { title: 'Mis cuentas · DropFlexAds Ops' }
export default crearPagina('/cuentas', {
  '': { titulo: 'Dropi · Billetera', queMuestra: 'Conexión con Dropi, botón de sincronizar y los movimientos de la billetera: ganancias por pedido, devoluciones, comisiones y recargas a la tarjeta.', fuente: 'API de Dropi (solo lectura, con tu sesión cifrada).', fase: 'Siguiente paso' },
  'dropi-tarjeta': { titulo: 'Dropi · Tarjeta', queMuestra: 'Movimientos de la tarjeta desde el 21 de septiembre y su cruce con los cobros de Meta por referencia de pago. Lo que no cruza queda como «otros».', fuente: 'API de Dropi.', fase: 'Siguiente paso' },
  'meta-ads': { titulo: 'Meta Ads', queMuestra: 'Gasto diario por campaña, cobros y facturas, y KPIs (CPM, CTR, CPC), todo por la API oficial de Meta en modo lectura.', fuente: 'Marketing API oficial de Meta (proyecto meta-ads).', fase: 'Fase 2' },
})
