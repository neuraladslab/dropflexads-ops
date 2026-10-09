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
