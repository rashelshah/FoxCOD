-- Migration V26: Deferred (cancel-at-period-end) subscription cancellation
--
-- Shopify's appSubscriptionCancel mutation only cancels immediately — there is
-- no "cancel at period end" option on the mutation itself. To let a merchant
-- keep their paid plan until their actual next renewal date (rather than being
-- dropped to Free mid-cycle, which also corrupts a mid-cycle order count
-- comparison against a much smaller Free allowance), cancellation is tracked
-- locally as a pending flag and only executed for real — via a scheduled sweep
-- — once the Shopify subscription's renews_on date arrives.
--
-- Run in Supabase SQL Editor.

ALTER TABLE merchant_subscriptions
  ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE merchant_subscriptions
  ADD COLUMN IF NOT EXISTS cancel_requested_at TIMESTAMPTZ;

-- Drives the cancellation sweep: shops whose cancellation is due.
CREATE INDEX IF NOT EXISTS idx_merchant_subscriptions_pending_cancellation
  ON merchant_subscriptions(shop, renews_on)
  WHERE cancel_at_period_end = true;
