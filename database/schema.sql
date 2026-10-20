-- Esquema de DropFlexAds Ops (idempotente). Autenticación copiada de calculadora; el dominio nuevo va en migraciones aparte.
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(254) NOT NULL,
  password_hash TEXT NOT NULL,
  disabled_at TIMESTAMPTZ,
  password_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (lower(email));

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  revoked_reason VARCHAR(40),
  user_agent VARCHAR(200)
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS auth_throttle (
  key VARCHAR(80) PRIMARY KEY,
  fails INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_until TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS auth_events (
  id SERIAL PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id INTEGER,
  event VARCHAR(40) NOT NULL,
  ip_hash VARCHAR(64),
  user_agent VARCHAR(200)
);
CREATE INDEX IF NOT EXISTS idx_auth_events_at ON auth_events(at);

CREATE TABLE IF NOT EXISTS login_known_ips (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip_hash VARCHAR(64) NOT NULL,
  last_ok_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, ip_hash)
);

-- ============================================================
-- 012 · Verificación en dos pasos (TOTP) y códigos de recuperación.
-- El secreto se guarda CIFRADO (AES-256-GCM, clave fuera de la base de datos); nunca en claro.
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret_enc TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_pending_enc TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_last_step BIGINT;

-- Códigos de un solo uso por si se pierde el teléfono. Solo se guarda su huella HMAC.
CREATE TABLE IF NOT EXISTS recovery_codes (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash VARCHAR(64) NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_recovery_codes ON recovery_codes (user_id, code_hash);

-- ============================================================
-- Datos de la operación (limpio: sin columnas muertas ni marcas «es de Meta»; el cruce con Meta lo decide el dominio por referencia de pago).
-- ============================================================
CREATE TABLE IF NOT EXISTS app_settings (
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key VARCHAR(40) NOT NULL,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (owner_id, key)
);

CREATE TABLE IF NOT EXISTS activity_log (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message VARCHAR(300) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_activity_log_owner ON activity_log (owner_id, created_at DESC);

-- Cobros de Meta (Facturación → Transacciones), con IVA incluido. La referencia de pago es la llave del cruce con la tarjeta.
CREATE TABLE IF NOT EXISTS meta_charges (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  charged_date DATE NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  status VARCHAR(8) NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'failed', 'pending')),
  payment_ref VARCHAR(24),
  vat_invoice VARCHAR(40),
  card_last4 VARCHAR(4),
  notes VARCHAR(300),
  external_key VARCHAR(300),
  batch_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_id, external_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_meta_charges_payment_ref ON meta_charges (owner_id, upper(payment_ref)) WHERE payment_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_meta_charges_owner_date ON meta_charges (owner_id, charged_date);

-- Movimientos de la tarjeta de Dropi.
CREATE TABLE IF NOT EXISTS card_transactions (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tx_date DATE NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  kind VARCHAR(10) NOT NULL DEFAULT 'charge' CHECK (kind IN ('charge', 'refund')),
  status VARCHAR(10) NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'declined')),
  decline_reason VARCHAR(200),
  description VARCHAR(200),
  reference VARCHAR(80),
  last4 VARCHAR(4),
  pay_ref VARCHAR(24),                         -- código de la descripción («FACEBK *PZ4XV8SWF4» → PZ4XV8SWF4)
  op_type VARCHAR(30),
  op_state VARCHAR(30),
  manual_charge_id INTEGER REFERENCES meta_charges(id) ON DELETE SET NULL,
  external_key VARCHAR(300),
  batch_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_id, external_key)
);
-- Movimientos que la persona decidió no contar (p. ej. Dropi los re-fecha y quedarían duplicados). La sincronización nunca toca esta marca.
ALTER TABLE card_transactions ADD COLUMN IF NOT EXISTS ignored BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_card_transactions_owner_date ON card_transactions (owner_id, tx_date);
CREATE INDEX IF NOT EXISTS idx_card_transactions_pay_ref ON card_transactions (owner_id, upper(pay_ref)) WHERE pay_ref IS NOT NULL;

