-- Migration v19: Pure Cash on Delivery (COD) Feature
-- Adds Pure COD columns to partial_payment_settings

-- ── 1. partial_payment_settings ──────────────────────────────────────────────
ALTER TABLE partial_payment_settings
  ADD COLUMN IF NOT EXISTS pure_cod_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS pure_cod_fee_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS pure_cod_fee_name TEXT DEFAULT 'COD Fee',
  ADD COLUMN IF NOT EXISTS pure_cod_fee_type TEXT DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS pure_cod_fee_amount NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pure_cod_minimum_order_total NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pure_cod_maximum_order_total NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pure_cod_allowed_product_ids JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS pure_cod_allowed_collection_ids JSONB DEFAULT '[]';
