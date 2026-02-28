CREATE TABLE IF NOT EXISTS bridge_orders (
  id UUID PRIMARY KEY,
  network TEXT NOT NULL,
  source_asset TEXT NOT NULL,
  destination_asset TEXT NOT NULL,
  amount NUMERIC(78,0) NOT NULL,
  amount_type TEXT NOT NULL,
  receive_address TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  status TEXT NOT NULL,
  atomiq_swap_id TEXT UNIQUE,
  source_tx_id TEXT,
  destination_tx_id TEXT,
  quote_json JSONB,
  expires_at TIMESTAMPTZ,
  last_error TEXT,
  raw_state_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bridge_actions (
  id BIGSERIAL PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES bridge_orders(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  action_status TEXT NOT NULL,
  payload_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bridge_events (
  id BIGSERIAL PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES bridge_orders(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  payload_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bridge_orders_wallet_created
  ON bridge_orders(wallet_address, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bridge_orders_status_updated
  ON bridge_orders(status, updated_at DESC);
