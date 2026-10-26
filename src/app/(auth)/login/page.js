import { redirect } from 'next/navigation'
import LoginForm from '@/components/auth/LoginForm'
import { cookies } from 'next/headers'
import { getServerSession } from '@/lib/auth/session'
import { DEVICE_COOKIE_NAME } from '@/lib/auth/config.mjs'
import { entradas, recordadas } from '@/lib/auth/dispositivos'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Iniciar sesión · DropFlexAds' }

/** Solo se aceptan rutas internas simples (evita redirecciones abiertas: OWASP A01). */
function safeNext(v) {
  if (typeof v !== 'string' || !/^\/(?!\/)[A-Za-z0-9\-._~/%?=&]{0,200}$/.test(v)) return '/'
  // Defensa en profundidad: nada de «..» ni de barras codificadas (%2f, %5c) que algún navegador o proxy interprete distinto.
  if (/\.\.|%2f|%5c/i.test(v) || v.startsWith('/login') || v.startsWith('/api')) return '/'
  return v
}

const NOTICES = {
  expired: 'Tu sesión terminó. Inicia sesión de nuevo.',
  changed: 'Contraseña actualizada. Inicia sesión con la nueva.',
  out: 'Cerraste sesión.',
  idle: 'Cerramos tu sesión por inactividad.',
}

export default async function LoginPage({ searchParams }) {
  const sp = await searchParams
  let session = null
  try {
    session = await getServerSession()
  } catch {
    session = null
  }
  const next = safeNext(sp?.next)
  const agregar = sp?.agregar === '1'
  if (session && !agregar) redirect(next) // con ?agregar=1 se queda: es para abrir otra cuenta sin cerrar la actual
  let recordados = []
  try { recordados = await recordadas(entradas((await cookies()).get(DEVICE_COOKIE_NAME)?.value)) } catch { recordados = [] }
  const notice = NOTICES[typeof sp?.m === 'string' ? sp.m : ''] || ''
  return (
    <main className="login-wrap">
      <LoginForm next={next} notice={notice} agregar={agregar && !!session} recordadas={recordados} />
    </main>
  )
}
