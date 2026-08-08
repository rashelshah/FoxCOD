/**
 * Shopify Billing API — subscription management
 * ============================================================================
 * Owns the `merchant_subscriptions` row for each shop and every call into
 * Shopify's App Subscription API.
 *
 * Two distinct clocks live in this file — keep them straight:
 *
 *   USAGE window  (current_period_start → current_period_end)
 *       Always 30 days. Resets the order counter. Anchored to the subscription
 *       start date, never the calendar month. A yearly subscriber still gets
 *       their included orders *per month*, which is why this is not the same as:
 *
 *   BILLING period (renews_on)
 *       Shopify's `appSubscription.currentPeriodEnd` — when the merchant's card
 *       is charged next. 30 days out on monthly plans, a year out on yearly.
 *       Display only.
 *
 * Shopify is the source of truth for what the merchant is paying for.
 * `syncFromShopify` reconciles our row against it; nothing else may promote a
 * shop to a paid plan.
 * ============================================================================
 */

import { supabase } from '../../config/supabase.server';
import { unauthenticated } from '../../shopify.server';
import {
    BILLING_CURRENCY,
    DEFAULT_CYCLE,
    DEFAULT_PLAN,
    FREE_PLAN_PERIOD_DAYS,
    chargesOverage,
    getPlan,
    getPlanPrice,
    parseSubscriptionName,
    resolveCycle,
    resolvePlanKey,
    shopifySubscriptionName,
    type BillingCycle,
    type PlanKey,
} from '../../config/billing-plans';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export type SubscriptionStatus =
    | 'active'
    | 'pending'
    | 'cancelled'
    | 'expired'
    | 'frozen'
    | 'declined';

export interface MerchantSubscription {
    id: string;
    shop: string;
    shopify_subscription_id: string | null;
    shopify_usage_line_item_id: string | null;
    plan_name: PlanKey;
    billing_cycle: BillingCycle;
    status: SubscriptionStatus;
    current_period_start: string;
    current_period_end: string;
    renews_on: string | null;
    included_orders: number;
    order_count: number;
    overage_orders: number;
    overage_charged_orders: number;
    last_usage_charge_date: string | null;
    usage_capped_amount: number;
    is_test: boolean;
    cancelled_at: string | null;
    created_at: string;
    updated_at: string;
}

/** Minimal shape of the Shopify Admin GraphQL client used here. */
export interface AdminGraphqlClient {
    graphql: (
        query: string,
        options?: { variables?: Record<string, unknown> },
    ) => Promise<Response>;
}

const TABLE = 'merchant_subscriptions';
const DAY_MS = 86_400_000;

/** Length of one usage window. Same for every plan and both billing cycles. */
export const USAGE_PERIOD_MS = FREE_PLAN_PERIOD_DAYS * DAY_MS;

// ────────────────────────────────────────────────────────────────────────────
// Test mode
// ────────────────────────────────────────────────────────────────────────────

/**
 * Test subscriptions go through the whole approval flow but never charge a real
 * card. Defaults to on outside production so local and dev-store work is free;
 * set SHOPIFY_BILLING_TEST explicitly to override in either direction.
 */
export function isBillingTestMode(): boolean {
    const flag = process.env.SHOPIFY_BILLING_TEST;
    if (flag != null && flag !== '') return flag.toLowerCase() === 'true';
    return process.env.NODE_ENV !== 'production';
}

// ────────────────────────────────────────────────────────────────────────────
// GraphQL
// ────────────────────────────────────────────────────────────────────────────

const ACTIVE_SUBSCRIPTIONS_QUERY = `#graphql
  query FoxlyBillingActiveSubscriptions {
    currentAppInstallation {
      activeSubscriptions {
        id
        name
        status
        test
        currentPeriodEnd
        createdAt
        trialDays
        lineItems {
          id
          plan {
            pricingDetails {
              __typename
              ... on AppRecurringPricing {
                interval
                price { amount currencyCode }
              }
              ... on AppUsagePricing {
                terms
                cappedAmount { amount currencyCode }
                balanceUsed { amount currencyCode }
              }
            }
          }
        }
      }
    }
  }
`;

