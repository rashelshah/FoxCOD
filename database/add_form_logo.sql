-- Migration: Add form_logo JSONB column to form_settings table
-- Stores the custom store logo shown above the product image/title at the
-- top of the COD form: enable/disable toggle, uploaded logo URL, horizontal
-- alignment, and size/zoom/shape overrides.

ALTER TABLE form_settings
ADD COLUMN IF NOT EXISTS form_logo JSONB;
