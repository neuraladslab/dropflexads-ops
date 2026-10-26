'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Icono } from '@/components/shell/Icono'
import Dialogo from '@/components/Dialogo'
import { hace } from '@/lib/formato'

// Superadmin → Empresas. Solo administración: crear, renombrar, activar o desactivar empresas y gestionar a sus administradores.
// Aquí no se ve nada de la operación de una empresa (pedidos, gasto, cuentas): eso es de cada administrador.
async function llamar(body) {
  const res = await fetch('/api/empresas', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'No se pudo completar la acción.')
  return data
}
function Campo({ id, etiqueta, ayuda, ...props }) {
  return (
    <div className="field">
      <label htmlFor={id}>{etiqueta}</label>
      <div className="inp"><input id={id} {...props} /></div>
      {ayuda && <span className="muted" style={{ fontSize: 13, marginTop: 6, display: 'block' }}>{ayuda}</span>}
    </div>
  )
}
/** Confirmación de identidad del superadmin (acciones delicadas). */
function Confirmar({ v, set, prefijo }) {
  return (
    <>
      <hr style={{ border: 0, borderTop: '1px solid var(--line2)', width: '100%' }} />
      <Campo id={`${prefijo}-app`} etiqueta="Tu contraseña de esta app (para confirmar que eres tú)" type="password" autoComplete="current-password" maxLength={128} value={v.appPassword} onChange={set('appPassword')} />
      <Campo id={`${prefijo}-code`} etiqueta="Código de tu app autenticadora (solo si activaste la verificación en dos pasos aquí)" inputMode="numeric" autoComplete="one-time-code" maxLength={20} placeholder="123456" value={v.appCode} onChange={set('appCode')} />
    </>
  )
}
const Acciones = ({ enviando, texto, onCerrar, peligro }) => (
  <div style={{ display: 'flex', gap: 12, marginTop: 20, flexWrap: 'wrap' }}>
    <button className="btn" type="submit" disabled={enviando} style={peligro ? { background: 'var(--coral-ink)' } : undefined}>{texto}</button>
    <button className="btn ghost" type="button" onClick={onCerrar}>Cancelar</button>
  </div>
)
/** Estado de un diálogo con formulario: valores, error y envío en un solo sitio. */
function useForm(inicial, enviar, onListo) {
  const [v, setV] = useState(inicial)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const set = (k) => (e) => setV((p) => ({ ...p, [k]: e.target.value }))
  async function submit(e, validar) {
    e.preventDefault()
    const problema = validar ? validar(v) : ''
    if (problema) { setError(problema); return }
    setError(''); setEnviando(true)
    try { onListo(await enviar(v)) } catch (ex) { setError(ex.message); setEnviando(false) }
  }
  return { v, set, error, enviando, submit }
}

function DialogoNueva({ onCerrar, onListo }) {
  const f = useForm({ nombre: '', email: '', appPassword: '', appCode: '' }, (v) => llamar({ action: 'create', ...v }), (r) => onListo({ ...r, email: f.v.email.trim().toLowerCase(), empresa: f.v.nombre.trim() }))
  const { v, set } = f
  return (
    <Dialogo etiqueta="Nueva empresa" onCerrar={onCerrar}>
      <form onSubmit={(e) => f.submit(e, (x) => (!x.nombre.trim() || !x.email.trim() ? 'Escribe el nombre de la empresa y el correo del administrador.' : !x.appPassword ? 'Escribe tu contraseña de esta app para confirmar que eres tú.' : ''))}>
        <h2 style={{ fontSize: 26 }}>Nueva empresa</h2>
        <p className="muted" style={{ marginTop: 10 }}>Empieza vacía y separada de las demás. Su operación arranca el día 1 del mes en que la crees (no se elige). Su administrador entra con el correo que escribas, conecta <b>su</b> Dropi y <b>su</b> Meta siguiendo la guía de conexión (Aprender → Guía de conexión) y es quien ve y gestiona todos sus datos. Tú no verás nada de su operación.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 18 }}>
          <Campo id="em-nombre" etiqueta="Nombre de la empresa" autoComplete="off" maxLength={80} placeholder="Portal x" value={v.nombre} onChange={set('nombre')} />
          <Campo id="em-mail" etiqueta="Correo del administrador" type="email" autoComplete="off" maxLength={254} value={v.email} onChange={set('email')} />
          <p className="muted" style={{ fontSize: 13.5, margin: 0 }}>La contraseña inicial se genera sola y se te muestra <b>una vez</b> al crear la empresa. El administrador deberá cambiarla al entrar.</p>
          <Confirmar v={v} set={set} prefijo="em" />
          <span className="errm" role="alert">{f.error}</span>
        </div>
        <Acciones enviando={f.enviando} texto={f.enviando ? 'Creando…' : 'Crear empresa'} onCerrar={onCerrar} />
      </form>
    </Dialogo>
  )
}

