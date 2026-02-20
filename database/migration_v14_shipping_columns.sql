-- =============================================
-- Migration v14: Add shipping columns to order_logs
-- Run this in your Supabase SQL Editor
-- =============================================

-- Add shipping_label column
ALTER TABLE order_logs 
ADD COLUMN IF NOT EXISTS shipping_label VARCHAR(255);

-- Add shipping_price column
ALTER TABLE order_logs 
ADD COLUMN IF NOT EXISTS shipping_price DECIMAL(10, 2) DEFAULT 0;

-- Comments
COMMENT ON COLUMN order_logs.shipping_label IS 'Shipping method label chosen by customer';
COMMENT ON COLUMN order_logs.shipping_price IS 'Shipping cost';
