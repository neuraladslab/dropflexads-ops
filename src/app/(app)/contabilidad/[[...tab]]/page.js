import { crearPagina } from '@/components/shell/crearPagina'

export const metadata = { title: 'Contabilidad · DropFlexAds Ops' }
const fuentes = 'Billetera y tarjeta de Dropi, pedidos de Dropi y gasto de Meta Ads. Total de campañas o por campaña.'
export default crearPagina('/contabilidad', {
  '': { titulo: 'Ganancia por día', queMuestra: 'Lo que ganaste cada día: ganancias de pedidos entregados menos publicidad, devoluciones y costos, y el veredicto de si estás ganando o perdiendo.', fuente: fuentes, fase: 'Fase 4' },
  'costo-por-venta': { titulo: 'Costo por venta', queMuestra: 'Cuánto te cuesta conseguir cada venta (CPA real) frente a lo que te deja cada una.', fuente: fuentes, fase: 'Fase 4' },
  'a-donde-va-mi-plata': { titulo: 'A dónde va mi plata', queMuestra: 'El reparto de lo que sale: Meta (solo lo que cruza por referencia de pago), otros gastos de la tarjeta, devoluciones, comisiones y herramientas.', fuente: fuentes, fase: 'Fase 4' },
  'cuando-recupero': { titulo: 'Cuándo recupero', queMuestra: 'Los pedidos entregados que aún no te pagan y cuándo debería entrar esa plata.', fuente: 'Pedidos y billetera de Dropi.', fase: 'Fase 4' },
  caja: { titulo: 'Caja', queMuestra: 'Cuánto tienes ahora en la billetera y en la tarjeta, y para cuántos días de publicidad alcanza. Nunca en negativo: si no cuadra, te dice qué falta.', fuente: 'Saldo y movimientos reales de Dropi.', fase: 'Fase 4' },
})
