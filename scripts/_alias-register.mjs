// Permite ejecutar el código del servidor (src/lib/*.js, con alias «@/») desde un script de Node, fuera de Next. Solo para verificaciones de solo lectura.
import { register } from 'node:module'
register('./_alias-loader.mjs', import.meta.url)
