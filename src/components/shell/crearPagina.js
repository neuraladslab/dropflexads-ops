import { notFound, redirect } from 'next/navigation'
import { resolverTab } from './nav'
import { Pagina, Pendiente } from './Pagina'

/**
 * Página con pestañas ([[...tab]]): `contenidos` indexa por slug de pestaña; una función recibe los parámetros de la URL (?p=…) y devuelve el contenido.
 * `alias` lleva las pestañas que ya no existen a su nueva dirección (así ningún marcador ni enlace guardado se rompe).
 */
export function crearPagina(href, contenidos, alias = {}) {
  return async function PaginaSeccion({ params, searchParams }) {
    const { tab } = await params
    const slug = tab && tab[0]
    if (slug && Object.hasOwn(alias, slug)) redirect(alias[slug])
    const r = resolverTab(href, tab)
    if (!r) notFound()
    const c = contenidos[r.tab.slug]
    const sp = searchParams ? await searchParams : {}
    return <Pagina item={r.item} slug={r.tab.slug}>{typeof c === 'function' ? await c(sp) : <Pendiente {...c} />}</Pagina>
  }
}
