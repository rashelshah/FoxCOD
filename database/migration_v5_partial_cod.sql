-- =============================================
-- Migration V5: Partial Cash on Delivery Feature
-- Run this in your Supabase SQL Editor
-- =============================================

-- =============================================
-- FORM_SETTINGS: Add Partial COD Settings
-- =============================================

-- Enable/Disable Partial COD for the shop
ALTER TABLE form_settings 
ADD COLUMN IF NOT EXISTS partial_cod_enabled BOOLEAN DEFAULT false;

-- Advance amount customer pays online (in store currency, e.g., INR)
ALTER TABLE form_settings 
ADD COLUMN IF NOT EXISTS partial_cod_advance_amount INTEGER DEFAULT 100;

-- Commission per partial COD order (for app billing)
ALTER TABLE form_settings 
ADD COLUMN IF NOT EXISTS partial_cod_commission NUMERIC(10,2) DEFAULT 0;

-- =============================================
-- ORDER_LOGS: Add Partial COD Tracking
-- =============================================

-- Whether this order used partial COD
ALTER TABLE order_logs 
ADD COLUMN IF NOT EXISTS is_partial_cod BOOLEAN DEFAULT false;

-- Advance amount that was paid online
ALTER TABLE order_logs 
ADD COLUMN IF NOT EXISTS advance_amount DECIMAL(10,2);

-- Remaining amount to collect on delivery
ALTER TABLE order_logs 
ADD COLUMN IF NOT EXISTS remaining_cod_amount DECIMAL(10,2);

-- =============================================
-- INDEX for Partial COD filtering
-- =============================================
CREATE INDEX IF NOT EXISTS idx_order_logs_partial_cod ON order_logs(is_partial_cod);

-- =============================================
-- COMMENTS
-- =============================================
COMMENT ON COLUMN form_settings.partial_cod_enabled IS 'Whether partial COD option is shown to customers';
COMMENT ON COLUMN form_settings.partial_cod_advance_amount IS 'Fixed advance amount customer pays online';
COMMENT ON COLUMN form_settings.partial_cod_commission IS 'App commission per partial COD order';
COMMENT ON COLUMN order_logs.is_partial_cod IS 'True if customer chose partial COD payment';
COMMENT ON COLUMN order_logs.advance_amount IS 'Amount paid online via Shopify checkout';
COMMENT ON COLUMN order_logs.remaining_cod_amount IS 'Amount to collect on delivery';
