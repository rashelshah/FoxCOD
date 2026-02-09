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
import { logOrder, supabase, getShop } from "../config/supabase.server";
import { lookupCustomerByPhone } from "../services/customer-lookup.server";
import { syncOrderToGoogleSheets } from "../services/google-sheets.server";

const corsHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS, POST",
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
export const action = async ({ request, params }: ActionFunctionArgs) => {
    console.log('[Proxy] ===== ACTION HANDLER INVOKED =====');

    try {
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

        const path = params["*"] || params["$"] || "";

        console.log('[Proxy] URL:', request.url);
        console.log('[Proxy] Path param:', path);

        let data: any;
        try {
            data = await request.json();
            console.log('[Proxy] Request data keys:', Object.keys(data));
            console.log('[Proxy] paymentMethod:', data.paymentMethod);
        } catch (parseError: any) {
            console.error('[Proxy] JSON parse error:', parseError.message);
            return new Response(JSON.stringify({
                success: false,
                error: "Invalid JSON in request body"
            }), { status: 400, headers: corsHeaders });
        }

        // Route: Partial COD Checkout Creation
        // Check BOTH path and payload to catch all partial COD requests
        const isPartialCodPath = path.includes("partial-cod") || path.includes("create-checkout");
        // Only consider it partial COD if paymentMethod is explicitly 'partial_cod' OR advanceAmount is a positive number
        const isPartialCodPayload = data.paymentMethod === 'partial_cod' ||
            (data.advanceAmount !== undefined && data.advanceAmount !== null && parseFloat(data.advanceAmount) > 0);

        if (isPartialCodPath || isPartialCodPayload) {
            console.log('[Proxy] ✅ Matched Partial COD route (path:', isPartialCodPath, ', payload:', isPartialCodPayload, ')');
            return await handlePartialCodCheckout(request, data);
        }

        // Default Route: Regular COD Order Creation
        console.log('[Proxy] Using default order creation route');
        return await handleRegularOrder(data);

    } catch (error: any) {
        console.error('[Proxy] Error:', error);
        return new Response(JSON.stringify({
            success: false,
            error: error.message || "Failed to process request"
        }), {
            status: 500,
            headers: corsHeaders
        });
    }
};