const APP_SUBSCRIPTION_CREATE = `#graphql
  mutation FoxlyBillingSubscriptionCreate(
    $name: String!
    $lineItems: [AppSubscriptionLineItemInput!]!
    $returnUrl: URL!
    $test: Boolean
    $trialDays: Int
    $replacementBehavior: AppSubscriptionReplacementBehavior
  ) {
    appSubscriptionCreate(
      name: $name
      lineItems: $lineItems
      returnUrl: $returnUrl
      test: $test
      trialDays: $trialDays
      replacementBehavior: $replacementBehavior
    ) {
      confirmationUrl
      appSubscription { id name status currentPeriodEnd test }
      userErrors { field message }
    }
  }
`;

const APP_SUBSCRIPTION_CANCEL = `#graphql
  mutation FoxlyBillingSubscriptionCancel($id: ID!, $prorate: Boolean) {
    appSubscriptionCancel(id: $id, prorate: $prorate) {
      appSubscription { id status }
      userErrors { field message }
    }
  }
`;

const APP_SUBSCRIPTION_LINE_ITEM_UPDATE = `#graphql
  mutation FoxlyBillingCapUpdate($id: ID!, $cappedAmount: MoneyInput!) {
    appSubscriptionLineItemUpdate(id: $id, cappedAmount: $cappedAmount) {
      confirmationUrl
      appSubscription { id }
      userErrors { field message }
    }
  }
`;

/** Resolve an offline-session Admin client for a shop outside a request context. */
export async function getAdminClient(shop: string): Promise<AdminGraphqlClient | null> {
    try {
        const { admin } = await unauthenticated.admin(shop);
        return admin as unknown as AdminGraphqlClient;
    } catch (error: any) {
        console.error(`[Billing] Could not get admin client for ${shop}:`, error?.message);
        return null;
    }
}

async function runGraphql<T = any>(
    admin: AdminGraphqlClient,
    query: string,
    variables?: Record<string, unknown>,
): Promise<T> {
    const response = await admin.graphql(query, variables ? { variables } : undefined);
    const body: any = await response.json();
    if (body?.errors?.length) {
        throw new Error(body.errors.map((e: any) => e.message).join('; '));
    }
    return body?.data as T;
}

// ────────────────────────────────────────────────────────────────────────────
// Record access
// ────────────────────────────────────────────────────────────────────────────

function normalizeRecord(row: any): MerchantSubscription {
    return {
        ...row,
        plan_name: resolvePlanKey(row.plan_name),
        billing_cycle: resolveCycle(row.billing_cycle),
        included_orders: Number(row.included_orders ?? 0),
        order_count: Number(row.order_count ?? 0),
        overage_orders: Number(row.overage_orders ?? 0),
        overage_charged_orders: Number(row.overage_charged_orders ?? 0),
        usage_capped_amount: Number(row.usage_capped_amount ?? 0),
    } as MerchantSubscription;
}

export async function getSubscriptionRecord(shop: string): Promise<MerchantSubscription | null> {
    const { data, error } = await supabase.from(TABLE).select('*').eq('shop', shop).maybeSingle();
    if (error) {
        console.error('[Billing] Error reading subscription:', error);
        throw error;
    }
    return data ? normalizeRecord(data) : null;
}

/**
 * Return the shop's subscription row, creating a Free-plan row on first touch.
 * The upsert is ignoreDuplicates so two concurrent callers can't both insert.
 */
export async function ensureSubscription(shop: string): Promise<MerchantSubscription> {
    const existing = await getSubscriptionRecord(shop);
    if (existing) return existing;

    const now = new Date();
    const plan = getPlan(DEFAULT_PLAN);

    const { error } = await supabase.from(TABLE).upsert(
        {
            shop,
            plan_name: DEFAULT_PLAN,
            billing_cycle: DEFAULT_CYCLE,
            status: 'active',
            current_period_start: now.toISOString(),
            current_period_end: new Date(now.getTime() + USAGE_PERIOD_MS).toISOString(),
            included_orders: plan.includedOrders,
            order_count: 0,
            overage_orders: 0,
            overage_charged_orders: 0,
            usage_capped_amount: 0,
            is_test: isBillingTestMode(),
        },
        { onConflict: 'shop', ignoreDuplicates: true },
    );
    if (error) {
        console.error('[Billing] Error creating subscription row:', error);
        throw error;
    }

    const created = await getSubscriptionRecord(shop);
    if (!created) throw new Error(`[Billing] Failed to create subscription row for ${shop}`);
    return created;
}

