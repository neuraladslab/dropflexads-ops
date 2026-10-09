import { notFound } from 'next/navigation'
import { resolverTab } from './nav'
import { Pagina, Pendiente } from './Pagina'

/** Página con pestañas ([[...tab]]): `contenidos` indexa por slug de pestaña; una función puede devolver contenido real en vez del aviso «en construcción». */
export function crearPagina(href, contenidos) {
  return async function PaginaSeccion({ params }) {
    const { tab } = await params
    const r = resolverTab(href, tab)
    if (!r) notFound()
    const c = contenidos[r.tab.slug]
    return <Pagina item={r.item} slug={r.tab.slug}>{typeof c === 'function' ? await c() : <Pendiente {...c} />}</Pagina>
  }
}
