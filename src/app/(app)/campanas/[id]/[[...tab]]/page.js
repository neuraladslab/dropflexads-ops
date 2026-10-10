import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Pendiente } from '@/components/shell/Pagina'
import { VistaPedidos } from '@/components/datos/Vistas'
import ResultadoCampana from '@/components/ResultadoCampana'
import TarjetaCombos from '@/components/datos/TarjetaCombos'
import { datosCampana } from '@/lib/datos'
import { usuarioActual } from '@/lib/sesion'

export const metadata = { title: 'Campaña · DropFlexAds Ops' }

// Cada campaña tiene sus propias secciones (como en el diagrama): Pedidos, Creativos y Cuándo escalar.
const TABS = [{ slug: '', titulo: 'Pedidos' }, { slug: 'creativos', titulo: 'Creativos' }, { slug: 'escalar', titulo: 'Cuándo escalar' }]

export default async function PaginaCampana({ params }) {
  const { id, tab } = await params
  if (tab && tab.length > 1) notFound()
  const slug = (tab && tab[0]) || ''
  const c = await datosCampana(await usuarioActual(), id)
  if (!c || !TABS.some((t) => t.slug === slug) || (!c.conTabs && slug)) notFound()
  const base = `/campanas/${id}`
  const vacio = <div className="tint blue" style={{ marginBottom: 16 }}><b style={{ color: 'var(--blue)' }}>Esta campaña todavía no tiene pedidos</b><div style={{ fontSize: 14.5, marginTop: 2 }}>Los pedidos aparecen cuando Dropi trae pedidos de {c.productos.length ? 'sus productos' : 'este grupo'}. Sincroniza en Mis cuentas → Dropi.</div></div>

  return (
    <>
      <div className="pagehead">
        <div>
          <Link href="/campanas" className="link" style={{ fontSize: 14 }}>← Campañas</Link>
          <h1 className="display" style={{ marginTop: 6 }}>{c.nombre}</h1>
          {c.productos.length > 0 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>{c.activa === false && <span className="chip idle">Pausada</span>}{c.productos.map((p) => <span key={p.id} className="chip idle">{p.nombre}</span>)}</div>}
          {c.clave === 'sin' && <p className="muted" style={{ marginTop: 6 }}>Pedidos de productos que todavía no están en ninguna campaña.</p>}
          {c.clave === 'todos' && <p className="muted" style={{ marginTop: 6 }}>Todos tus pedidos, de todas las campañas y los que no tienen campaña.</p>}
        </div>
      </div>
      {c.r && <div className="card" style={{ marginBottom: 16 }}><ResultadoCampana r={c.r} /></div>}
      <TarjetaCombos c={c.combos} />
      {c.conTabs && (
        <div className="seg" role="tablist" style={{ marginBottom: 20, flexWrap: 'wrap' }}>
          {TABS.map((t) => <Link key={t.slug} role="tab" aria-selected={t.slug === slug} href={t.slug ? `${base}/${t.slug}` : base} className={'segl' + (t.slug === slug ? ' on' : '')}>{t.titulo}</Link>)}
        </div>
      )}
      {slug === '' && <VistaPedidos d={c.pedidos} ocultarCampana={c.conTabs || c.clave === 'sin'} sinKpis={!!c.r} vacio={vacio} />}
      {slug === 'creativos' && <Pendiente titulo={`Creativos de «${c.nombre}»`} queMuestra="Los anuncios de esta campaña con su nombre estándar, el enlace al archivo y su resultado (alcance, CPA y gasto de cada uno)." fuente="Meta Ads: cada anuncio se une a su campaña." fase="Después de conectar Meta" />}
      {slug === 'escalar' && <Pendiente titulo={`Cuándo escalar «${c.nombre}»`} queMuestra="Si conviene subir el presupuesto de esta campaña y cuánto, según su ROAS de margen, su CPA y los días con datos. Usa las reglas de la calculadora de escalado." fuente="Gasto de Meta de esta campaña y su ganancia real de Dropi." fase="Necesita Meta Ads" />}
    </>
  )
}
