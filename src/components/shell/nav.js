// Mapa de navegación (según el diagrama de DropFlexAds Ops). Cada sección tiene pestañas; la primera es la página por defecto.
export const SECCIONES = [
  { id: 'hoy', etiqueta: 'Hoy', items: [
    { href: '/', titulo: 'Dashboard', desc: 'Resumen: ¿gano o pierdo?' },
  ] },
  { id: 'campanas', etiqueta: 'Campañas', items: [
    { href: '/campanas', titulo: 'Campañas', desc: 'Tus campañas y su resultado', tabs: [
      { slug: '', titulo: 'Campañas' },
      { slug: 'pedidos', titulo: 'Pedidos' },
      { slug: 'creativos', titulo: 'Creativos' },
      { slug: 'escalar', titulo: 'Cuándo escalar' },
    ] },
  ] },
  { id: 'dinero', etiqueta: 'Dinero', items: [
    { href: '/contabilidad', titulo: 'Contabilidad', desc: 'Lo que entra y lo que sale, con datos reales', tabs: [
      { slug: '', titulo: 'Ganancia por día' },
      { slug: 'costo-por-venta', titulo: 'Costo por venta' },
      { slug: 'a-donde-va-mi-plata', titulo: 'A dónde va mi plata' },
      { slug: 'cuando-recupero', titulo: 'Cuándo recupero' },
      { slug: 'caja', titulo: 'Caja' },
    ] },
    { href: '/cuentas', titulo: 'Mis cuentas', desc: 'Dropi y Meta, conectados y al día', tabs: [
      { slug: '', titulo: 'Dropi · Billetera' },
      { slug: 'dropi-tarjeta', titulo: 'Dropi · Tarjeta' },
      { slug: 'meta-ads', titulo: 'Meta Ads' },
    ] },
  ] },
  { id: 'herramientas', etiqueta: 'Herramientas', items: [
    { href: '/calculadora', titulo: 'Calculadora', desc: 'Simula tus números antes de montar pauta para asegurar tu rentabilidad.' },
  ] },
  { id: 'config', etiqueta: 'Configuración', items: [
    { href: '/configuracion', titulo: 'Configuración', desc: 'Cuenta de Meta y herramientas mensuales', tabs: [
      { slug: '', titulo: 'Cuenta de Meta' },
      { slug: 'herramientas', titulo: 'Herramientas de operación' },
    ] },
  ] },
]

export const ITEMS = SECCIONES.flatMap((s) => s.items)
export const itemDe = (href) => ITEMS.find((i) => i.href === href)

/** Pestaña pedida en la URL ([[...tab]]) → { item, tab } o null si no existe. */
export function resolverTab(href, partes) {
  const item = itemDe(href)
  if (!item) return null
  const slug = (partes && partes[0]) || ''
  if (partes && partes.length > 1) return null
  const tab = item.tabs.find((t) => t.slug === slug)
  return tab ? { item, tab } : null
}
