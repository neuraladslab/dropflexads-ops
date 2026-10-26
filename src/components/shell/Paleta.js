'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Icono } from './Icono'
import { ITEMS } from './nav'

/** Destinos de la paleta: cada sección y cada una de sus pestañas. */
const DESTINOS = ITEMS.flatMap((i) => (i.tabs
  ? i.tabs.map((t) => ({ href: t.slug ? `${i.href}/${t.slug}` : i.href, titulo: t.titulo, seccion: i.titulo, icono: i.icono }))
  : [{ href: i.href, titulo: i.titulo, seccion: i.desc, icono: i.icono, soloSuper: !!i.soloSuper, todos: !!i.todos }]))

const sinTildes = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function Paleta({ abierta, onCerrar, esSuperadmin }) {
  return abierta ? <PaletaAbierta onCerrar={onCerrar} esSuperadmin={esSuperadmin} /> : null // al abrir se monta de nuevo: búsqueda y selección parten de cero
}

function PaletaAbierta({ onCerrar, esSuperadmin }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const input = useRef(null)
  const lista = useMemo(() => {
    const k = sinTildes(q.trim())
    return DESTINOS.filter((d) => (d.todos || !!d.soloSuper === !!esSuperadmin) && (!k || sinTildes(d.titulo + ' ' + d.seccion).includes(k)))
  }, [q, esSuperadmin])

  useEffect(() => { input.current && input.current.focus() }, [])
  const listaRef = useRef(null)
  useEffect(() => { const el = listaRef.current && listaRef.current.querySelector('.pal-i.on'); if (el) el.scrollIntoView({ block: 'nearest' }) }, [sel])

  const ir = (d) => { onCerrar(); router.push(d.href) }
  const tecla = (e) => {
    if (e.key === 'Escape') onCerrar()
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((v) => Math.min(v + 1, lista.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((v) => Math.max(v - 1, 0)) }
    else if (e.key === 'Enter' && lista[sel]) ir(lista[sel])
  }
  return (
    <div className="pal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onCerrar() }}>
      <div className="pal" role="dialog" aria-label="Buscar o ir a" onKeyDown={tecla}>
        <input id="palq" ref={input} type="search" placeholder="Ir a… (Contabilidad, Pedidos, Caja, Calculadora)" value={q} onChange={(e) => { setQ(e.target.value); setSel(0) }} aria-label="Buscar o ir a" />
        <div className="pal-list" role="listbox" ref={listaRef}>
          {lista.length === 0 && <p className="empty-note" style={{ padding: 14 }}>No encontré nada con ese texto.</p>}
          {lista.map((d, i) => (
            <button key={d.href} type="button" role="option" aria-selected={i === sel} className={'pal-i' + (i === sel ? ' on' : '')} onMouseEnter={() => setSel(i)} onClick={() => ir(d)}>
              <Icono n={d.icono} size={20} /><span>{d.titulo}</span><small>{d.seccion}</small>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
