import { pathToFileURL, fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

const raiz = fileURLToPath(new URL('../src/', import.meta.url))
export async function resolve(spec, ctx, next) {
  if (spec.startsWith('@/')) {
    const base = raiz + spec.slice(2)
    for (const ext of ['', '.js', '.mjs', '.ts']) if (existsSync(base + ext) && /\.\w+$/.test(base + ext)) return next(pathToFileURL(base + ext).href, ctx)
  }
  return next(spec, ctx)
}
