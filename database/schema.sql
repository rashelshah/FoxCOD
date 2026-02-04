-- =============================================
-- Shopify COD App - Supabase Database Schema
-- Run this in your Supabase SQL Editor
-- =============================================

-- Enable UUID extension (usually already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- SHOPS TABLE
-- Stores merchant data after app installation
-- =============================================
CREATE TABLE IF NOT EXISTS shops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_domain VARCHAR(255) UNIQUE NOT NULL,
  access_token TEXT NOT NULL,
  scope TEXT,
  installed_at TIMESTAMPTZ DEFAULT NOW(),
  uninstalled_at TIMESTAMPTZ,
  
  -- Indexes for common queries
  CONSTRAINT shops_shop_domain_unique UNIQUE (shop_domain)
);

-- Index for quick lookups by domain
CREATE INDEX IF NOT EXISTS idx_shops_domain ON shops(shop_domain);

-- =============================================
-- FORM_SETTINGS TABLE  
-- COD form customization per shop
-- =============================================
CREATE TABLE IF NOT EXISTS form_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_domain VARCHAR(255) NOT NULL,
  
  -- Form toggle
  enabled BOOLEAN DEFAULT false,
  
  -- Basic customization options
  button_text VARCHAR(100) DEFAULT 'Order Now (COD)',
  primary_color VARCHAR(7) DEFAULT '#000000',
  required_fields JSONB DEFAULT '["name", "phone", "address"]'::jsonb,
  max_quantity INTEGER DEFAULT 10,
  
  -- Extended button settings
  button_style VARCHAR(20) DEFAULT 'solid',
  button_size VARCHAR(20) DEFAULT 'large',
  button_position VARCHAR(20) DEFAULT 'below_atc',
  
  -- Form content settings
  form_title VARCHAR(255) DEFAULT 'Cash on Delivery Order',
  form_subtitle TEXT,
  success_message TEXT DEFAULT 'Your order has been placed! We will contact you shortly.',
  submit_button_text VARCHAR(100) DEFAULT 'Place COD Order',
  
  -- Display options
  show_product_image BOOLEAN DEFAULT true,
  show_price BOOLEAN DEFAULT true,
  show_quantity_selector BOOLEAN DEFAULT true,
  show_email_field BOOLEAN DEFAULT false,
  show_notes_field BOOLEAN DEFAULT false,
  email_required BOOLEAN DEFAULT false,
  
  -- Placeholder texts
  name_placeholder VARCHAR(255) DEFAULT 'Enter your full name',
  phone_placeholder VARCHAR(255) DEFAULT 'Enter your phone number',
  address_placeholder VARCHAR(255) DEFAULT 'Enter your delivery address',
  notes_placeholder VARCHAR(255) DEFAULT 'Any special instructions?',
  
  -- Style options
  modal_style VARCHAR(20) DEFAULT 'modern',
  animation_style VARCHAR(20) DEFAULT 'fade',
  border_radius INTEGER DEFAULT 12,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Foreign key
  CONSTRAINT fk_form_settings_shop 
    FOREIGN KEY (shop_domain) 
    REFERENCES shops(shop_domain) 
    ON DELETE CASCADE,
  CONSTRAINT form_settings_shop_domain_unique UNIQUE (shop_domain)
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_form_settings_shop ON form_settings(shop_domain);

-- =============================================
-- ORDER_LOGS TABLE
-- Track all COD orders placed through the form
-- =============================================
CREATE TABLE IF NOT EXISTS order_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_domain VARCHAR(255) NOT NULL,
  
  -- Shopify order reference
  shopify_order_id VARCHAR(255),
  shopify_order_name VARCHAR(255),
  
  -- Customer info
  customer_name VARCHAR(255),
  customer_phone VARCHAR(50),
  customer_address TEXT,
  
  -- Product info
  product_id VARCHAR(255),
  product_title VARCHAR(255),
  variant_id VARCHAR(255),
  quantity INTEGER DEFAULT 1,
  total_price DECIMAL(10, 2),
  currency VARCHAR(10) DEFAULT 'INR',
  
  -- Order status
  status VARCHAR(50) DEFAULT 'pending',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Foreign key (soft reference, no cascade)
  CONSTRAINT fk_order_logs_shop 
    FOREIGN KEY (shop_domain) 
    REFERENCES shops(shop_domain) 
    ON DELETE SET NULL
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_order_logs_shop ON order_logs(shop_domain);
CREATE INDEX IF NOT EXISTS idx_order_logs_created ON order_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_logs_status ON order_logs(status);

-- =============================================
-- ROW LEVEL SECURITY (Optional but recommended)
-- =============================================

-- Enable RLS on all tables
ALTER TABLE shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Allow service role full access (for backend)
CREATE POLICY "Service role has full access to shops" ON shops
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to form_settings" ON form_settings
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to order_logs" ON order_logs
  FOR ALL USING (auth.role() = 'service_role');

-- =============================================
-- HELPER FUNCTION: Update timestamp trigger
-- =============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to form_settings
CREATE TRIGGER update_form_settings_updated_at
  BEFORE UPDATE ON form_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
