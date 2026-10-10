import 'server-only'
// Sincroniza los movimientos de la tarjeta desde Dropi: GET /api/credit-cards/list-card-transactions/{tarjeta}/{página}/20, igual que la pantalla de Dropi.
// VENTANA FIJA: solo desde 7 días antes de HOY hasta HOY (hora de Colombia); nada más antiguo entra ni se pide. Las páginas se leen en el orden en que Dropi
// las entrega (se detecta si vienen de lo más nuevo a lo más viejo o al revés) y se corta apenas aparece un movimiento fuera de la ventana.
// Una sola petición a la vez, con pausa entre páginas. SIN DUPLICADOS: lo que se repite entre páginas (un movimiento nuevo corre las páginas) se descarta
// aquí, y el importador idempotente reconoce por su identificador lo que ya estaba (también si vino por el JSON pegado).
import sql from '@/lib/db'
import { parseCardJson } from './parse/importers.mjs'
import { importCardRows } from './card-import'
import { logActivity } from '@/lib/activity'
import { MAX_IMPORT, todayCO } from '@/lib/util'
import { getSetting } from '@/lib/settings'
import { calcularVentana } from '@/domain/ventana.ts'
import { diaBogota } from '@/domain/fechas.ts'
import { CARD_ID_RE, MAX_PAGES_PER_SYNC, MIN_SYNC_INTERVAL_S, PAGE_DELAY_MS, PAGE_SIZE, SYNC_BUDGET_MS, WINDOW_DAYS } from './config.mjs'
import { DropiError, dropiRequest } from './client'
import { dec, getToken, invalidateToken, recordReadFailure } from './session'

// Una lista vacía de verdad («data»: [] / «total_items»: 0) es una tarjeta sin movimientos, no un error.
const EMPTY = Symbol('empty')
const EMPTY_LIST = /"(?:data|transactions|transacciones|movimientos|items|results|registros)"\s*:\s*\[\s*\]|"total_items"\s*:\s*0\b/

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const jitter = () => PAGE_DELAY_MS[0] + Math.random() * (PAGE_DELAY_MS[1] - PAGE_DELAY_MS[0])
const daysBefore = (iso, n) => new Date(new Date(iso + 'T12:00:00Z').getTime() - n * 864e5).toISOString().slice(0, 10)

const msg = (e) => (e instanceof DropiError ? { code: e.code, message: e.message, seconds: e.seconds || 0 } : { code: 'unexpected', message: 'No se pudo sincronizar con Dropi.', seconds: 0 })

/**
 * Ventana de la sincronización { from, to } (días de Bogotá). Sin opciones es la INCREMENTAL (desde 2 días antes de la última sincronización buena);
 * `full` = histórico desde el inicio de la operación; `from`/`to` = un rango exacto pedido a mano. La regla está en domain/ventana.ts.
 */
export const syncWindow = async (uid, { from = null, to = null, full = false } = {}) => {
  const inicio = (await getSetting(uid, 'op_from')) || OPERACION_INICIO
  const [c] = await sql`SELECT last_sync_ok_at FROM dropi_connections WHERE owner_id = ${uid}`
  const [hay] = await sql`SELECT 1 AS x FROM card_transactions WHERE owner_id = ${uid} LIMIT 1`
  return calcularVentana({ hoy: todayCO(), inicioOperacion: inicio, ultimaSyncDia: c && c.last_sync_ok_at ? diaBogota(c.last_sync_ok_at) : null, hayDatos: !!hay, from, to, completo: full })
}

/** Descarta lo que cae fuera de la ventana y lo repetido (mismo identificador). Devuelve las filas únicas. */
export function windowAndDedupe(rows, { from, to }, seen = new Set()) {
  const out = []
  for (const r of rows) {
    if (r.date < from || r.date > to) continue
    // Repetido = la fila ENTERA es idéntica (lo que pasa cuando un movimiento nuevo corre las páginas). Dos movimientos distintos que compartan
    // referencia NO se descartan: el importador los distingue igual que con el JSON pegado.
    const k = [r.date, r.amount, r.kind, r.status, r.reference, r.description, r.last4].join('\u0001')
    if (seen.has(k)) continue
    seen.add(k)
    out.push(r)
  }
  return out
}

/** → { ok, skipped?, pages, inserted, updated, unchanged, invalid, window, error? }. Nunca lanza por errores de Dropi: los devuelve como `error`. */
/**
 * `from`/`to` piden un rango exacto y `full` el histórico desde el inicio de la operación (sin ellos, la ventana incremental). Con `replace` se BORRAN los movimientos guardados de la tarjeta y se cargan de nuevo
 * los leídos de Dropi, pero SOLO si la lectura salió completa y trajo movimientos (si algo falla, lo que había se conserva intacto).
 */
