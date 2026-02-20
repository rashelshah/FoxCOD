-- Migration V13: Pixel Tracking Settings
-- Stores pixel tracking configurations per shop (Facebook, TikTok, Google, Snap, Pinterest, Taboola, Kwai)

CREATE TABLE IF NOT EXISTS pixel_tracking_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_domain TEXT NOT NULL,

    provider TEXT NOT NULL, -- facebook, tiktok, google, snap, pinterest, taboola, kwai
    label TEXT, -- optional user label for the pixel

    pixel_id TEXT,
    access_token TEXT,
    conversion_api_token TEXT,

    -- Event tracking toggles
    track_initiate_checkout BOOLEAN DEFAULT true,
    track_purchase BOOLEAN DEFAULT true,
    track_add_to_cart BOOLEAN DEFAULT false,
    track_view_content BOOLEAN DEFAULT false,
    track_add_payment_info BOOLEAN DEFAULT false,

    enabled BOOLEAN DEFAULT true,

    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pixel_tracking_shop_domain_idx
    ON pixel_tracking_settings(shop_domain);
