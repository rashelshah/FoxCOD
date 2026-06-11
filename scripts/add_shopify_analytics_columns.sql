-- Migration: Add granular Shopify analytics columns to order_logs
-- These columns track the exact status flags from Shopify required for accurate analytics.

ALTER TABLE public.order_logs
ADD COLUMN shopify_financial_status text,
ADD COLUMN shopify_fulfillment_status text,
ADD COLUMN shopify_cancelled_at timestamptz,
ADD COLUMN shopify_tags text[],
ADD COLUMN shopify_updated_at timestamptz;

-- Add an index to speed up analytics aggregations
CREATE INDEX idx_order_logs_shopify_financial_status 
ON public.order_logs (shopify_financial_status);

CREATE INDEX idx_order_logs_shopify_fulfillment_status 
ON public.order_logs (shopify_fulfillment_status);
