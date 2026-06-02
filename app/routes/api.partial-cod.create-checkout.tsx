/**
 * [DEPRECATED] Partial COD Create Checkout — Direct Route
 *
 * This route is no longer the active handler for partial COD checkouts.
 * All partial COD requests are now handled by the App Proxy route:
 *   proxy.$.tsx → handlePartialCodCheckout() → shopify-partial-payment.server.ts
 *
 * The storefront JS calls:
 *   /apps/fox-cod/api/partial-cod/create-checkout
 * which Shopify proxies to:
 *   /proxy/api/partial-cod/create-checkout
 *
 * That request is intercepted by proxy.$.tsx before ever reaching this file.
 *
 * This file is kept to avoid 404s on any edge-case direct-app-URL calls,
 * but it simply returns a redirect hint to the proxy URL.
 *
 * DO NOT add logic here. Use proxy.$.tsx and shopify-partial-payment.server.ts.
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
};

export async function loader(_: LoaderFunctionArgs) {
    return new Response(null, { status: 204, headers: corsHeaders });
}

export async function action({ request }: ActionFunctionArgs) {
    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    // This route should never be reached in normal operation.
    // The storefront uses the App Proxy (/apps/fox-cod/...) which routes to proxy.$.tsx.
    console.warn(
        "[Deprecated] api.partial-cod.create-checkout was called directly. " +
        "This should not happen — check App Proxy configuration."
    );

    return new Response(
        JSON.stringify({
            success: false,
            error: "This endpoint is deprecated. Use the App Proxy URL: /apps/fox-cod/api/partial-cod/create-checkout",
        }),
        { status: 410, headers: corsHeaders }
    );
}
