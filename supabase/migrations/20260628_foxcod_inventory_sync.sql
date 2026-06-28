-- ============================================================================
-- FoxlyCOD: Inventory Synchronization Tables Migration
-- Run this in your Supabase SQL editor or migration system.
-- ============================================================================

-- ─── 1. inventory_reservations ───────────────────────────────────────────────
-- Short-lived locks (120s TTL) to prevent race-condition overselling.
-- Created before orderCreate, released after order response.

CREATE TABLE IF NOT EXISTS inventory_reservations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id    text NOT NULL,         -- gid://shopify/ProductVariant/xxx
  quantity      integer NOT NULL CHECK (quantity > 0),
  order_reference text NOT NULL,       -- client-side correlation ID (e.g. timestamp+phone)
  expires_at    timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Index for efficient lookup by variant and expiry
CREATE INDEX IF NOT EXISTS idx_inventory_reservations_variant_expires
  ON inventory_reservations (variant_id, expires_at);

-- Index for order reference (used by releaseReservations)
CREATE INDEX IF NOT EXISTS idx_inventory_reservations_order_ref
  ON inventory_reservations (order_reference);

-- ─── 2. processed_inventory_events ───────────────────────────────────────────
-- Idempotency table: records each webhook event that triggered an inventory mutation.
-- Prevents duplicate mutations from Shopify's at-least-once webhook delivery.

CREATE TABLE IF NOT EXISTS processed_inventory_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key         text NOT NULL UNIQUE,  -- "{topic}:{shopify_order_id}"
  shopify_order_id  text NOT NULL,
  shop_domain       text NOT NULL,
  processed_at      timestamptz NOT NULL DEFAULT now()
);

-- Unique index on event_key (enforces idempotency)
CREATE UNIQUE INDEX IF NOT EXISTS idx_processed_inventory_events_key
  ON processed_inventory_events (event_key);

-- Index for lookup by order and shop
CREATE INDEX IF NOT EXISTS idx_processed_inventory_events_order
  ON processed_inventory_events (shopify_order_id, shop_domain);

-- ─── 3. order_inventory_metadata ─────────────────────────────────────────────
-- Persists the variant → inventoryItem → deducted location mapping for each order.
-- Used by cancellation and refund webhooks to restore inventory at the exact
-- location it was originally deducted from.

CREATE TABLE IF NOT EXISTS order_inventory_metadata (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_order_id      text NOT NULL,
  shop_domain           text NOT NULL,
  variant_id            text NOT NULL,         -- gid://shopify/ProductVariant/xxx
  inventory_item_id     text NOT NULL,         -- gid://shopify/InventoryItem/xxx
  deducted_location_id  text,                  -- gid://shopify/Location/xxx (set after deduction)
  deducted_quantity     integer NOT NULL CHECK (deducted_quantity > 0),
  title                 text,
  sku                   text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint: one row per order+variant
CREATE UNIQUE INDEX IF NOT EXISTS idx_order_inventory_metadata_order_variant
  ON order_inventory_metadata (shopify_order_id, variant_id);

-- Index for order lookups (cancellation/refund)
CREATE INDEX IF NOT EXISTS idx_order_inventory_metadata_order
  ON order_inventory_metadata (shopify_order_id, shop_domain);

-- ─── 4. Row Level Security (RLS) ─────────────────────────────────────────────
-- These tables are accessed exclusively by the service role (backend).
-- RLS is disabled — access is controlled at the application layer.

ALTER TABLE inventory_reservations DISABLE ROW LEVEL SECURITY;
ALTER TABLE processed_inventory_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE order_inventory_metadata DISABLE ROW LEVEL SECURITY;

-- ─── 5. Cleanup function (optional — for pg_cron or Supabase scheduled functions) ─
-- Removes expired reservations automatically. Call from your cron endpoint.

CREATE OR REPLACE FUNCTION cleanup_expired_inventory_reservations()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM inventory_reservations
  WHERE expires_at < now();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
