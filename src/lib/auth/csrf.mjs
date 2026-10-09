// Protección CSRF para peticiones que modifican datos (OWASP): verificación de origen + Fetch Metadata.
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS'])

function hostOf(request) {
  return (request.headers.get('host') || request.headers.get('x-forwarded-host') || '').split(',')[0].trim().toLowerCase()
}

/** true si la petición viene de esta misma aplicación. Sin Origin ni Referer en una mutación, se rechaza. */
export function sameOrigin(request) {
  if (SAFE.has(request.method)) return true
  const site = request.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin' && site !== 'none') return false
  const host = hostOf(request)
  if (!host) return false
  for (const h of ['origin', 'referer']) {
    const v = request.headers.get(h)
    if (v) {
      try {
        return new URL(v).host.toLowerCase() === host
      } catch {
        return false
      }
    }
  }
  return false
}

/** Las mutaciones con cuerpo deben ser JSON: obliga a un preflight CORS en peticiones cruzadas. */
export function jsonBodyOk(request) {
  if (SAFE.has(request.method)) return true
  const len = request.headers.get('content-length')
  const hasBody = (len && len !== '0') || request.headers.get('transfer-encoding')
  if (!hasBody) return true
  return (request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')
}
