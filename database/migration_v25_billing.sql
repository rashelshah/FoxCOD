-- Migration V25: Subscription & usage-based billing (Shopify Billing API)
--
-- Three tables:
--   merchant_subscriptions  — one row per shop: current plan, cycle, period window, counters
--   billing_usage_events    — one row per counted order; UNIQUE(shop, event_key) makes
--                             order counting idempotent no matter how many code paths
--                             or webhook retries try to count the same order
--   billing_usage_charges   — one row per usage charge submitted to Shopify; the unique
--                             idempotency_key is what protects against double billing
--
-- Run in Supabase SQL Editor.

-- =============================================
-- MERCHANT SUBSCRIPTIONS
-- =============================================
CREATE TABLE IF NOT EXISTS merchant_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop VARCHAR(255) NOT NULL UNIQUE,

  -- Shopify Billing API references (NULL while on the Free plan)
  shopify_subscription_id VARCHAR(255),
  -- Line item that carries appUsagePricingDetails; usage charges target this id
  shopify_usage_line_item_id VARCHAR(255),

  -- Plan state. plan_name holds the PlanKey from app/config/billing-plans.ts
  -- ('FREE' | 'PRO' | 'ADVANCED' | 'UNLIMITED'), never a display name.
  plan_name VARCHAR(50) NOT NULL DEFAULT 'FREE',
  billing_cycle VARCHAR(20) NOT NULL DEFAULT 'monthly',
  -- active | pending | cancelled | expired | frozen | declined
  status VARCHAR(30) NOT NULL DEFAULT 'active',

  -- USAGE window — the period the order allowance is measured over. Always 30
  -- days, anchored to the subscription start date (or install date on Free), and
  -- NEVER the calendar month. A yearly subscriber still gets their included
  -- orders per month, so this deliberately does not follow the annual charge.
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  current_period_end TIMESTAMPTZ NOT NULL DEFAULT (timezone('utc', now()) + INTERVAL '30 days'),

  -- BILLING renewal date — Shopify's appSubscription.currentPeriodEnd. This is
  -- when the merchant's card is charged again (30 days out on monthly plans, a
  -- year out on yearly ones). Display-only; the usage window above drives resets.
  renews_on TIMESTAMPTZ,

  -- Usage counters, reset to 0 on every period rollover.
  -- included_orders is denormalised from the plan config so historical rows stay
  -- meaningful if pricing changes later.
  included_orders INTEGER NOT NULL DEFAULT 70,
  order_count INTEGER NOT NULL DEFAULT 0,
  overage_orders INTEGER NOT NULL DEFAULT 0,
  -- How many of overage_orders have already been billed to Shopify this period.
  -- overage_orders - overage_charged_orders = pending, unbilled overage.
  overage_charged_orders INTEGER NOT NULL DEFAULT 0,
  last_usage_charge_date TIMESTAMPTZ,

  -- Merchant-approved ceiling on usage charges per cycle (Shopify cappedAmount)
  usage_capped_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,

  -- Test subscriptions never charge a real card (dev stores / local testing)
  is_test BOOLEAN NOT NULL DEFAULT false,

  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_merchant_subscriptions_shop
  ON merchant_subscriptions(shop);
CREATE INDEX IF NOT EXISTS idx_merchant_subscriptions_status
  ON merchant_subscriptions(status);
-- Drives the daily aggregation sweep: shops with unbilled overage
CREATE INDEX IF NOT EXISTS idx_merchant_subscriptions_pending_overage
  ON merchant_subscriptions(shop)
  WHERE overage_orders > overage_charged_orders;

-- =============================================
-- USAGE EVENTS (idempotent order counting)
-- =============================================
CREATE TABLE IF NOT EXISTS billing_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop VARCHAR(255) NOT NULL,

  -- Stable, deduplicating identity for the counted order. Normally the Shopify
  -- order id. The UNIQUE constraint below is the single guarantee that an order
  -- is counted exactly once, regardless of webhook retries or racing writers.
  event_key VARCHAR(255) NOT NULL,

  -- cod | partial_cod | full_prepaid | native_cod
  order_type VARCHAR(30),
  shopify_order_id VARCHAR(255),
  shopify_order_name VARCHAR(255),

  -- Billing period this order was counted against
  period_start TIMESTAMPTZ NOT NULL,
  -- 1-based position within the period, assigned at insert time
  counted_index INTEGER,
  -- True when counted_index exceeded the plan's included allowance
  is_overage BOOLEAN NOT NULL DEFAULT false,

  -- Set when the order was cancelled after being counted. The row is kept
  -- rather than deleted so repeat cancellation webhooks can't decrement twice,
  -- and so the event_key stays claimed against a re-delivered orders/create.
  voided_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT uq_billing_usage_events_shop_key UNIQUE (shop, event_key)
);

