-- Migration V15: Fraud Protection Settings
-- Stores fraud protection rules per shop (block lists, order limits, postal codes)

CREATE TABLE IF NOT EXISTS fraud_protection_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_domain TEXT NOT NULL UNIQUE,

    -- Order limit rules
    limit_orders_enabled BOOLEAN DEFAULT FALSE,
    max_orders INTEGER,
    limit_hours INTEGER,

    -- Quantity limit rules
    limit_quantity_enabled BOOLEAN DEFAULT FALSE,
    max_quantity INTEGER,

    -- Block lists
    blocked_phone_numbers TEXT[] DEFAULT '{}',
    blocked_emails TEXT[] DEFAULT '{}',
    blocked_ip_addresses TEXT[] DEFAULT '{}',

    -- Allow override
    allowed_ip_addresses TEXT[] DEFAULT '{}',

    -- Postal code restrictions
    postal_code_mode TEXT DEFAULT 'none', -- none | allow_only | block_only
    postal_codes TEXT[] DEFAULT '{}',

    -- Block message
    blocked_message TEXT DEFAULT 'Sorry, you are not allowed to place orders.',

    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fraud_protection_shop_domain_idx
    ON fraud_protection_settings(shop_domain);
