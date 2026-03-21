/**
 * Get Order Status API
 * Route: GET /api/get-order-status?orderId=XXX
 *
 * Used by storefront to poll for Shopify order ID after background sync completes.
 */

import type { LoaderFunctionArgs } from "react-router";
import { supabase } from "../config/supabase.server";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);
    const orderId = url.searchParams.get("orderId");

    if (!orderId) {
        return Response.json({ success: false, error: "orderId is required" }, { headers: corsHeaders });
    }

    const { data, error } = await supabase
        .from("order_logs")
        .select("shopify_order_id, shopify_order_name, sync_status")
        .eq("id", orderId)
        .single();

    if (error || !data) {
        return Response.json({ success: false }, { headers: corsHeaders });
    }

    return Response.json({
        success: true,
        order: data,
    }, { headers: corsHeaders });
};
