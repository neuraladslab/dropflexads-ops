'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { SECCIONES } from './nav'
import { Icono } from './Icono'
import Paleta from './Paleta'
import { AsistenteFlotante } from '@/components/ia/AsistenteFlotante'
import SincronizarBarra from './SincronizarBarra'

const activo = (pathname, href) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/'))
const ls = {
  get: (k) => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k, v) => { try { localStorage.setItem(k, v) } catch { /* sin almacenamiento: no pasa nada */ } },
}

export default function AppShell({ email, empresa, esSuperadmin, children }) {
  const pathname = usePathname()
  const router = useRouter()
  const [min, setMin] = useState(false)
  const [nivel, setNivel] = useState('learner')
  const [paleta, setPaleta] = useState(false)
  const [menu, setMenu] = useState(false)
  const [saliendo, setSaliendo] = useState(false)
  const [cuentas, setCuentas] = useState(null) // otras cuentas abiertas en este navegador
  const [trabajando, setTrabajando] = useState('')
  const menuRef = useRef(null)

  // Preferencias de este navegador: menú minimizado y nivel de ayuda (Aprendiz / Avanzado).
  /* eslint-disable react-hooks/set-state-in-effect -- se lee en el cliente tras hidratar para que el HTML del servidor coincida */
  useEffect(() => {
    setMin(ls.get('ops-side-min') === '1')
    const n = ls.get('ops-level') === 'pro' ? 'pro' : 'learner'
    setNivel(n)
    document.body.dataset.level = n
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */
  const cambiarNivel = (n) => { setNivel(n); document.body.dataset.level = n; ls.set('ops-level', n) }
  const alternarMenu = () => setMin((v) => { ls.set('ops-side-min', v ? '0' : '1'); return !v })

  // ⌘K / Ctrl+K abre la búsqueda.
  useEffect(() => {
    const f = (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaleta((v) => !v) } }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [])
  useEffect(() => {
    if (!menu) return
    const f = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenu(false) }
    document.addEventListener('mousedown', f)
    return () => document.removeEventListener('mousedown', f)
  }, [menu])

  // Al abrir el menú se leen las demás cuentas abiertas en este navegador (nunca trae tokens).
  useEffect(() => {
    if (!menu) return
    let vivo = true
    fetch('/api/auth/cuentas').then((r) => (r.ok ? r.json() : null)).then((d) => { if (vivo && d) setCuentas(d.otras) }).catch(() => {})
    return () => { vivo = false }
  }, [menu])

  const salir = useCallback(async () => {
    setSaliendo(true)
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' })
      const d = await res.json().catch(() => ({}))
      if (d.siguiente) { window.location.assign('/'); return } // quedaba otra cuenta abierta: pasa a ser la activa (recarga completa, sin datos de la anterior)
    } catch { /* igual se va al login */ }
    router.replace('/login'); router.refresh()
  }, [router])

  async function cuenta(accion, id) {
    setTrabajando(id)
    try {
      const res = await fetch('/api/auth/cuentas', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: accion, id }) })
      if (!res.ok) throw new Error()
      if (accion === 'switch') window.location.assign('/') // recarga completa: se descarta todo lo de la cuenta anterior
      else setCuentas((l) => (l || []).filter((c) => c.id !== id))
    } catch { setCuentas(null); setMenu(false) } finally { setTrabajando('') }
  }

  return (
    <>
      <a className="skip" href="#view">Saltar al contenido</a>
      <div className={'app' + (min ? ' side-min' : '')} id="app">
        <aside className="side" aria-label="Navegación principal">
          <div className="brand">
            <div className="brand-mark"><Icono n="truck" size={22} /></div>
            <div><div className="brand-name">DropFlexAds</div><div className="brand-sub">{esSuperadmin ? 'Plataforma' : empresa ? empresa.nombre : 'Colombia Ops'}</div></div>
          </div>
          <nav className="nav" aria-label="Secciones">
            {SECCIONES.filter((s) => s.todos || esSuperadmin === !!s.soloSuper).map((s) => (
              <div className="nav-g" role="group" aria-label={s.etiqueta} key={s.id}>
                <div className="nav-l">{s.etiqueta}</div>
                {s.items.map((i) => {
                  const on = activo(pathname, i.href)
                  return (
                    <Link key={i.href} href={i.href} className={'ni' + (on ? ' on' : '')} title={i.titulo} aria-current={on ? 'page' : undefined}>
                      <Icono n={i.icono} size={22} /><span>{i.titulo}</span>
                    </Link>
                  )
                })}
              </div>
            ))}
          </nav>
          <div className="side-foot">Tus datos se guardan en tu propia base de datos. Los cálculos usan datos reales de Dropi y Meta.</div>
        </aside>
        <main className="main">
          <div className="top">
            <button className="side-toggle" onClick={alternarMenu} aria-label={min ? 'Expandir el menú lateral' : 'Minimizar el menú lateral'} aria-expanded={!min} title={min ? 'Expandir menú' : 'Minimizar menú'}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect className="pl-fill" x="3" y="4" width="6" height="16" rx="2" fill="currentColor" stroke="none" />
                <rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 4v16" />
              </svg>
            </button>
            <button className="search" onClick={() => setPaleta(true)} aria-label="Buscar o ir a">
              <Icono n="search" size={18} />
              <span>Buscar pantalla, pedido, campaña…</span>
              <kbd>⌘K</kbd>
            </button>
            <div className="spacer" />
            {!esSuperadmin && empresa && <span className="chip" title="Tu empresa">{empresa.nombre}</span>}
            {!esSuperadmin && <SincronizarBarra />}
            <div className="seg" role="group" aria-label="Nivel de ayuda">
              <button type="button" aria-pressed={nivel === 'learner'} className={nivel === 'learner' ? 'on' : ''} onClick={() => cambiarNivel('learner')}><span className="m-lg">Modo Aprendiz</span><span className="m-sm">Aprendiz</span></button>
              <button type="button" aria-pressed={nivel === 'pro'} className={nivel === 'pro' ? 'on' : ''} onClick={() => cambiarNivel('pro')}>Avanzado</button>
            </div>
            <div ref={menuRef} style={{ position: 'relative' }}>
              <button className="userbtn" onClick={() => setMenu((v) => !v)} aria-haspopup="menu" aria-expanded={menu} aria-label="Cuenta y sesión" title={email}>
                <span aria-hidden="true">{(email || '?').charAt(0).toUpperCase()}</span>
              </button>
              {menu && (
                <div className="pop" role="menu" style={{ position: 'absolute', right: 0, top: 48 }}>
                  <div className="um-mail">{email}</div>
                  {cuentas && cuentas.length > 0 && (
                    <div className="um-cuentas" role="group" aria-label="Otras cuentas abiertas">
                      <div className="um-tit">Otras cuentas abiertas</div>
                      {cuentas.map((c) => (
                        <div className="um-cta" key={c.id}>
                          <button className="um-item" role="menuitem" disabled={!!trabajando} onClick={() => cuenta('switch', c.id)} title={`Cambiar a ${c.email}`}>
                            <span className="um-cta-mail">{c.email}</span>
                            <span className="muted um-cta-sub">{c.esSuperadmin ? 'Superadmin' : c.empresa || 'Cuenta'}</span>
                          </button>
                          <button className="um-x" aria-label={`Cerrar la sesión de ${c.email}`} title="Cerrar esta sesión" disabled={!!trabajando} onClick={() => cuenta('remove', c.id)}><Icono n="x" size={14} /></button>
                        </div>
                      ))}
                    </div>
                  )}
                  <Link className="um-item" role="menuitem" href="/seguridad" onClick={() => setMenu(false)}>Seguridad y dispositivos</Link>
                  <a className="um-item" role="menuitem" href="/login?agregar=1">Agregar otra cuenta</a>
                  <button className="um-item out" role="menuitem" onClick={salir} disabled={saliendo}>{saliendo ? 'Saliendo…' : 'Cerrar sesión'}</button>
                </div>
              )}
            </div>
          </div>
          <div id="view" className="view" tabIndex={-1}>{children}</div>
        </main>
      </div>
      <Paleta abierta={paleta} onCerrar={() => setPaleta(false)} esSuperadmin={esSuperadmin} />
      {!esSuperadmin && <AsistenteFlotante />}
    </>
  )
}
