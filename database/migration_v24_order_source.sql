-- Migration V24: Add order_source to order_logs

-- Add order_source column to track where the order originated (product_page, cart_page, cart_drawer)
ALTER TABLE order_logs ADD COLUMN IF NOT EXISTS order_source text DEFAULT 'product_page';
