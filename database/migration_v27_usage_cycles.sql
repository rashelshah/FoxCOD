-- Migration V27: Decouple usage tracking from subscription identity
--
-- PROBLEM THIS FIXES
-- ============================================================================
-- Order counting previously lived directly on merchant_subscriptions, keyed
-- to whatever Shopify subscription was currently active. That created an
-- abuse loophole: a merchant could burn their full order allowance, cancel
-- (collecting a prorated Shopify credit for the unused portion of the month),
-- then re-subscribe — which minted a NEW shopify_subscription_id and reset
-- order_count back to 0, granting a fresh allowance days into the same real
-- calendar cycle. Repeat indefinitely for near-free unlimited orders.
--
-- THE FIX
-- ============================================================================
-- Usage now lives in its own table, merchant_usage_cycles, keyed ONLY by shop.
-- It has no foreign key to any Shopify subscription id and is NEVER reset by
-- a subscription event (cancel, upgrade, downgrade, resubscribe, reactivate).
-- The only thing that starts a new cycle is the current one's cycle_end
-- actually passing — a real 30-day rollover. Plan changes only ever adjust
-- the ALLOWANCE (via the live plan on merchant_subscriptions) against the
-- SAME cycle's already-accrued included_orders_used; they never touch the
-- counters themselves.
--
-- Run in Supabase SQL Editor, after migration_v25_billing.sql.

-- =============================================
-- NEW TABLE: merchant_usage_cycles
-- =============================================
CREATE TABLE IF NOT EXISTS merchant_usage_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop VARCHAR(255) NOT NULL,

  -- Plan active when this cycle was created. Informational/audit only — NEVER
  -- read for enforcement or allowance math. The live plan always comes from
  -- merchant_subscriptions.plan_name, so a mid-cycle plan change immediately
  -- changes the effective allowance without touching this table's counters.
  plan_name VARCHAR(50) NOT NULL DEFAULT 'FREE',

  -- The usage window. Always 30 days. Only ever advances when cycle_end has
  -- actually passed — never in response to a subscription event.
  cycle_start TIMESTAMPTZ NOT NULL,
  cycle_end TIMESTAMPTZ NOT NULL,

  -- Raw order count for this cycle. Never reset except by natural rollover.
  included_orders_used INTEGER NOT NULL DEFAULT 0,
  -- Recomputed against the CURRENT plan's allowance on every plan change
  -- (see recomputeOverageForPlanChange in subscription.server.ts) and on
  -- every order counted. Floored at overage_charged_orders — a usage record
  -- already submitted to Shopify can never be un-submitted, so a downgrade or
  -- recompute must never report less overage than has already been billed.
  overage_orders INTEGER NOT NULL DEFAULT 0,
  overage_charged_orders INTEGER NOT NULL DEFAULT 0,
  last_usage_charge_date TIMESTAMPTZ,

  -- 'active' | 'closed'. Exactly one active cycle per shop at any time,
  -- enforced by the partial unique index below. A cycle is closed only when
  -- superseded by its natural successor on rollover.
  status VARCHAR(20) NOT NULL DEFAULT 'active',

  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- At most one ACTIVE cycle per shop. findOrCreateUsageCycle relies on this to
-- make "does an active cycle already exist" a safe, race-free check.
CREATE UNIQUE INDEX IF NOT EXISTS uq_merchant_usage_cycles_active_shop
  ON merchant_usage_cycles(shop) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_merchant_usage_cycles_shop
  ON merchant_usage_cycles(shop, created_at DESC);

-- Drives the daily overage-aggregation sweep.
CREATE INDEX IF NOT EXISTS idx_merchant_usage_cycles_pending_overage
  ON merchant_usage_cycles(shop)
  WHERE status = 'active' AND overage_orders > overage_charged_orders;

-- =============================================
-- BACKFILL from merchant_subscriptions
-- =============================================
-- Every shop's current usage window becomes its first row here, preserving
-- exactly the counts and window it already had — no merchant loses progress
-- or gets a surprise reset from this migration.
INSERT INTO merchant_usage_cycles (
  shop, plan_name, cycle_start, cycle_end,
  included_orders_used, overage_orders, overage_charged_orders,
  last_usage_charge_date, status, created_at, updated_at
)
SELECT
  ms.shop,
  ms.plan_name,
  ms.current_period_start,
  ms.current_period_end,
  ms.order_count,
  ms.overage_orders,
  ms.overage_charged_orders,
  ms.last_usage_charge_date,
  'active',
  ms.created_at,
  timezone('utc', now())
FROM merchant_subscriptions ms
WHERE NOT EXISTS (
  SELECT 1 FROM merchant_usage_cycles muc
  WHERE muc.shop = ms.shop AND muc.status = 'active'
);

-- =============================================
-- billing_usage_events: point at the cycle explicitly
-- =============================================
-- Previously deduplicated/scoped via a period_start timestamp match against
-- merchant_subscriptions. An explicit FK is more robust and survives the
-- subscription/usage split cleanly. period_start is kept on old rows for
-- historical reference but is no longer written going forward.
ALTER TABLE billing_usage_events
  ADD COLUMN IF NOT EXISTS usage_cycle_id UUID REFERENCES merchant_usage_cycles(id);

