-- Migration v23: Payment Method Descriptions
-- Adds JSONB column for customizable descriptions on payment methods

ALTER TABLE partial_payment_settings
  ADD COLUMN IF NOT EXISTS payment_method_descriptions JSONB DEFAULT '{}';