export async function syncCardTransactions(uid, { budgetMs = SYNC_BUDGET_MS, ip = '', otp = '', from = null, to = null, full = false, replace = false } = {}) {
  // Reserva la sincronización de forma atómica: nada de dos a la vez ni más seguidas que el intervalo mínimo.
  const claim = await sql`
    UPDATE dropi_connections SET sync_started_at = NOW()
    WHERE owner_id = ${uid}
      AND (sync_started_at IS NULL OR sync_started_at < NOW() - interval '2 minutes')
      AND (last_sync_at IS NULL OR last_sync_at < NOW() - make_interval(secs => ${MIN_SYNC_INTERVAL_S}))
    RETURNING card_id_enc`
  if (!claim.length) {
    const [c] = await sql`SELECT sync_started_at, last_sync_at FROM dropi_connections WHERE owner_id = ${uid}`
    if (!c) return { ok: false, error: { code: 'no_connection', message: 'Todavía no conectaste tu cuenta de Dropi.', seconds: 0 } }
    const wait = c.last_sync_at ? Math.max(1, Math.ceil(MIN_SYNC_INTERVAL_S - (Date.now() - new Date(c.last_sync_at).getTime()) / 1000)) : 5
    return { ok: false, skipped: true, error: { code: 'busy', message: 'Ya se está sincronizando o se sincronizó hace un momento. Espera un poco.', seconds: wait } }
  }
  const cardId = dec(uid, 'card', claim[0].card_id_enc)
  const win = await syncWindow(uid, { from, to, full: full || replace }) // «reiniciar» siempre parte del inicio de la operación
  // Dropi fecha los movimientos de la tarjeta en hora UTC: después de las 7 p. m. en Colombia ya llevan la fecha de MAÑANA. Sin este día de margen,
  // una recarga o un cobro de la noche se descartaba por «pasar de hoy» y nunca entraba.
  const cardWin = { from: win.from, to: daysBefore(win.to, -1) }
  const rows = [], seen = new Set()
  let pages = 0, err = null, relogged = false, emptyCard = false, fatal = null, incomplete = false, read = 0, stopped = ''
  const trace = [], typesAll = new Map(), skipSample = []
  let skipped = 0
  const t0 = Date.now()
  const fetchPage = async (page) => {
    const path = `/api/credit-cards/list-card-transactions/${cardId}/${page}/${PAGE_SIZE}`
    let token = await getToken(uid, { ip, otp })
    let r = await dropiRequest('GET', path, { token })
    if (r.status === 401 && !relogged) { // el token ya no sirve: UN inicio de sesión nuevo y un solo reintento de esta página
      relogged = true
      await invalidateToken(uid)
      token = await getToken(uid, { force: true, ip, otp })
      r = await dropiRequest('GET', path, { token })
    }
    if (r.status === 401) throw new DropiError('blocked', 'Dropi no aceptó la sesión nueva (¿la tarjeta o la cuenta no tienen permiso?).')
    if (r.status !== 200) throw new DropiError('unexpected', 'Dropi respondió algo inesperado al leer los movimientos.', { status: r.status })
    const parsed = parseCardJson(r.text)
    if (parsed.error) return EMPTY_LIST.test(r.text) ? EMPTY : null // sin lista de movimientos (o una lista vacía: tarjeta nueva sin movimientos)
    pages++
    return parsed
  }
  try {
    if (!cardId || !CARD_ID_RE.test(cardId)) throw new DropiError('reauth', 'No se pudo leer el ID de la tarjeta guardado. Vuelve a conectar tu cuenta.')
    scan: {
      const first = await fetchPage(1)
      if (first === EMPTY) { emptyCard = true; stopped = 'la tarjeta no tiene movimientos'; break scan }
      if (!first) throw new DropiError('unexpected', 'No se pudo leer la lista de movimientos que devolvió Dropi.')
      const take = (page, p) => {
        for (const t of p.types || []) { const c = typesAll.get(t.type) || { n: 0, kind: t.kind }; c.n += t.n; if (c.kind !== t.kind) c.kind = 'mixed'; typesAll.set(t.type, c) }
        skipped += (p.errors || []).length; for (const e of (p.errors || []).slice(0, 2)) if (skipSample.length < 3) skipSample.push(String(e.msg).slice(0, 80))
        const kept = windowAndDedupe(p.rows, cardWin, seen); rows.push(...kept); read += p.rows.length
        const ds = p.rows.map((x) => x.date).sort()
        trace.push({ page, n: p.rows.length, min: ds[0] || null, max: ds[ds.length - 1] || null, kept: kept.length })
      }
      take(1, first)
      const totalPages = first.meta && first.meta.pagination && first.meta.pagination.pages != null ? first.meta.pagination.pages : null
      const ds = first.rows.map((x) => x.date)
      // ¿De lo más nuevo a lo más viejo (lo normal) o al revés? Si viene al revés, se recorre desde la última página hacia atrás.
      const ascByDates = ds.length > 1 && ds[0] < ds[ds.length - 1]
      if (ascByDates && (totalPages == null) && first.rows.length >= PAGE_SIZE) throw new DropiError('unexpected', 'Dropi entregó los movimientos en un orden que no pude interpretar (sin datos de paginación). Usa «Importar JSON» y avísame.')
      const asc = ascByDates && totalPages != null && totalPages > 1
      // Se corta SOLO cuando una página ENTERA es anterior a la ventana (no con que traiga un movimiento viejo): si Dropi no ordena estrictamente por
      // fecha (retenciones que se liquidan, etc.) un movimiento viejo suelto no debe cortar la lectura y dejar sin leer los días de la ventana.
      const allOlder = (p) => p.rows.length > 0 && p.rows.every((x) => x.date < win.from)
      let cur = asc ? totalPages : 2, step = asc ? -1 : 1
      if (!asc && (first.rows.length < PAGE_SIZE || (totalPages != null && totalPages <= 1))) stopped = 'era la única página'
      else if (!asc && allOlder(first)) stopped = 'la primera página ya era anterior a la ventana'
      while (!stopped && cur >= 1 && (totalPages == null || cur <= totalPages)) {
        if (pages >= MAX_PAGES_PER_SYNC) { stopped = 'tope de páginas'; incomplete = true; break }
        await sleep(jitter()); if (Date.now() - t0 > budgetMs) { stopped = 'tiempo agotado'; incomplete = true; break }
        const p = await fetchPage(cur)
        if (!p) { stopped = 'página sin lista'; break }
        take(cur, p)
        if (allOlder(p)) stopped = 'la página era anterior a la ventana'
        else if (asc ? cur <= 2 : (p.rows.length < PAGE_SIZE || (totalPages != null && cur >= totalPages))) stopped = 'última página'
        cur += step
      }
    }
  } catch (e) {
    err = e
    if (!(e instanceof DropiError)) fatal = e
    else await recordReadFailure(uid, e) // 429/403, red o respuesta rara al LEER: también activa la espera (antes solo el login lo hacía)
  }
  if (rows.length > MAX_IMPORT) rows.length = MAX_IMPORT // tope: un Dropi hostil no puede inflar la importación
  let imp = { inserted: 0, updated: 0, duplicated: 0, invalid: 0 }
  try {
    if (rows.length) {
      if (replace && !err && !incomplete) await sql`DELETE FROM card_transactions WHERE owner_id = ${uid}`
      const r = await importCardRows(uid, rows)
      if (!r.error) imp = r
    }
  } finally {
    await sql`UPDATE dropi_connections SET sync_started_at = NULL, last_sync_at = NOW(), next_page = NULL,
              last_sync_ok_at = CASE WHEN ${!err} THEN NOW() ELSE last_sync_ok_at END,
              state = CASE WHEN ${!err} AND state <> 'reauth' THEN 'ok' ELSE state END, fail_count = CASE WHEN ${!err} THEN 0 ELSE fail_count END,
              cooldown_until = CASE WHEN ${!err} THEN NULL ELSE cooldown_until END,
              last_error = ${err ? msg(err).message.slice(0, 160) : null}, updated_at = NOW() WHERE owner_id = ${uid}`
  }
  if (fatal) throw fatal // p. ej. falta DATA_ENCRYPTION_KEY: lo atiende guard (503 con el motivo en el log)
  if (imp.inserted || imp.updated) await logActivity(uid, `Sincronizaste Dropi (${win.from} a ${win.to}): ${imp.inserted} movimientos nuevos` + (imp.updated ? `, ${imp.updated} actualizados` : ''))
  const kinds = { charge: rows.filter((r) => r.kind === 'charge').length, refund: rows.filter((r) => r.kind === 'refund').length }
  const types = [...typesAll].map(([type, v]) => ({ type, n: v.n, kind: v.kind })).sort((a, b) => b.n - a.n).slice(0, 12)
  const detail = { window: win, read, kept: rows.length, kinds, types, skipped, skipSample, pages: trace, stopped: stopped || (err ? 'error' : ''), complete: !err && !incomplete }
  const replaced = replace && !err && !incomplete && rows.length > 0
  const summary = { replaced, pages, inserted: imp.inserted, updated: imp.updated, unchanged: imp.duplicated, invalid: imp.invalid, window: win, incomplete, detail }
  return err ? { ok: false, ...summary, error: msg(err) } : { ok: true, ...summary }
}
