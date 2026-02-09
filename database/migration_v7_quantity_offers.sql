-- =============================================
-- Migration V7: Quantity Offers
-- Run this in your Supabase SQL Editor
-- =============================================

-- =============================================
-- QUANTITY_OFFER_GROUPS TABLE
-- Stores quantity/bundle offer configurations per shop
-- =============================================
CREATE TABLE IF NOT EXISTS quantity_offer_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_domain VARCHAR(255) NOT NULL,
  
  -- Offer identification
  name VARCHAR(255) NOT NULL DEFAULT 'New Quantity Offer',
  active BOOLEAN DEFAULT false,
  
  -- Product targeting
  product_ids JSONB DEFAULT '[]'::jsonb,
  
  -- Offer tiers (quantity, price, discount, label)
  offers JSONB DEFAULT '[]'::jsonb,
  
  -- Design settings (colors, fonts, layout)
  design JSONB DEFAULT '{}'::jsonb,
  
  -- Placement: 'inside_form' | 'above_button'
  placement VARCHAR(50) DEFAULT 'inside_form',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Foreign key
  CONSTRAINT fk_quantity_offers_shop 
    FOREIGN KEY (shop_domain) 
    REFERENCES shops(shop_domain) 
    ON DELETE CASCADE
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_quantity_offers_shop ON quantity_offer_groups(shop_domain);
CREATE INDEX IF NOT EXISTS idx_quantity_offers_active ON quantity_offer_groups(active);
CREATE INDEX IF NOT EXISTS idx_quantity_offers_updated ON quantity_offer_groups(updated_at DESC);

-- GIN index for product_ids JSONB array lookups
CREATE INDEX IF NOT EXISTS idx_quantity_offers_products ON quantity_offer_groups USING GIN (product_ids);

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================
ALTER TABLE quantity_offer_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to quantity_offer_groups" ON quantity_offer_groups
  FOR ALL USING (auth.role() = 'service_role');

-- =============================================
-- UPDATE TRIGGER
-- =============================================
CREATE TRIGGER update_quantity_offers_updated_at
  BEFORE UPDATE ON quantity_offer_groups
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
