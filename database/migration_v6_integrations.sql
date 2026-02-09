-- =============================================
-- Migration V6: Integrations Settings
-- Stores third-party integration configurations per shop
-- =============================================

-- Create integration_settings table
CREATE TABLE IF NOT EXISTS integration_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_domain VARCHAR(255) NOT NULL,
  
  -- Integration identifier (e.g., 'google_sheets', 'sms_whatsapp')
  integration_id VARCHAR(100) NOT NULL,
  
  -- Status flags
  enabled BOOLEAN DEFAULT false,
  connected BOOLEAN DEFAULT false,
  
  -- OAuth / Connection info
  connected_email VARCHAR(255),
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  
  -- Integration-specific configuration (JSONB for flexibility)
  config JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  connected_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT fk_integration_settings_shop 
    FOREIGN KEY (shop_domain) 
    REFERENCES shops(shop_domain) 
    ON DELETE CASCADE,
  
  -- Unique constraint: one setting per integration per shop
  CONSTRAINT integration_settings_unique UNIQUE (shop_domain, integration_id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_integration_settings_shop ON integration_settings(shop_domain);
CREATE INDEX IF NOT EXISTS idx_integration_settings_integration ON integration_settings(integration_id);
CREATE INDEX IF NOT EXISTS idx_integration_settings_enabled ON integration_settings(enabled) WHERE enabled = true;

-- Enable RLS
ALTER TABLE integration_settings ENABLE ROW LEVEL SECURITY;

-- Policy: Allow service role full access
CREATE POLICY "Service role has full access to integration_settings" ON integration_settings
  FOR ALL USING (auth.role() = 'service_role');

-- Apply updated_at trigger
CREATE TRIGGER update_integration_settings_updated_at
  BEFORE UPDATE ON integration_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
