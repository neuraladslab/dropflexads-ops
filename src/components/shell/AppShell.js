'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { SECCIONES } from './nav'

const activo = (pathname, href) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/'))

export default function AppShell({ email, children }) {
  const pathname = usePathname()
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [saliendo, setSaliendo] = useState(false)

  async function salir() {
    setSaliendo(true)
    try { await fetch('/api/auth/logout', { method: 'POST' }) } finally { router.replace('/login'); router.refresh() }
  }

  return (
    <div className="app">
      <aside className={'side' + (abierto ? ' open' : '')} aria-label="Navegación principal">
        <div className="brand">
          <div className="brand-mark">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" />
            </svg>
          </div>
          <div><div className="brand-name">DropFlexAds</div><div className="brand-sub">Ops</div></div>
        </div>
        <nav className="nav">
          {SECCIONES.map((s) => (
            <div className="nav-g" key={s.id}>
              <div className="nav-l">{s.etiqueta}</div>
              {s.items.map((i) => (
                <Link key={i.href} href={i.href} className={'ni' + (activo(pathname, i.href) ? ' on' : '')} aria-current={activo(pathname, i.href) ? 'page' : undefined} onClick={() => setAbierto(false)}>
                  <span className="ni-t">{i.titulo}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="side-foot">
          <div style={{ wordBreak: 'break-all' }}>{email}</div>
          <button className="ni" style={{ marginTop: 8 }} onClick={salir} disabled={saliendo}>{saliendo ? 'Saliendo…' : 'Cerrar sesión'}</button>
        </div>
      </aside>
      <div className="main-wrap">
        <button className="menu-btn" onClick={() => setAbierto((v) => !v)} aria-expanded={abierto} aria-label="Abrir o cerrar el menú">☰ Menú</button>
        <main className="main">{children}</main>
      </div>
    </div>
  )
}
