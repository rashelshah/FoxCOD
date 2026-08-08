/**
 * Daily Billing Sweep Endpoint
 * Route: POST /api/billing/aggregate-usage
 *
 * Two jobs, run together once a day from a scheduler (Vercel Cron, GitHub
 * Actions, an external pinger — anything that can issue an authenticated POST):
 *
 *   1. Submit each shop's accrued overage to Shopify as one aggregated usage
 *      record. Usage charges are NOT created per order; see usage-charges.server.ts.
 *   2. Execute any deferred cancellations whose cycle has actually ended —
 *      the real appSubscriptionCancel call for a merchant who requested
 *      cancellation earlier; see processDueCancellations in subscription.server.ts.
 *
 * Cancellations run first: a shop being cancelled today gets its overage
 * flushed as part of that process, so the aggregation pass that follows
 * simply finds nothing pending for it.
 *
 * AUTH: requires BILLING_CRON_SECRET (or Vercel's own CRON_SECRET, so the
 * scheduler in vercel.json authenticates with no extra setup), sent as either
 *     Authorization: Bearer <secret>
 *   or
 *     x-billing-cron-secret: <secret>
 * The endpoint refuses to run when no secret is configured, so an unconfigured
 * deploy can't expose a billing trigger to the internet.
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { runDailyUsageAggregation, aggregateUsageForShop } from '../services/billing/usage-charges.server';
import { processDueCancellations } from '../services/billing/subscription.server';

/**
 * Constant-time-ish comparison. Not a hard requirement for a cron trigger, but
 * it costs nothing and keeps the secret out of timing-based guessing.
 */
function secretsMatch(a: string, b: string): boolean {
    if (!a || !b || a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

function isAuthorized(request: Request): boolean {
    // CRON_SECRET is what Vercel Cron sends automatically as a bearer token.
    const secrets = [process.env.BILLING_CRON_SECRET, process.env.CRON_SECRET].filter(
        (value): value is string => Boolean(value),
    );

    if (secrets.length === 0) {
        console.error('[Billing] No BILLING_CRON_SECRET/CRON_SECRET set — refusing to run aggregation');
        return false;
    }

    const header = request.headers.get('authorization') ?? '';
    const bearer = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
    const custom = request.headers.get('x-billing-cron-secret') ?? '';

    return secrets.some((secret) => secretsMatch(bearer, secret) || secretsMatch(custom, secret));
}

export const action = async ({ request }: ActionFunctionArgs) => {
    if (request.method !== 'POST') {
        return Response.json({ success: false, error: 'Method not allowed' }, { status: 405 });
    }

    if (!isAuthorized(request)) {
        return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // An optional `shop` narrows the sweep to one store, which is handy for
        // support and for re-running a shop whose charge previously failed.
        const url = new URL(request.url);
        const shop = url.searchParams.get('shop');

        if (shop) {
            const result = await aggregateUsageForShop(shop);
            console.log(`[Billing] Manual aggregation for ${shop}:`, result.outcome);
            return Response.json({ success: true, shop, result });
        }

        const cancellations = await processDueCancellations();
        const usage = await runDailyUsageAggregation();
        return Response.json({ success: true, cancellations, usage });
    } catch (error: any) {
        console.error('[Billing] Daily sweep endpoint error:', error);
        return Response.json(
            { success: false, error: error?.message ?? 'Daily sweep failed' },
            { status: 500 },
        );
    }
};

/** Some schedulers only issue GETs — accept those too, behind the same secret. */
export const loader = async ({ request }: LoaderFunctionArgs) => {
    if (!isAuthorized(request)) {
        return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const cancellations = await processDueCancellations();
        const usage = await runDailyUsageAggregation();
        return Response.json({ success: true, cancellations, usage });
    } catch (error: any) {
        console.error('[Billing] Daily sweep endpoint error:', error);
        return Response.json(
            { success: false, error: error?.message ?? 'Daily sweep failed' },
            { status: 500 },
        );
    }
};
