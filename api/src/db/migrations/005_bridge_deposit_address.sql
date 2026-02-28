ALTER TABLE bridge_orders
ADD COLUMN IF NOT EXISTS deposit_address TEXT;
