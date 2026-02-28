-- Migrate amount to TEXT for token amounts (decimal strings, no precision loss)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bridge_orders' AND column_name = 'amount'
    AND data_type = 'numeric'
  ) THEN
    ALTER TABLE bridge_orders ALTER COLUMN amount TYPE TEXT USING amount::text;
  END IF;
END $$;
