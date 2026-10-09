import { crearPagina } from '@/components/shell/crearPagina'

export const metadata = { title: 'Configuración · DropFlexAds Ops' }
export default crearPagina('/configuracion', {
  '': { titulo: 'Cuenta de Meta', queMuestra: 'La cuenta publicitaria conectada, el IVA que aplica Meta y el token de acceso (guardado cifrado).', fuente: 'Marketing API de Meta.', fase: 'Fase 2' },
  herramientas: { titulo: 'Herramientas de operación', queMuestra: 'Lo que pagas cada mes por herramientas (WhatsApp, IA, etc.). Se reparte por día en la contabilidad.', fuente: 'Lo que registres aquí.', fase: 'Fase 4' },
})
