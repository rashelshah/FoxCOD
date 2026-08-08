/**
 * FoxlyCOD Billing Plan Configuration
 * ============================================================================
 * SINGLE SOURCE OF TRUTH for every plan, price, limit and overage rule.
 *
 * Changing pricing, included order counts or overage rates should ONLY ever
 * require editing this file. Nothing else in the codebase may hardcode a
 * price, an order limit or a plan name.
 *
 * This module is intentionally free of server-only imports so both the admin
 * UI (browser bundle) and the server services can import it.
 * ============================================================================
 */

/** Sentinel for "no limit". Used by `includedOrders`. */
export const UNLIMITED_ORDERS = -1;

/** Currency every app charge is issued in. Shopify converts for the merchant. */
export const BILLING_CURRENCY = 'USD';

/**
 * Length of a Free-plan usage period. Merchants on Free have no Shopify
 * subscription, so there is no Shopify billing cycle to anchor to — we roll a
 * 30-day window from their install date instead (never the calendar month).
 */
export const FREE_PLAN_PERIOD_DAYS = 30;

export type PlanKey = 'FREE' | 'PRO' | 'ADVANCED' | 'UNLIMITED';
export type BillingCycle = 'monthly' | 'yearly';

export interface BillingPlanConfig {
    /** Human-readable name shown in the UI and on the Shopify charge screen. */
    name: string;
    monthlyPrice: number;
    yearlyPrice: number;
    /** Orders included per billing cycle. `UNLIMITED_ORDERS` (-1) = unlimited. */
    includedOrders: number;
    /** Price charged per order beyond `includedOrders`. */
    overagePrice: number;
    /** Whether orders beyond the included count are billed at all. */
    overageEnabled: boolean;
    /**
     * Maximum usage charges Shopify may bill in one cycle. The merchant approves
     * this number when subscribing; charges beyond it are rejected by Shopify
     * until the cap is raised (and re-approved).
     */
    overageCappedAmount: number;
    /** Terms string shown to the merchant on Shopify's approval screen. */
    overageTerms: string;
    /**
     * When true, order creation is blocked once `includedOrders` is reached.
     * When false, extra orders are allowed and (if `overageEnabled`) billed.
     */
    blockOnLimit: boolean;
    /** Free trial days applied when subscribing to this plan. */
    trialDays: number;
    /** Whether this plan requires a Shopify subscription at all. */
    requiresSubscription: boolean;
    /** Marketing bullets rendered on the plan picker. */
    features: string[];
    /** Optional short tagline for the plan card. */
    tagline?: string;
    /** Renders a "Most popular" ribbon on the plan card. */
    highlight?: boolean;
}

/**
 * ────────────────────────────────────────────────────────────────────────────
 * THE PLANS
 * ────────────────────────────────────────────────────────────────────────────
 */
export const BILLING_PLANS: Record<PlanKey, BillingPlanConfig> = {
    FREE: {
        name: 'Free',
        monthlyPrice: 0,
        yearlyPrice: 0,
        includedOrders: 70,
        overagePrice: 0,
        overageEnabled: false,
        overageCappedAmount: 0,
        overageTerms: '',
        blockOnLimit: true,
        trialDays: 0,
        requiresSubscription: false,
        tagline: 'Get started at no cost',
        features: [
            '70 orders per month',
            'COD, Partial COD & Prepaid orders',
            'Form builder & customisation',
            'Order analytics',
        ],
    },

    PRO: {
        name: 'Pro',
        monthlyPrice: 9.99,
        yearlyPrice: 89.99,
        includedOrders: 450,
        overagePrice: 0.05,
        overageEnabled: true,
        overageCappedAmount: 500,
        overageTerms: '$0.05 per order beyond 450 orders per billing cycle',
        blockOnLimit: false,
        trialDays: 0,
        requiresSubscription: true,
        highlight: true,
        tagline: 'For growing stores',
        features: [
            '450 orders per month',
            'Then $0.05 per extra order',
            'Upsells, downsells & bundle offers',
            'Fraud protection & pixel tracking',
        ],
    },

    ADVANCED: {
        name: 'Advanced',
        monthlyPrice: 29.99,
        yearlyPrice: 269.99,
        includedOrders: 10000,
        overagePrice: 0.05,
        overageEnabled: true,
        overageCappedAmount: 2000,
        overageTerms: '$0.05 per order beyond 10,000 orders per billing cycle',
        blockOnLimit: false,
        trialDays: 0,
        requiresSubscription: true,
        tagline: 'For high-volume stores',
        features: [
            '10,000 orders per month',
            'Then $0.05 per extra order',
            'Everything in Pro',
            'Priority support',
        ],
    },

    UNLIMITED: {
        name: 'Unlimited',
        monthlyPrice: 69.99,
        yearlyPrice: 629.99,
        includedOrders: UNLIMITED_ORDERS,
        overagePrice: 0,
        overageEnabled: false,
        overageCappedAmount: 0,
        overageTerms: '',
        blockOnLimit: false,
        trialDays: 0,
        requiresSubscription: true,
        tagline: 'No limits, ever',
        features: [
            'Unlimited orders',
            'No overage charges, ever',
            'Everything in Advanced',
            'Priority support',
        ],
    },
};

