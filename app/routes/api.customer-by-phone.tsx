/**
 * Customer Lookup API Endpoint
 * Route: GET /api/customer-by-phone?phone=XXXX&shop=STORE
 * 
 * Searches Supabase order_logs for the latest order with the same phone and shop
 * Returns customer name and address for auto-fill functionality
 */

import type { LoaderFunctionArgs } from "react-router";
import { supabase } from "../config/supabase.server";

// CORS headers for storefront requests
const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
};

/**
 * Normalize phone number for comparison
 * Removes spaces, dashes, parentheses, and leading +
 */
function normalizePhone(phone: string): string {
    return phone.replace(/[\s\-\(\)\+]/g, '');
}

/**
 * Validate phone number format
 */
function isValidPhone(phone: string): boolean {
    const normalized = normalizePhone(phone);
    return normalized.length >= 8 && normalized.length <= 15 && /^\d+$/.test(normalized);
}

/**
 * Loader: Handle GET requests for customer lookup
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
    // Handle preflight OPTIONS request
    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
        const url = new URL(request.url);
        const phone = url.searchParams.get("phone");
        const shop = url.searchParams.get("shop");

        // Validate required parameters
        if (!phone || !shop) {
            return Response.json(
                { found: false, error: "Phone and shop are required" },
                { status: 400, headers: corsHeaders }
            );
        }

        // Validate phone format
        if (!isValidPhone(phone)) {
            return Response.json(
                { found: false, error: "Invalid phone number format" },
                { status: 400, headers: corsHeaders }
            );
        }

        console.log("[Customer Lookup] Searching for phone:", phone, "shop:", shop);

        // Query Supabase for the latest order with matching phone and shop
        // Using ilike for flexible phone matching
        const { data, error } = await supabase
            .from('order_logs')
            .select('customer_name, customer_address, customer_phone, customer_email')
            .eq('shop_domain', shop)
            .eq('customer_phone', phone)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (error && error.code !== 'PGRST116') {
            console.error("[Customer Lookup] Database error:", error);
            return Response.json(
                { found: false, error: "Database error" },
                { status: 500, headers: corsHeaders }
            );
        }

        // Customer found
        if (data) {
            console.log("[Customer Lookup] Found customer:", data.customer_name);
            return Response.json({
                found: true,
                name: data.customer_name,
                address: data.customer_address,
                email: data.customer_email || '',
            }, { headers: corsHeaders });
        }

        // No customer found - try with normalized phone number
        const normalizedPhone = normalizePhone(phone);

        // Query again with normalized phone (in case stored differently)
        const { data: normalizedData, error: normalizedError } = await supabase
            .from('order_logs')
            .select('customer_name, customer_address, customer_phone, customer_email')
            .eq('shop_domain', shop)
            .order('created_at', { ascending: false })
            .limit(50);

        if (!normalizedError && normalizedData) {
            // Find a match by comparing normalized phone numbers
            const match = normalizedData.find(order =>
                normalizePhone(order.customer_phone) === normalizedPhone
            );

            if (match) {
                console.log("[Customer Lookup] Found customer (normalized):", match.customer_name);
                return Response.json({
                    found: true,
                    name: match.customer_name,
                    address: match.customer_address,
                    email: match.customer_email || '',
                }, { headers: corsHeaders });
            }
        }

        // No customer found
        console.log("[Customer Lookup] No customer found for phone:", phone);
        return Response.json({
            found: false,
        }, { headers: corsHeaders });

    } catch (error: any) {
        console.error("[Customer Lookup] Error:", error);
        return Response.json({
            found: false,
            error: "Failed to lookup customer",
        }, { status: 500, headers: corsHeaders });
    }
};
