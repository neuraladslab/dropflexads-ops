'use client'

import { useRef } from 'react'

// Código de 6 dígitos del autenticador de Dropi: seis casillas, solo números, avanzan solas, aceptan pegar el código entero («123 456», «123456») y el autocompletado del teléfono.
// `value` es el texto con los dígitos escritos (0 a 6); `onChange` recibe siempre solo dígitos. `onCompleto` se llama al llegar a 6.
export const LARGO_OTP = 6

export default function CodigoOtp({ value, onChange, onCompleto, id = 'otp', etiqueta = 'Código de 6 dígitos', disabled = false, autoFocus = false }) {
  const refs = useRef([])
  const digitos = Array.from({ length: LARGO_OTP }, (_, i) => value[i] || '')

  function poner(texto, desde) {
    const limpio = texto.replace(/\D/g, '')
    if (!limpio) return
    const base = value.slice(0, desde)
    const nuevo = (base + limpio).slice(0, LARGO_OTP)
    onChange(nuevo)
    refs.current[Math.min(nuevo.length, LARGO_OTP - 1)]?.focus()
    if (nuevo.length === LARGO_OTP) onCompleto?.(nuevo)
  }
  function tecla(e, i) {
    if (e.key === 'Backspace') {
      e.preventDefault()
      onChange(value.slice(0, digitos[i] ? i : Math.max(0, i - 1)))
      refs.current[digitos[i] ? i : Math.max(0, i - 1)]?.focus()
    } else if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); refs.current[i - 1]?.focus() }
    else if (e.key === 'ArrowRight' && i < LARGO_OTP - 1) { e.preventDefault(); refs.current[i + 1]?.focus() }
  }

  return (
    <div role="group" aria-label={etiqueta} className="otp">
      {digitos.map((d, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el }}
          id={i === 0 ? id : `${id}-${i + 1}`}
          className={'otp-c' + (d ? ' lleno' : '')}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={LARGO_OTP} // permite pegar el código completo en cualquier casilla; poner() recorta a 6
          aria-label={`Dígito ${i + 1} de ${LARGO_OTP}`}
          value={d}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
          onFocus={(e) => e.target.select()}
          onChange={(e) => poner(d && e.target.value.length === 2 ? e.target.value.replace(d, '') : e.target.value, i)} // con la casilla ya llena, quita el dígito viejo y deja el nuevo
          onKeyDown={(e) => tecla(e, i)}
          onPaste={(e) => { e.preventDefault(); poner(e.clipboardData.getData('text'), 0) }}
        />
      ))}
    </div>
  )
}