CREATE INDEX IF NOT EXISTS idx_billing_usage_events_shop_period
  ON billing_usage_events(shop, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_billing_usage_events_overage
  ON billing_usage_events(shop, period_start)
  WHERE is_overage = true;

-- =============================================
-- USAGE CHARGES (aggregated Shopify appUsageRecordCreate submissions)
-- =============================================
CREATE TABLE IF NOT EXISTS billing_usage_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop VARCHAR(255) NOT NULL,

  -- Passed to appUsageRecordCreate. Shopify rejects a repeat of the same key,
  -- and the UNIQUE constraint here stops us from even attempting a duplicate.
  -- Max 255 chars (Shopify limit).
  idempotency_key VARCHAR(255) NOT NULL UNIQUE,

  shopify_usage_record_id VARCHAR(255),
  subscription_line_item_id VARCHAR(255),

  -- The overage orders this charge covers: (from_index, to_index]
  overage_orders INTEGER NOT NULL DEFAULT 0,
  from_index INTEGER NOT NULL DEFAULT 0,
  to_index INTEGER NOT NULL DEFAULT 0,

  amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',

  plan_name VARCHAR(50),
  billing_cycle VARCHAR(20),
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,

  -- pending | success | failed | capped
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  error TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_billing_usage_charges_shop
  ON billing_usage_charges(shop, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_usage_charges_status
  ON billing_usage_charges(status);

-- =============================================
-- ATOMIC ORDER COUNTER
-- =============================================
-- Increments order_count and recomputes overage in a single statement so two
-- concurrent orders can never read-modify-write the same count. Returns the
-- post-increment row. p_included_orders of -1 means unlimited (no overage).
CREATE OR REPLACE FUNCTION billing_increment_order_count(
  p_shop VARCHAR,
  p_included_orders INTEGER
)
RETURNS TABLE (
  order_count INTEGER,
  overage_orders INTEGER,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ
)
LANGUAGE sql
AS $$
  UPDATE merchant_subscriptions AS ms
  SET
    order_count = ms.order_count + 1,
    overage_orders = CASE
      WHEN p_included_orders < 0 THEN 0
      ELSE GREATEST(0, (ms.order_count + 1) - p_included_orders)
    END,
    updated_at = timezone('utc', now())
  WHERE ms.shop = p_shop
  RETURNING ms.order_count, ms.overage_orders, ms.current_period_start, ms.current_period_end;
$$;

-- Reverses one counted order (used when an order is cancelled after creation).
--
-- overage_orders is floored at overage_charged_orders: usage records already
-- submitted to Shopify cannot be reversed, so the counter must never drop below
-- what has actually been billed. The merchant keeps the benefit of the
-- cancellation for anything not yet charged.
CREATE OR REPLACE FUNCTION billing_decrement_order_count(
  p_shop VARCHAR,
  p_included_orders INTEGER
)
RETURNS TABLE (
  order_count INTEGER,
  overage_orders INTEGER
)
LANGUAGE sql
AS $$
  UPDATE merchant_subscriptions AS ms
  SET
    order_count = GREATEST(0, ms.order_count - 1),
    overage_orders = CASE
      WHEN p_included_orders < 0 THEN 0
      ELSE GREATEST(
        ms.overage_charged_orders,
        GREATEST(0, GREATEST(0, ms.order_count - 1) - p_included_orders)
      )
    END,
    updated_at = timezone('utc', now())
  WHERE ms.shop = p_shop
  RETURNING ms.order_count, ms.overage_orders;
$$;

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================
ALTER TABLE merchant_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_usage_charges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role has full access to merchant_subscriptions" ON merchant_subscriptions;
CREATE POLICY "Service role has full access to merchant_subscriptions" ON merchant_subscriptions
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role has full access to billing_usage_events" ON billing_usage_events;
CREATE POLICY "Service role has full access to billing_usage_events" ON billing_usage_events
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role has full access to billing_usage_charges" ON billing_usage_charges;
CREATE POLICY "Service role has full access to billing_usage_charges" ON billing_usage_charges
  FOR ALL USING (auth.role() = 'service_role');