// Handle Partial COD Checkout
// Uses Cart Permalink approach - no Draft Orders required (avoids protected customer data restrictions)
async function handlePartialCodCheckout(request: Request, data: any) {
    try {
        console.log('[Proxy Partial COD] Starting checkout creation (Cart Permalink approach)');

        const {
            shop,
            productId,
            variantId,
            productTitle,
            quantity,
            price,
            advanceAmount,
            customerName,
            customerPhone,
            customerAddress,
            customerEmail,
            customerCity,
            customerState,
            customerZipcode,
            shippingPrice,
            notes,
        } = data;

        // Validate required fields
        if (!shop || !variantId || !advanceAmount) {
            console.log('[Proxy Partial COD] Missing required fields');
            return new Response(JSON.stringify({
                success: false,
                error: "Missing required fields: shop, variantId, advanceAmount"
            }), { status: 400, headers: corsHeaders });
        }

        // Calculate amounts
        const totalOrderValue = (parseFloat(price) * parseInt(quantity)) + (parseFloat(shippingPrice) || 0);
        const actualRemainingAmount = totalOrderValue - parseFloat(advanceAmount);

        console.log('[Proxy Partial COD] Amounts - Total:', totalOrderValue, 'Advance:', advanceAmount, 'Remaining:', actualRemainingAmount);

        // Generate a unique order reference
        const orderRef = 'PCOD-' + Date.now().toString(36).toUpperCase();

        // Log the partial COD order to our database
        try {
            const orderLogEntry = {
                shop_domain: shop,
                customer_name: customerName || '',
                customer_phone: customerPhone || '',
                customer_address: customerAddress || '',
                customer_email: customerEmail || '',
                customer_city: customerCity || '',
                customer_state: customerState || '',
                customer_zipcode: customerZipcode || '',
                product_id: productId,
                variant_id: variantId,
                product_title: productTitle,
                quantity: parseInt(quantity) || 1,
                price: String(price),
                shipping_price: parseFloat(shippingPrice) || 0,
                notes: notes || '',
                status: 'pending_advance_payment',
                order_source: 'partial_cod',
                is_partial_cod: true,
                advance_amount: parseFloat(advanceAmount),
                remaining_cod_amount: actualRemainingAmount,
                order_reference: orderRef,
            };

            console.log('[Proxy Partial COD] Logging order to database:', orderRef);
            await logOrder(orderLogEntry);
            console.log('[Proxy Partial COD] Order logged successfully');

            // Non-blocking Google Sheets sync for partial COD
            syncOrderToGoogleSheets(shop, {
                orderId: orderRef,
                orderName: orderRef,
                customerName: customerName || '',
                phone: customerPhone || '',
                email: customerEmail || '',
                address: customerAddress || '',
                city: customerCity || '',
                state: customerState || '',
                pincode: customerZipcode || '',
                product: productTitle || 'Product',
                quantity: parseInt(quantity) || 1,
                totalPrice: totalOrderValue.toString(),
                paymentMethod: 'partial_cod',
                status: 'pending_advance_payment',
            }).catch(err => {
                console.error('[Proxy Partial COD] Google Sheets sync error (non-blocking):', err.message);
            });
        } catch (dbError: any) {
            console.error('[Proxy Partial COD] Database error (non-blocking):', dbError.message);
            // Continue even if DB logging fails
        }

        // Create a Shopify cart checkout URL with notes about partial COD
        // Format: https://store.myshopify.com/cart/VARIANT_ID:QUANTITY?checkout[note]=NOTE&attributes[key]=value
        const encodedNote = encodeURIComponent(
            `PARTIAL COD ORDER [${orderRef}]\n` +
            `Advance Payment: ₹${advanceAmount}\n` +
            `Remaining (Pay on Delivery): ₹${actualRemainingAmount.toFixed(2)}\n` +
            `Customer: ${customerName} | ${customerPhone}`
        );

        // Build cart attributes for tracking
        const attributes = [
            `attributes[partial_cod]=true`,
            `attributes[order_ref]=${orderRef}`,
            `attributes[advance_amount]=${advanceAmount}`,
            `attributes[remaining_amount]=${actualRemainingAmount.toFixed(2)}`,
            `attributes[customer_name]=${encodeURIComponent(customerName || '')}`,
            `attributes[customer_phone]=${encodeURIComponent(customerPhone || '')}`,
            `attributes[customer_address]=${encodeURIComponent(customerAddress || '')}`,
        ].join('&');

        // Build the cart permalink URL
        // This adds the product to cart and redirects to checkout
        const checkoutUrl = `https://${shop}/cart/${variantId}:${quantity}?checkout[note]=${encodedNote}&${attributes}`;

        console.log('[Proxy Partial COD] Generated checkout URL:', checkoutUrl);

        return new Response(JSON.stringify({
            success: true,
            checkoutUrl: checkoutUrl,
            orderReference: orderRef,
            message: `Partial COD order created. Reference: ${orderRef}. Advance: ₹${advanceAmount}, Remaining: ₹${actualRemainingAmount.toFixed(2)}`,
        }), { headers: corsHeaders });

    } catch (error: any) {
        console.error('[Proxy Partial COD] Unexpected error:', error);
        return new Response(JSON.stringify({
            success: false,
            error: error.message || "Failed to create checkout"
        }), { status: 500, headers: corsHeaders });
    }
}

// Handle Regular COD Order
async function handleRegularOrder(data: any) {
    // Validate required fields
    if (!data.shop || !data.productId || !data.variantId) {
        return new Response(JSON.stringify({
            success: false,
            error: "Missing required fields: shop, productId, variantId"
        }), {
            status: 400,
            headers: corsHeaders
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

    // Non-blocking Google Sheets sync
    syncOrderToGoogleSheets(data.shop, {
        orderId: result.id,
        orderName: result.shopify_order_name || `COD-${result.id}`,
        customerName: data.customerName || '',
        phone: data.customerPhone || '',
        email: data.customerEmail || '',
        address: data.customerAddress || '',
        city: data.customerCity || '',
        state: data.customerState || '',
        pincode: data.customerZipcode || '',
        product: data.productTitle || 'Product',
        quantity: parseInt(data.quantity) || 1,
        totalPrice: (parseFloat(data.price) * (parseInt(data.quantity) || 1)).toString(),
        paymentMethod: 'full_cod',
    }).catch(err => {
        console.error('[Proxy] Google Sheets sync error (non-blocking):', err.message);
    });

    return new Response(JSON.stringify({
        success: true,
        orderId: result.id,
        orderName: result.shopify_order_name
    }), { headers: corsHeaders });
}

