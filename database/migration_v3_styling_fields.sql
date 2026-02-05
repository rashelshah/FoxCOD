-- =============================================
-- Migration v3: Extended Styling for Button & Form Fields
-- Run this in your Supabase SQL Editor
-- =============================================
-- 
-- NO SCHEMA CHANGES REQUIRED.
-- The styles and button_styles columns are JSONB and accept new keys.
-- This migration updates existing rows to add default values for new keys
-- so old shops get the extended styling structure.
-- =============================================

-- Update form_settings to merge new styling keys into existing JSONB
-- (Optional - the app merges with DEFAULT_STYLES/DEFAULT_BUTTON_STYLES on load.
--  Running this ensures DB has complete structure for external readers.)

-- Merge new keys into styles (defaults first, then overlay existing - preserves existing values)
UPDATE form_settings
SET styles = '{"textSize":14,"fontStyle":"normal","borderColor":"#d1d5db","borderWidth":1,"iconColor":"#6b7280","iconBackground":"#f3f4f6"}'::jsonb || COALESCE(styles, '{}'::jsonb);

-- Merge new keys into button_styles
UPDATE form_settings
SET button_styles = '{"textSize":15,"fontStyle":"bold"}'::jsonb || COALESCE(button_styles, '{}'::jsonb);

-- Verify (optional):
-- SELECT shop_domain, styles, button_styles FROM form_settings LIMIT 5;
