// Glosario de DropFlexAds Ops: lo usan los «?» de ayuda de cada pantalla y la sección Aprender. `corto` se ve siempre; `largo` solo en modo Aprendiz.
export const GLOSARIO = {
  ganancia_neta: { titulo: 'Ganancia neta', corto: 'Lo que te queda de verdad: lo que entró por pedidos entregados menos todo lo que gastaste.', largo: 'Cuenta solo plata que ya llegó a tu billetera de Dropi (pedidos entregados y pagados). Un pedido en camino todavía no suma, así que si pautas mucho hoy, la ganancia de hoy puede verse baja aunque las ventas sean buenas.', formula: 'ganancias de pedidos entregados − publicidad − devoluciones − comisiones − otros gastos − herramientas' },
  recuperacion: { titulo: 'Recuperar la inversión', corto: 'El punto en que lo que has recuperado iguala lo que has gastado desde que empezó tu operación.', largo: 'Mientras no lo alcances, estás «en rojo» acumulado. El ritmo se calcula con lo que te quedó por día en la última semana; si es cero o negativo, a ese paso no se recupera.', formula: 'recuperado − invertido (acumulado desde el inicio de la operación)' },
  invertido: { titulo: 'Invertido', corto: 'Todo lo que ha costado tu operación desde el inicio: publicidad, devoluciones, comisiones, otros gastos y herramientas.', formula: 'publicidad + devoluciones + comisiones + otros gastos de la tarjeta + herramientas' },
  recuperado: { titulo: 'Recuperado', corto: 'Las ganancias de pedidos entregados que ya entraron a tu billetera de Dropi.', largo: 'Es plata real, no estimada: sale de los movimientos de la billetera, no de una calculadora.' },
  cpm: { titulo: 'CPM', corto: 'Cuánto pagas por cada mil veces que se muestra tu anuncio.', largo: 'Cuanto más bajo, más barato llegas a la gente. Si sube varios días seguidos suele significar que el anuncio se cansó o que hay más competencia por esa audiencia. Compáralo siempre contra tus propios días anteriores.', formula: 'gasto ÷ impresiones × 1.000 (con el gasto sin IVA)' },
  ctr: { titulo: 'CTR', corto: 'Del total de veces que se vio tu anuncio, el porcentaje que terminó en un clic.', largo: 'Mide qué tan interesante es el anuncio (el video, la imagen, el texto). Un CTR bajo con CPM normal suele ser un problema del creativo, no de la audiencia.', formula: 'clics ÷ impresiones × 100' },
  cpa: { titulo: 'Costo por venta (CPA)', corto: 'Cuánto gastas en publicidad para conseguir un pedido entregado.', largo: 'Se divide entre pedidos entregados, no entre los generados: es el costo de una venta que sí se cobró. Mídelo en períodos largos, porque lo que entregas hoy pudo anunciarse días antes.', formula: 'gasto en Meta ÷ pedidos entregados' },
  roas: { titulo: 'ROAS', corto: 'Cuántos pesos recuperas por cada peso que pones en publicidad.', formula: 'ganancia ÷ gasto en publicidad' },
  gasto_iva: { titulo: 'Gasto con y sin IVA', corto: 'Meta reporta el gasto sin IVA, pero a tu tarjeta le cobra con IVA (19 %).', largo: 'Por eso el gasto de la campaña ($100) y el cargo de tu tarjeta ($119) no coinciden: no es un error, es el impuesto.', formula: 'gasto con IVA = gasto sin IVA × 1,19' },
  cobro_meta: { titulo: 'Cobro de Meta', corto: 'El cargo que Meta le hace a tu tarjeta. Meta cobra por umbral, no cada día.', largo: 'Por eso lo gastado en los últimos días puede no haberse cobrado todavía: la diferencia entre gasto con IVA y cobros suele ser plata ya gastada pero aún no cargada.' },
  devolucion: { titulo: 'Devolución', corto: 'Un pedido que no se entregó y volvió. No te paga ganancia y además Dropi te cobra el flete.', largo: 'La publicidad de ese pedido igual se gastó. Por eso una tasa alta de devoluciones se come la ganancia aunque las ventas parezcan buenas.' },
  sin_pagar: { titulo: 'Entregado sin pagar', corto: 'Ya se entregó, pero Dropi todavía no te pagó la ganancia en la billetera.', largo: 'Si pasan muchos días, vale la pena reclamarlo a Dropi: ese dinero ya es tuyo.' },
  en_curso: { titulo: 'En curso', corto: 'Pedidos en camino, con novedad o pendientes. Su ganancia aún no cuenta.' },
  billetera: { titulo: 'Billetera de Dropi', corto: 'Donde Dropi te va pagando la ganancia de cada pedido entregado. De ahí pasas plata a la tarjeta.' },
  tarjeta: { titulo: 'Tarjeta de Dropi', corto: 'Con ella pagas la publicidad. Se recarga desde la billetera y su saldo lo informa Dropi.' },
  atribucion: { titulo: 'Pedido de una campaña', corto: 'Cada pedido se asigna a la campaña por el producto que compró.', largo: 'Si dos campañas anuncian el mismo producto, el pedido se queda con la más antigua. Por eso cada producto debería estar en una sola campaña.' },
  escalar: { titulo: 'Escalar', corto: 'Subir el presupuesto de una campaña que ya está dando ganancia.', largo: 'Sube de a poco (20–30 % cada vez) y espera 2–3 días antes de volver a subir. Si el costo por venta se dispara, vuelve al presupuesto anterior.' },
}

