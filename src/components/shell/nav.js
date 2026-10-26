// Mapa de navegación (según el diagrama de DropFlexAds Ops). Cada sección tiene pestañas; la primera es la página por defecto.
export const SECCIONES = [
  { id: 'hoy', etiqueta: 'Hoy', items: [
    { href: '/', icono: 'home', titulo: 'Inicio', desc: 'Cuánto puedes retirar, cómo vas en el corte y cuándo recuperas tu inversión' },
  ] },
  { id: 'campanas', etiqueta: 'Campañas', items: [
    { href: '/campanas', icono: 'chart', titulo: 'Campañas', desc: 'Cada campaña con sus pedidos, creativos y cuándo escalar' },
    { href: '/creativos', icono: 'eye', titulo: 'Creativos', desc: 'El nombre único de cada video o imagen (igual en Meta y en Drive), si circula o está apagado y cuál funciona o hay que refrescar' },
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
    { href: '/aprender', icono: 'book', titulo: 'Aprender', desc: 'Qué significa cada cifra y cómo conectar Dropi y Meta paso a paso', tabs: [
      { slug: '', titulo: 'Qué significa cada cifra' },
      { slug: 'conexion', titulo: 'Guía de conexión' },
    ] },
  ] },
  { id: 'cuenta', etiqueta: 'Cuenta', todos: true, items: [
    { href: '/seguridad', icono: 'lock', titulo: 'Seguridad', desc: 'Tu contraseña y los dispositivos desde los que entras con un clic', todos: true },
  ] },
  { id: 'admin', etiqueta: 'Administración', soloSuper: true, items: [
    { href: '/empresas', icono: 'building', titulo: 'Empresas', desc: 'Crea, edita y desactiva empresas y a sus administradores. No ves los datos de ninguna: son de cada empresa', soloSuper: true },
  ] },
  { id: 'config', etiqueta: 'Configuración', items: [
    { href: '/configuracion', icono: 'box', titulo: 'Configuración', desc: 'Cuenta de Meta, desde cuándo empieza tu operación, herramientas mensuales, corte y reparto', tabs: [
      { slug: '', titulo: 'Cuenta de Meta' },
      { slug: 'inicio', titulo: 'Inicio de la operación' },
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
