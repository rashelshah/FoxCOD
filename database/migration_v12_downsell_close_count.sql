-- Migration v12: Add form_close_count column for downsell campaigns
-- Tracks how many times form must be closed before showing downsell

ALTER TABLE upsell_offers
ADD COLUMN IF NOT EXISTS form_close_count INTEGER DEFAULT 1;
