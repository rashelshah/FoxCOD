-- Migration v17: Full Prepaid Feature
-- Adds Full Prepaid columns to partial_payment_settings
-- Adds is_full_prepaid + payment_method to order_logs

-- ── 1. partial_payment_settings ──────────────────────────────────────────────
ALTER TABLE partial_payment_settings
  ADD COLUMN IF NOT EXISTS full_prepaid_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS full_prepaid_minimum_order_total NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS full_prepaid_maximum_order_total NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS full_prepaid_allowed_product_ids JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS full_prepaid_allowed_collection_ids JSONB DEFAULT '[]';

-- ── 2. order_logs ─────────────────────────────────────────────────────────────
ALTER TABLE order_logs
  ADD COLUMN IF NOT EXISTS is_full_prepaid BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'cod';

-- Index for analytics queries
CREATE INDEX IF NOT EXISTS idx_order_logs_payment_method
  ON order_logs (shop_domain, payment_method);

-- Backfill: mark existing partial COD orders
UPDATE order_logs
  SET payment_method = 'partial_cod'
  WHERE is_partial_cod = true AND payment_method = 'cod';