export async function updateSubscriptionRecord(
    shop: string,
    patch: Partial<Omit<MerchantSubscription, 'id' | 'shop' | 'created_at'>>,
): Promise<MerchantSubscription> {
    const { data, error } = await supabase
        .from(TABLE)
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('shop', shop)
        .select()
        .single();
    if (error) {
        console.error('[Billing] Error updating subscription:', error);
        throw error;
    }
    return normalizeRecord(data);
}

// ────────────────────────────────────────────────────────────────────────────
// Usage period rollover
// ────────────────────────────────────────────────────────────────────────────

/**
 * Advance the usage window if it has elapsed, resetting counters.
 *
 * Any overage the closing period accrued but hasn't billed is flushed FIRST —
 * Shopify only accepts a usage record against the period it belongs to, so
 * skipping this would silently drop revenue.
 *
 * Windows advance in whole 30-day steps, so a shop that went quiet for months
 * lands on a window that actually contains `now` rather than a stale one.
 */
export async function rollUsagePeriodIfNeeded(
    record: MerchantSubscription,
    admin?: AdminGraphqlClient | null,
): Promise<MerchantSubscription> {
    const now = Date.now();
    let periodEnd = new Date(record.current_period_end).getTime();
    if (!Number.isFinite(periodEnd) || now < periodEnd) return record;

    const pending = record.overage_orders - record.overage_charged_orders;
    if (pending > 0) {
        try {
            const { submitPendingUsage } = await import('./usage-charges.server');
            await submitPendingUsage(record, admin);
        } catch (error: any) {
            // Never block the reset on a billing failure — the charge is retried
            // by the daily sweep, and a stuck window would break enforcement.
            console.error(
                `[Billing] Failed to flush overage for ${record.shop} before period reset:`,
                error?.message,
            );
        }
    }

    let periodStart = new Date(record.current_period_start).getTime();
    while (periodEnd <= now) {
        periodStart = periodEnd;
        periodEnd = periodStart + USAGE_PERIOD_MS;
    }

    // Re-read the allowance from config so plan changes made in billing-plans.ts
    // take effect at the start of the next cycle.
    const plan = getPlan(record.plan_name);

    console.log(
        `[Billing] Usage period rolled for ${record.shop}: ` +
        `${new Date(periodStart).toISOString()} → ${new Date(periodEnd).toISOString()}`,
    );

    return updateSubscriptionRecord(record.shop, {
        current_period_start: new Date(periodStart).toISOString(),
        current_period_end: new Date(periodEnd).toISOString(),
        included_orders: plan.includedOrders,
        order_count: 0,
        overage_orders: 0,
        overage_charged_orders: 0,
    });
}

/** Fetch the shop's row, creating it if needed and rolling an elapsed period. */
export async function getCurrentSubscription(
    shop: string,
    admin?: AdminGraphqlClient | null,
): Promise<MerchantSubscription> {
    const record = await ensureSubscription(shop);
    return rollUsagePeriodIfNeeded(record, admin);
}

// ────────────────────────────────────────────────────────────────────────────
// Shopify reconciliation
// ────────────────────────────────────────────────────────────────────────────

interface ShopifySubscriptionSummary {
    id: string;
    name: string;
    status: string;
    test: boolean;
    currentPeriodEnd: string | null;
    createdAt: string | null;
    usageLineItemId: string | null;
    usageCappedAmount: number;
    usageBalanceUsed: number;
    recurringAmount: number;
    interval: string | null;
}

/** The app's currently active Shopify subscription, if any. */
export async function fetchActiveShopifySubscription(
    admin: AdminGraphqlClient,
): Promise<ShopifySubscriptionSummary | null> {
    const data = await runGraphql(admin, ACTIVE_SUBSCRIPTIONS_QUERY);
    const subs: any[] = data?.currentAppInstallation?.activeSubscriptions ?? [];
    if (!subs.length) return null;

    // An app can only have one active subscription per shop; if Shopify ever
    // reports more, the newest is the one the merchant actually approved.
    const sub = subs.reduce((newest, candidate) =>
        new Date(candidate.createdAt ?? 0) > new Date(newest.createdAt ?? 0) ? candidate : newest,
    );

    let usageLineItemId: string | null = null;
    let usageCappedAmount = 0;
    let usageBalanceUsed = 0;
    let recurringAmount = 0;
    let interval: string | null = null;

    for (const item of sub.lineItems ?? []) {
        const details = item?.plan?.pricingDetails;
        if (details?.__typename === 'AppUsagePricing') {
            usageLineItemId = item.id;
            usageCappedAmount = Number(details.cappedAmount?.amount ?? 0);
            usageBalanceUsed = Number(details.balanceUsed?.amount ?? 0);
        } else if (details?.__typename === 'AppRecurringPricing') {
            recurringAmount = Number(details.price?.amount ?? 0);
            interval = details.interval ?? null;
        }
    }

    return {
        id: sub.id,
        name: sub.name ?? '',
        status: sub.status ?? '',
        test: Boolean(sub.test),
        currentPeriodEnd: sub.currentPeriodEnd ?? null,
        createdAt: sub.createdAt ?? null,
        usageLineItemId,
        usageCappedAmount,
        usageBalanceUsed,
        recurringAmount,
        interval,
    };
}