CREATE INDEX IF NOT EXISTS idx_billing_usage_events_cycle
  ON billing_usage_events(usage_cycle_id);

-- =============================================
-- billing_usage_charges: point at the cycle explicitly
-- =============================================
ALTER TABLE billing_usage_charges
  ADD COLUMN IF NOT EXISTS usage_cycle_id UUID REFERENCES merchant_usage_cycles(id);

-- =============================================
-- merchant_subscriptions: drop usage-tracking columns
-- =============================================
-- Subscription tracks billing identity and status only, from here on. Usage
-- allowance tracking lives exclusively in merchant_usage_cycles above.
ALTER TABLE merchant_subscriptions DROP COLUMN IF EXISTS current_period_start;
ALTER TABLE merchant_subscriptions DROP COLUMN IF EXISTS current_period_end;
ALTER TABLE merchant_subscriptions DROP COLUMN IF EXISTS included_orders;
ALTER TABLE merchant_subscriptions DROP COLUMN IF EXISTS order_count;
ALTER TABLE merchant_subscriptions DROP COLUMN IF EXISTS overage_orders;
ALTER TABLE merchant_subscriptions DROP COLUMN IF EXISTS overage_charged_orders;
ALTER TABLE merchant_subscriptions DROP COLUMN IF EXISTS last_usage_charge_date;

DROP INDEX IF EXISTS idx_merchant_subscriptions_pending_overage;

-- =============================================
-- ATOMIC COUNTERS — now target merchant_usage_cycles
-- =============================================
-- p_included_orders is the CURRENT plan's allowance (-1 = unlimited), passed
-- in fresh on every call so a plan change takes effect on the very next order
-- without needing any separate reconciliation step.
DROP FUNCTION IF EXISTS billing_increment_order_count(VARCHAR, INTEGER);
CREATE OR REPLACE FUNCTION billing_increment_order_count(
  p_shop VARCHAR,
  p_included_orders INTEGER
)
RETURNS TABLE (
  id UUID,
  included_orders_used INTEGER,
  overage_orders INTEGER,
  cycle_start TIMESTAMPTZ,
  cycle_end TIMESTAMPTZ
)
LANGUAGE sql
AS $$
  UPDATE merchant_usage_cycles AS muc
  SET
    included_orders_used = muc.included_orders_used + 1,
    overage_orders = CASE
      WHEN p_included_orders < 0 THEN 0
      ELSE GREATEST(
        muc.overage_charged_orders,
        GREATEST(0, (muc.included_orders_used + 1) - p_included_orders)
      )
    END,
    updated_at = timezone('utc', now())
  WHERE muc.shop = p_shop AND muc.status = 'active'
  RETURNING muc.id, muc.included_orders_used, muc.overage_orders, muc.cycle_start, muc.cycle_end;
$$;

DROP FUNCTION IF EXISTS billing_decrement_order_count(VARCHAR, INTEGER);
CREATE OR REPLACE FUNCTION billing_decrement_order_count(
  p_shop VARCHAR,
  p_included_orders INTEGER
)
RETURNS TABLE (
  id UUID,
  included_orders_used INTEGER,
  overage_orders INTEGER
)
LANGUAGE sql
AS $$
  UPDATE merchant_usage_cycles AS muc
  SET
    included_orders_used = GREATEST(0, muc.included_orders_used - 1),
    overage_orders = CASE
      WHEN p_included_orders < 0 THEN 0
      ELSE GREATEST(
        muc.overage_charged_orders,
        GREATEST(0, GREATEST(0, muc.included_orders_used - 1) - p_included_orders)
      )
    END,
    updated_at = timezone('utc', now())
  WHERE muc.shop = p_shop AND muc.status = 'active'
  RETURNING muc.id, muc.included_orders_used, muc.overage_orders;
$$;

-- Recomputes overage against a NEW plan's allowance without touching
-- included_orders_used. Called on every upgrade, downgrade, and cancel.
-- Floored at overage_charged_orders for the same reason as the functions
-- above — already-billed usage can never be un-billed by a plan change.
CREATE OR REPLACE FUNCTION billing_recompute_overage(
  p_shop VARCHAR,
  p_included_orders INTEGER
)
RETURNS TABLE (
  id UUID,
  included_orders_used INTEGER,
  overage_orders INTEGER
)
LANGUAGE sql
AS $$
  UPDATE merchant_usage_cycles AS muc
  SET
    overage_orders = CASE
      WHEN p_included_orders < 0 THEN 0
      ELSE GREATEST(
        muc.overage_charged_orders,
        GREATEST(0, muc.included_orders_used - p_included_orders)
      )
    END,
    updated_at = timezone('utc', now())
  WHERE muc.shop = p_shop AND muc.status = 'active'
  RETURNING muc.id, muc.included_orders_used, muc.overage_orders;
$$;

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================
ALTER TABLE merchant_usage_cycles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role has full access to merchant_usage_cycles" ON merchant_usage_cycles;
CREATE POLICY "Service role has full access to merchant_usage_cycles" ON merchant_usage_cycles
  FOR ALL USING (auth.role() = 'service_role');
