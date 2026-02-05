-- =============================================
-- Migration: Advanced COD Form Builder Features
-- Version: 2.0
-- Run this in your Supabase SQL Editor
-- =============================================

-- =============================================
-- ADD NEW COLUMNS TO form_settings TABLE
-- =============================================

-- Form type (popup or embedded)
ALTER TABLE form_settings 
ADD COLUMN IF NOT EXISTS form_type VARCHAR(20) DEFAULT 'popup';

-- Dynamic fields configuration JSONB
-- Stores field visibility, required status, and order
ALTER TABLE form_settings 
ADD COLUMN IF NOT EXISTS fields JSONB DEFAULT '[
  {"id":"name","label":"Full Name","type":"text","visible":true,"required":true,"order":1},
  {"id":"phone","label":"Phone Number","type":"tel","visible":true,"required":true,"order":2},
  {"id":"address","label":"Address","type":"textarea","visible":true,"required":true,"order":3},
  {"id":"zip","label":"ZIP Code","type":"text","visible":false,"required":false,"order":4},
  {"id":"state","label":"State","type":"text","visible":false,"required":false,"order":5},
  {"id":"city","label":"City","type":"text","visible":false,"required":false,"order":6},
  {"id":"email","label":"Email","type":"email","visible":false,"required":false,"order":7},
  {"id":"notes","label":"Notes","type":"textarea","visible":false,"required":false,"order":8},
  {"id":"quantity","label":"Quantity","type":"number","visible":true,"required":false,"order":9},
  {"id":"marketing","label":"Buyer accepts marketing","type":"checkbox","visible":false,"required":false,"order":10}
]'::jsonb;

-- Content blocks configuration
ALTER TABLE form_settings 
ADD COLUMN IF NOT EXISTS blocks JSONB DEFAULT '{
  "order_summary": true,
  "shipping_options": false,
  "cart_quantity_offers": false,
  "buyer_marketing": false
}'::jsonb;

-- Custom fields created by merchant
ALTER TABLE form_settings 
ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '[]'::jsonb;

-- Form styles (colors, alignment, etc.)
ALTER TABLE form_settings 
ADD COLUMN IF NOT EXISTS styles JSONB DEFAULT '{
  "textColor": "#333333",
  "backgroundColor": "#ffffff",
  "labelAlignment": "left",
  "iconColor": "#6366f1",
  "iconBackground": "#f3f4f6",
  "borderRadius": 12,
  "shadow": true
}'::jsonb;

-- Extended button styles
ALTER TABLE form_settings 
ADD COLUMN IF NOT EXISTS button_styles JSONB DEFAULT '{
  "textColor": "#ffffff",
  "backgroundColor": "#6366f1",
  "borderColor": "#6366f1",
  "borderWidth": 0,
  "borderRadius": 12,
  "shadow": true,
  "animation": "none"
}'::jsonb;

-- Shipping options configuration
ALTER TABLE form_settings 
ADD COLUMN IF NOT EXISTS shipping_options JSONB DEFAULT '{
  "enabled": false,
  "defaultOption": "free_shipping",
  "options": [
    {"id": "free_shipping", "label": "Free Shipping", "price": 0},
    {"id": "standard", "label": "Standard Shipping", "price": 50},
    {"id": "express", "label": "Express Shipping", "price": 100}
  ]
}'::jsonb;

-- =============================================
-- VERIFY MIGRATION
-- =============================================
-- Run this to verify the columns were added:
-- SELECT column_name, data_type, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'form_settings' 
-- AND column_name IN ('form_type', 'fields', 'blocks', 'custom_fields', 'styles', 'button_styles', 'shipping_options');
