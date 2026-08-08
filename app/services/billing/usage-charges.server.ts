/**
 * Usage charge aggregation
 * ============================================================================
 * Turns accrued overage orders into Shopify usage records.
 *
 * AGGREGATED, NOT PER-ORDER. One order never produces one charge. Overage
 * accumulates on the subscription row and is submitted as a single record per
 * sweep — daily via /api/billing/aggregate-usage, plus a flush whenever the
 * usage period rolls, the plan changes, or the subscription is cancelled.
 *
 *     Day 1: 10 overage   Day 2: 20   Day 3: 15   →  one charge, 45 × $0.05 = $2.25
 *
 * NEVER DOUBLE-BILLS. Three independent guards, in order:
 *
 *   1. Compare-and-swap on `overage_charged_orders`. A submission claims the
 *      range (from, to] by updating the row only if it still reads `from`.
 *      Concurrent sweeps: exactly one claim succeeds, the rest abort.
 *   2. UNIQUE `idempotency_key` on billing_usage_charges, derived
 *      deterministically from (shop, period, from, to) — a retry regenerates
 *      the same key rather than a new charge.
 *   3. The same key is passed to Shopify's `appUsageRecordCreate`, so even a
 *      request we believe failed cannot bill twice on the Shopify side.
 *
 * If the Shopify call genuinely fails, the claim is rolled back so the next
 * sweep retries the same range under the same key.
 * ============================================================================
 */

import { supabase } from '../../config/supabase.server';
import {
    BILLING_CURRENCY,
    chargesOverage,
    getPlan,
    roundMoney,
} from '../../config/billing-plans';
import {
    getAdminClient,
    getCurrentSubscription,
    getSubscriptionRecord,
    type AdminGraphqlClient,
    type MerchantSubscription,
} from './subscription.server';

const SUBSCRIPTIONS_TABLE = 'merchant_subscriptions';
const CHARGES_TABLE = 'billing_usage_charges';

/** Shopify caps idempotency keys at 255 characters. */
const MAX_IDEMPOTENCY_KEY_LENGTH = 255;

const APP_USAGE_RECORD_CREATE = `#graphql
  mutation FoxlyBillingUsageRecordCreate(
    $subscriptionLineItemId: ID!
    $description: String!
    $price: MoneyInput!
    $idempotencyKey: String
  ) {
    appUsageRecordCreate(
      subscriptionLineItemId: $subscriptionLineItemId
      description: $description
      price: $price
      idempotencyKey: $idempotencyKey
    ) {
      appUsageRecord { id createdAt price { amount currencyCode } }
      userErrors { field message }
    }
  }
`;

export type UsageChargeOutcome =
    | 'charged'
    | 'nothing_pending'
    | 'not_billable'
    | 'no_line_item'
    | 'already_charged'
    | 'capped'
    | 'failed';

export interface UsageChargeResult {
    outcome: UsageChargeOutcome;
    overageOrders: number;
    amount: number;
    currency: string;
    usageRecordId?: string | null;
    error?: string;
}

/**
 * Deterministic per-range key. The same (shop, period, from, to) always yields
 * the same key, which is what makes retries safe on both sides.
 */
function buildIdempotencyKey(
    shop: string,
    periodStart: string,
    from: number,
    to: number,
): string {
    const periodMs = new Date(periodStart).getTime();
    const key = `foxlycod:${shop}:${periodMs}:${from}-${to}`;
    return key.length > MAX_IDEMPOTENCY_KEY_LENGTH
        ? key.slice(key.length - MAX_IDEMPOTENCY_KEY_LENGTH)
        : key;
}

async function runGraphql<T = any>(
    admin: AdminGraphqlClient,
    query: string,
    variables: Record<string, unknown>,
): Promise<T> {
    const response = await admin.graphql(query, { variables });
    const body: any = await response.json();
    if (body?.errors?.length) {
        throw new Error(body.errors.map((e: any) => e.message).join('; '));
    }
    return body?.data as T;
}

/** Shopify rejects usage records that would push the period past its cap. */
function isCapError(message: string): boolean {
    return /capped amount|exceed.*cap|cap.*exceed/i.test(message);
}

/**
 * Submit the shop's outstanding overage as one Shopify usage record.
 *
 * Safe to call as often as you like: it no-ops when there is nothing pending,
 * when the plan/cycle can't be billed, or when another caller already claimed
 * the same range.
 */
