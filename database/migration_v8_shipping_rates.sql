-- Migration: Create shipping_rates table for comprehensive shipping management
-- Created: 2025

CREATE TABLE IF NOT EXISTS shipping_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_domain TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    price NUMERIC NOT NULL DEFAULT 0,

    -- Conditions
    condition_type TEXT DEFAULT 'none', -- 'none', 'order_price', 'order_quantity', 'order_weight'
    min_value NUMERIC,
    max_value NUMERIC,

    -- Restrictions
    applies_to_products BOOLEAN DEFAULT FALSE,
    product_ids TEXT[] DEFAULT '{}',

    applies_to_countries BOOLEAN DEFAULT FALSE,
    country_codes TEXT[] DEFAULT '{}',

    applies_to_states BOOLEAN DEFAULT FALSE,
    state_codes TEXT[] DEFAULT '{}',

    is_active BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for fast lookups by shop domain
CREATE INDEX IF NOT EXISTS idx_shipping_rates_shop ON shipping_rates(shop_domain);

-- Index for active rates only (for storefront queries)
CREATE INDEX IF NOT EXISTS idx_shipping_rates_active ON shipping_rates(shop_domain, is_active);

-- Add RLS policies (Row Level Security) if using Supabase
-- Enable RLS
ALTER TABLE shipping_rates ENABLE ROW LEVEL SECURITY;

-- Policy: Shops can only see their own shipping rates
CREATE POLICY shop_shipping_rates_select
    ON shipping_rates
    FOR SELECT
    USING (shop_domain = current_setting('request.jwt.claims.shop_domain', true)::text);

-- Policy: Shops can only insert their own shipping rates
CREATE POLICY shop_shipping_rates_insert
    ON shipping_rates
    FOR INSERT
    WITH CHECK (shop_domain = current_setting('request.jwt.claims.shop_domain', true)::text);

-- Policy: Shops can only update their own shipping rates
CREATE POLICY shop_shipping_rates_update
    ON shipping_rates
    FOR UPDATE
    USING (shop_domain = current_setting('request.jwt.claims.shop_domain', true)::text);

-- Policy: Shops can only delete their own shipping rates
CREATE POLICY shop_shipping_rates_delete
    ON shipping_rates
    FOR DELETE
    USING (shop_domain = current_setting('request.jwt.claims.shop_domain', true)::text);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_shipping_rates_updated_at
    BEFORE UPDATE ON shipping_rates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
