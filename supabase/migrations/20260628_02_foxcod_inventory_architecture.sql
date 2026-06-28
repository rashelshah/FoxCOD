-- ============================================================================
-- FoxlyCOD: Inventory Architecture Migration (Phase 2)
-- Replaces old metadata tables with strict reservation tracking.
-- ============================================================================

-- Drop old tables if they exist to start fresh with the new architecture
DROP TABLE IF EXISTS order_inventory_metadata;
DROP TABLE IF EXISTS processed_inventory_events;

-- ─── 1. processed_inventory_events ───────────────────────────────────────────
-- Purpose: Prevent duplicate webhook execution.
-- Primary key: webhook_id
CREATE TABLE processed_inventory_events (
  webhook_id    text PRIMARY KEY,
  event_type    text NOT NULL,
  order_id      text NOT NULL,
  processed_at  timestamptz NOT NULL DEFAULT now()
);

-- Index for querying by order_id
CREATE INDEX idx_processed_inventory_events_order 
  ON processed_inventory_events (order_id);

-- ─── 2. order_inventory_reservations ─────────────────────────────────────────
-- Purpose: Track what FoxlyCOD reserved, by location.
CREATE TABLE order_inventory_reservations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            text NOT NULL,
  variant_id          text NOT NULL,
  inventory_item_id   text NOT NULL,
  location_id         text NOT NULL,
  reserved_quantity   integer NOT NULL DEFAULT 0,
  fulfilled_quantity  integer NOT NULL DEFAULT 0,
  cancelled_quantity  integer NOT NULL DEFAULT 0,
  refunded_quantity   integer NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Unique index to prevent duplicates and allow exact upserts/lookups
CREATE UNIQUE INDEX idx_order_inventory_reservations_unique 
  ON order_inventory_reservations (order_id, variant_id, location_id);

-- ─── 3. Row Level Security (RLS) ─────────────────────────────────────────────
ALTER TABLE processed_inventory_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE order_inventory_reservations DISABLE ROW LEVEL SECURITY;
