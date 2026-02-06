-- =============================================
-- Migration v4: Add Address Fields to order_logs
-- Adds city, state, pincode columns for enhanced autofill
-- Run this in your Supabase SQL Editor
-- =============================================

-- Add city column
ALTER TABLE order_logs
ADD COLUMN IF NOT EXISTS city TEXT;

-- Add state column
ALTER TABLE order_logs
ADD COLUMN IF NOT EXISTS state TEXT;

-- Add pincode column
ALTER TABLE order_logs
ADD COLUMN IF NOT EXISTS pincode TEXT;

-- Verify migration (optional):
-- SELECT column_name FROM information_schema.columns 
-- WHERE table_name = 'order_logs' 
-- AND column_name IN ('city', 'state', 'pincode');
