import Link from 'next/link'
import { Icono } from '@/components/shell/Icono'

// Aprender → Guía de conexión: paso a paso para dejar una empresa con Dropi y Meta funcionando. Texto estático; solo marca lo que ya está hecho.
// Los nombres de los menús de Dropi y Meta cambian de vez en cuando: si alguno no coincide, busca el equivalente.
function Herramienta({ n, titulo, hecho, resumen, enlace, textoHecho = 'Conectado', children }) {
  return (
    <section className="card gd-paso" aria-labelledby={`gd-${n}`}>
      <div className={'gd-n' + (hecho ? ' ok' : '')} aria-hidden="true">{hecho ? <Icono n="check" size={18} /> : n}</div>
      <div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <b id={`gd-${n}`} style={{ fontSize: 18 }}>{titulo}</b>
            <span className={'chip ' + (hecho ? 'ok' : 'idle')}>{hecho ? textoHecho : 'Pendiente'}</span>
          </div>
          {enlace && <Link className={hecho ? 'btn ghost sm' : 'btn sm'} href={enlace.href}>{enlace.texto}</Link>}
        </div>
        <p className="muted" style={{ fontSize: 14, margin: '6px 0 0' }}>{resumen}</p>
        {children}
      </div>
    </section>
  )
}
const Pasos = ({ titulo, children, abierto }) => (
  <details className="md-flat" style={{ marginTop: 12 }} open={abierto}>
    <summary>{titulo}</summary>
    <ol className="gd-ol">{children}</ol>
  </details>
)

