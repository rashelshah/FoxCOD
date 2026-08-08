/**
 * Order usage counter
 * ============================================================================
 * Counts successful FoxlyCOD orders against the shop's billing allowance.
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
    getCurrentSubscription,
    updateSubscriptionRecord,
    USAGE_PERIOD_MS,
    type AdminGraphqlClient,
    type MerchantSubscription,
    type SubscriptionStatus,
} from './subscription.server';

const EVENTS_TABLE = 'billing_usage_events';

/** Order kinds that count toward the allowance. */
export type CountableOrderType = 'cod' | 'partial_cod' | 'full_prepaid' | 'native_cod';

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
}

/** Derive the full usage picture from a subscription row. Pure — no I/O. */
export function buildUsageSnapshot(record: MerchantSubscription): UsageSnapshot {
    const plan = getPlan(record.plan_name);
    const isUnlimited = plan.includedOrders === UNLIMITED_ORDERS;

    const overageOrders = record.overage_orders;
    const pendingOverageOrders = Math.max(0, overageOrders - record.overage_charged_orders);
    const overageBillable = chargesOverage(record.plan_name, record.billing_cycle);

    const usagePercent = isUnlimited
        ? 0
        : plan.includedOrders > 0
            ? Math.min(100, Math.round((record.order_count / plan.includedOrders) * 100))
            : 100;

    return {
        shop: record.shop,
        planKey: record.plan_name,
        planName: plan.name,
        cycle: record.billing_cycle,
        status: record.status,

        orderCount: record.order_count,
        includedOrders: plan.includedOrders,
        remainingOrders: remainingOrdersFor(record.plan_name, record.order_count),
        usagePercent,

        overageOrders,
        pendingOverageOrders,
        overagePrice: plan.overagePrice,
        estimatedOverageAmount: overageAmountFor(record.plan_name, overageOrders),
        chargedOverageAmount: overageAmountFor(record.plan_name, record.overage_charged_orders),

        currency: BILLING_CURRENCY,
        isUnlimited,
        overageBillable,
        limitReached: plan.blockOnLimit && !isUnlimited && record.order_count >= plan.includedOrders,

        periodStart: record.current_period_start,
        periodEnd: record.current_period_end,
        renewsOn: record.renews_on,
        usageCappedAmount: record.usage_capped_amount,
        isTest: record.is_test,
    };
}

/**
 * Current usage for a shop, creating the billing row and rolling an elapsed
 * usage period if needed.
 */
export async function getCurrentUsage(
    shop: string,
    admin?: AdminGraphqlClient | null,
): Promise<UsageSnapshot> {
    const record = await getCurrentSubscription(shop, admin);
    return buildUsageSnapshot(record);
}

export interface IncrementResult {
    /** False when this order was already counted (duplicate webhook, retry, …). */
    counted: boolean;
    /** 1-based position of this order within the current usage period. */
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

    const record = await getCurrentSubscription(shop, admin);
    const plan = getPlan(record.plan_name);

    // ── 1. Claim the event key. A duplicate here means the order is already
    //       counted, and we stop without touching the counter.
    const { error: insertError } = await supabase.from(EVENTS_TABLE).insert({
        shop,
        event_key: eventKey,
        order_type: orderType ?? null,
        shopify_order_id: shopifyOrderId ?? null,
        shopify_order_name: shopifyOrderName ?? null,
        period_start: record.current_period_start,
    });

    if (insertError) {
        // 23505 = unique_violation on (shop, event_key)
        if (insertError.code === '23505') {
            return {
                counted: false,
                countedIndex: null,
                isOverage: false,
                usage: buildUsageSnapshot(record),
            };
        }
        console.error('[Billing] Failed to record usage event:', insertError);
        throw insertError;
    }

