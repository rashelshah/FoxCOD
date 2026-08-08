-- Migration V28: Deferred (cancel-at-period-end) subscription cancellation
--
-- POLICY
-- ============================================================================
-- Cancelling a paid plan does NOT stop it immediately. The merchant keeps
-- full access to their plan (allowance, overage billing, everything) for the
-- rest of the cycle they've already paid for — the same policy competing COD
-- apps use ("you can cancel anytime and you will not get charged for the new
-- month, but for the cycle already started you will be billed for"). Only
-- once the subscription's real Shopify renewal date (renews_on) arrives does
-- the subscription actually get cancelled via appSubscriptionCancel, and the
-- shop drops to Free. No proration credit is ever issued, because nothing is
-- ever cancelled mid-cycle.
--
-- Shopify's appSubscriptionCancel mutation only supports cancelling right
-- now — there is no "cancel at period end" option on the API itself. This is
-- implemented by tracking the request locally and executing the real
-- cancellation later via a scheduled sweep (processDueCancellations in
-- subscription.server.ts, run daily from /api/billing/aggregate-usage).
--
-- Run in Supabase SQL Editor, after migration_v27_usage_cycles.sql.

ALTER TABLE merchant_subscriptions
  ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE merchant_subscriptions
  ADD COLUMN IF NOT EXISTS cancel_requested_at TIMESTAMPTZ;

-- Drives the daily cancellation sweep: shops whose deferred cancellation is due.
CREATE INDEX IF NOT EXISTS idx_merchant_subscriptions_pending_cancellation
  ON merchant_subscriptions(shop, renews_on)
  WHERE cancel_at_period_end = true;
