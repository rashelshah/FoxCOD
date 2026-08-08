/**
 * Route: GET /api/billing-status
 *
 * Tiny, fast poll used by the shared app shell (app.tsx) to decide whether to
 * show the "you've hit your Free plan limit" upgrade prompt. Deliberately
 * separate from api.dashboard-stats.tsx — that one is fetched only by the
 * dashboard page; this one is fetched on every /app/* navigation via the root
 * layout, so it stays minimal (no order stats, no charge history) to keep
 * that cost negligible.
 */
import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getCurrentUsage } from "../services/billing/order-counter.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { session, admin } = await authenticate.admin(request);

    try {
        const usage = await getCurrentUsage(session.shop, admin as any);
        return {
            limitReached: usage.limitReached,
            planKey: usage.planKey,
            planName: usage.planName,
        };
    } catch (error: any) {
        // Never let a billing hiccup break the shared shell for every page.
        console.error("[Billing] Status check failed:", error?.message);
        return { limitReached: false, planKey: "FREE", planName: "Free" };
    }
};
