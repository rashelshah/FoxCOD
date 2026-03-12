-- Migration: Add form_submit_button JSONB column to form_settings table
-- This column stores optional styling overrides for the form submit button

ALTER TABLE form_settings
ADD COLUMN IF NOT EXISTS form_submit_button JSONB;
