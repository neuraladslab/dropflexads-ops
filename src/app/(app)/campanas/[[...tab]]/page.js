import { crearPagina } from '@/components/shell/crearPagina'

export const metadata = { title: 'Campañas · DropFlexAds Ops' }
export default crearPagina('/campanas', {
  '': { titulo: 'Tus campañas', queMuestra: 'Cada campaña con su gasto real en Meta, sus pedidos entregados y devueltos, su ganancia y un veredicto (escalar, vigilar o pausar).', fuente: 'Meta Ads (gasto) y pedidos de Dropi atribuidos por producto.', fase: 'Fase 4' },
  pedidos: { titulo: 'Pedidos', queMuestra: 'Los pedidos del día con su ID de Dropi y su estado real: pagado, sin pagar, devuelto o en curso. Cada pedido se atribuye a una campaña por su producto.', fuente: 'Dropi (estado de cada pedido y billetera) y DropFlex App (vendedor y envíos propios).', fase: 'Fase 3' },
  creativos: { titulo: 'Creativos', queMuestra: 'Tus anuncios con su nombre estándar, el enlace al archivo y su resultado.', fuente: 'Meta Ads.', fase: 'Después de lo esencial' },
  escalar: { titulo: 'Cuándo escalar', queMuestra: 'Para cada campaña, si conviene subir el presupuesto y cuánto, según el ROAS de margen, el CPA y los días con datos.', fuente: 'Gasto de Meta y ganancia real por campaña; las reglas están en la calculadora de escalado.', fase: 'Fase 4' },
})
