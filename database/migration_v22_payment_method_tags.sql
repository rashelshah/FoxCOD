-- Migration v22: Payment Method Tags
-- Adds JSONB column for customizable tags on payment methods (e.g. "Most Popular")

ALTER TABLE partial_payment_settings
  ADD COLUMN IF NOT EXISTS payment_method_tags JSONB DEFAULT '{}';