export async function submitPendingUsage(
    record: MerchantSubscription,
    admin?: AdminGraphqlClient | null,
): Promise<UsageChargeResult> {
    const shop = record.shop;
    const plan = getPlan(record.plan_name);
    const currency = BILLING_CURRENCY;

    const from = record.overage_charged_orders;
    const to = record.overage_orders;
    const pending = to - from;

    if (pending <= 0) {
        return { outcome: 'nothing_pending', overageOrders: 0, amount: 0, currency };
    }

    // Free and Unlimited have no overage pricing; yearly cycles cannot carry a
    // Shopify usage line item at all (see billing-plans.ts). In every case the
    // overage stays visible in the UI, it just isn't charged.
    if (!chargesOverage(record.plan_name, record.billing_cycle)) {
        return { outcome: 'not_billable', overageOrders: pending, amount: 0, currency };
    }

    if (!record.shopify_usage_line_item_id) {
        console.warn(`[Billing] ${shop} has billable overage but no usage line item — skipping`);
        return { outcome: 'no_line_item', overageOrders: pending, amount: 0, currency };
    }

    const amount = roundMoney(pending * plan.overagePrice);
    if (amount <= 0) {
        return { outcome: 'nothing_pending', overageOrders: pending, amount: 0, currency };
    }

    const idempotencyKey = buildIdempotencyKey(shop, record.current_period_start, from, to);

    // ── Guard 1: claim the range. Succeeds only if nobody else moved the
    //    watermark since we read it.
    const { data: claimed, error: claimError } = await supabase
        .from(SUBSCRIPTIONS_TABLE)
        .update({
            overage_charged_orders: to,
            last_usage_charge_date: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
        .eq('shop', shop)
        .eq('overage_charged_orders', from)
        .select('id');

    if (claimError) {
        console.error(`[Billing] Could not claim overage range for ${shop}:`, claimError);
        return { outcome: 'failed', overageOrders: pending, amount, currency, error: claimError.message };
    }
    if (!claimed || claimed.length === 0) {
        // Another sweep is handling this range.
        return { outcome: 'already_charged', overageOrders: 0, amount: 0, currency };
    }

    const releaseClaim = async () => {
        await supabase
            .from(SUBSCRIPTIONS_TABLE)
            .update({ overage_charged_orders: from, updated_at: new Date().toISOString() })
            .eq('shop', shop)
            .eq('overage_charged_orders', to);
    };

    // ── Guard 2: record our intent under the deterministic key.
    const chargeRow = {
        shop,
        idempotency_key: idempotencyKey,
        subscription_line_item_id: record.shopify_usage_line_item_id,
        overage_orders: pending,
        from_index: from,
        to_index: to,
        amount,
        currency,
        plan_name: record.plan_name,
        billing_cycle: record.billing_cycle,
        period_start: record.current_period_start,
        period_end: record.current_period_end,
        status: 'pending' as const,
    };

    const { error: chargeInsertError } = await supabase.from(CHARGES_TABLE).insert(chargeRow);
    if (chargeInsertError && chargeInsertError.code !== '23505') {
        await releaseClaim();
        console.error(`[Billing] Could not record usage charge for ${shop}:`, chargeInsertError);
        return { outcome: 'failed', overageOrders: pending, amount, currency, error: chargeInsertError.message };
    }

    if (chargeInsertError?.code === '23505') {
        // This exact range was attempted before. If it already succeeded there is
        // nothing to do; if it failed we retry it under the same key, which
        // Shopify will deduplicate for us.
        const { data: existing } = await supabase
            .from(CHARGES_TABLE)
            .select('status, shopify_usage_record_id')
            .eq('idempotency_key', idempotencyKey)
            .maybeSingle();

        if (existing?.status === 'success') {
            console.log(`[Billing] Usage charge ${idempotencyKey} already submitted — skipping`);
            return {
                outcome: 'already_charged',
                overageOrders: pending,
                amount,
                currency,
                usageRecordId: existing.shopify_usage_record_id,
            };
        }
    }

    const client = admin ?? (await getAdminClient(shop));
    if (!client) {
        await releaseClaim();
        await markCharge(idempotencyKey, 'failed', { error: 'No admin client available' });
        return { outcome: 'failed', overageOrders: pending, amount, currency, error: 'No admin client available' };
    }

    // ── Guard 3: Shopify's own idempotency, using the same key.
    try {
        const description =
            `${pending} order${pending === 1 ? '' : 's'} beyond the ` +
            `${plan.includedOrders.toLocaleString('en-US')} included in ${plan.name} ` +
            `(${pending} × $${plan.overagePrice.toFixed(2)})`;

        const data = await runGraphql(client, APP_USAGE_RECORD_CREATE, {
            subscriptionLineItemId: record.shopify_usage_line_item_id,
            description,
            price: { amount, currencyCode: currency },
            idempotencyKey,
        });

        const payload = data?.appUsageRecordCreate;
        const userErrors: any[] = payload?.userErrors ?? [];

        if (userErrors.length) {
            const message = userErrors.map((e) => e.message).join('; ');

            if (isCapError(message)) {
                // The merchant's approved cap is exhausted. Keep the claim in place
                // so we don't spin retrying a charge Shopify will keep refusing —
                // the billing page surfaces this and offers a cap increase.
                await markCharge(idempotencyKey, 'capped', { error: message });
                console.warn(`[Billing] Usage cap reached for ${shop}: ${message}`);
                return { outcome: 'capped', overageOrders: pending, amount, currency, error: message };
            }

            await releaseClaim();
            await markCharge(idempotencyKey, 'failed', { error: message });
            console.error(`[Billing] appUsageRecordCreate failed for ${shop}:`, message);
            return { outcome: 'failed', overageOrders: pending, amount, currency, error: message };
        }

        const usageRecordId = payload?.appUsageRecord?.id ?? null;
        await markCharge(idempotencyKey, 'success', { shopify_usage_record_id: usageRecordId });

        console.log(
            `[Billing] Charged ${shop} $${amount.toFixed(2)} for ${pending} overage orders ` +
            `(orders ${from + 1}–${to})`,
        );

        return { outcome: 'charged', overageOrders: pending, amount, currency, usageRecordId };
    } catch (error: any) {
        await releaseClaim();
        await markCharge(idempotencyKey, 'failed', { error: error?.message ?? 'Unknown error' });
        console.error(`[Billing] Usage charge threw for ${shop}:`, error?.message);
        return { outcome: 'failed', overageOrders: pending, amount, currency, error: error?.message };
    }
}

async function markCharge(
    idempotencyKey: string,
    status: 'success' | 'failed' | 'capped',
    patch: Record<string, unknown> = {},
): Promise<void> {
    const { error } = await supabase
        .from(CHARGES_TABLE)
        .update({ status, ...patch, updated_at: new Date().toISOString() })
        .eq('idempotency_key', idempotencyKey);
    if (error) console.error('[Billing] Could not update usage charge status:', error);
}

/** Aggregate and submit one shop's outstanding overage. */
export async function aggregateUsageForShop(
    shop: string,
    admin?: AdminGraphqlClient | null,
): Promise<UsageChargeResult> {
    const record = await getCurrentSubscription(shop, admin);
    return submitPendingUsage(record, admin);
}

export interface AggregationSweepResult {
    shopsScanned: number;
    charged: number;
    totalAmount: number;
    skipped: number;
    failed: number;
    capped: number;
    results: Array<{ shop: string; outcome: UsageChargeOutcome; amount: number; error?: string }>;
}

/**
 * Daily sweep: submit outstanding overage for every shop that has any.
 *
 * Driven by /api/billing/aggregate-usage. Shops are processed sequentially so a
 * large install base can't burst past Shopify's API rate limits; one shop's
 * failure never stops the rest.
 */
export async function runDailyUsageAggregation(): Promise<AggregationSweepResult> {
    const result: AggregationSweepResult = {
        shopsScanned: 0,
        charged: 0,
        totalAmount: 0,
        skipped: 0,
        failed: 0,
        capped: 0,
        results: [],
    };

    const { data, error } = await supabase
        .from(SUBSCRIPTIONS_TABLE)
        .select('shop')
        .neq('status', 'cancelled')
        .gt('overage_orders', 0);

    if (error) {
        console.error('[Billing] Aggregation sweep could not list shops:', error);
        throw error;
    }

    const shops = (data ?? []).map((row: any) => row.shop as string);
    console.log(`[Billing] Aggregation sweep starting for ${shops.length} shop(s)`);

    for (const shop of shops) {
        result.shopsScanned += 1;
        try {
            const record = await getSubscriptionRecord(shop);
            if (!record) continue;
            if (record.overage_orders <= record.overage_charged_orders) {
                result.skipped += 1;
                continue;
            }

            const charge = await aggregateUsageForShop(shop);
            result.results.push({
                shop,
                outcome: charge.outcome,
                amount: charge.amount,
                error: charge.error,
            });

            if (charge.outcome === 'charged') {
                result.charged += 1;
                result.totalAmount = roundMoney(result.totalAmount + charge.amount);
            } else if (charge.outcome === 'failed') {
                result.failed += 1;
            } else if (charge.outcome === 'capped') {
                result.capped += 1;
            } else {
                result.skipped += 1;
            }
        } catch (err: any) {
            result.failed += 1;
            result.results.push({ shop, outcome: 'failed', amount: 0, error: err?.message });
            console.error(`[Billing] Aggregation failed for ${shop}:`, err?.message);
        }
    }

    console.log(
        `[Billing] Aggregation sweep done — charged ${result.charged} shop(s), ` +
        `$${result.totalAmount.toFixed(2)} total, ${result.failed} failed, ${result.capped} capped`,
    );
    return result;
}

/** Recent usage charges for a shop, newest first. Powers the billing history UI. */
export async function getUsageChargeHistory(shop: string, limit = 12) {
    const { data, error } = await supabase
        .from(CHARGES_TABLE)
        .select('*')
        .eq('shop', shop)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('[Billing] Could not load usage charge history:', error);
        return [];
    }
    return data ?? [];
}
