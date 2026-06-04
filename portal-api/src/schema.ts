export const bootstrapSql = `
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS merchants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  country_code TEXT,
  city TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (merchant_id, code)
);

CREATE TABLE IF NOT EXISTS devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  device_code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'desktop',
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activation_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  code TEXT NOT NULL UNIQUE,
  max_devices INTEGER NOT NULL DEFAULT 1,
  expires_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'READY',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS offline_leases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activation_code_id UUID NOT NULL REFERENCES activation_codes(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  lease_token TEXT NOT NULL UNIQUE,
  signed_payload TEXT NOT NULL,
  valid_from TIMESTAMPTZ NOT NULL,
  valid_until TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sync_ingestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_code TEXT NOT NULL,
  source TEXT NOT NULL,
  sent_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  request_json JSONB NOT NULL,
  result_json JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_products (
  merchant_code TEXT NOT NULL,
  branch_code TEXT NOT NULL,
  device_code TEXT NOT NULL,
  id TEXT NOT NULL,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (merchant_code, branch_code, device_code, id)
);

CREATE TABLE IF NOT EXISTS sync_customers (
  merchant_code TEXT NOT NULL,
  branch_code TEXT NOT NULL,
  device_code TEXT NOT NULL,
  id TEXT NOT NULL,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (merchant_code, branch_code, device_code, id)
);

CREATE TABLE IF NOT EXISTS sync_suppliers (
  merchant_code TEXT NOT NULL,
  branch_code TEXT NOT NULL,
  device_code TEXT NOT NULL,
  id TEXT NOT NULL,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (merchant_code, branch_code, device_code, id)
);

CREATE TABLE IF NOT EXISTS sync_sales (
  merchant_code TEXT NOT NULL,
  branch_code TEXT NOT NULL,
  device_code TEXT NOT NULL,
  id TEXT NOT NULL,
  invoice_number TEXT,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (merchant_code, branch_code, device_code, id)
);

CREATE TABLE IF NOT EXISTS sync_purchases (
  merchant_code TEXT NOT NULL,
  branch_code TEXT NOT NULL,
  device_code TEXT NOT NULL,
  id TEXT NOT NULL,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (merchant_code, branch_code, device_code, id)
);

CREATE TABLE IF NOT EXISTS sync_settings (
  merchant_code TEXT NOT NULL,
  branch_code TEXT NOT NULL,
  device_code TEXT NOT NULL,
  key TEXT NOT NULL,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (merchant_code, branch_code, device_code, key)
);

CREATE TABLE IF NOT EXISTS sync_stock_snapshots (
  merchant_code TEXT NOT NULL,
  branch_code TEXT NOT NULL,
  device_code TEXT NOT NULL,
  id TEXT NOT NULL,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (merchant_code, branch_code, device_code, id)
);

CREATE TABLE IF NOT EXISTS operators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  username TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'cashier',
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  credentials_version INTEGER NOT NULL DEFAULT 1,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (merchant_id, username)
);

CREATE TABLE IF NOT EXISTS operator_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operators_merchant ON operators(merchant_id);
CREATE INDEX IF NOT EXISTS idx_operator_sessions_operator ON operator_sessions(operator_id);
`;
