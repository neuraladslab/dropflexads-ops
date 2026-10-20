// Mapa de navegación (según el diagrama de DropFlexAds Ops). Cada sección tiene pestañas; la primera es la página por defecto.
export const SECCIONES = [
  { id: 'hoy', etiqueta: 'Hoy', items: [
    { href: '/', icono: 'home', titulo: 'Inicio', desc: 'Cuánto puedes retirar, cómo vas en el corte y cuándo recuperas tu inversión' },
  ] },
  { id: 'campanas', etiqueta: 'Campañas', items: [
    { href: '/campanas', icono: 'chart', titulo: 'Campañas', desc: 'Cada campaña con sus pedidos, creativos y cuándo escalar' },
  ] },
  { id: 'dinero', etiqueta: 'Dinero', items: [
    { href: '/contabilidad', icono: 'coin', titulo: 'Contabilidad', desc: 'Lo que entra, lo que sale y cuánto puedes retirar, por corte', tabs: [
      { slug: '', titulo: 'Cortes' },
      { slug: 'recuperacion', titulo: 'Recuperación' },
    ] },
    { href: '/cuentas', icono: 'wallet', titulo: 'Mis cuentas', desc: 'Dropi y Meta, conectados y al día', tabs: [
      { slug: '', titulo: 'Dropi · Billetera' },
      { slug: 'dropi-tarjeta', titulo: 'Dropi · Tarjeta' },
      { slug: 'meta-ads', titulo: 'Meta Ads' },
    ] },
  ] },
  { id: 'herramientas', etiqueta: 'Herramientas', items: [
    { href: '/calculadora', icono: 'percent', titulo: 'Calculadora', desc: 'Simula tus números antes de montar pauta para asegurar tu rentabilidad.' },
  ] },
  { id: 'aprender', etiqueta: 'Aprender', items: [
    { href: '/aprender', icono: 'book', titulo: 'Aprender', desc: 'Qué significa cada cifra, con ejemplos y cómo usarla para decidir' },
  ] },
  { id: 'config', etiqueta: 'Configuración', items: [
    { href: '/configuracion', icono: 'box', titulo: 'Configuración', desc: 'Cuenta de Meta, herramientas mensuales, corte y reparto', tabs: [
      { slug: '', titulo: 'Cuenta de Meta' },
      { slug: 'herramientas', titulo: 'Herramientas de operación' },
      { slug: 'corte', titulo: 'Corte del mes' },
      { slug: 'reparto', titulo: 'Reparto' },
      { slug: 'ia', titulo: 'Inteligencia artificial' },
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
