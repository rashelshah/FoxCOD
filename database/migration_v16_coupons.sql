-- Migration v16: Coupon field settings and order log totals

ALTER TABLE form_settings
ADD COLUMN IF NOT EXISTS enable_coupon_field BOOLEAN DEFAULT false;

ALTER TABLE form_settings
ADD COLUMN IF NOT EXISTS coupon_field_position INTEGER DEFAULT 13;

ALTER TABLE form_settings
ADD COLUMN IF NOT EXISTS coupons JSONB DEFAULT '[]'::jsonb;

ALTER TABLE order_logs
ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(100);

ALTER TABLE order_logs
ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10, 2) DEFAULT 0;

ALTER TABLE order_logs
ADD COLUMN IF NOT EXISTS original_total DECIMAL(10, 2);

ALTER TABLE order_logs
ADD COLUMN IF NOT EXISTS final_total DECIMAL(10, 2);

CREATE INDEX IF NOT EXISTS idx_order_logs_coupon_code ON order_logs(shop_domain, coupon_code);
