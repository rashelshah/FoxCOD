-- Adds the generic country_restrictions JSONB column to partial_payment_settings

-- ── 1. partial_payment_settings ──────────────────────────────────────────────
ALTER TABLE partial_payment_settings
ADD COLUMN IF NOT EXISTS country_restrictions JSONB DEFAULT '{
  "full_cod": { "allowedCountries": [], "excludedCountries": [] },
  "partial_payment": { "allowedCountries": [], "excludedCountries": [] },
  "full_prepaid": { "allowedCountries": [], "excludedCountries": [] }
}'::jsonb;
