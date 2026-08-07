-- Migration: Add payment_mode_card_styles JSONB column to form_settings table
-- This column stores optional custom color overrides for the Payment Mode
-- selector cards (Full Prepaid / Partial Payment / Cash on Delivery).

ALTER TABLE form_settings
ADD COLUMN IF NOT EXISTS payment_mode_card_styles JSONB;
