-- Add token amount columns (decimal strings, no precision loss)
ALTER TABLE bridge_orders ADD COLUMN IF NOT EXISTS amount_source TEXT;
ALTER TABLE bridge_orders ADD COLUMN IF NOT EXISTS amount_destination TEXT;
