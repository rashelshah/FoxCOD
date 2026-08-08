/**
 * Plan enforcement
 * ============================================================================
 * The server-side gate every order-creation path must pass through.
 *
 * All limit checks live here and run on the server. The storefront widget is
 * told what the limit is only so it can show a friendly message — nothing it
 * sends can raise or bypass the allowance, because the decision is made from
 * the shop's own `merchant_subscriptions` row, keyed off the authenticated
 * shop domain rather than anything in the request body.
 *
 * FAIL-OPEN, DELIBERATELY: if the billing lookup itself errors (Supabase
 * unreachable, migration not yet applied), orders are allowed through and the
 * failure is logged loudly. Refusing a merchant's real customers because our
 * own metering broke is far worse than under-counting a handful of orders.
 * ============================================================================
 */

import { getPlan } from '../../config/billing-plans';
import { getCurrentUsage, type UsageSnapshot } from './order-counter.server';
import type { AdminGraphqlClient } from './subscription.server';

export type PlanValidationCode = 'ok' | 'limit_reached' | 'billing_unavailable';

export interface PlanValidationResult {
    allowed: boolean;
    code: PlanValidationCode;
    /** Customer-facing message. Only set when `allowed` is false. */
    message?: string;
    /** True when the merchant must upgrade to keep receiving orders. */
    upgradeRequired: boolean;
    /** Null only when the billing lookup failed. */
    usage: UsageSnapshot | null;
}

/**
 * Message shown to the shopper when a Free-plan merchant is out of orders.
 * Kept generic on purpose — the shopper is not the one who needs to upgrade.
 */
export const LIMIT_REACHED_CUSTOMER_MESSAGE =
    'Orders are temporarily unavailable for this store. Please try again later or contact the store owner.';

/** Message shown to the merchant in the admin UI. */
export const LIMIT_REACHED_MERCHANT_MESSAGE =
    'You have reached your free plan limit. Upgrade to continue receiving orders.';

/**
 * Decide whether a shop may create another order right now.
 *
 * Free       — blocked once the included allowance is used up.
 * Pro        — always allowed; orders past the allowance accrue as overage.
 * Advanced   — same as Pro.
 * Unlimited  — always allowed, nothing to track.
 */
export async function validatePlanBeforeOrder(
    shop: string,
    admin?: AdminGraphqlClient | null,
): Promise<PlanValidationResult> {
    if (!shop) {
        return { allowed: true, code: 'billing_unavailable', upgradeRequired: false, usage: null };
    }

    let usage: UsageSnapshot;
    try {
        usage = await getCurrentUsage(shop, admin);
    } catch (error: any) {
        console.error(
            `[Billing] Enforcement check failed for ${shop} — allowing order through:`,
            error?.message,
        );
        return { allowed: true, code: 'billing_unavailable', upgradeRequired: false, usage: null };
    }

    const plan = getPlan(usage.planKey);

    // Unlimited plans short-circuit — nothing to compare against.
    if (usage.isUnlimited) {
        return { allowed: true, code: 'ok', upgradeRequired: false, usage };
    }

    // Metered plans (Pro, Advanced) never block; the extra orders are billed.
    if (!plan.blockOnLimit) {
        return { allowed: true, code: 'ok', upgradeRequired: false, usage };
    }

    if (usage.orderCount >= plan.includedOrders) {
        console.warn(
            `[Billing] Order blocked for ${shop}: ${usage.orderCount}/${plan.includedOrders} on ${plan.name}`,
        );
        return {
            allowed: false,
            code: 'limit_reached',
            message: LIMIT_REACHED_CUSTOMER_MESSAGE,
            upgradeRequired: true,
            usage,
        };
    }

    return { allowed: true, code: 'ok', upgradeRequired: false, usage };
}

/**
 * Standard JSON body returned to the storefront when an order is blocked.
 * Kept in one place so every endpoint answers identically and the widget can
 * branch on `code` rather than matching on message text.
 */
export function planLimitResponseBody(result: PlanValidationResult) {
    return {
        success: false,
        error: result.message ?? LIMIT_REACHED_CUSTOMER_MESSAGE,
        code: result.code,
        upgradeRequired: result.upgradeRequired,
    };
}