/** Plans ordered cheapest → most expensive. Drives upgrade/downgrade logic. */
export const PLAN_ORDER: PlanKey[] = ['FREE', 'PRO', 'ADVANCED', 'UNLIMITED'];

export const DEFAULT_PLAN: PlanKey = 'FREE';
export const DEFAULT_CYCLE: BillingCycle = 'monthly';

/**
 * ────────────────────────────────────────────────────────────────────────────
 * SHOPIFY PLATFORM CONSTRAINT — read before changing yearly overage pricing
 * ────────────────────────────────────────────────────────────────────────────
 * Shopify's `AppUsagePricingInput` accepts only `cappedAmount` and `terms` —
 * it has no interval of its own, and every line item on an app subscription
 * must share one billing interval. Usage records are billed per 30-day
 * interval, so a subscription created with `interval: ANNUAL` cannot carry a
 * usage line item: `appSubscriptionCreate` rejects the combination.
 *
 * Consequence: overage can only be *charged* on monthly (EVERY_30_DAYS) plans.
 * On yearly plans we still COUNT and DISPLAY overage — the merchant sees their
 * real usage — but no Shopify usage record is created, because the platform
 * gives us no compliant way to create one. All other logic is identical, so if
 * Shopify ever lifts this restriction, flipping this one constant turns yearly
 * overage billing on with no other code change.
 */
export const USAGE_BILLING_SUPPORTED_CYCLES: BillingCycle[] = ['monthly'];

/** Whether Shopify can actually bill usage charges on a given billing cycle. */
export function supportsUsageBilling(cycle: BillingCycle): boolean {
    return USAGE_BILLING_SUPPORTED_CYCLES.includes(cycle);
}

/**
 * ────────────────────────────────────────────────────────────────────────────
 * HELPERS
 * ────────────────────────────────────────────────────────────────────────────
 */

/** Coerce arbitrary input (DB column, query param) into a valid PlanKey. */
export function resolvePlanKey(value: unknown): PlanKey {
    const key = String(value ?? '').toUpperCase().trim();
    return (PLAN_ORDER as string[]).includes(key) ? (key as PlanKey) : DEFAULT_PLAN;
}

/** Coerce arbitrary input into a valid BillingCycle. */
export function resolveCycle(value: unknown): BillingCycle {
    return String(value ?? '').toLowerCase().trim() === 'yearly' ? 'yearly' : 'monthly';
}

export function getPlan(planKey: PlanKey | string): BillingPlanConfig {
    return BILLING_PLANS[resolvePlanKey(planKey)];
}

/** Price of a plan for a given cycle, in `BILLING_CURRENCY`. */
export function getPlanPrice(planKey: PlanKey | string, cycle: BillingCycle): number {
    const plan = getPlan(planKey);
    return cycle === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;
}

export function isUnlimitedPlan(planKey: PlanKey | string): boolean {
    return getPlan(planKey).includedOrders === UNLIMITED_ORDERS;
}

