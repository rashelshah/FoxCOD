-- Migration v18: Prepaid Discount Feature
-- Adds 3 prepaid discount configuration columns to partial_payment_settings.
--
-- Design decisions:
--   • Discount INHERITS Full Prepaid eligibility restrictions — no separate
--     min/max total or product/collection columns needed.
--   • Discount data (type, value, amount) stored in order_logs.order_payload
--     JSONB — no new order_logs columns required.
--
-- Run this in your Supabase SQL Editor.

ALTER TABLE partial_payment_settings
  ADD COLUMN IF NOT EXISTS prepaid_discount_enabled BOOLEAN       DEFAULT false,
  ADD COLUMN IF NOT EXISTS prepaid_discount_type    TEXT          DEFAULT 'percentage',
  ADD COLUMN IF NOT EXISTS prepaid_discount_value   NUMERIC(10,2) DEFAULT 0;

-- Verify
-- SELECT prepaid_discount_enabled, prepaid_discount_type, prepaid_discount_value
-- FROM partial_payment_settings LIMIT 1;
