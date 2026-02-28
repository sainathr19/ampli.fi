-- Rename old columns to new names (for DBs that ran earlier 002)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bridge_orders' AND column_name = 'amount_source_sats')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bridge_orders' AND column_name = 'amount_source')
  THEN
    ALTER TABLE bridge_orders RENAME COLUMN amount_source_sats TO amount_source;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bridge_orders' AND column_name = 'amount_destination_units')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bridge_orders' AND column_name = 'amount_destination')
  THEN
    ALTER TABLE bridge_orders RENAME COLUMN amount_destination_units TO amount_destination;
  END IF;
END $$;