function DialogoNombre({ empresa, onCerrar, onListo }) {
  const f = useForm({ nombre: empresa.nombre }, (v) => llamar({ action: 'rename', empresaId: empresa.id, nombre: v.nombre }), onListo)
  return (
    <Dialogo etiqueta="Editar empresa" onCerrar={onCerrar}>
      <form onSubmit={(e) => f.submit(e, (x) => (x.nombre.trim().length < 2 ? 'Escribe el nombre de la empresa.' : ''))}>
        <h2 style={{ fontSize: 24 }}>Editar empresa</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 18 }}>
          <Campo id="en-nombre" etiqueta="Nombre de la empresa" autoComplete="off" maxLength={80} value={f.v.nombre} onChange={f.set('nombre')} />
          <span className="errm" role="alert">{f.error}</span>
        </div>
        <Acciones enviando={f.enviando} texto="Guardar" onCerrar={onCerrar} />
      </form>
    </Dialogo>
  )
}

function DialogoEstado({ empresa, onCerrar, onListo }) {
  const activar = !empresa.activa
  const f = useForm({ appPassword: '', appCode: '' }, (v) => llamar({ action: 'set_active', empresaId: empresa.id, activa: activar, ...v }), onListo)
  return (
    <Dialogo etiqueta={activar ? 'Reactivar empresa' : 'Desactivar empresa'} onCerrar={onCerrar}>
      <form onSubmit={(e) => f.submit(e, (x) => (!x.appPassword ? 'Escribe tu contraseña de esta app.' : ''))}>
        <h2 style={{ fontSize: 24 }}>{activar ? `¿Reactivar ${empresa.nombre}?` : `¿Desactivar ${empresa.nombre}?`}</h2>
        <p className="muted" style={{ marginTop: 12 }}>{activar
          ? 'Sus administradores vuelven a poder entrar y se retoma la sincronización diaria.'
          : 'Sus administradores dejan de poder entrar y la sincronización diaria se detiene. No se borra ningún dato: puedes reactivarla cuando quieras.'}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 18 }}>
          <Confirmar v={f.v} set={f.set} prefijo="ee" />
          <span className="errm" role="alert">{f.error}</span>
        </div>
        <Acciones enviando={f.enviando} texto={activar ? 'Reactivar' : 'Desactivar'} onCerrar={onCerrar} peligro={!activar} />
      </form>
    </Dialogo>
  )
}

/** Alta de administrador o contraseña nueva de uno existente. La contraseña se genera sola. */
function DialogoClave({ empresa, admin, onCerrar, onListo }) {
  const f = useForm({ email: '', appPassword: '', appCode: '' },
    (v) => llamar(admin ? { action: 'reset_admin', empresaId: empresa.id, userId: admin.id, appPassword: v.appPassword, appCode: v.appCode } : { action: 'add_admin', empresaId: empresa.id, ...v }),
    (r) => onListo({ ...r, email: admin ? admin.email : f.v.email.trim().toLowerCase(), titulo: admin ? 'Contraseña nueva' : 'Administrador creado' }))
  const { v, set } = f
  return (
    <Dialogo etiqueta={admin ? 'Nueva contraseña' : 'Nuevo administrador'} onCerrar={onCerrar}>
      <form onSubmit={(e) => f.submit(e, (x) => ((!admin && !x.email.trim()) ? 'Escribe el correo.' : !x.appPassword ? 'Escribe tu contraseña de esta app.' : ''))}>
        <h2 style={{ fontSize: 24 }}>{admin ? `Nueva contraseña para ${admin.email}` : `Nuevo administrador de ${empresa.nombre}`}</h2>
        <p className="muted" style={{ marginTop: 12 }}>{admin ? 'Se genera una contraseña nueva y se cierran todas sus sesiones abiertas. Se te muestra una sola vez; debe cambiarla al entrar.' : 'Verá y gestionará los mismos datos que los demás administradores de esta empresa. Su contraseña inicial se genera sola y se te muestra una sola vez.'}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 18 }}>
          {!admin && <Campo id="ea-mail" etiqueta="Correo" type="email" autoComplete="off" maxLength={254} value={v.email} onChange={set('email')} />}
          <Confirmar v={v} set={set} prefijo="ea" />
          <span className="errm" role="alert">{f.error}</span>
        </div>
        <Acciones enviando={f.enviando} texto={admin ? 'Generar contraseña' : 'Crear administrador'} onCerrar={onCerrar} />
      </form>
    </Dialogo>
  )
}