/**
 * Whether a plan/cycle combination produces Shopify usage charges.
 * Both the plan must enable overage AND the cycle must support usage billing.
 */
export function chargesOverage(planKey: PlanKey | string, cycle: BillingCycle): boolean {
    const plan = getPlan(planKey);
    return plan.overageEnabled && plan.overagePrice > 0 && supportsUsageBilling(cycle);
}

/** Orders beyond the plan's included allowance. Never negative. */
export function overageOrdersFor(planKey: PlanKey | string, orderCount: number): number {
    const plan = getPlan(planKey);
    if (plan.includedOrders === UNLIMITED_ORDERS) return 0;
    return Math.max(0, orderCount - plan.includedOrders);
}

/**
 * Money owed for a number of overage orders, rounded to cents.
 * Returns 0 when the plan does not bill overage.
 */
export function overageAmountFor(planKey: PlanKey | string, overageOrders: number): number {
    const plan = getPlan(planKey);
    if (!plan.overageEnabled || plan.overagePrice <= 0 || overageOrders <= 0) return 0;
    return roundMoney(overageOrders * plan.overagePrice);
}

/** Round to 2 decimals without floating-point drift (2.675 → 2.68). */
export function roundMoney(amount: number): number {
    return Math.round((amount + Number.EPSILON) * 100) / 100;
}

/** Orders left before hitting the included allowance. `null` when unlimited. */
export function remainingOrdersFor(planKey: PlanKey | string, orderCount: number): number | null {
    const plan = getPlan(planKey);
    if (plan.includedOrders === UNLIMITED_ORDERS) return null;
    return Math.max(0, plan.includedOrders - orderCount);
}

/**
 * Name sent to Shopify for the subscription, e.g. "FoxlyCOD Pro (Monthly)".
 * Shown to the merchant on the approval screen and in their Shopify invoices.
 */
export function shopifySubscriptionName(planKey: PlanKey | string, cycle: BillingCycle): string {
    const plan = getPlan(planKey);
    return `FoxlyCOD ${plan.name} (${cycle === 'yearly' ? 'Yearly' : 'Monthly'})`;
}

/** Inverse of `shopifySubscriptionName`, for reconciling with Shopify's API. */
export function parseSubscriptionName(name: string): { planKey: PlanKey; cycle: BillingCycle } {
    const match = /FoxlyCOD\s+(\w+)\s*\((Monthly|Yearly)\)/i.exec(name || '');
    if (!match) return { planKey: DEFAULT_PLAN, cycle: DEFAULT_CYCLE };

    const planName = match[1].toLowerCase();
    const planKey = PLAN_ORDER.find((k) => BILLING_PLANS[k].name.toLowerCase() === planName);
    return {
        planKey: planKey ?? DEFAULT_PLAN,
        cycle: match[2].toLowerCase() === 'yearly' ? 'yearly' : 'monthly',
    };
}

/** Positive when `a` is a higher tier than `b`, negative when lower, 0 when equal. */
export function comparePlans(a: PlanKey | string, b: PlanKey | string): number {
    return PLAN_ORDER.indexOf(resolvePlanKey(a)) - PLAN_ORDER.indexOf(resolvePlanKey(b));
}

/** How much a yearly subscription saves versus 12 monthly payments. */
export function yearlySavings(planKey: PlanKey | string): { amount: number; percent: number } {
    const plan = getPlan(planKey);
    const twelveMonths = plan.monthlyPrice * 12;
    if (twelveMonths <= 0) return { amount: 0, percent: 0 };
    const amount = roundMoney(twelveMonths - plan.yearlyPrice);
    return { amount, percent: Math.round((amount / twelveMonths) * 100) };
}

/** Format a plan's order allowance for display ("450", "10,000", "Unlimited"). */
export function formatIncludedOrders(planKey: PlanKey | string): string {
    const plan = getPlan(planKey);
    return plan.includedOrders === UNLIMITED_ORDERS
        ? 'Unlimited'
        : plan.includedOrders.toLocaleString('en-US');
}
