import { pathToFileURL, fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

const raiz = fileURLToPath(new URL('../src/', import.meta.url))
export async function resolve(spec, ctx, next) {
  if (spec.startsWith('@/')) {
    const base = raiz + spec.slice(2)
    for (const ext of ['', '.js', '.mjs', '.ts']) if (existsSync(base + ext) && /\.\w+$/.test(base + ext)) return next(pathToFileURL(base + ext).href, ctx)
  }
  if (/^next\/[a-z-]+$/.test(spec)) return next(spec + '.js', ctx)
  if (/^\.\.?\/[\w./-]*[^.\w/]?$/.test(spec) && !/\.\w+$/.test(spec) && ctx.parentURL) { // importes relativos sin extensión (como los resuelve Next)
    const u = new URL(spec + '.js', ctx.parentURL); if (existsSync(fileURLToPath(u))) return next(u.href, ctx)
  }
  return next(spec, ctx)
}
