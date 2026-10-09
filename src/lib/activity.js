import sql from '@/lib/db'

/** Bitácora de usuario: todo cambio importante queda anotado. */
export async function logActivity(uid, message) {
  await sql`INSERT INTO activity_log (owner_id, message) VALUES (${uid}, ${String(message).slice(0, 300)})`
}
