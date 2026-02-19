-- Migration v11: Create upsell_offers table for Upsells & Downsells system
-- Supports multi-offer campaigns matching EasySell feature set
-- Created: 2026-02-20

CREATE TABLE IF NOT EXISTS upsell_offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_domain TEXT NOT NULL,

    -- Type: tick_upsell, click_upsell, downsell
    type TEXT NOT NULL DEFAULT 'click_upsell',

    -- Campaign info
    campaign_name TEXT NOT NULL DEFAULT '',
    active BOOLEAN DEFAULT TRUE,
    upsell_mode TEXT DEFAULT 'post_purchase',  -- post_purchase, pre_purchase

    -- Trigger rules
    show_condition_type TEXT DEFAULT 'always',  -- always, specific_products, order_value
    trigger_product_ids JSONB DEFAULT '[]'::jsonb,
    min_order_value NUMERIC DEFAULT 0,
    max_order_value NUMERIC DEFAULT 0,

    -- Offers array (up to 5 per campaign) — each has product, discount, etc.
    offers JSONB DEFAULT '[]'::jsonb,

    -- Design settings (header, timer, discount tag, accept/reject buttons)
    design JSONB DEFAULT '{}'::jsonb,

    -- Linked downsell (for click_upsell type)
    linked_downsell_id UUID,

    -- Tick upsell specific
    display_location TEXT DEFAULT 'in_form',
    checkbox_default_checked BOOLEAN DEFAULT FALSE,

    -- Ordering
    priority INTEGER DEFAULT 0,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_upsell_offers_shop ON upsell_offers(shop_domain);
CREATE INDEX IF NOT EXISTS idx_upsell_offers_type ON upsell_offers(shop_domain, type);
CREATE INDEX IF NOT EXISTS idx_upsell_offers_active ON upsell_offers(shop_domain, active);

-- RLS
ALTER TABLE upsell_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY upsell_offers_select ON upsell_offers FOR SELECT USING (true);
CREATE POLICY upsell_offers_insert ON upsell_offers FOR INSERT WITH CHECK (true);
CREATE POLICY upsell_offers_update ON upsell_offers FOR UPDATE USING (true);
CREATE POLICY upsell_offers_delete ON upsell_offers FOR DELETE USING (true);

-- Updated_at trigger
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
        CREATE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $func$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $func$ language 'plpgsql';
    END IF;
END
$$;

CREATE TRIGGER update_upsell_offers_updated_at
    BEFORE UPDATE ON upsell_offers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