/**
 * Reconcile the local row against Shopify. This is the ONLY path that may move a
 * shop onto a paid plan — a merchant cannot reach one by manipulating the client.
 *
 * A subscription id we haven't seen before means the merchant just approved a
 * new plan, which starts a fresh billing period: flush any unbilled overage from
 * the old plan, then restart the usage window and counters.
 */
export async function syncFromShopify(
    shop: string,
    admin?: AdminGraphqlClient | null,
): Promise<MerchantSubscription> {
    const record = await getCurrentSubscription(shop, admin);
    const client = admin ?? (await getAdminClient(shop));
    if (!client) return record;

    let remote: ShopifySubscriptionSummary | null;
    try {
        remote = await fetchActiveShopifySubscription(client);
    } catch (error: any) {
        console.error(`[Billing] Shopify subscription lookup failed for ${shop}:`, error?.message);
        return record;
    }

    // No active subscription at Shopify → the shop belongs on Free, whatever our
    // row says (merchant cancelled from the Shopify admin, charge expired, etc).
    if (!remote || remote.status !== 'ACTIVE') {
        if (record.plan_name === DEFAULT_PLAN && !record.shopify_subscription_id) return record;

        console.log(`[Billing] ${shop} has no active Shopify subscription — reverting to Free`);
        return downgradeRecordToFree(record, remote?.status);
    }

    const { planKey, cycle } = parseSubscriptionName(remote.name);
    const plan = getPlan(planKey);
    const isNewSubscription = record.shopify_subscription_id !== remote.id;

    const patch: Partial<MerchantSubscription> = {
        shopify_subscription_id: remote.id,
        shopify_usage_line_item_id: remote.usageLineItemId,
        plan_name: planKey,
        billing_cycle: cycle,
        status: 'active',
        renews_on: remote.currentPeriodEnd,
        included_orders: plan.includedOrders,
        usage_capped_amount: remote.usageCappedAmount,
        is_test: remote.test,
        cancelled_at: null,
    };

    if (isNewSubscription) {
        const pending = record.overage_orders - record.overage_charged_orders;
        if (pending > 0) {
            try {
                const { submitPendingUsage } = await import('./usage-charges.server');
                await submitPendingUsage(record, client);
            } catch (error: any) {
                console.error(
                    `[Billing] Could not flush overage before plan change for ${shop}:`,
                    error?.message,
                );
            }
        }

        // A newly approved subscription starts its own billing period, so the
        // allowance starts over rather than inheriting the old plan's usage.
        const start = remote.createdAt ? new Date(remote.createdAt) : new Date();
        patch.current_period_start = start.toISOString();
        patch.current_period_end = new Date(start.getTime() + USAGE_PERIOD_MS).toISOString();
        patch.order_count = 0;
        patch.overage_orders = 0;
        patch.overage_charged_orders = 0;

        console.log(`[Billing] ${shop} moved to ${planKey} (${cycle}) — usage window restarted`);
    }

    return updateSubscriptionRecord(shop, patch);
}

/**
 * Move the local row onto Free. `status` stays 'active' because the shop is
 * actively on the Free plan — `cancelled_at` records that a paid subscription
 * ended, and `reason` is the Shopify status that caused it (for the log trail).
 *
 * Usage counters are deliberately preserved: a merchant who drops to Free
 * mid-cycle keeps the orders they already used, so cancelling and resubscribing
 * can't be used to reset the allowance.
 */
