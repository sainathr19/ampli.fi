-- Add token amount columns for normalized storage (source sats, destination base units)
ALTER TABLE bridge_orders ADD COLUMN IF NOT EXISTS amount_source_sats NUMERIC(78,0);
ALTER TABLE bridge_orders ADD COLUMN IF NOT EXISTS amount_destination_units NUMERIC(78,0);
