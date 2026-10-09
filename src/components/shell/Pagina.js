import Link from 'next/link'

/** Encabezado de sección con sus pestañas (enlaces: cada pestaña es una URL). */
export function Pagina({ item, slug, children }) {
  return (
    <>
      <div className="pagehead"><div><h1 className="display">{item.titulo}</h1><p>{item.desc}</p></div></div>
      {item.tabs && (
        <div className="seg" role="tablist" style={{ marginBottom: 20, flexWrap: 'wrap' }}>
          {item.tabs.map((t) => (
            <Link key={t.slug} role="tab" aria-selected={t.slug === slug} href={t.slug ? `${item.href}/${t.slug}` : item.href} className={'segl' + (t.slug === slug ? ' on' : '')}>{t.titulo}</Link>
          ))}
        </div>
      )}
      {children}
    </>
  )
}

/** Estado honesto de una pantalla que aún no tiene datos: qué mostrará y de dónde saldrán. */
export function Pendiente({ titulo, queMuestra, fuente, fase }) {
  return (
    <div className="card" style={{ maxWidth: 760 }}>
      <span className="chip idle">En construcción · {fase}</span>
      <h2 style={{ margin: '12px 0 6px', fontSize: 20 }}>{titulo}</h2>
      <p style={{ margin: '0 0 10px' }}>{queMuestra}</p>
      <p className="muted" style={{ margin: 0, fontSize: 14 }}><b>Datos de:</b> {fuente}</p>
    </div>
  )
}
