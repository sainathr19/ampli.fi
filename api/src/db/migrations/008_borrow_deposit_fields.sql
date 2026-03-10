-- Add deposit params and loan tx IDs to bridge_orders for borrow flow persistence
ALTER TABLE bridge_orders ADD COLUMN IF NOT EXISTS deposit_params JSONB;
ALTER TABLE bridge_orders ADD COLUMN IF NOT EXISTS supply_tx_id TEXT;
ALTER TABLE bridge_orders ADD COLUMN IF NOT EXISTS borrow_tx_id TEXT;
