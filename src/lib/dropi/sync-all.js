import 'server-only'
// Una sincronización completa con Dropi: tarjeta → saldo → billetera → pedidos, con la misma sesión. La usan el botón manual y el cron diario.
import { syncCardTransactions } from './sync'
import { syncCardBalance } from './balance-sync'
import { syncWalletMovements } from './wallet-sync'
import { syncOrders } from './orders-sync'

/**
 * modo: 'incremental' (lo de todos los días) · 'historico' (desde el inicio de la operación, sin borrar) · 'rango' (from/to exactos) · 'reset' (borra la tarjeta y la trae de nuevo).
 * Devuelve el resultado de la tarjeta + { balance, wallet, orders }. Si la tarjeta falla, se detiene ahí (la sesión o el acceso no sirven).
 */
export async function sincronizarTodo(uid, { ip = '', otp = '', modo = 'incremental', from = null, to = null } = {}) {
  const base = { ip, otp }
  const card = await syncCardTransactions(uid,
    modo === 'reset' ? { ...base, full: true, replace: true, budgetMs: 40_000 }
    : modo === 'historico' ? { ...base, full: true, budgetMs: 40_000 }
    : modo === 'rango' ? { ...base, from, to, budgetMs: 40_000 }
    : base)
  if (!card.ok) return card
  const balance = await syncCardBalance(uid, { ip }) // el saldo que informa Dropi: la fuente de verdad del disponible
  const wallet = await syncWalletMovements(uid, { ip, win: card.window })
  // Si la billetera falló no se sigue pidiendo a Dropi: se informa y se omite lo que faltaba.
  const orders = wallet.ok === false
    ? { ok: false, omitido: true, error: { code: 'omitido', message: 'Se omitió porque falló la billetera.' } }
    : await syncOrders(uid, { ip, ...(modo === 'rango' ? { win: card.window } : {}) }) // el estado real de cada pedido (entregado, devolución…)
  return { ...card, balance, wallet, orders }
}