/** La contraseña automática, una sola vez: solo se cierra con el botón (no con Escape ni haciendo clic fuera) para no perderla sin querer. */
function ClaveGenerada({ r, onCerrar }) {
  const [copiada, setCopiada] = useState(false)
  async function copiar() {
    try { await navigator.clipboard.writeText(r.clave); setCopiada(true) } catch { setCopiada(false) }
  }
  return (
    <Dialogo etiqueta={r.titulo} onCerrar={() => {}}>
      <h2 style={{ fontSize: 24 }}>{r.titulo}</h2>
      <p className="muted" style={{ marginTop: 10 }}>{r.empresa ? <>Empresa <b>{r.empresa}</b> creada. </> : null}Entrégale estos datos por un canal seguro. <b>La contraseña no se vuelve a mostrar</b>; si se pierde, genera otra.</p>
      <div className="card" style={{ marginTop: 14, display: 'grid', gap: 10 }}>
        <div><span className="muted" style={{ fontSize: 13 }}>Correo</span><div style={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{r.email}</div></div>
        <div><span className="muted" style={{ fontSize: 13 }}>Contraseña inicial</span><div style={{ fontFamily: 'var(--mono, ui-monospace, monospace)', fontSize: 20, fontWeight: 700, letterSpacing: '.04em', userSelect: 'all', overflowWrap: 'anywhere' }} data-testid="clave">{r.clave}</div></div>
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 18, flexWrap: 'wrap' }}>
        <button className="btn" type="button" onClick={copiar}>{copiada ? 'Copiada ✓' : 'Copiar contraseña'}</button>
        <button className="btn ghost" type="button" onClick={onCerrar}>Ya la guardé, cerrar</button>
      </div>
      <p className="muted" style={{ fontSize: 13, margin: '12px 0 0' }}>Al entrar por primera vez tendrá que cambiarla por una propia.</p>
    </Dialogo>
  )
}

function DialogoHabilitar({ empresa, admin, onCerrar, onListo }) {
  const habilitar = admin.deshabilitado
  const f = useForm({ appPassword: '', appCode: '' }, (v) => llamar({ action: 'set_admin', empresaId: empresa.id, userId: admin.id, habilitado: habilitar, ...v }), onListo)
  return (
    <Dialogo etiqueta={habilitar ? 'Rehabilitar administrador' : 'Deshabilitar administrador'} onCerrar={onCerrar}>
      <form onSubmit={(e) => f.submit(e, (x) => (!x.appPassword ? 'Escribe tu contraseña de esta app.' : ''))}>
        <h2 style={{ fontSize: 24 }}>{habilitar ? `¿Rehabilitar a ${admin.email}?` : `¿Deshabilitar a ${admin.email}?`}</h2>
        <p className="muted" style={{ marginTop: 12 }}>{habilitar ? 'Podrá volver a entrar con su contraseña.' : 'No podrá entrar y se cierran sus sesiones. Los datos de la empresa no se tocan.'}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 18 }}>
          <Confirmar v={f.v} set={f.set} prefijo="eh" />
          <span className="errm" role="alert">{f.error}</span>
        </div>
        <Acciones enviando={f.enviando} texto={habilitar ? 'Rehabilitar' : 'Deshabilitar'} onCerrar={onCerrar} peligro={!habilitar} />
      </form>
    </Dialogo>
  )
}

