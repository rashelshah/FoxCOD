-- Migration: Add announcement_banner JSONB column to form_settings table
-- Stores the sliding announcement banner shown above the COD form title:
-- enable/disable toggle, multiple rotating statements, and background/text
-- color overrides (kept in sync with "Design with AI" theme extraction).

ALTER TABLE form_settings
ADD COLUMN IF NOT EXISTS announcement_banner JSONB;
