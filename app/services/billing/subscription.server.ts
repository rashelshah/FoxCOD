/**
 * Shopify Billing API — subscription management
 * ============================================================================
 * Owns the `merchant_subscriptions` row for each shop and every call into
 * Shopify's App Subscription API. This file is SUBSCRIPTION-ONLY: billing
 * identity, plan, cycle, status. It holds no order counters and no usage
 * window — that lives entirely in `merchant_usage_cycles`, owned by
 * order-counter.server.ts, and is deliberately never touched by anything in
 * this file except through the one narrow recompute hook below.
 *
 * WHY THE SPLIT: usage used to live on this same row, reset whenever a new
 * Shopify subscription id showed up. That let a merchant burn their full
 * allowance, cancel (collecting a prorated credit for the unused month),
 * re-subscribe — new subscription id, fresh order_count — and repeat
 * indefinitely for near-free unlimited orders. Usage now persists across
 * every subscription event by construction: nothing in this file has the
 * ability to reset it. A plan change only ever calls
 * `recomputeOverageForPlanChange`, which re-derives overage against the new
 * plan's allowance from the SAME already-accrued count — it never resets
 * included_orders_used, and it never touches cycle_start/cycle_end. The only
 * thing that starts a new cycle is that cycle's own cycle_end passing, which
 * lives entirely in order-counter.server.ts's findOrCreateUsageCycle.
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

/**
 * Billing identity only — no usage counters, no cycle window. See
 * merchant_usage_cycles / order-counter.server.ts for order tracking.
 */
