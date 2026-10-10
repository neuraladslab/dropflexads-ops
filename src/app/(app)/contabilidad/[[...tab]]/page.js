import { crearPagina } from '@/components/shell/crearPagina'
import { VistaGananciaDia, VistaCaja, VistaCostoPorVenta, VistaDondeVaMiPlata, VistaCuandoRecupero } from '@/components/datos/Vistas'
import { datosGananciaPorDia, datosCaja, datosRecuperacion } from '@/lib/datos'
import { usuarioActual } from '@/lib/sesion'

export const metadata = { title: 'Contabilidad · DropFlexAds Ops' }
const fuentes = 'Billetera y tarjeta de Dropi, pedidos de Dropi y gasto de Meta Ads. Total de campañas o por campaña.'
export default crearPagina('/contabilidad', {
  '': async () => <VistaGananciaDia d={await datosGananciaPorDia(await usuarioActual())} />,
  'costo-por-venta': async () => <VistaCostoPorVenta d={await datosGananciaPorDia(await usuarioActual())} />,
  'a-donde-va-mi-plata': async () => <VistaDondeVaMiPlata d={await datosGananciaPorDia(await usuarioActual())} />,
  'cuando-recupero': async () => <VistaCuandoRecupero d={await datosRecuperacion(await usuarioActual())} />,
  caja: async () => <VistaCaja d={await datosCaja(await usuarioActual())} />,
})
