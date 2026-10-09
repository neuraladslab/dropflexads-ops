// Cabeceras de un Chrome real en app.dropi.co (copiadas de una petición del propio frontend de Dropi). El WAF de Dropi mira que la
// petición «venga» de su aplicación. Cuando Chrome se actualice, cambia DROPI_CHROME_MAJOR (o esta constante) a la versión que usas.
export const CHROME_MAJOR = String(process.env.DROPI_CHROME_MAJOR || '152').replace(/\D/g, '').slice(0, 3) || '152'
export const DROPI_ORIGIN = 'https://app.dropi.co'

export function dropiHeaders(extra = {}) {
  return {
    accept: 'application/json, text/plain, */*',
    'accept-language': 'es-US,es-419;q=0.9,es;q=0.8',
    origin: DROPI_ORIGIN,
    priority: 'u=1, i',
    referer: DROPI_ORIGIN + '/',
    'sec-ch-ua': `"Chromium";v="${CHROME_MAJOR}", "Not?A_Brand";v="24", "Google Chrome";v="${CHROME_MAJOR}"`,
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-site',
    'user-agent': `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_MAJOR}.0.0.0 Safari/537.36`,
    ...extra,
  }
}