/** Lista de administradores de una empresa, con sus acciones. */
function Admins({ empresa, onCerrar, onCambio, onClave }) {
  const [admins, setAdmins] = useState(null)
  const [error, setError] = useState('')
  const [sub, setSub] = useState(null)
  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`/api/empresas?empresa=${empresa.id}`)
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'No se pudo cargar.')
      setAdmins(d.admins); setError('')
    } catch (ex) { setError(ex.message) }
  }, [empresa.id])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial desde la API
  useEffect(() => { cargar() }, [cargar])
  const termina = (r) => { setSub(null); setAdmins(null); cargar(); onCambio(); if (r && r.clave) onClave(r) }
  return (
    <Dialogo etiqueta={`Administradores de ${empresa.nombre}`} onCerrar={onCerrar}>
      <h2 style={{ fontSize: 24 }}>Administradores de {empresa.nombre}</h2>
      <p className="muted" style={{ marginTop: 10 }}>Ven y gestionan todos los datos de la empresa. Desde aquí solo creas sus accesos, no ves lo que ellos ven.</p>
      {error && <p className="errm" role="alert">{error}</p>}
      {!admins && !error && <p className="muted">Cargando…</p>}
      {admins && admins.map((a) => (
        <div key={a.id} className="adm-fila">
          <div style={{ minWidth: 0 }}>
            <b style={{ overflowWrap: 'anywhere' }}>{a.email}</b>
            <div className="muted" style={{ fontSize: 13 }}>{a.principal ? 'Principal · ' : ''}{a.dosPasos ? 'con dos pasos' : 'sin dos pasos'}{a.deshabilitado ? ' · deshabilitado' : ''}</div>
          </div>
          <div className="rowbtns">
            <button className="btn ghost sm" onClick={() => setSub({ clave: a })}>Nueva contraseña</button>
            <button className="btn ghost sm" onClick={() => setSub({ estado: a })}>{a.deshabilitado ? 'Rehabilitar' : 'Deshabilitar'}</button>
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 12, marginTop: 20, flexWrap: 'wrap' }}>
        <button className="btn" onClick={() => setSub({ nuevo: true })}><Icono n="plus" size={16} />Nuevo administrador</button>
        <button className="btn ghost" onClick={onCerrar}>Cerrar</button>
      </div>
      {sub && sub.nuevo && <DialogoClave empresa={empresa} onCerrar={() => setSub(null)} onListo={termina} />}
      {sub && sub.clave && <DialogoClave empresa={empresa} admin={sub.clave} onCerrar={() => setSub(null)} onListo={termina} />}
      {sub && sub.estado && <DialogoHabilitar empresa={empresa} admin={sub.estado} onCerrar={() => setSub(null)} onListo={termina} />}
    </Dialogo>
  )
}

export default function Empresas({ lista }) {
  const router = useRouter()
  const [dialogo, setDialogo] = useState(null)
  const termina = (r) => { router.refresh(); setDialogo(r && r.clave ? { clave: { ...r, titulo: r.titulo || 'Empresa creada' } } : null) }

  return (
    <>
      <div className="card" style={{ display: 'flex', gap: '14px 24px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ maxWidth: 640 }}>
          <b style={{ fontSize: 18 }}>{lista.length} {lista.length === 1 ? 'empresa' : 'empresas'}</b>
          <div className="muted" style={{ fontSize: 14, marginTop: 4 }}>Aquí administras la plataforma: creas empresas y a sus administradores. Cada empresa tiene su propia cuenta de Dropi, de Meta, su IA y su contabilidad, que solo ven sus administradores.</div>
        </div>
        <button className="btn" onClick={() => setDialogo({ nueva: true })}><Icono n="plus" size={16} />Nueva empresa</button>
      </div>
      <div className="emp-lista" style={{ marginTop: 16 }}>
        {lista.map((e) => (
          <div key={e.id} className={'card emp-fila' + (e.activa ? '' : ' off')}>
            <div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <b style={{ fontSize: 17 }}>{e.nombre}</b>
                {!e.activa && <span className="chip bad">Desactivada</span>}
              </div>
              <div className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>{e.admins} {e.admins === 1 ? 'administrador' : 'administradores'} · creada {hace(e.creada)}</div>
            </div>
            <div className="rowbtns">
              <button className="btn sm" onClick={() => setDialogo({ admins: e })}>Administradores</button>
              <button className="btn ghost sm" onClick={() => setDialogo({ nombre: e })}>Editar</button>
              <button className="btn ghost sm" onClick={() => setDialogo({ estado: e })}>{e.activa ? 'Desactivar' : 'Reactivar'}</button>
            </div>
          </div>
        ))}
      </div>
      {dialogo && dialogo.nueva && <DialogoNueva onCerrar={() => setDialogo(null)} onListo={termina} />}
      {dialogo && dialogo.nombre && <DialogoNombre empresa={dialogo.nombre} onCerrar={() => setDialogo(null)} onListo={termina} />}
      {dialogo && dialogo.estado && <DialogoEstado empresa={dialogo.estado} onCerrar={() => setDialogo(null)} onListo={termina} />}
      {dialogo && dialogo.admins && <Admins empresa={dialogo.admins} onCerrar={() => setDialogo(null)} onCambio={() => router.refresh()} onClave={(r) => setDialogo({ admins: dialogo.admins, clave: r })} />}
      {dialogo && dialogo.clave && <ClaveGenerada r={dialogo.clave} onCerrar={() => setDialogo(dialogo.admins ? { admins: dialogo.admins } : null)} />}
    </>
  )
}