// Lecciones de la sección Aprender (contenido breve, con los mismos términos del glosario).
export const LECCIONES = [
  { id: 'leer-dashboard', titulo: 'Cómo leer tu Dashboard en 1 minuto', pasos: [
    'Mira primero la barra de «recuperar la inversión»: te dice cuánto invertiste, cuánto llevas recuperado y cuánto falta.',
    'Luego la línea del resultado acumulado: cuando cruza el $0, ya recuperaste. Si baja, estás gastando más de lo que entra.',
    'Las barras día por día te dicen en qué días ganaste y en cuáles perdiste. Un día rojo aislado no es grave; una racha de rojos sí.',
    'Recuerda que la ganancia entra cuando el pedido se ENTREGA. Si hoy pautas fuerte, la ganancia llega días después.',
  ] },
  { id: 'cpm-ctr', titulo: 'CPM y CTR: qué mirar en un anuncio', pasos: [
    'El CPM te dice qué tan caro es mostrar el anuncio; el CTR, qué tan atractivo es para quien lo ve.',
    'CPM alto y CTR normal: la audiencia es cara o hay mucha competencia. Prueba otra audiencia o espera.',
    'CPM normal y CTR bajo: el creativo no engancha. Cambia el video, el gancho de los primeros segundos o el texto.',
    'Ambos malos varios días seguidos: el anuncio se cansó. Es hora de un creativo nuevo.',
    'Compara siempre contra tus propios días anteriores, no contra números de internet.',
  ] },
  { id: 'cuando-escalar', titulo: 'Cuándo escalar una campaña', pasos: [
    'Escala solo si llevas varios días con ganancia real (no solo pedidos generados).',
    'Mira la tasa de devoluciones: una campaña con muchas ventas pero muchas devoluciones puede estar perdiendo.',
    'Sube el presupuesto de a poco, 20–30 %, y espera 2–3 días antes de decidir.',
    'Si el costo por venta se dispara tras subir, vuelve al presupuesto anterior.',
  ] },
  { id: 'plata-real', titulo: 'Por qué un pedido entregado no es plata todavía', pasos: [
    'Dropi paga la ganancia a tu billetera después de la entrega, no el mismo día.',
    '«Entregado sin pagar» son pedidos ya entregados que Dropi aún no te paga: si tardan mucho, reclámalos.',
    'Los pedidos en camino no cuentan en la ganancia. Por eso el Dashboard separa «recuperado» (ya en billetera) de lo que viene en camino.',
    'Las devoluciones te cuestan el flete y no pagan ganancia: revísalas por campaña.',
  ] },
]
