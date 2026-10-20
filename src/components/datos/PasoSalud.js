'use client'

import { useEffect, useRef } from 'react'

// Un paso de «¿Por qué este monto?». En escritorio se ve siempre abierto (como antes); en el celular se pliega y deja ver solo el título y su resultado, para no aglomerar la pantalla.
export default function PasoSalud({ n, titulo, nota, resultado, children }) {
  const ref = useRef(null)
  useEffect(() => { if (ref.current && window.matchMedia('(max-width: 720px)').matches) ref.current.open = false }, [])
  return (
    <details ref={ref} className="sal-paso" open>
      <summary>
        <i>{n}</i><span className="sal-paso-t">{titulo}</span>
        {nota && <span className="sal-paso-n">{nota}</span>}
        {resultado && <b className="sal-paso-r">{resultado}</b>}
      </summary>
      <div className="sal-paso-c">{children}</div>
    </details>
  )
}
