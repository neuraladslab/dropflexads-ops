// Toma capturas de pantallas con Playwright (para revisar el diseño). Uso: npm run captura -- /login [/otra-ruta ...]
// Con DFA_EMAIL y DFA_PASSWORD entra primero (para pantallas con sesión). Requiere la app corriendo (npm run dev) o BASE_URL. Guarda en el directorio indicado por SHOTS_DIR (por defecto ./capturas, ignorado por git).
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const base = process.env.BASE_URL || 'http://localhost:3000'
const dir = process.env.SHOTS_DIR || 'capturas'
const rutas = process.argv.slice(2).length ? process.argv.slice(2) : ['/login']
mkdirSync(dir, { recursive: true })

const browser = await chromium.launch()
for (const [nombre, viewport] of [['escritorio', { width: 1366, height: 860 }], ['movil', { width: 390, height: 844 }]]) {
  const page = await (await browser.newContext({ viewport })).newPage()
  if (process.env.DFA_EMAIL && process.env.DFA_PASSWORD) {
    await page.goto(base + '/login', { waitUntil: 'networkidle' })
    await page.getByLabel('Correo').fill(process.env.DFA_EMAIL)
    await page.getByRole('textbox', { name: 'Contraseña' }).fill(process.env.DFA_PASSWORD)
    await page.getByRole('button', { name: 'Entrar' }).click()
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 })
  }
  for (const ruta of rutas) {
    await page.goto(base + ruta, { waitUntil: 'networkidle' })
    const file = `${dir}/${ruta.replace(/\W+/g, '_').replace(/^_|_$/g, '') || 'inicio'}-${nombre}.png`
    await page.screenshot({ path: file, fullPage: true })
    console.log(file, '→', page.url())
  }
}
await browser.close()
