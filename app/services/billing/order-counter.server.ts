/**
 * Order usage counter
 * ============================================================================
 * Counts successful FoxlyCOD orders against the shop's billing allowance.
 *
 * OWNS `merchant_usage_cycles` — the usage window and its counters — entirely
 * independently of `merchant_subscriptions` (owned by subscription.server.ts).
 * `findOrCreateUsageCycle` is the ONLY function in this codebase allowed to
 * start a new cycle, and it does so for exactly one reason: the current
 * cycle's `cycle_end` has actually passed. Nothing about a subscription
 * event — upgrade, downgrade, cancel, resubscribe, reactivate — ever creates
 * or resets a cycle. That separation is what closes the abuse loophole where
 * a merchant could burn their allowance, cancel for a prorated credit,
 * resubscribe for a fresh count, and repeat.
 *
 * WHAT COUNTS: COD, Partial COD, native COD and Prepaid orders — but only once
 * they exist as real Shopify orders. Draft orders, abandoned checkouts, failed
 * submissions, cancelled and test orders never reach `incrementOrderCount`;
 * see webhooks.orders.create.tsx for the filter.
 *
 * COUNTED EXACTLY ONCE: every increment first claims a row in
 * `billing_usage_events` keyed UNIQUE(shop, event_key). Whichever code path
 * gets there first wins; webhook retries, concurrent writers and the direct
 * order flows all collapse onto the same key. The counter itself is bumped by
 * a single atomic SQL statement, so two orders landing at the same instant
 * can't read-modify-write the same value.
 * ============================================================================
 */

import { supabase } from '../../config/supabase.server';
import {
    BILLING_CURRENCY,
    FREE_PLAN_PERIOD_DAYS,
    UNLIMITED_ORDERS,
    chargesOverage,
    getPlan,
    overageAmountFor,
    remainingOrdersFor,
    roundMoney,
    type BillingCycle,
    type PlanKey,
} from '../../config/billing-plans';
import {
    ensureSubscription,
    type AdminGraphqlClient,
    type MerchantSubscription,
    type SubscriptionStatus,
} from './subscription.server';

const EVENTS_TABLE = 'billing_usage_events';
const CYCLES_TABLE = 'merchant_usage_cycles';
const DAY_MS = 86_400_000;

/** Length of one usage window. Same for every plan and both billing cycles. */
export const USAGE_PERIOD_MS = FREE_PLAN_PERIOD_DAYS * DAY_MS;

/** Order kinds that count toward the allowance. */
export type CountableOrderType = 'cod' | 'partial_cod' | 'full_prepaid' | 'native_cod';

/**
 * The usage window and its counters, entirely independent of subscription
 * identity. See file header — nothing here is ever reset by a subscription
 * event, only by this cycle's own cycle_end passing.
 */
export interface MerchantUsageCycle {
    id: string;
    shop: string;
    /** Plan active when this cycle was created. Audit only — never used for
     *  enforcement math; the live plan always comes from merchant_subscriptions. */
    plan_name: PlanKey;
    cycle_start: string;
    cycle_end: string;
    included_orders_used: number;
    overage_orders: number;
    overage_charged_orders: number;
    last_usage_charge_date: string | null;
    status: 'active' | 'closed';
    created_at: string;
    updated_at: string;
}

function normalizeCycle(row: any): MerchantUsageCycle {
    return {
        ...row,
        plan_name: (row.plan_name ?? 'FREE') as PlanKey,
        included_orders_used: Number(row.included_orders_used ?? 0),
        overage_orders: Number(row.overage_orders ?? 0),
        overage_charged_orders: Number(row.overage_charged_orders ?? 0),
    } as MerchantUsageCycle;
}

async function getActiveUsageCycle(shop: string): Promise<MerchantUsageCycle | null> {
    const { data, error } = await supabase
        .from(CYCLES_TABLE)
        .select('*')
        .eq('shop', shop)
        .eq('status', 'active')
        .maybeSingle();
    if (error) {
        console.error('[Billing] Error reading usage cycle:', error);
        throw error;
    }
    return data ? normalizeCycle(data) : null;
}

