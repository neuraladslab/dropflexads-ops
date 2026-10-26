// Rutas de la Graph API de Meta que la app puede pedir: SOLO lectura de la cuenta publicitaria elegida (datos de la cuenta y gasto/métricas; los cobros NO: Meta quitó el campo «transactions» de la API).
const VERSION = 'v\\d{2}\\.\\d'
export const RUTAS_META = [
  new RegExp(`^/${VERSION}/act_\\d{5,20}$`),              // datos de la cuenta (nombre, moneda, estado): sirve para validar el token
  new RegExp(`^/${VERSION}/act_\\d{5,20}/insights$`),     // gasto y métricas
]
export const rutaMetaPermitida = (path) => RUTAS_META.some((re) => re.test(path))
export const cuentaMeta = (v) => { const m = String(v || '').trim().match(/^(?:act_)?(\d{5,20})$/); return m ? 'act_' + m[1] : null }
