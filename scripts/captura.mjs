// Toma capturas de pantallas con Playwright (para revisar el diseño). Uso: npm run captura -- /login [/otra-ruta ...]
// Requiere la app corriendo (npm run dev) o BASE_URL. Guarda en el directorio indicado por SHOTS_DIR (por defecto ./capturas, ignorado por git).
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const base = process.env.BASE_URL || 'http://localhost:3000'
const dir = process.env.SHOTS_DIR || 'capturas'
const rutas = process.argv.slice(2).length ? process.argv.slice(2) : ['/login']
mkdirSync(dir, { recursive: true })

const browser = await chromium.launch()
for (const [nombre, viewport] of [['escritorio', { width: 1366, height: 860 }], ['movil', { width: 390, height: 844 }]]) {
  const page = await (await browser.newContext({ viewport })).newPage()
  for (const ruta of rutas) {
    await page.goto(base + ruta, { waitUntil: 'networkidle' })
    const file = `${dir}/${ruta.replace(/\W+/g, '_').replace(/^_|_$/g, '') || 'inicio'}-${nombre}.png`
    await page.screenshot({ path: file, fullPage: true })
    console.log(file, '→', page.url())
  }
}
await browser.close()
