-- ============================================================================
-- FoxlyCOD: Strict Inventory Idempotency
-- Replaces webhook-based idempotency with state-based unique constraints.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.inventory_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop text NOT NULL,
    order_id text NOT NULL,
    variant_id text NOT NULL,
    action text NOT NULL,
    quantity integer NOT NULL,
    processed_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (shop, order_id, variant_id, action)
);

CREATE INDEX IF NOT EXISTS idx_inventory_events_order_id ON public.inventory_events(order_id);

-- Rename reserved_quantity to quantity to match the new architecture, and add deducted flag
ALTER TABLE public.order_inventory_reservations 
  RENAME COLUMN reserved_quantity TO quantity;

ALTER TABLE public.order_inventory_reservations 
  ADD COLUMN IF NOT EXISTS deducted boolean NOT NULL DEFAULT true;

ALTER TABLE public.inventory_events DISABLE ROW LEVEL SECURITY;
