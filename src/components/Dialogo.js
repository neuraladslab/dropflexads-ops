'use client'

import { useEffect } from 'react'
import { createPortal } from 'react-dom'

/** Diálogo modal (mismo marco que los diálogos de la app original). */
export default function Dialogo({ etiqueta, onCerrar, children }) {
  useEffect(() => {
    const f = (e) => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [onCerrar])
  // En el nivel raíz de la página (como los diálogos de la app original): el fondo cubre menú y barra superior.
  return createPortal(
    <div className="pal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onCerrar() }}>
      <div className="pal" role="dialog" aria-label={etiqueta} style={{ padding: 30, maxHeight: '92vh', overflow: 'auto' }}>{children}</div>
    </div>,
    document.body,
  )
}
