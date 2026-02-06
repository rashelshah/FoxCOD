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
import { logOrder, supabase } from "../config/supabase.server";

import { lookupCustomerByPhone } from "../services/customer-lookup.server";

const corsHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
};

// Handle GET requests - proxy for api/customer-by-phone (autofill)
// Storefront: /apps/fox-cod/api/customer-by-phone → /proxy/api/customer-by-phone
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
    const url = new URL(request.url);
    const path = params["*"] || params["$"] || "";
    const shop = url.searchParams.get("shop");
    const phone = url.searchParams.get("phone");

    // Route customer lookup for autofill
    if ((path === "api/customer-by-phone" || path.endsWith("customer-by-phone")) && phone && shop) {
        const result = await lookupCustomerByPhone(phone, shop);
        return new Response(JSON.stringify(result), { headers: corsHeaders });
    }

    return new Response(JSON.stringify({
        success: true,
        message: "Fox COD App Proxy is working",
        shop: shop
    }), { headers: corsHeaders });
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

        // Save/update customer data in customers table for autofill
        try {
            if (data.customerPhone && data.customerPhone.trim()) {
                const customerData = {
                    shop_domain: data.shop,
                    phone: data.customerPhone.trim(),
                    name: data.customerName || '',
                    address: data.customerAddress || '',
                    state: data.customerState || '',
                    city: data.customerCity || '',
                    zipcode: data.customerZipcode || '',
                    email: data.customerEmail || '',
                    updated_at: new Date().toISOString()
                };

                // Upsert customer (insert or update if exists)
                const { error: customerError } = await supabase
                    .from('customers')
                    .upsert(customerData, {
                        onConflict: 'shop_domain,phone',
                        ignoreDuplicates: false
                    });

                if (customerError) {
                    console.error('[Proxy] Error saving customer data:', customerError);
                } else {
                    console.log('[Proxy] Customer data saved/updated for phone:', data.customerPhone);
                }
            }
        } catch (custError) {
            // Log but don't fail the order if customer save fails
            console.error('[Proxy] Customer save error:', custError);
        }

        // Create the order using logOrder
        const result = await logOrder({
            shop_domain: data.shop,
            customer_name: data.customerName || '',
            customer_phone: data.customerPhone || '',
            customer_address: data.customerAddress || '',
            customer_email: data.customerEmail || '',
            notes: data.notes || data.customerNotes || '',
            city: data.customerCity || '',
            state: data.customerState || '',
            pincode: data.customerZipcode || '',
            product_id: data.productId,
            product_title: data.productTitle || 'Product',
            variant_id: data.variantId || '',
            quantity: parseInt(data.quantity) || 1,
            price: (parseFloat(data.price) * (parseInt(data.quantity) || 1)).toString(),
            shipping_label: data.shippingLabel || '',
            shipping_price: parseFloat(data.shippingPrice) || 0,
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