-- Conexión con Dropi. Todo lo sensible va CIFRADO (AES-256-GCM, ligado al usuario y al campo); el token tampoco se guarda en claro.
CREATE TABLE IF NOT EXISTS dropi_connections (
  owner_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email_enc TEXT NOT NULL,
  password_enc TEXT NOT NULL,
  totp_enc TEXT,                     -- NULL = modo «código a mano»
  card_id_enc TEXT NOT NULL,
  email_hint VARCHAR(80),
  card_hint VARCHAR(24),
  token_enc TEXT,
  token_exp TIMESTAMPTZ,
  state VARCHAR(10) NOT NULL DEFAULT 'ok' CHECK (state IN ('ok', 'cooldown', 'blocked', 'reauth')),
  fail_count INTEGER NOT NULL DEFAULT 0,
  cooldown_until TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  last_login_step BIGINT,
  sync_started_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  last_sync_ok_at TIMESTAMPTZ,
  next_page INTEGER,
  last_error VARCHAR(160),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Saldo real que informa Dropi: la fuente de verdad del «disponible».
CREATE TABLE IF NOT EXISTS dropi_balances (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account VARCHAR(8) NOT NULL DEFAULT 'card' CHECK (account IN ('card', 'wallet')),
  amount NUMERIC(14,2) NOT NULL,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dropi_balances_owner ON dropi_balances (owner_id, account, read_at DESC);

-- Billetera de Dropi: ganancias por pedido, devoluciones, mantenimiento, recargas a la tarjeta… `order_ref` = ID del pedido en Dropi.
CREATE TABLE IF NOT EXISTS wallet_movements (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  external_id VARCHAR(40) NOT NULL,
  tx_at TIMESTAMPTZ NOT NULL,
  tx_date DATE NOT NULL,                     -- día en Bogotá
  direction VARCHAR(3) NOT NULL CHECK (direction IN ('in', 'out')),
  amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  balance_before NUMERIC(14,2),
  kind VARCHAR(16) NOT NULL,                 -- profit | return_fee | card_fee | recharge_fee | to_card | withdrawal | reversal | wallet_topup | other_in | other_out
  description VARCHAR(300),
  order_ref VARCHAR(30),
  guide VARCHAR(40),
  code VARCHAR(10),
  reverses VARCHAR(40),
  batch_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_wallet_movements_owner_date ON wallet_movements (owner_id, tx_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_movements_order ON wallet_movements (owner_id, order_ref);
-- «SALIDA POR COBRO DE FLETE INICIAL» es el cobro de una devolución: antes quedaba como «otro descuento».
UPDATE wallet_movements SET kind = 'return_fee', order_ref = COALESCE(NULLIF(order_ref, ''), substring(description from '(?i)FLETE INICIAL:?\s*\*?(\d{4,30})')) WHERE kind IN ('other_out', 'order_payment') AND direction = 'out' AND description ~* 'FLETE INICIAL';

-- Pedidos de Dropi (TODOS los estados; el estado real decide la contabilidad). NO guarda datos del cliente (nombre, teléfono, dirección) ni facturas.
-- product_ids = IDs de producto de Dropi del pedido: con ellos se atribuye el pedido a una campaña (por producto).
CREATE TABLE IF NOT EXISTS dropi_orders (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id VARCHAR(30) NOT NULL,             -- ID del pedido en Dropi
  guide VARCHAR(40),
  status VARCHAR(30) NOT NULL,               -- estado crudo de Dropi (texto libre)
  status_group VARCHAR(12) NOT NULL DEFAULT 'otro' CHECK (status_group IN ('entregado', 'devolucion', 'novedad', 'transito', 'pendiente', 'otro')),
  product VARCHAR(200),
  product_ids TEXT[] NOT NULL DEFAULT '{}',
  total NUMERIC(14,2),
  created_date DATE,
  delivered_date DATE,
  returned_date DATE,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_id, order_id)
);
CREATE INDEX IF NOT EXISTS idx_dropi_orders_owner_created ON dropi_orders (owner_id, created_date DESC);
CREATE INDEX IF NOT EXISTS idx_dropi_orders_owner_group ON dropi_orders (owner_id, status_group);

-- Herramientas de operación (costos mensuales fijos): se reparten por día en la contabilidad.
CREATE TABLE IF NOT EXISTS fixed_costs (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(80) NOT NULL,
  monthly_amount NUMERIC(14,2) NOT NULL CHECK (monthly_amount >= 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fixed_costs_owner ON fixed_costs (owner_id);

-- Nombre de cada producto del pedido (alineado con product_ids) para poder elegirlos al crear una campaña.
ALTER TABLE dropi_orders ADD COLUMN IF NOT EXISTS product_names TEXT[] NOT NULL DEFAULT '{}';

-- Campañas: agrupan productos de Dropi. Un pedido se atribuye a la primera campaña (la más antigua) que tenga alguno de sus productos.
-- meta_campaign_id queda para unir con la campaña de Meta Ads cuando se conecte.
CREATE TABLE IF NOT EXISTS campaigns (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  product_ids TEXT[] NOT NULL DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  meta_campaign_id VARCHAR(40),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_campaigns_owner ON campaigns (owner_id, created_at);

-- Unidades de cada pedido (1x, 2x, 3x…): suma de la cantidad de sus productos. Con esto se arma «Lo vendido por combo».
ALTER TABLE dropi_orders ADD COLUMN IF NOT EXISTS units INTEGER;

-- ============================================================
-- Meta Ads (Marketing API oficial, solo lectura). El token se guarda CIFRADO (AES-256-GCM, ligado al usuario y al campo) y no vuelve al navegador.
CREATE TABLE IF NOT EXISTS meta_connections (
  owner_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  ad_account_id VARCHAR(40) NOT NULL,          -- act_123…
  account_name VARCHAR(120),
  currency VARCHAR(8),
  timezone VARCHAR(60),
  token_enc TEXT NOT NULL,
  token_hint VARCHAR(12),                      -- «…a1b2» para reconocerlo sin descifrar
  vat_pct NUMERIC(5,2) NOT NULL DEFAULT 19,    -- IVA que Meta cobra encima del gasto
  api_version VARCHAR(10) NOT NULL DEFAULT 'v23.0',
  state VARCHAR(10) NOT NULL DEFAULT 'ok' CHECK (state IN ('ok', 'reauth', 'error')),
  sync_started_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  last_sync_ok_at TIMESTAMPTZ,
  last_error VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Gasto diario por campaña de Meta (insights). El gasto de Meta viene SIN IVA.
CREATE TABLE IF NOT EXISTS meta_spend_daily (
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  meta_campaign_id VARCHAR(40) NOT NULL,
  campaign_name VARCHAR(200),
  spend NUMERIC(14,2) NOT NULL DEFAULT 0,
  impressions BIGINT NOT NULL DEFAULT 0,
  clicks BIGINT NOT NULL DEFAULT 0,
  purchases INTEGER NOT NULL DEFAULT 0,
  purchase_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (owner_id, day, meta_campaign_id)
);
CREATE INDEX IF NOT EXISTS idx_meta_spend_owner_day ON meta_spend_daily (owner_id, day DESC);

-- Los cobros de Meta (con IVA incluido) pueden venir de la API o de otro origen; la referencia de pago es opcional (si no llega, el cruce con la tarjeta usa monto y fecha).
ALTER TABLE meta_charges ADD COLUMN IF NOT EXISTS source VARCHAR(10) NOT NULL DEFAULT 'manual';

-- Identificador de la transacción tal como sale en el extracto de Meta (p. ej. 28990819463938228-28947602274926610); es opcional y evita duplicar al importar.
ALTER TABLE meta_charges ADD COLUMN IF NOT EXISTS reference VARCHAR(80);

-- ============================================================
-- Cortes del mes: devolución esperada por campaña y cierres sellados.
-- % de devolución que se espera de los pedidos de la campaña (por defecto 15). Sirve para estimar la ganancia de los pedidos en curso y el costo de las devoluciones.
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS return_pct NUMERIC(5,2) NOT NULL DEFAULT 15;

-- Cierre sellado de un corte: foto de las cifras al cerrarlo. NUNCA se modifica ni se borra: volver a cerrar crea una versión nueva. `period_end` = último día del corte.
CREATE TABLE IF NOT EXISTS cut_closures (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  version INTEGER NOT NULL,
  snapshot JSONB NOT NULL,
  note VARCHAR(300),
  closed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_id, period_end, version)
);
CREATE INDEX IF NOT EXISTS idx_cut_closures_owner ON cut_closures (owner_id, period_end DESC, version DESC);
