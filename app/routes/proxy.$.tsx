/**
 * App Proxy Route Handler
 * This handles requests from the storefront via Shopify App Proxy
 * 
 * Storefront calls: https://store.myshopify.com/apps/fox-cod/create-order
 * Shopify proxies to: https://your-app/proxy/create-order
 * 
 * This eliminates the need for hardcoded app URLs!
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { logOrder } from "../config/supabase.server";

// Handle GET requests (for health checks or settings)
export const loader = async ({ request }: LoaderFunctionArgs) => {
    const url = new URL(request.url);
    const shop = url.searchParams.get('shop');

    return new Response(JSON.stringify({
        success: true,
        message: "Fox COD App Proxy is working",
        shop: shop
    }), {
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
        }
    });
};

// Handle POST requests (for order creation)
export const action = async ({ request }: ActionFunctionArgs) => {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
        return new Response(null, {
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type"
            }
        });
    }

    try {
        const data = await request.json();

        console.log('[Proxy] Received order data:', data);

        // Validate required fields
        if (!data.shop || !data.productId || !data.variantId) {
            return new Response(JSON.stringify({
                success: false,
                error: "Missing required fields: shop, productId, variantId"
            }), {
                status: 400,
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
            });
        }

        // Create the order using logOrder
        const result = await logOrder({
            shop_domain: data.shop,
            customer_name: data.customerName || '',
            customer_phone: data.customerPhone || '',
            customer_address: data.customerAddress || '',
            product_id: data.productId,
            product_title: data.productTitle || 'Product',
            variant_id: data.variantId,
            quantity: parseInt(data.quantity) || 1,
            total_price: parseFloat(data.price) * (parseInt(data.quantity) || 1),
            currency: 'INR'
        });

        console.log('[Proxy] Order created:', result);

        return new Response(JSON.stringify({
            success: true,
            orderId: result.id,
            orderName: result.shopify_order_name
        }), {
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });

    } catch (error: any) {
        console.error('[Proxy] Error:', error);
        return new Response(JSON.stringify({
            success: false,
            error: error.message || "Failed to create order"
        }), {
            status: 500,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
    }
};
