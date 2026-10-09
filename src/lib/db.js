import postgres from 'postgres'
import { sslOptions } from './dbssl.mjs'

if (!process.env.POSTGRES_URL) {
  throw new Error('POSTGRES_URL environment variable is not set')
}

let sql

if (process.env.NODE_ENV === 'production') {
  sql = postgres(process.env.POSTGRES_URL, {
    ssl: sslOptions(),
    max: 1,
    transform: {
      undefined: null,
    },
  })
} else {
  if (!global.sql) {
    global.sql = postgres(process.env.POSTGRES_URL, {
      ssl: sslOptions(),
      transform: {
        undefined: null,
      },
    })
  }
  sql = global.sql
}

export default sql