export interface MerchantSubscription {
    id: string;
    shop: string;
    shopify_subscription_id: string | null;
    shopify_usage_line_item_id: string | null;
    plan_name: PlanKey;
    billing_cycle: BillingCycle;
    status: SubscriptionStatus;
    renews_on: string | null;
    usage_capped_amount: number;
    is_test: boolean;
    cancelled_at: string | null;
    /**
     * True once the merchant has requested cancellation but the current paid
     * cycle hasn't ended yet. The Shopify subscription stays fully active —
     * billing, allowance, overage, everything — until `renews_on` arrives,
     * at which point processDueCancellations actually cancels it. No
     * proration credit is ever issued, because nothing is ever cancelled
     * mid-cycle by this app.
     */
    cancel_at_period_end: boolean;
    cancel_requested_at: string | null;
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

// ────────────────────────────────────────────────────────────────────────────
// Test mode
// ────────────────────────────────────────────────────────────────────────────

/**
 * Test subscriptions go through the whole approval flow but never charge a real
 * card. Defaults to on outside true production so local, dev-store, AND
 * Vercel Preview deployments are all free; set SHOPIFY_BILLING_TEST
 * explicitly to override in either direction.
 *
 * Deliberately does NOT trust NODE_ENV alone: Vercel builds every deployment
 * — Preview included — with NODE_ENV=production, since that just means
 * "optimized build," not "this is the live site." VERCEL_ENV is what
 * actually distinguishes them ('production' | 'preview' | 'development'), so
 * it takes priority whenever Vercel sets it. Off Vercel, NODE_ENV is the only
 * signal available, so it's the fallback.
 */
export function isBillingTestMode(): boolean {
    const flag = process.env.SHOPIFY_BILLING_TEST;
    if (flag != null && flag !== '') return flag.toLowerCase() === 'true';

    if (process.env.VERCEL_ENV) return process.env.VERCEL_ENV !== 'production';
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
        usage_capped_amount: Number(row.usage_capped_amount ?? 0),
        cancel_at_period_end: Boolean(row.cancel_at_period_end),
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
 * Does NOT create a usage cycle — call findOrCreateUsageCycle separately
 * (order-counter.server.ts) for that; the two are intentionally decoupled.
 *
 * ALSO the single safety-check chokepoint for deferred cancellations: every
 * subscription-aware code path in the app calls this function — order
 * counting, plan enforcement, the dashboard, the billing page, install — so
 * putting the "is a cancellation actually due now" check here means it runs
 * everywhere the user needs it (dashboard load, billing page load, app
 * install, any subscription-related request) without hunting down each call
 * site individually. See checkAndExecuteDueCancellation for why this is cheap.
 */
export async function ensureSubscription(
    shop: string,
    admin?: AdminGraphqlClient | null,
): Promise<MerchantSubscription> {
    let existing = await getSubscriptionRecord(shop);

    if (!existing) {
        const { error } = await supabase.from(TABLE).upsert(
            {
                shop,
                plan_name: DEFAULT_PLAN,
                billing_cycle: DEFAULT_CYCLE,
                status: 'active',
                usage_capped_amount: 0,
                is_test: isBillingTestMode(),
            },
            { onConflict: 'shop', ignoreDuplicates: true },
        );
        if (error) {
            console.error('[Billing] Error creating subscription row:', error);
            throw error;
        }

        existing = await getSubscriptionRecord(shop);
        if (!existing) throw new Error(`[Billing] Failed to create subscription row for ${shop}`);
    }

    return checkAndExecuteDueCancellation(existing, admin);
}

/** Descriptive alias for call sites (the cron sweep) that want the name to
 *  read as "reconcile this shop's cancellation state," not "get or create." */
export const syncSubscriptionFromShopify = ensureSubscription;

/**
 * The actual due-check. Pure in-memory comparison in the overwhelmingly
 * common case (no pending cancellation, or pending but not due yet) — costs
 * nothing beyond a date comparison on data already in hand, so calling it
 * from every ensureSubscription() call (including the order-creation hot
 * path) has no measurable performance impact.
 *
 * Only touches Shopify's API in the rare case a cancellation just became
 * due, and even then at most once: the CAS claim below flips
 * cancel_at_period_end to false immediately, so every other concurrent
 * caller (a second browser tab, a racing request) sees it already claimed
 * and returns without doing anything — exactly-once execution, no duplicate
 * appSubscriptionCancel calls.
 *
 * On failure, the claim is rolled back (cancel_at_period_end restored to
 * true) so the next check — or the daily cron backstop, for a shop nobody
 * happens to touch — retries instead of silently losing the cancellation.
 */
async function checkAndExecuteDueCancellation(
    record: MerchantSubscription,
    admin?: AdminGraphqlClient | null,
): Promise<MerchantSubscription> {
    if (!record.cancel_at_period_end || !record.renews_on) return record;
    if (new Date(record.renews_on).getTime() > Date.now()) return record;

    const shop = record.shop;

    // CAS claim: succeeds only for the first caller to see the flag still true.
    const { data: claimed, error: claimError } = await supabase
        .from(TABLE)
        .update({ cancel_at_period_end: false, updated_at: new Date().toISOString() })
        .eq('shop', shop)
        .eq('cancel_at_period_end', true)
        .select('*');

    if (claimError) {
        console.error(`[Billing] Could not claim due cancellation for ${shop}:`, claimError);
        return record;
    }
    if (!claimed || claimed.length === 0) {
        // Another request already claimed it (or it was undone since we read
        // `record`) — nothing left for this caller to do.
        return record;
    }

    const claimedRecord = normalizeRecord(claimed[0]);

    try {
        const client = admin ?? (await getAdminClient(shop));
        if (!client) throw new Error('Could not reach Shopify for this shop.');

        if (!claimedRecord.shopify_subscription_id) {
            // Nothing active on Shopify's side to cancel — just finalize locally.
            return await downgradeRecordToFree(claimedRecord, 'CANCELLED');
        }

        if (claimedRecord.shopify_usage_line_item_id) {
            try {
                const { submitPendingUsageForShop } = await import('./usage-charges.server');
                await submitPendingUsageForShop(shop, client);
            } catch (flushError: any) {
                console.error(`[Billing] Overage flush before due cancel failed for ${shop}:`, flushError?.message);
            }
        }

        // prorate: false — the merchant already fully consumed this cycle,
        // there's nothing unused left to credit back.
        const cancelData = await runGraphql(client, APP_SUBSCRIPTION_CANCEL, {
            id: claimedRecord.shopify_subscription_id,
            prorate: false,
        });

        const userErrors: any[] = cancelData?.appSubscriptionCancel?.userErrors ?? [];
        if (userErrors.length) throw new Error(userErrors.map((e: any) => e.message).join('; '));

        console.log(`[Billing] ${shop} deferred cancellation executed — now on Free`);
        return await downgradeRecordToFree(claimedRecord, 'CANCELLED');
    } catch (error: any) {
        console.error(`[Billing] Due-cancellation execution failed for ${shop}, will retry:`, error?.message);
        await supabase
            .from(TABLE)
            .update({ cancel_at_period_end: true, updated_at: new Date().toISOString() })
            .eq('id', claimedRecord.id)
            .eq('cancel_at_period_end', false);
        return { ...claimedRecord, cancel_at_period_end: true };
    }
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

/**
 * Re-derive the active usage cycle's overage against a (possibly new) plan's
 * allowance, WITHOUT touching included_orders_used or the cycle window. This
 * is the ONLY way a subscription-side event may affect usage state — called
 * after every upgrade, downgrade, and cancel. It is intentionally NOT a reset:
 * a merchant who has already used 900 orders and downgrades to a 450-order
 * plan simply now shows 450 overage orders, not 0/450.
 */
async function recomputeOverageForPlanChange(shop: string, planKey: PlanKey): Promise<void> {
    try {
        const { recomputeOverageForPlan } = await import('./order-counter.server');
        await recomputeOverageForPlan(shop, planKey);
    } catch (error: any) {
        // Never let a display-only recompute block a real subscription change —
        // the next order or the next page load will naturally correct it.
        console.error(`[Billing] Overage recompute failed for ${shop}:`, error?.message);
    }
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
 * plan change. Usage is NEVER reset here — only recomputed against the new
 * plan's allowance via recomputeOverageForPlanChange. See the file header for
 * why this is the whole point of the subscription/usage split.
 */
export async function syncFromShopify(
    shop: string,
    admin?: AdminGraphqlClient | null,
): Promise<MerchantSubscription> {
    const record = await ensureSubscription(shop);
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
    const isPlanChange = record.shopify_subscription_id !== remote.id;

    const updated = await updateSubscriptionRecord(shop, {
        shopify_subscription_id: remote.id,
        shopify_usage_line_item_id: remote.usageLineItemId,
        plan_name: planKey,
        billing_cycle: cycle,
        status: 'active',
        renews_on: remote.currentPeriodEnd,
        usage_capped_amount: remote.usageCappedAmount,
        is_test: remote.test,
        cancelled_at: null,
        // A fresh subscription id means the merchant either resubscribed or
        // changed plans — either way that supersedes any pending deferred
        // cancellation on whatever came before.
        cancel_at_period_end: false,
        cancel_requested_at: null,
    });

    if (isPlanChange) {
        await recomputeOverageForPlanChange(shop, planKey);
        console.log(`[Billing] ${shop} moved to ${planKey} (${cycle}) — usage cycle unaffected`);
    }

    return updated;
}

/**
 * Move the local row onto Free. `status` stays 'active' because the shop is
 * actively on the Free plan — `cancelled_at` records that a paid subscription
 * ended, and `reason` is the Shopify status that caused it (for the log trail).
 *
 * Usage is untouched here too — see recomputeOverageForPlanChange. A merchant
 * who drops to Free mid-cycle keeps whatever they've already used; Free's
 * lower allowance just means enforcement blocks them sooner, not that their
 * usage was forgiven.
 */
async function downgradeRecordToFree(
    record: MerchantSubscription,
    reason?: string,
): Promise<MerchantSubscription> {
    if (reason) {
        console.log(`[Billing] ${record.shop} downgraded to Free (Shopify status: ${reason})`);
    }

    const updated = await updateSubscriptionRecord(record.shop, {
        shopify_subscription_id: null,
        shopify_usage_line_item_id: null,
        plan_name: DEFAULT_PLAN,
        billing_cycle: DEFAULT_CYCLE,
        status: 'active',
        renews_on: null,
        usage_capped_amount: 0,
        cancelled_at: new Date().toISOString(),
        cancel_at_period_end: false,
        cancel_requested_at: null,
    });

    await recomputeOverageForPlanChange(record.shop, DEFAULT_PLAN);
    return updated;
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
 *
 * NOTE: the admin UI no longer offers a direct "downgrade" action — moving to
 * a lower tier requires cancelling first (see cancelSubscription). This
 * function still supports it at the API layer for completeness, since
 * Shopify's replacement flow handles either direction identically.
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

    // Free has no Shopify subscription — request deferred cancellation instead.
    if (!plan.requiresSubscription) {
        const cancelled = await cancelSubscription({ shop, admin: client });
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

/**
 * Request cancellation of the active Shopify subscription. This is the ONLY
 * supported way off a paid plan in the admin UI — there is no direct
 * "downgrade" action.
 *
 * DEFERRED, NOT IMMEDIATE: the Shopify subscription is NOT touched here. The
 * merchant keeps full access — billing, allowance, overage — for the rest of
 * the cycle they've already paid for. Only `cancel_at_period_end` and
 * `cancel_requested_at` are set locally. The real `appSubscriptionCancel`
 * call happens later, once `renews_on` actually arrives, via
 * `processDueCancellations` (run from the daily cron). No proration credit
 * is ever issued, because nothing is ever cancelled mid-cycle — the merchant
 * simply isn't charged again after the period they're already in ends.
 *
 * If the shop has no active Shopify subscription at all (already on Free),
 * there's nothing to defer — this is a no-op that just confirms Free.
 */
export async function cancelSubscription(options: {
    shop: string;
    admin?: AdminGraphqlClient | null;
}): Promise<{ success: boolean; error?: string; renewsOn?: string | null }> {
    const { shop } = options;
    const record = await ensureSubscription(shop);

    if (!record.shopify_subscription_id) {
        await downgradeRecordToFree(record);
        return { success: true };
    }

    if (record.cancel_at_period_end) {
        // Already requested — nothing new to do.
        return { success: true, renewsOn: record.renews_on };
    }

    await updateSubscriptionRecord(shop, {
        cancel_at_period_end: true,
        cancel_requested_at: new Date().toISOString(),
    });

    console.log(
        `[Billing] ${shop} requested cancellation — stays on ${record.plan_name} until ` +
        `${record.renews_on ?? 'the next renewal'}, then moves to Free`,
    );
    return { success: true, renewsOn: record.renews_on };
}

/**
 * Reverse a pending cancellation before it takes effect. The subscription was
 * never actually touched, so this is purely a local flag flip.
 */
export async function undoCancellation(shop: string): Promise<{ success: boolean; error?: string }> {
    const record = await ensureSubscription(shop);
    if (!record.cancel_at_period_end) return { success: true };

    await updateSubscriptionRecord(shop, {
        cancel_at_period_end: false,
        cancel_requested_at: null,
    });
    console.log(`[Billing] ${shop} cancellation reversed — staying on ${record.plan_name}`);
    return { success: true };
}

/**
 * Backstop for merchants who never reopen the app: everything that actually
 * executes a due cancellation lives in checkAndExecuteDueCancellation, run
 * from every ensureSubscription() call. This just makes sure that function
 * gets called at least once a day for every shop with a pending
 * cancellation, so one isn't stranded indefinitely waiting for a page load
 * that never comes. No duplicate cancellation logic — this is a thin loop
 * over syncSubscriptionFromShopify, the same path the app itself uses.
 */
export async function processDueCancellations(): Promise<{
    processed: number;
    failed: number;
    results: Array<{ shop: string; success: boolean; error?: string }>;
}> {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
        .from(TABLE)
        .select('shop')
        .eq('cancel_at_period_end', true)
        .lte('renews_on', nowIso);

    if (error) {
        console.error('[Billing] Could not list due cancellations:', error);
        throw error;
    }

    const shops = (data ?? []).map((row: any) => row.shop as string);
    const results: Array<{ shop: string; success: boolean; error?: string }> = [];
    let processed = 0;
    let failed = 0;

    console.log(`[Billing] Cancellation sweep starting for ${shops.length} shop(s)`);

    for (const shop of shops) {
        try {
            const record = await syncSubscriptionFromShopify(shop);
            if (record.cancel_at_period_end) {
                // Still pending — checkAndExecuteDueCancellation hit a failure
                // and rolled the claim back for the next attempt.
                results.push({ shop, success: false, error: 'Cancellation attempt failed, will retry.' });
                failed += 1;
            } else {
                results.push({ shop, success: true });
                processed += 1;
            }
        } catch (err: any) {
            console.error(`[Billing] Due-cancellation sweep failed for ${shop}:`, err?.message);
            results.push({ shop, success: false, error: err?.message });
            failed += 1;
        }
    }

    console.log(`[Billing] Cancellation sweep done — ${processed} processed, ${failed} failed`);
    return { processed, failed, results };
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
 * Usage cycles, events and charge history are preserved for reporting and
 * disputes — nothing about uninstall resets usage either.
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
        usage_capped_amount: 0,
        cancelled_at: new Date().toISOString(),
    });

    console.log(`[Billing] Billing disabled for uninstalled shop ${shop}`);
}
