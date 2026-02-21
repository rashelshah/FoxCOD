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
import { validateOrderAgainstFraudRules } from "../services/fraud-protection.server";

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
        return await handleRegularOrder(request, data);

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
        const currencyCode = data.currency || 'USD';
        const fmtAmt = (amt: number) => { try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode }).format(amt); } catch { return `${currencyCode} ${amt.toFixed(2)}`; } };

        const encodedNote = encodeURIComponent(
            `PARTIAL COD ORDER [${orderRef}]\n` +
            `Advance Payment: ${fmtAmt(parseFloat(advanceAmount))}\n` +
            `Remaining (Pay on Delivery): ${fmtAmt(actualRemainingAmount)}\n` +
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
            message: `Partial COD order created. Reference: ${orderRef}. Advance: ${fmtAmt(parseFloat(advanceAmount))}, Remaining: ${fmtAmt(actualRemainingAmount)}`,
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
async function handleRegularOrder(request: Request, data: any) {
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

    // ── Fraud Protection: server-side validation ──
    // Log ALL IP-related headers for debugging
    console.log('[Proxy] ===== IP HEADER DEBUG =====');
    console.log('[Proxy] x-forwarded-for:', request.headers.get('x-forwarded-for'));
    console.log('[Proxy] cf-connecting-ip:', request.headers.get('cf-connecting-ip'));
    console.log('[Proxy] x-real-ip:', request.headers.get('x-real-ip'));
    console.log('[Proxy] x-shopify-client-ip:', request.headers.get('x-shopify-client-ip'));
    console.log('[Proxy] x-request-id:', request.headers.get('x-request-id'));
    console.log('[Proxy] ================================');

    const clientIp =
        request.headers.get('x-shopify-client-ip')
        || request.headers.get('cf-connecting-ip')
        || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || request.headers.get('x-real-ip')
        || 'unknown';
    console.log('[Proxy] >>> CUSTOMER IP:', clientIp, '<<<');

    try {
        const fraudResult = await validateOrderAgainstFraudRules({
            phone: data.customerPhone,
            email: data.customerEmail,
            ip: clientIp,
            zipcode: data.customerZipcode,
            quantity: parseInt(data.quantity) || 1,
            shopDomain: data.shop,
        });
        if (!fraudResult.allowed) {
            console.warn('[Proxy] Blocked by fraud protection:', fraudResult.message);
            return new Response(JSON.stringify({
                success: false,
                error: fraudResult.message
            }), { status: 403, headers: corsHeaders });
        }
        console.log('[Proxy] Fraud check passed');
    } catch (fraudErr: any) {
        console.error('[Proxy] Fraud check error (allowing order):', fraudErr.message);
        // If fraud check fails due to DB error, allow the order to proceed
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

    // Calculate prices including upsell items
    const upsellItems = data.upsell_items || [];
    const upsellTotal = upsellItems.reduce((sum: number, item: any) => sum + (parseFloat(item.price) * (parseInt(item.quantity) || 1)), 0);
    const shippingPrice = parseFloat(data.shippingPrice) || 0;
    const discountPercent = parseFloat(data.discountPercent) || 0;

    // Use finalTotal from storefront DOM (most accurate — includes qty, discounts, shipping, upsells)
    // Fallback: compute from individual fields
    let totalPrice: number;
    if (data.finalTotal && parseFloat(data.finalTotal) > 0) {
        totalPrice = parseFloat(data.finalTotal);
        console.log('[Proxy] Using finalTotal from storefront:', totalPrice);
    } else {
        const subtotal = parseFloat(data.price) * (parseInt(data.quantity) || 1);
        const discount = subtotal * (discountPercent / 100);
        totalPrice = subtotal - discount + shippingPrice + upsellTotal;
        console.log('[Proxy] Computed total:', totalPrice, '(subtotal:', subtotal, 'discount:', discount, 'shipping:', shippingPrice, 'upsells:', upsellTotal, ')');
    }

    // Build notes including upsell details, shipping, and discount
    let orderNotes = data.notes || data.customerNotes || '';
    const currencyCode = data.currency || 'USD';
    const fmtPrice = (amt: number) => { try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode }).format(amt); } catch { return `${currencyCode} ${amt.toFixed(2)}`; } };
    if (upsellItems.length > 0) {
        const upsellNotes = 'UPSELL ITEMS:\n' + upsellItems.map((item: any) =>
            `  - ${item.title} (${fmtPrice(parseFloat(item.price))}) x${item.quantity} [${item.type}]`
        ).join('\n');
        orderNotes = orderNotes ? orderNotes + '\n' + upsellNotes : upsellNotes;
    }
    if (shippingPrice > 0 && data.shippingLabel) {
        orderNotes = orderNotes ? orderNotes + '\n' : '';
        orderNotes += `SHIPPING: ${data.shippingLabel} (${fmtPrice(shippingPrice)})`;
    }
    if (discountPercent > 0) {
        orderNotes = orderNotes ? orderNotes + '\n' : '';
        orderNotes += `BUNDLE DISCOUNT: ${discountPercent}% off`;
    }

    console.log('[Proxy] Total price:', totalPrice, 'Qty:', data.quantity, 'Discount:', discountPercent + '%', 'Upsell items:', upsellItems.length);

    // Create the order using logOrder
    const result = await logOrder({
        shop_domain: data.shop,
        customer_name: data.customerName || '',
        customer_phone: data.customerPhone || '',
        customer_address: data.customerAddress || '',
        customer_email: data.customerEmail || '',
        notes: orderNotes,
        city: data.customerCity || '',
        state: data.customerState || '',
        pincode: data.customerZipcode || '',
        product_id: data.productId,
        product_title: data.productTitle || 'Product',
        variant_id: data.variantId || '',
        quantity: parseInt(data.quantity) || 1,
        price: totalPrice.toString(),
        shipping_label: data.shippingLabel || '',
        shipping_price: shippingPrice,
        currency: currencyCode,
    });

    console.log('[Proxy] Order created:', result);

    // Try to create Shopify draft order
    let shopifyOrderName = result.shopify_order_name; // fallback: COD-XXX
    try {
        const shop = await getShop(data.shop);
        const accessToken = shop?.access_token;
        if (accessToken) {
            const mainVariantGid = data.variantId.startsWith('gid://')
                ? data.variantId
                : `gid://shopify/ProductVariant/${data.variantId}`;

            const lineItems: Array<{ variantId: string; quantity: number }> = [
                { variantId: mainVariantGid, quantity: parseInt(data.quantity) || 1 }
            ];

            if (upsellItems.length > 0) {
                upsellItems.forEach((item: any) => {
                    if (!item.variant_id) {
                        console.warn('[Proxy] Skipping upsell item with no variant_id:', item.title);
                        return;
                    }
                    const vid = String(item.variant_id).startsWith('gid://')
                        ? item.variant_id
                        : `gid://shopify/ProductVariant/${item.variant_id}`;
                    lineItems.push({ variantId: vid, quantity: parseInt(item.quantity) || 1 });
                });
            }

            const draftOrderInput: Record<string, any> = {
                note: orderNotes || `COD Order via FoxCOD`,
                tags: ['FoxCOD', 'COD'],
                lineItems: lineItems.map(li => ({ variantId: li.variantId, quantity: li.quantity })),
            };

            if (data.customerName || data.customerAddress) {
                draftOrderInput.shippingAddress = {
                    firstName: (data.customerName || '').split(' ')[0] || '',
                    lastName: (data.customerName || '').split(' ').slice(1).join(' ') || '',
                    address1: data.customerAddress || '',
                    city: data.customerCity || '',
                    province: data.customerState || '',
                    zip: data.customerZipcode || '',
                    country: 'IN',
                    phone: data.customerPhone || '',
                };
            }

            console.log('[Proxy] Creating draft order with lineItems:', JSON.stringify(lineItems));

            const shopifyRes = await fetch(`https://${data.shop}/admin/api/2024-01/graphql.json`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': accessToken },
                body: JSON.stringify({
                    query: `mutation draftOrderCreate($input: DraftOrderInput!) { draftOrderCreate(input: $input) { draftOrder { id name } userErrors { field message } } }`,
                    variables: { input: draftOrderInput },
                }),
            });

            const shopifyData = await shopifyRes.json();
            if (shopifyData.data?.draftOrderCreate?.draftOrder) {
                const draftOrder = shopifyData.data.draftOrderCreate.draftOrder;
                console.log('[Proxy] Shopify draft order created:', draftOrder.name);
                shopifyOrderName = draftOrder.name; // Use real Shopify name (e.g. #D39)
                // Update Supabase record
                const { updateOrderStatus } = await import("../config/supabase.server");
                await updateOrderStatus(result.id, draftOrder.id, draftOrder.name, 'pending');
            } else {
                console.warn('[Proxy] Shopify draft order errors:', JSON.stringify(shopifyData.data?.draftOrderCreate?.userErrors || shopifyData.errors));
            }
        }
    } catch (shopifyErr: any) {
        console.error('[Proxy] Shopify draft order error (non-fatal):', shopifyErr.message, shopifyErr.stack);
    }

    // Non-blocking Google Sheets sync
    syncOrderToGoogleSheets(data.shop, {
        orderId: result.id,
        orderName: shopifyOrderName || `COD-${result.id}`,
        customerName: data.customerName || '',
        phone: data.customerPhone || '',
        email: data.customerEmail || '',
        address: data.customerAddress || '',
        city: data.customerCity || '',
        state: data.customerState || '',
        pincode: data.customerZipcode || '',
        product: data.productTitle || 'Product',
        quantity: parseInt(data.quantity) || 1,
        totalPrice: totalPrice.toString(),
        paymentMethod: 'full_cod',
    }).catch(err => {
        console.error('[Proxy] Google Sheets sync error (non-blocking):', err.message);
    });

    return new Response(JSON.stringify({
        success: true,
        orderId: result.id,
        orderName: shopifyOrderName
    }), { headers: corsHeaders });
}

