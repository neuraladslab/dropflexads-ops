'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { GLOSARIO } from '@/lib/glosario'

/** Botón «?» con la explicación de un término. En modo Aprendiz muestra la explicación completa; en Avanzado, la definición corta y la fórmula. */
export default function Ayuda({ t, texto, titulo }) {
  const [abierto, setAbierto] = useState(false)
  const ref = useRef(null)
  const g = t ? GLOSARIO[t] : null
  useEffect(() => {
    if (!abierto) return
    const fuera = (e) => { if (ref.current && !ref.current.contains(e.target)) setAbierto(false) }
    const tecla = (e) => { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('mousedown', fuera); document.addEventListener('keydown', tecla)
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', tecla) }
  }, [abierto])
  if (!g && !texto) return null
  const nombre = titulo || (g && g.titulo)
  return (
    <span className="ayuda" ref={ref}>
      <button type="button" className="ayuda-btn" aria-expanded={abierto} aria-label={`Ayuda: ${nombre}`} onClick={() => setAbierto((v) => !v)}>?</button>
      {abierto && (
        <span className="ayuda-pop" role="dialog" aria-label={nombre}>
          <b>{nombre}</b>
          <span>{texto || g.corto}</span>
          {g && g.largo && <span className="only-learner">{g.largo}</span>}
          {g && g.formula && <span className="ayuda-f"><b>Cómo se calcula:</b> {g.formula}</span>}
          {g && <Link href={`/aprender#${t}`} className="link" onClick={() => setAbierto(false)}>Aprender más</Link>}
        </span>
      )}
    </span>
  )
}