export default function GuiaConexion({ estado, empresa, inicio }) {
  const fin = estado.dropi && estado.meta
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="card">
        <b style={{ fontSize: 18 }}>Deja {empresa ? <>«{empresa}»</> : 'tu empresa'} lista en tres pasos</b>
        <p className="muted" style={{ fontSize: 14, margin: '6px 0 0', maxWidth: 680 }}>Cada empresa usa <b>su propia</b> cuenta de Dropi y <b>su propia</b> cuenta publicitaria de Meta: así la contabilidad no se mezcla. Las claves se guardan cifradas y no vuelven al navegador. {inicio && <>Tu operación empieza en <b>{inicio}</b>: la sincronización de Dropi y de Meta se hace por mes, desde ese inicio y como máximo el mes actual y los 2 anteriores.</>} Los nombres de los menús de Dropi y Meta cambian de vez en cuando; si alguno no coincide, busca el equivalente.</p>
      </div>

      <Herramienta n={1} titulo="Conectar Dropi" hecho={estado.dropi} enlace={{ href: '/cuentas', texto: estado.dropi ? 'Ver conexión' : 'Ir a conectar Dropi' }}
        resumen="Trae los movimientos de la tarjeta, la billetera y el estado real de cada pedido (entregado, devolución…).">
        <Pasos titulo="Paso a paso" abierto={!estado.dropi}>
          <li><b>Usa la cuenta de Dropi de esta empresa.</b> No reutilices la de otra empresa: los pedidos y la billetera de cada una deben estar separados.</li>
          <li><b>Activa el autenticador en Dropi</b> (verificación en dos pasos) desde la seguridad de tu perfil. Al mostrarte el código QR, escanéalo con tu app autenticadora y, si piensas usar el modo automático, pulsa «¿no puedes escanear el código?» y guarda la clave de texto (letras A–Z y números 2–7).</li>
          <li><b>Busca el ID de tu tarjeta.</b> Entra a Dropi en el navegador, abre los movimientos de tu tarjeta, pulsa <b>F12</b> → pestaña <b>Red</b> (Network) y recarga la página. Busca la petición <code>list-card-transactions</code>: su dirección termina en <code>…/car_XXXXXXXX/1/20</code>. Copia lo que empieza por <code>car_</code>.</li>
          <li>Aquí, en <b>Mis cuentas → Dropi</b>, pulsa <b>Conectar Dropi</b> y escribe: el correo y la contraseña de Dropi, el ID de la tarjeta y cómo quieres iniciar sesión (con el código de tu autenticador cuando haga falta, que es lo recomendado, o automático).</li>
          <li>Confirma con <b>la contraseña de esta app</b> y, si la tienes activa, el código de tus dos pasos.</li>
          <li>Pulsa <b>Sincronizar</b> en la barra de arriba (disponible en cualquier pantalla), elige el mes y, si Dropi lo pide, escribe el código de 6 dígitos. Debe aparecer cuántos movimientos de tarjeta, pedidos y de billetera se leyeron. Si Dropi pide código, escríbelo en el momento.</li>
                  </Pasos>
      </Herramienta>

      <Herramienta n={2} titulo="Conectar Meta Ads" hecho={estado.meta} enlace={{ href: '/configuracion', texto: estado.meta ? 'Ver conexión' : 'Ir a conectar Meta' }}
        resumen="Trae el gasto y los resultados de cada campaña y anuncio. Es solo lectura: la app no crea, edita ni pausa nada en tu cuenta.">
        <Pasos titulo="Paso a paso" abierto={!estado.meta}>
          <li><b>Ten la cuenta publicitaria de esta empresa dentro de un portafolio comercial</b> (Business Manager, en <b>business.facebook.com</b>). Cada empresa, su propia cuenta publicitaria.</li>
          <li><b>Copia el ID de la cuenta publicitaria</b>: en el Administrador de anuncios aparece junto al nombre de la cuenta (solo números) y también en la dirección, después de <code>act=</code>.</li>
          <li>Entra a <b>business.facebook.com/settings</b> → <b>Usuarios → Usuarios del sistema → Agregar</b>. El rol «Empleado» basta.</li>
          <li>Con ese usuario seleccionado: <b>Agregar activos → Cuentas publicitarias</b> y elige la cuenta con el permiso solo de <b>ver rendimiento</b>.</li>
          <li>Pulsa <b>Generar token</b>. Elige la app de Meta de tu portafolio (si no tienes una, créala en <b>developers.facebook.com</b> como app de tipo «Empresa» y vincúlala al portafolio) y marca <b>solo</b> el permiso <code>ads_read</code>. Si te deja elegir la caducidad, escoge que no venza.</li>
          <li><b>Copia el token</b> (se muestra una sola vez; empieza por «EAA») y, en <b>Configuración → Cuenta de Meta</b>, pulsa <b>Conectar Meta</b>: pega el ID de la cuenta y el token, y deja el IVA en 19 % si tu cuenta cobra IVA colombiano.</li>
          <li>Confirma con la contraseña de esta app. Luego pulsa <b>Sincronizar</b> en la barra de arriba y elige el mes: se trae el gasto de Meta junto con lo de Dropi.</li>
          <li>Los <b>cobros</b> de Meta no se pueden traer por la API (Meta ya no los entrega). En <b>Mis cuentas → Meta Ads</b> anótalos o impórtalos y ponles su <b>referencia de pago</b> (la del extracto de la tarjeta, «FACEBK *PZ4XV8SWF4») para cruzarlos con la tarjeta de Dropi.</li>
        </Pasos>
      </Herramienta>

      <Herramienta n={3} titulo="Crear la primera campaña" textoHecho="Listo" hecho={estado.pedidos && estado.meta && estado.dropi}
        enlace={{ href: '/campanas', texto: 'Ir a Campañas' }}
        resumen="Agrupa los productos de Dropi de lo que vendes. Con ella se atribuyen los pedidos, el gasto de Meta y los creativos.">
        <Pasos titulo="Paso a paso">
          <li>En <b>Campañas</b>, crea una campaña y elige los productos de Dropi que vendes con ella. Si aún no tienen ventas, agrégalos por su ID de Dropi.</li>
          <li>Registra los creativos (video o imagen) con el nombre único que usarás igual en Meta y en Drive.</li>
          <li>En <b>Configuración</b> ajusta lo propio de esta empresa: herramientas de operación (costos fijos), día del corte, reparto entre socios y, si la quieres, la clave de la IA.</li>
        </Pasos>
      </Herramienta>

      {fin && <div className="tint ok" role="status"><b style={{ color: 'var(--jade-ink)' }}>Dropi y Meta están conectados.</b> Ya puedes ver el Inicio y la Contabilidad de esta empresa.</div>}
    </div>
  )
}
