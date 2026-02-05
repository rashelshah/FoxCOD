/**
 * Customer Lookup API Endpoint
 * Route: GET /api/customer-by-phone?phone=XXXX&shop=STORE
 * 
 * Also reachable via App Proxy: /apps/fox-cod/api/customer-by-phone (handled by proxy.$.tsx)
 * Returns customer name and address for auto-fill functionality
 */

import type { LoaderFunctionArgs } from "react-router";
import { lookupCustomerByPhone } from "../services/customer-lookup.server";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
        const url = new URL(request.url);
        const phone = url.searchParams.get("phone");
        const shop = url.searchParams.get("shop");

        const result = await lookupCustomerByPhone(phone || "", shop || "");

        if (result.error && !result.found) {
            const status = result.error.includes("required") ? 400 : 400;
            return Response.json(
                { found: false, error: result.error },
                { status, headers: corsHeaders }
            );
        }

        return Response.json(
            result.found
                ? { found: true, ...result }
                : { found: false },
            { headers: corsHeaders }
        );
    } catch (error: any) {
        console.error("[Customer Lookup] Error:", error);
        return Response.json(
            { found: false, error: "Failed to lookup customer" },
            { status: 500, headers: corsHeaders }
        );
    }
};
