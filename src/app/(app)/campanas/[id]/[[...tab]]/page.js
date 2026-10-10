import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Pendiente } from '@/components/shell/Pagina'
import { VistaPedidos, VistaGastoCampana, VistaEscalar, VistaInformeDiario } from '@/components/datos/Vistas'
import PanelMeta from '@/components/PanelMeta'
import ResultadoCampana from '@/components/ResultadoCampana'
import TarjetaCombos from '@/components/datos/TarjetaCombos'
import { datosCampana } from '@/lib/datos'
import { usuarioActual } from '@/lib/sesion'

export const metadata = { title: 'Campaña · DropFlexAds Ops' }

// Cada campaña tiene sus propias secciones (como en el diagrama): Pedidos, Gasto en Meta, Creativos y Cuándo escalar.
const TABS = [{ slug: '', titulo: 'Pedidos' }, { slug: 'informe', titulo: 'Pedidos por día' }, { slug: 'meta', titulo: 'Gasto en Meta' }, { slug: 'creativos', titulo: 'Creativos' }, { slug: 'escalar', titulo: 'Cuándo escalar' }]

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
      {(c.r || c.gasto) && <div className="card" style={{ marginBottom: 16 }}><ResultadoCampana r={c.r} gasto={c.gasto} /></div>}
      <TarjetaCombos c={c.combos} />
      {c.conTabs && (
        <div className="seg" role="tablist" style={{ marginBottom: 20, flexWrap: 'wrap' }}>
          {TABS.map((t) => <Link key={t.slug} role="tab" aria-selected={t.slug === slug} href={t.slug ? `${base}/${t.slug}` : base} className={'segl' + (t.slug === slug ? ' on' : '')}>{t.titulo}</Link>)}
        </div>
      )}
      {slug === '' && c.clave === 'todos' && <><VistaInformeDiario filas={c.informe} /><div style={{ height: 20 }} /></>}
      {slug === '' && <VistaPedidos d={c.pedidos} ocultarCampana={c.conTabs || c.clave === 'sin'} sinKpis={!!c.r} vacio={vacio} />}
      {slug === 'informe' && <VistaInformeDiario filas={c.informe} nombre={c.nombre} />}
      {slug === 'meta' && <><PanelMeta /><VistaGastoCampana m={c.meta} inicio={c.inicio} /></>}
      {slug === 'creativos' && <Pendiente titulo={`Creativos de «${c.nombre}»`} queMuestra="Los anuncios de esta campaña con su nombre estándar, el enlace al archivo y su resultado (alcance, CPA y gasto de cada uno)." fuente="Meta Ads: cada anuncio se une a su campaña." fase="Después de conectar Meta" />}
      {slug === 'escalar' && <VistaEscalar e={c.escalar} nombre={c.nombre} vinculada={c.meta.vinculada} />}
    </>
  )
}
