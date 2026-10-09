'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

/** Indicador de «datos al día»: según la última sincronización con Dropi. Lleva a Mis cuentas. */
export default function EstadoDatos() {
  const [e, setE] = useState(null)
  useEffect(() => {
    let vivo = true
    fetch('/api/dropi').then((r) => (r.ok ? r.json() : null)).then((d) => { if (vivo) setE(d) }).catch(() => {})
    return () => { vivo = false }
  }, [])
  if (!e) return null
  let tono = 'warn', texto = 'Dropi sin conectar', ms = null
  if (e.connected) {
    ms = e.lastSyncOkAt ? Date.now() - e.lastSyncOkAt : null
    const h = ms == null ? null : ms / 3600e3
    if (h != null && h < 12) { tono = 'ok'; texto = 'Datos al día' } else texto = h == null ? 'Sin sincronizar' : `Última sincronización hace ${h < 48 ? Math.round(h) + ' h' : Math.round(h / 24) + ' días'}`
  }
  return (
    <Link href="/cuentas" className={'dstat ' + tono} title="Ver mis cuentas">
      <span className={'dot ' + (tono === 'ok' ? 'ok' : 'warn')} aria-hidden="true" />
      <span>{texto}</span>
    </Link>
  )
}
