-- Migration: Add collection support to shipping rates
-- Run this in Supabase SQL Editor

-- Add collection fields to shipping_rates table
ALTER TABLE shipping_rates
    ADD COLUMN IF NOT EXISTS applies_to_collections BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS collection_ids TEXT[] DEFAULT '{}';
