/**
 * Partial Payment Discount Cleanup Endpoint
 * Route: GET /api/cleanup-partial-discounts?shop=SHOP&secret=SECRET
 *
 * Deletes expired FOX-PCOD-* discount codes from Shopify.
 * Should be called by a scheduled job (cron) every hour.
 *
 * Security: requires CLEANUP_SECRET env var to match the `secret` query param.
 * If CLEANUP_SECRET is not set, the endpoint is disabled.
 *
 * Example cron (Upstash, Vercel Cron, etc.):
 *   GET https://your-app.fly.dev/api/cleanup-partial-discounts?shop=SHOP&secret=SECRET
 *   Schedule: every 1 hour
 */

import type { LoaderFunctionArgs } from "react-router";
import { cleanupPartialPaymentDiscounts } from "../services/shopify-partial-payment.server";

const corsHeaders = {
    "Content-Type": "application/json",
};

export async function loader({ request }: LoaderFunctionArgs) {
    const url = new URL(request.url);
    const shop = url.searchParams.get("shop");
    const secret = url.searchParams.get("secret");
    const maxAgeHours = parseInt(url.searchParams.get("maxAgeHours") || "24");

    // Security check
    const cleanupSecret = process.env.CLEANUP_SECRET;
    if (!cleanupSecret) {
        console.warn("[Cleanup] CLEANUP_SECRET env var not set — endpoint disabled");
        return new Response(
            JSON.stringify({ success: false, error: "Cleanup endpoint is disabled (no CLEANUP_SECRET configured)" }),
            { status: 403, headers: corsHeaders }
        );
    }

    if (secret !== cleanupSecret) {
        console.warn("[Cleanup] Invalid secret provided");
        return new Response(
            JSON.stringify({ success: false, error: "Unauthorized" }),
            { status: 401, headers: corsHeaders }
        );
    }

    if (!shop) {
        return new Response(
            JSON.stringify({ success: false, error: "Missing shop parameter" }),
            { status: 400, headers: corsHeaders }
        );
    }

    try {
        console.log(`[Cleanup] Running partial discount cleanup for shop: ${shop}, maxAgeHours: ${maxAgeHours}`);
        const result = await cleanupPartialPaymentDiscounts(shop, maxAgeHours);

        return new Response(
            JSON.stringify({
                success: true,
                shop,
                deleted: result.deleted,
                errors: result.errors,
                maxAgeHours,
                runAt: new Date().toISOString(),
            }),
            { headers: corsHeaders }
        );
    } catch (error: any) {
        console.error("[Cleanup] Error running cleanup:", error);
        return new Response(
            JSON.stringify({ success: false, error: error.message || "Cleanup failed" }),
            { status: 500, headers: corsHeaders }
        );
    }
}

// Reject non-GET requests
export async function action() {
    return new Response(
        JSON.stringify({ success: false, error: "Method not allowed. Use GET." }),
        { status: 405, headers: corsHeaders }
    );
}
