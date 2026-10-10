// Lista CERRADA de rutas de Dropi que la app puede pedir (solo lectura, parámetros fijos salvo página, usuario y fechas) y los armadores de las
// rutas con parámetros. Viven juntos y con pruebas para que una ruta nueva no quede bloqueada por la lista (o al revés).
const FECHA = '\\d{4}-\\d{2}-\\d{2}'

export const RUTAS_PERMITIDAS = [
  /^\/api\/login$/,
  /^\/api\/credit-cards\/list-card-transactions\/car_[A-Za-z0-9]{8,40}\/\d{1,4}\/\d{1,3}$/,
  // Saldo disponible de la tarjeta: lo informa Dropi, no se calcula.
  /^\/api\/credit-cards\/balances\/car_[A-Za-z0-9]{8,40}$/,
  // Billetera: la misma consulta que hace la pantalla de Dropi.
  new RegExp(`^/api/historywallet\\?orderBy=id&orderDirection=desc&result_number=\\d{1,3}&start=\\d{1,6}&textToSearch=&type=null&id=null&identification_code=null&user_id=\\d{1,12}&from=${FECHA}&until=${FECHA}&wallet_id=0$`),
  // Pedidos de TODOS los estados (Dropi espera el texto «null» en status y seller, como DropFlex App).
  new RegExp(`^/api/orders/myorders/v2\\?exportAs=orderByRow&orderBy=id&orderDirection=desc&result_number=\\d{1,3}&start=\\d{1,6}&textToSearch=&status=null&supplier_id=false&user_id=\\d{1,12}&from=${FECHA}&until=${FECHA}&filter_product=undefined&haveIncidenceProcesamiento=false&tag_id=&warranty=false&seller=null&filter_date_by=FECHA%20DE%20CREADO&invoiced=null$`),
]
export const rutaPermitida = (path) => RUTAS_PERMITIDAS.some((re) => re.test(path))

/** Billetera de Dropi (historywallet). */
export const walletPath = ({ userId, start, from, until, size = 20 }) =>
  `/api/historywallet?orderBy=id&orderDirection=desc&result_number=${size}&start=${start}&textToSearch=&type=null&id=null&identification_code=null&user_id=${userId}&from=${from}&until=${until}&wallet_id=0`
