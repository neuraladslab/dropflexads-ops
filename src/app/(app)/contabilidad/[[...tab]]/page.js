import { crearPagina } from '@/components/shell/crearPagina'
import { VistaDinero } from '@/components/datos/VistaDinero'
import { VistaCuandoRecupero } from '@/components/datos/Vistas'
import { datosPeriodo, datosRecuperacion } from '@/lib/datos'
import { usuarioActual } from '@/lib/sesion'

export const metadata = { title: 'Contabilidad · DropFlexAds Ops' }
const uno = (v) => (Array.isArray(v) ? v[0] : v)
// Las 6 pestañas de antes pasaron a 2: «Cortes» reúne ganancia por día, costo por venta, a dónde va la plata y caja (por periodo); «Recuperación» queda aparte (mira todo el tiempo).
export default crearPagina('/contabilidad', {
  '': async (sp) => <VistaDinero d={await datosPeriodo(await usuarioActual(), uno(sp.p))} />,
  recuperacion: async () => <VistaCuandoRecupero d={await datosRecuperacion(await usuarioActual())} />,
}, {
  'costo-por-venta': '/contabilidad', 'a-donde-va-mi-plata': '/contabilidad', caja: '/contabilidad', cortes: '/contabilidad', 'cuando-recupero': '/contabilidad/recuperacion',
})
