-- Migration v21: Payment Method Item Restrictions
-- Consolidates allow lists and restrict lists into a single JSONB column for all payment modes

-- ── 1. partial_payment_settings ──────────────────────────────────────────────
ALTER TABLE partial_payment_settings
  ADD COLUMN IF NOT EXISTS payment_method_restrictions JSONB DEFAULT '{}';
