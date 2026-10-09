// Opciones TLS para la conexión a Postgres.
// Con `ssl: 'require'` el tráfico va cifrado pero NO se verifica el certificado: alguien en el camino entre la app y la base podría
// hacerse pasar por ella y leer o alterar todo (usuarios, sesiones, datos financieros). Con un host remoto se verifica el certificado
// contra las autoridades públicas (Neon y Vercel Postgres usan certificados válidos). Solo se omite para una base LOCAL (que casi siempre
// tiene un certificado autofirmado) o si lo pides expresamente con POSTGRES_SSL=insecure (no recomendado).
export function sslOptions(url = process.env.POSTGRES_URL) {
  if (process.env.POSTGRES_SSL === 'insecure') return 'require'
  let host = ''
  try { host = new URL(url).hostname } catch {}
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]') return 'require'
  return { rejectUnauthorized: true }
}
