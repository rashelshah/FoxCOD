-- Migration v6: Make currency column dynamic
-- Remove hardcoded 'INR' default so currency is always explicitly set from storefront
-- Existing orders already have 'INR' stored, so no data is lost.

-- Step 1: Back-fill any NULL rows (safety)
UPDATE order_logs SET currency = 'INR' WHERE currency IS NULL;

-- Step 2: Remove default
ALTER TABLE order_logs ALTER COLUMN currency DROP DEFAULT;

-- Step 3: Ensure NOT NULL
ALTER TABLE order_logs ALTER COLUMN currency SET NOT NULL;
