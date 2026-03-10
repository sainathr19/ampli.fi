-- Add bitcoin_address column for querying order history by BTC address
ALTER TABLE bridge_orders ADD COLUMN IF NOT EXISTS bitcoin_address TEXT;

-- Index for querying by bitcoin_address
CREATE INDEX IF NOT EXISTS idx_bridge_orders_bitcoin_address_created
  ON bridge_orders(bitcoin_address, created_at DESC);
