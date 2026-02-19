-- Migration: Add shipping_rates_enabled column to form_settings
-- This column controls whether the new shipping rates system is enabled

ALTER TABLE form_settings 
ADD COLUMN IF NOT EXISTS shipping_rates_enabled BOOLEAN DEFAULT FALSE;
