import sql from '@/lib/db'

/** Ajustes por usuario (clave/valor). `op_from` = día en que empezó la operación (la ventana de sincronización parte de ahí). */
export async function getSetting(uid, key) {
  const [r] = await sql`SELECT value FROM app_settings WHERE owner_id = ${uid} AND key = ${key}`
  return r ? r.value : null
}
export async function setSetting(uid, key, value) {
  await sql`INSERT INTO app_settings (owner_id, key, value) VALUES (${uid}, ${key}, ${String(value)})
            ON CONFLICT (owner_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`
}