async function downgradeRecordToFree(
    record: MerchantSubscription,
    reason?: string,
): Promise<MerchantSubscription> {
    if (reason) {
        console.log(`[Billing] ${record.shop} downgraded to Free (Shopify status: ${reason})`);
    }

    return updateSubscriptionRecord(record.shop, {
        shopify_subscription_id: null,
        shopify_usage_line_item_id: null,
        plan_name: DEFAULT_PLAN,
        billing_cycle: DEFAULT_CYCLE,
        status: 'active',
        renews_on: null,
        included_orders: getPlan(DEFAULT_PLAN).includedOrders,
        usage_capped_amount: 0,
        cancelled_at: new Date().toISOString(),
    });
}

// ────────────────────────────────────────────────────────────────────────────
// Plan changes
// ────────────────────────────────────────────────────────────────────────────

export interface SubscribeResult {
    success: boolean;
    /** Shopify-hosted approval page. Null when no approval is needed (Free). */
    confirmationUrl: string | null;
    error?: string;
}

/**
 * Start a plan change. Every upgrade AND downgrade between paid plans goes
 * through `appSubscriptionCreate` with a replacement behavior — Shopify cancels
 * and prorates the previous subscription itself. We never cancel manually to
 * simulate a change; the only real cancellation is a move to Free, which has no
 * subscription to replace it with.
 */
export async function subscribeToPlan(options: {
    shop: string;
    planKey: PlanKey;
    cycle: BillingCycle;
    returnUrl: string;
    admin?: AdminGraphqlClient | null;
}): Promise<SubscribeResult> {
    const { shop, returnUrl } = options;
    const planKey = resolvePlanKey(options.planKey);
    const cycle = resolveCycle(options.cycle);
    const plan = getPlan(planKey);

    const client = options.admin ?? (await getAdminClient(shop));
    if (!client) {
        return { success: false, confirmationUrl: null, error: 'Could not reach Shopify for this shop.' };
    }

    // Free has no Shopify subscription — cancel whatever is active instead.
    if (!plan.requiresSubscription) {
        const cancelled = await cancelSubscription({ shop, admin: client, prorate: true });
        return {
            success: cancelled.success,
            confirmationUrl: null,
            error: cancelled.error,
        };
    }

    const price = getPlanPrice(planKey, cycle);
    const lineItems: Record<string, unknown>[] = [
        {
            plan: {
                appRecurringPricingDetails: {
                    price: { amount: price, currencyCode: BILLING_CURRENCY },
                    interval: cycle === 'yearly' ? 'ANNUAL' : 'EVERY_30_DAYS',
                },
            },
        },
    ];

    // Usage line item only when Shopify can actually bill it. See the platform
    // constraint note in app/config/billing-plans.ts — an ANNUAL subscription
    // cannot carry usage pricing, and appSubscriptionCreate rejects the mix.
    if (chargesOverage(planKey, cycle)) {
        lineItems.push({
            plan: {
                appUsagePricingDetails: {
                    terms: plan.overageTerms,
                    cappedAmount: {
                        amount: plan.overageCappedAmount,
                        currencyCode: BILLING_CURRENCY,
                    },
                },
            },
        });
    }

    try {
        const data = await runGraphql(client, APP_SUBSCRIPTION_CREATE, {
            name: shopifySubscriptionName(planKey, cycle),
            lineItems,
            returnUrl,
            test: isBillingTestMode(),
            trialDays: plan.trialDays > 0 ? plan.trialDays : undefined,
            replacementBehavior: 'APPLY_IMMEDIATELY',
        });

        const payload = data?.appSubscriptionCreate;
        const userErrors: any[] = payload?.userErrors ?? [];
        if (userErrors.length) {
            const message = userErrors.map((e) => e.message).join('; ');
            console.error(`[Billing] appSubscriptionCreate failed for ${shop}:`, message);
            return { success: false, confirmationUrl: null, error: message };
        }

        if (!payload?.confirmationUrl) {
            return {
                success: false,
                confirmationUrl: null,
                error: 'Shopify did not return an approval URL.',
            };
        }

        // Nothing is written to the local row here on purpose. The plan only
        // becomes real once the merchant approves and syncFromShopify sees it.
        console.log(`[Billing] ${shop} → approval requested for ${planKey} (${cycle})`);
        return { success: true, confirmationUrl: payload.confirmationUrl };
    } catch (error: any) {
        console.error(`[Billing] subscribeToPlan error for ${shop}:`, error?.message);
        return { success: false, confirmationUrl: null, error: error?.message ?? 'Subscription failed.' };
    }
}