    // ── 2. Bump the counter atomically.
    try {
        const { data, error } = await supabase.rpc('billing_increment_order_count', {
            p_shop: shop,
            p_included_orders: plan.includedOrders,
        });
        if (error) throw error;

        const row = Array.isArray(data) ? data[0] : data;
        const orderCount = Number(row?.order_count ?? record.order_count + 1);
        const overageOrders = Number(row?.overage_orders ?? 0);
        const isOverage =
            plan.includedOrders !== UNLIMITED_ORDERS && orderCount > plan.includedOrders;

        // ── 3. Backfill the event with where it landed, for auditability.
        await supabase
            .from(EVENTS_TABLE)
            .update({ counted_index: orderCount, is_overage: isOverage })
            .eq('shop', shop)
            .eq('event_key', eventKey);

        const updated: MerchantSubscription = {
            ...record,
            order_count: orderCount,
            overage_orders: overageOrders,
        };

        console.log(
            `[Billing] ${shop} order counted: ${orderCount}` +
            `${plan.includedOrders === UNLIMITED_ORDERS ? '' : `/${plan.includedOrders}`}` +
            `${isOverage ? ' (overage)' : ''}`,
        );

        return {
            counted: true,
            countedIndex: orderCount,
            isOverage,
            usage: buildUsageSnapshot(updated),
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
 * Overage never falls below what has already been billed — Shopify usage
 * records cannot be reversed, so the SQL function floors `overage_orders` at
 * `overage_charged_orders`. A cancellation therefore credits the merchant for
 * anything not yet charged, and nothing more.
 */
export async function decrementOrderCount(
    shop: string,
    eventKey: string,
): Promise<{ reversed: boolean; usage: UsageSnapshot | null }> {
    if (!shop || !eventKey) return { reversed: false, usage: null };

    // Claim the void — only the first caller for this event gets a row back.
    const { data: voided, error: voidError } = await supabase
        .from(EVENTS_TABLE)
        .update({ voided_at: new Date().toISOString() })
        .eq('shop', shop)
        .eq('event_key', eventKey)
        .is('voided_at', null)
        .select('id, period_start');

    if (voidError) {
        console.error('[Billing] Could not void usage event:', voidError);
        return { reversed: false, usage: null };
    }
    if (!voided || voided.length === 0) {
        // Never counted, or already voided.
        return { reversed: false, usage: null };
    }

    const record = await getCurrentSubscription(shop);

    // If the usage period already rolled past the one this order was counted in,
    // its counter is long since reset — voiding the event is all that's left.
    // Compared as instants, not strings, so timestamp formatting can't matter.
    const eventPeriod = new Date(voided[0].period_start).getTime();
    const currentPeriod = new Date(record.current_period_start).getTime();
    if (eventPeriod !== currentPeriod) {
        return { reversed: false, usage: buildUsageSnapshot(record) };
    }

    const plan = getPlan(record.plan_name);
    const { data, error } = await supabase.rpc('billing_decrement_order_count', {
        p_shop: shop,
        p_included_orders: plan.includedOrders,
    });

    if (error) {
        console.error('[Billing] Could not decrement order count:', error);
        return { reversed: false, usage: buildUsageSnapshot(record) };
    }

    const row = Array.isArray(data) ? data[0] : data;
    const updated: MerchantSubscription = {
        ...record,
        order_count: Number(row?.order_count ?? record.order_count),
        overage_orders: Number(row?.overage_orders ?? record.overage_orders),
    };

    console.log(`[Billing] ${shop} order uncounted (cancelled): now ${updated.order_count}`);
    return { reversed: true, usage: buildUsageSnapshot(updated) };
}

/**
 * Force the usage period to restart now, zeroing the counters.
 *
 * Normal resets happen on their own via the billing-cycle rollover in
 * `rollUsagePeriodIfNeeded`; this exists for support and back-office use. Any
 * unbilled overage is flushed first so a manual reset can't erase revenue.
 */
export async function resetMonthlyUsage(
    shop: string,
    admin?: AdminGraphqlClient | null,
): Promise<UsageSnapshot> {
    const record = await getCurrentSubscription(shop, admin);

    const pending = record.overage_orders - record.overage_charged_orders;
    if (pending > 0) {
        try {
            const { submitPendingUsage } = await import('./usage-charges.server');
            await submitPendingUsage(record, admin);
        } catch (error: any) {
            console.error(`[Billing] Overage flush before manual reset failed for ${shop}:`, error?.message);
        }
    }

    const now = new Date();
    const updated = await updateSubscriptionRecord(shop, {
        current_period_start: now.toISOString(),
        current_period_end: new Date(now.getTime() + USAGE_PERIOD_MS).toISOString(),
        included_orders: getPlan(record.plan_name).includedOrders,
        order_count: 0,
        overage_orders: 0,
        overage_charged_orders: 0,
    });

    console.log(`[Billing] Usage manually reset for ${shop}`);
    return buildUsageSnapshot(updated);
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
    const record = await getCurrentSubscription(shop, admin);
    return calculateOverageFromRecord(record);
}

/** Same as `calculateOverage` but against a row you already hold. Pure. */
export function calculateOverageFromRecord(record: MerchantSubscription): OverageBreakdown {
    const plan = getPlan(record.plan_name);
    const pendingOverageOrders = Math.max(
        0,
        record.overage_orders - record.overage_charged_orders,
    );

    return {
        planKey: record.plan_name,
        cycle: record.billing_cycle,
        overageOrders: record.overage_orders,
        pendingOverageOrders,
        overagePrice: plan.overagePrice,
        totalAmount: overageAmountFor(record.plan_name, record.overage_orders),
        pendingAmount: roundMoney(pendingOverageOrders * plan.overagePrice),
        currency: BILLING_CURRENCY,
        billable: chargesOverage(record.plan_name, record.billing_cycle),
        cappedAmount: record.usage_capped_amount,
    };
}