async function createUsageCycle(
    shop: string,
    start: Date,
    end: Date,
    planName: PlanKey,
): Promise<MerchantUsageCycle> {
    const { data, error } = await supabase
        .from(CYCLES_TABLE)
        .insert({
            shop,
            plan_name: planName,
            cycle_start: start.toISOString(),
            cycle_end: end.toISOString(),
            included_orders_used: 0,
            overage_orders: 0,
            overage_charged_orders: 0,
            status: 'active',
        })
        .select()
        .single();

    if (!error) return normalizeCycle(data);

    // 23505 = unique_violation on the partial "one active cycle per shop"
    // index — another caller won the race to create it. Use theirs.
    if (error.code === '23505') {
        const existing = await getActiveUsageCycle(shop);
        if (existing) return existing;
    }
    console.error('[Billing] Error creating usage cycle:', error);
    throw error;
}

async function closeUsageCycle(id: string): Promise<void> {
    const { error } = await supabase
        .from(CYCLES_TABLE)
        .update({ status: 'closed', updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('status', 'active');
    if (error) console.error('[Billing] Error closing usage cycle:', error);
}

/**
 * The shop's active usage cycle, creating one if none exists and rolling it
 * over if its window has actually elapsed.
 *
 * THIS IS THE ONLY PLACE A NEW CYCLE IS EVER CREATED because of the passage
 * of time. Every other code path that touches usage — upgrades, downgrades,
 * cancellations — calls `recomputeOverageForPlan` instead, which adjusts
 * overage against a new plan's allowance without creating or resetting
 * anything here.
 *
 * On rollover, any overage accrued but not yet submitted to Shopify is
 * flushed FIRST — once the cycle closes, `submitPendingUsage` can no longer
 * reach it as the "active" cycle, so skipping this would silently drop
 * revenue. Windows advance in whole 30-day steps, so a shop that went quiet
 * for months lands on a window that actually contains `now`.
 */
export async function findOrCreateUsageCycle(
    shop: string,
    admin?: AdminGraphqlClient | null,
): Promise<MerchantUsageCycle> {
    const subscription = await ensureSubscription(shop);
    const now = Date.now();

    let cycle = await getActiveUsageCycle(shop);
    if (!cycle) {
        return createUsageCycle(shop, new Date(now), new Date(now + USAGE_PERIOD_MS), subscription.plan_name);
    }

    const cycleEndMs = new Date(cycle.cycle_end).getTime();
    if (now < cycleEndMs) return cycle;

    const pending = cycle.overage_orders - cycle.overage_charged_orders;
    if (pending > 0) {
        try {
            const { submitPendingUsage } = await import('./usage-charges.server');
            await submitPendingUsage(subscription, cycle, admin);
        } catch (error: any) {
            // Never block the rollover on a billing failure — retried by the
            // daily sweep, and a stuck cycle would break enforcement entirely.
            console.error(
                `[Billing] Failed to flush overage for ${shop} before cycle rollover:`,
                error?.message,
            );
        }
    }

    let start = new Date(cycle.cycle_start).getTime();
    let end = cycleEndMs;
    while (end <= now) {
        start = end;
        end = start + USAGE_PERIOD_MS;
    }

    await closeUsageCycle(cycle.id);
    const fresh = await createUsageCycle(shop, new Date(start), new Date(end), subscription.plan_name);

    console.log(
        `[Billing] Usage cycle rolled for ${shop}: ` +
        `${new Date(start).toISOString()} → ${new Date(end).toISOString()}`,
    );
    return fresh;
}

/**
 * Re-derive overage against a (possibly new) plan's allowance, without
 * touching included_orders_used or the cycle window. Called by
 * subscription.server.ts after every upgrade, downgrade, and cancel — this
 * is the ONLY way a subscription event may affect usage state.
 */
export async function recomputeOverageForPlan(shop: string, planKey: PlanKey): Promise<void> {
    // Ensures a cycle exists and rolls it if it happened to expire at the
    // exact moment of this plan change — a legitimate natural rollover, not
    // something this function itself triggers.
    await findOrCreateUsageCycle(shop);

    const plan = getPlan(planKey);
    const { error } = await supabase.rpc('billing_recompute_overage', {
        p_shop: shop,
        p_included_orders: plan.includedOrders,
    });
    if (error) {
        console.error(`[Billing] Failed to recompute overage for ${shop}:`, error);
        throw error;
    }
    console.log(`[Billing] Overage recomputed for ${shop} against ${planKey}`);
}

// ────────────────────────────────────────────────────────────────────────────
// Usage snapshot
// ────────────────────────────────────────────────────────────────────────────

export interface UsageSnapshot {
    shop: string;
    planKey: PlanKey;
    planName: string;
    cycle: BillingCycle;
    status: SubscriptionStatus;

    orderCount: number;
    /** -1 means unlimited. */
    includedOrders: number;
    /** null when the plan is unlimited. */
    remainingOrders: number | null;
    usagePercent: number;

    overageOrders: number;
    /** Overage accrued but not yet submitted to Shopify. */
    pendingOverageOrders: number;
    overagePrice: number;
    /** Money owed for all overage this period. */
    estimatedOverageAmount: number;
    /** Money already submitted to Shopify this period. */
    chargedOverageAmount: number;

    currency: string;
    isUnlimited: boolean;
    /** True when Shopify will actually bill this plan/cycle's overage. */
    overageBillable: boolean;
    /** True when the plan blocks new orders past its allowance (Free). */
    limitReached: boolean;

    periodStart: string;
    periodEnd: string;
    renewsOn: string | null;
    usageCappedAmount: number;
    isTest: boolean;
    /** True when a cancellation is pending — plan stays active until renewsOn. */
    cancelAtPeriodEnd: boolean;
    cancelRequestedAt: string | null;
}

/** Derive the full usage picture from a subscription + its active usage cycle. Pure — no I/O. */
export function buildUsageSnapshot(
    subscription: MerchantSubscription,
    cycle: MerchantUsageCycle,
): UsageSnapshot {
    const plan = getPlan(subscription.plan_name);
    const isUnlimited = plan.includedOrders === UNLIMITED_ORDERS;

    const overageOrders = cycle.overage_orders;
    const pendingOverageOrders = Math.max(0, overageOrders - cycle.overage_charged_orders);
    const overageBillable = chargesOverage(subscription.plan_name, subscription.billing_cycle);

    const usagePercent = isUnlimited
        ? 0
        : plan.includedOrders > 0
            ? Math.min(100, Math.round((cycle.included_orders_used / plan.includedOrders) * 100))
            : 100;

    return {
        shop: subscription.shop,
        planKey: subscription.plan_name,
        planName: plan.name,
        cycle: subscription.billing_cycle,
        status: subscription.status,

        orderCount: cycle.included_orders_used,
        includedOrders: plan.includedOrders,
        remainingOrders: remainingOrdersFor(subscription.plan_name, cycle.included_orders_used),
        usagePercent,

        overageOrders,
        pendingOverageOrders,
        overagePrice: plan.overagePrice,
        estimatedOverageAmount: overageAmountFor(subscription.plan_name, overageOrders),
        chargedOverageAmount: overageAmountFor(subscription.plan_name, cycle.overage_charged_orders),

        currency: BILLING_CURRENCY,
        isUnlimited,
        overageBillable,
        limitReached: plan.blockOnLimit && !isUnlimited && cycle.included_orders_used >= plan.includedOrders,

        periodStart: cycle.cycle_start,
        periodEnd: cycle.cycle_end,
        renewsOn: subscription.renews_on,
        usageCappedAmount: subscription.usage_capped_amount,
        isTest: subscription.is_test,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        cancelRequestedAt: subscription.cancel_requested_at,
    };
}

/**
 * Current usage for a shop, creating the subscription/cycle rows and rolling
 * an elapsed usage cycle if needed. Does NOT reconcile against Shopify —
 * callers that need fresh subscription state call syncFromShopify first.
 */
export async function getCurrentUsage(
    shop: string,
    admin?: AdminGraphqlClient | null,
): Promise<UsageSnapshot> {
    const subscription = await ensureSubscription(shop);
    const cycle = await findOrCreateUsageCycle(shop, admin);
    return buildUsageSnapshot(subscription, cycle);
}

export interface IncrementResult {
    /** False when this order was already counted (duplicate webhook, retry, …). */
    counted: boolean;
    /** Running total within the current usage cycle after this order. */
    countedIndex: number | null;
    /** True when this specific order landed beyond the included allowance. */
    isOverage: boolean;
    usage: UsageSnapshot;
}

/**
 * Count one successful order against the shop's allowance.
 *
 * `eventKey` must be stable for the order — normally the Shopify order id. The
 * same key is safe to submit any number of times; only the first call counts.
 */
export async function incrementOrderCount(
    shop: string,
    options: {
        eventKey: string;
        orderType?: CountableOrderType;
        shopifyOrderId?: string;
        shopifyOrderName?: string;
        admin?: AdminGraphqlClient | null;
    },
): Promise<IncrementResult> {
    const { eventKey, orderType, shopifyOrderId, shopifyOrderName, admin } = options;

    if (!shop || !eventKey) {
        throw new Error('[Billing] incrementOrderCount requires both shop and eventKey');
    }

    const subscription = await ensureSubscription(shop);
    const cycle = await findOrCreateUsageCycle(shop, admin);
    const plan = getPlan(subscription.plan_name);

    // ── 1. Claim the event key. A duplicate here means the order is already
    //       counted, and we stop without touching the counter.
    const { error: insertError } = await supabase.from(EVENTS_TABLE).insert({
        shop,
        event_key: eventKey,
        order_type: orderType ?? null,
        shopify_order_id: shopifyOrderId ?? null,
        shopify_order_name: shopifyOrderName ?? null,
        usage_cycle_id: cycle.id,
        period_start: cycle.cycle_start,
    });

    if (insertError) {
        // 23505 = unique_violation on (shop, event_key)
        if (insertError.code === '23505') {
            return {
                counted: false,
                countedIndex: null,
                isOverage: false,
                usage: buildUsageSnapshot(subscription, cycle),
            };
        }
        console.error('[Billing] Failed to record usage event:', insertError);
        throw insertError;
    }

    // ── 2. Bump the counter atomically. Scoped to shop's active cycle, not
    //       the specific cycle id above — self-correcting if a rollover raced
    //       in between, which simply means it counts against whichever cycle
    //       is now active, which is always the right behavior for a fresh order.
    try {
        const { data, error } = await supabase.rpc('billing_increment_order_count', {
            p_shop: shop,
            p_included_orders: plan.includedOrders,
        });
        if (error) throw error;

        const row = Array.isArray(data) ? data[0] : data;
        const includedOrdersUsed = Number(row?.included_orders_used ?? cycle.included_orders_used + 1);
        const overageOrders = Number(row?.overage_orders ?? cycle.overage_orders);
        const isOverage =
            plan.includedOrders !== UNLIMITED_ORDERS && includedOrdersUsed > plan.includedOrders;

        // ── 3. Backfill the event with where it landed, for auditability.
        await supabase
            .from(EVENTS_TABLE)
            .update({ counted_index: includedOrdersUsed, is_overage: isOverage })
            .eq('shop', shop)
            .eq('event_key', eventKey);

        const updatedCycle: MerchantUsageCycle = {
            ...cycle,
            included_orders_used: includedOrdersUsed,
            overage_orders: overageOrders,
        };

        console.log(
            `[Billing] ${shop} order counted: ${includedOrdersUsed}` +
            `${plan.includedOrders === UNLIMITED_ORDERS ? '' : `/${plan.includedOrders}`}` +
            `${isOverage ? ' (overage)' : ''}`,
        );

        return {
            counted: true,
            countedIndex: includedOrdersUsed,
            isOverage,
            usage: buildUsageSnapshot(subscription, updatedCycle),
        };
    } catch (error) {
        // Release the claimed key so a retry can count this order properly —
        // otherwise the event row would permanently suppress it.
        await supabase.from(EVENTS_TABLE).delete().eq('shop', shop).eq('event_key', eventKey);
        console.error('[Billing] Failed to increment order count, released event key:', error);
        throw error;
    }
}

/**
 * Reverse a previously counted order, for when it is cancelled after creation.
 *
 * Idempotent: the event row is marked `voided_at` rather than deleted, so a
 * repeated cancellation webhook is a no-op and the event key stays claimed
 * against a re-delivered orders/create.
 *
 * Only reverses against the SAME cycle the order was originally counted in
 * (tracked via usage_cycle_id) — if that cycle has since rolled over, its
 * counters are long gone and there's nothing left to reverse.
 *
 * Overage never falls below what has already been billed — Shopify usage
 * records cannot be reversed, so the SQL function floors `overage_orders` at
 * `overage_charged_orders`.
 */
export async function decrementOrderCount(
    shop: string,
    eventKey: string,
): Promise<{ reversed: boolean; usage: UsageSnapshot | null }> {
    if (!shop || !eventKey) return { reversed: false, usage: null };

    const { data: voided, error: voidError } = await supabase
        .from(EVENTS_TABLE)
        .update({ voided_at: new Date().toISOString() })
        .eq('shop', shop)
        .eq('event_key', eventKey)
        .is('voided_at', null)
        .select('id, usage_cycle_id');

    if (voidError) {
        console.error('[Billing] Could not void usage event:', voidError);
        return { reversed: false, usage: null };
    }
    if (!voided || voided.length === 0) {
        // Never counted, or already voided.
        return { reversed: false, usage: null };
    }

    const subscription = await ensureSubscription(shop);
    const cycle = await getActiveUsageCycle(shop);

    if (!cycle || cycle.id !== voided[0].usage_cycle_id) {
        // The cycle this order was counted in has since rolled over — its
        // counters no longer exist to reverse. Voiding the event is all
        // that's left, and that already happened above.
        return {
            reversed: false,
            usage: cycle ? buildUsageSnapshot(subscription, cycle) : null,
        };
    }

    const plan = getPlan(subscription.plan_name);
    const { data, error } = await supabase.rpc('billing_decrement_order_count', {
        p_shop: shop,
        p_included_orders: plan.includedOrders,
    });

    if (error) {
        console.error('[Billing] Could not decrement order count:', error);
        return { reversed: false, usage: buildUsageSnapshot(subscription, cycle) };
    }

    const row = Array.isArray(data) ? data[0] : data;
    const updatedCycle: MerchantUsageCycle = {
        ...cycle,
        included_orders_used: Number(row?.included_orders_used ?? cycle.included_orders_used),
        overage_orders: Number(row?.overage_orders ?? cycle.overage_orders),
    };

    console.log(`[Billing] ${shop} order uncounted (cancelled): now ${updatedCycle.included_orders_used}`);
    return { reversed: true, usage: buildUsageSnapshot(subscription, updatedCycle) };
}

/**
 * Force the usage cycle to restart right now, zeroing the counters. This is a
 * deliberate, explicit override of the "only natural cycle_end triggers a
 * reset" rule — for support and back-office use only, never called from any
 * subscription-event code path. Any unbilled overage is flushed first so a
 * manual reset can't erase revenue.
 */
export async function resetMonthlyUsage(
    shop: string,
    admin?: AdminGraphqlClient | null,
): Promise<UsageSnapshot> {
    const subscription = await ensureSubscription(shop);
    const cycle = await findOrCreateUsageCycle(shop, admin);

    const pending = cycle.overage_orders - cycle.overage_charged_orders;
    if (pending > 0) {
        try {
            const { submitPendingUsage } = await import('./usage-charges.server');
            await submitPendingUsage(subscription, cycle, admin);
        } catch (error: any) {
            console.error(`[Billing] Overage flush before manual reset failed for ${shop}:`, error?.message);
        }
    }

    await closeUsageCycle(cycle.id);
    const now = new Date();
    const fresh = await createUsageCycle(
        shop,
        now,
        new Date(now.getTime() + USAGE_PERIOD_MS),
        subscription.plan_name,
    );

    console.log(`[Billing] Usage manually reset for ${shop}`);
    return buildUsageSnapshot(subscription, fresh);
}

export interface OverageBreakdown {
    planKey: PlanKey;
    cycle: BillingCycle;
    /** All overage orders this period. */
    overageOrders: number;
    /** Overage orders not yet submitted to Shopify. */
    pendingOverageOrders: number;
    overagePrice: number;
    /** Money owed for all overage this period. */
    totalAmount: number;
    /** Money for the not-yet-submitted portion — what the next charge will be. */
    pendingAmount: number;
    currency: string;
    /** False when Shopify cannot bill this plan/cycle (Free, Unlimited, yearly). */
    billable: boolean;
    /** Merchant-approved ceiling on usage charges this period. */
    cappedAmount: number;
}

/** Compute what the shop currently owes in overage, billed and unbilled. */
export async function calculateOverage(
    shop: string,
    admin?: AdminGraphqlClient | null,
): Promise<OverageBreakdown> {
    const subscription = await ensureSubscription(shop);
    const cycle = await findOrCreateUsageCycle(shop, admin);
    return calculateOverageFromCycle(subscription, cycle);
}

/** Same as `calculateOverage` but against rows you already hold. Pure. */
export function calculateOverageFromCycle(
    subscription: MerchantSubscription,
    cycle: MerchantUsageCycle,
): OverageBreakdown {
    const plan = getPlan(subscription.plan_name);
    const pendingOverageOrders = Math.max(0, cycle.overage_orders - cycle.overage_charged_orders);

    return {
        planKey: subscription.plan_name,
        cycle: subscription.billing_cycle,
        overageOrders: cycle.overage_orders,
        pendingOverageOrders,
        overagePrice: plan.overagePrice,
        totalAmount: overageAmountFor(subscription.plan_name, cycle.overage_orders),
        pendingAmount: roundMoney(pendingOverageOrders * plan.overagePrice),
        currency: BILLING_CURRENCY,
        billable: chargesOverage(subscription.plan_name, subscription.billing_cycle),
        cappedAmount: subscription.usage_capped_amount,
    };
}