/** Cancel the active Shopify subscription and drop the shop to Free. */
export async function cancelSubscription(options: {
    shop: string;
    admin?: AdminGraphqlClient | null;
    prorate?: boolean;
}): Promise<{ success: boolean; error?: string }> {
    const { shop, prorate = true } = options;
    const record = await ensureSubscription(shop);

    if (!record.shopify_subscription_id) {
        await downgradeRecordToFree(record);
        return { success: true };
    }

    const client = options.admin ?? (await getAdminClient(shop));
    if (!client) return { success: false, error: 'Could not reach Shopify for this shop.' };

    try {
        // Bill whatever overage is outstanding before the subscription goes away —
        // afterwards there is no line item to charge against.
        const pending = record.overage_orders - record.overage_charged_orders;
        if (pending > 0) {
            try {
                const { submitPendingUsage } = await import('./usage-charges.server');
                await submitPendingUsage(record, client);
            } catch (error: any) {
                console.error(`[Billing] Overage flush before cancel failed for ${shop}:`, error?.message);
            }
        }

        const data = await runGraphql(client, APP_SUBSCRIPTION_CANCEL, {
            id: record.shopify_subscription_id,
            prorate,
        });

        const userErrors: any[] = data?.appSubscriptionCancel?.userErrors ?? [];
        if (userErrors.length) {
            const message = userErrors.map((e) => e.message).join('; ');
            console.error(`[Billing] appSubscriptionCancel failed for ${shop}:`, message);
            return { success: false, error: message };
        }

        await downgradeRecordToFree(record, 'CANCELLED');
        console.log(`[Billing] ${shop} subscription cancelled — now on Free`);
        return { success: true };
    } catch (error: any) {
        console.error(`[Billing] cancelSubscription error for ${shop}:`, error?.message);
        return { success: false, error: error?.message ?? 'Cancellation failed.' };
    }
}

/**
 * Raise the merchant-approved ceiling on usage charges. Shopify requires the
 * merchant to approve the new cap, so this returns a confirmation URL.
 */
export async function requestUsageCapIncrease(options: {
    shop: string;
    newCap: number;
    admin?: AdminGraphqlClient | null;
}): Promise<{ success: boolean; confirmationUrl: string | null; error?: string }> {
    const { shop, newCap } = options;
    const record = await ensureSubscription(shop);

    if (!record.shopify_usage_line_item_id) {
        return { success: false, confirmationUrl: null, error: 'This plan has no usage charges.' };
    }

    const client = options.admin ?? (await getAdminClient(shop));
    if (!client) return { success: false, confirmationUrl: null, error: 'Could not reach Shopify.' };

    try {
        const data = await runGraphql(client, APP_SUBSCRIPTION_LINE_ITEM_UPDATE, {
            id: record.shopify_usage_line_item_id,
            cappedAmount: { amount: newCap, currencyCode: BILLING_CURRENCY },
        });

        const payload = data?.appSubscriptionLineItemUpdate;
        const userErrors: any[] = payload?.userErrors ?? [];
        if (userErrors.length) {
            return { success: false, confirmationUrl: null, error: userErrors.map((e) => e.message).join('; ') };
        }

        return { success: true, confirmationUrl: payload?.confirmationUrl ?? null };
    } catch (error: any) {
        console.error(`[Billing] requestUsageCapIncrease error for ${shop}:`, error?.message);
        return { success: false, confirmationUrl: null, error: error?.message ?? 'Cap update failed.' };
    }
}

/**
 * Called from the app/uninstalled webhook. Shopify cancels the subscription on
 * its own side when an app is removed, so this only clears our billing state.
 * Usage events and charge history are preserved for reporting and disputes.
 */
export async function disableBillingForShop(shop: string): Promise<void> {
    const record = await getSubscriptionRecord(shop);
    if (!record) return;

    await updateSubscriptionRecord(shop, {
        shopify_subscription_id: null,
        shopify_usage_line_item_id: null,
        plan_name: DEFAULT_PLAN,
        billing_cycle: DEFAULT_CYCLE,
        status: 'cancelled',
        renews_on: null,
        included_orders: getPlan(DEFAULT_PLAN).includedOrders,
        usage_capped_amount: 0,
        cancelled_at: new Date().toISOString(),
    });

    console.log(`[Billing] Billing disabled for uninstalled shop ${shop}`);
}
