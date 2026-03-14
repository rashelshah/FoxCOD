/**
 * Create Order API Endpoint
 * Route: POST /api/create-order
 * 
 * Receives order data from storefront COD form and creates order in Supabase
 * Note: Shopify order creation requires protected customer data access
 * Orders are stored in Supabase and visible in the seller dashboard
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
    getShop,
    getFormSettings,
    logOrder,
    updateOrderStatus
} from "../config/supabase.server";
import { validateOrderAgainstFraudRules } from "../services/fraud-protection.server";

// CORS headers for storefront requests
const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
};

// Input validation types
interface OrderRequestBody {
    shop: string;
    customerName: string;
    customerPhone: string;
    customerAddress: string;
    customerEmail?: string;
    customerState?: string;
    customerCity?: string;
    customerZipcode?: string;
    customerCountry?: string;
    productId: string;
    variantId: string;
    quantity: number;
    price: number;
    productTitle: string;
    notes?: string;
    shippingLabel?: string;
    shippingPrice?: number;
    discountPercent?: number;
    finalTotal?: number;
    currency?: string;
    upsell_items?: Array<{
        product_id: string;
        variant_id: string;
        title: string;
        price: number;
        quantity: number;
        type: string;
    }>;
}

/**
 * Validate order input
 */
function validateOrderInput(body: OrderRequestBody, formSettings: any): string | null {
    const requiredFields = formSettings?.required_fields || ["name", "phone", "address"];

    // Check required fields
    if (requiredFields.includes("name") && !body.customerName?.trim()) {
        return "Customer name is required";
    }
    if (requiredFields.includes("phone") && !body.customerPhone?.trim()) {
        return "Phone number is required";
    }
    if (requiredFields.includes("address") && !body.customerAddress?.trim()) {
        return "Delivery address is required";
    }

    // Validate phone format (basic validation)
    if (body.customerPhone && !/^[\d\s\+\-\(\)]{8,15}$/.test(body.customerPhone)) {
        return "Invalid phone number format";
    }

    // Validate quantity
    const maxQuantity = formSettings?.max_quantity || 10;
    if (!body.quantity || body.quantity < 1) {
        return "Quantity must be at least 1";
    }
    if (body.quantity > maxQuantity) {
        return `Maximum quantity is ${maxQuantity}`;
    }

    // Validate product/variant IDs
    if (!body.productId || !body.variantId) {
        return "Product and variant are required";
    }

    if (!body.productTitle) {
        return "Product title is required";
    }

    // Validate price
    if (!body.price || body.price <= 0) {
        return "Invalid price";
    }

    return null; // No validation errors
}

/**
 * Generate a unique order name for COD orders
 */
function generateOrderName(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `COD-${timestamp}-${random}`;
}

/**
 * Action Handler: Create COD order
 */
export const action = async ({ request }: ActionFunctionArgs) => {
    // Handle preflight OPTIONS request
    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Only allow POST requests
    if (request.method !== "POST") {
        return Response.json(
            { success: false, error: "Method not allowed" },
            { status: 405, headers: corsHeaders }
        );
    }

    try {
        // Parse request body
        const body: OrderRequestBody = await request.json();

        console.log("[COD Order] Received order request:", body.shop, body.productTitle, "qty:", body.quantity, "discount:", body.discountPercent, "finalTotal:", body.finalTotal);

        // Validate shop domain
        if (!body.shop) {
            return Response.json(
                { success: false, error: "Shop domain is required" },
                { status: 400, headers: corsHeaders }
            );
        }

        // Get shop data from Supabase
        const shop = await getShop(body.shop);
        if (!shop || shop.uninstalled_at) {
            return Response.json(
                { success: false, error: "Shop not found or app not installed" },
                { status: 404, headers: corsHeaders }
            );
        }

        // Get form settings
        const formSettings = await getFormSettings(body.shop);
        if (!formSettings?.enabled) {
            return Response.json(
                { success: false, error: "COD form is not enabled for this shop" },
                { status: 403, headers: corsHeaders }
            );
        }

        // Validate input
        const validationError = validateOrderInput(body, formSettings);
        if (validationError) {
            return Response.json(
                { success: false, error: validationError },
                { status: 400, headers: corsHeaders }
            );
        }

        // ── Fraud Protection: server-side validation ──
        const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
            || request.headers.get('cf-connecting-ip')
            || request.headers.get('x-real-ip')
            || request.headers.get('x-shopify-client-ip')
            || '';
        console.log('[COD Order] Fraud check — detected IP:', clientIp);
        const fraudResult = await validateOrderAgainstFraudRules({
            phone: body.customerPhone,
            email: body.customerEmail,
            ip: clientIp,
            zipcode: body.customerZipcode,
            quantity: body.quantity,
            shopDomain: body.shop,
        });
        if (!fraudResult.allowed) {
            console.warn('[COD Order] Blocked by fraud protection:', fraudResult.message);
            return Response.json(
                { success: false, error: fraudResult.message },
                { status: 403, headers: corsHeaders }
            );
        }

        // Generate order name
        const orderName = generateOrderName();

        // Calculate total price:
        // Priority 1: finalTotal from order summary DOM (most accurate — includes qty, discounts, shipping, upsells)
        // Priority 2: Compute from individual fields
        const upsellTotal = (body.upsell_items || []).reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const shippingPrice = body.shippingPrice || 0;
        const discountPercent = body.discountPercent || 0;

        let totalPrice: number;
        if (body.finalTotal && body.finalTotal > 0) {
            totalPrice = body.finalTotal;
            console.log("[COD Order] Using finalTotal from storefront:", totalPrice);
        } else {
            const subtotal = body.price * body.quantity;
            const discount = subtotal * (discountPercent / 100);
            totalPrice = subtotal - discount + shippingPrice + upsellTotal;
            console.log("[COD Order] Computed total:", totalPrice, "(subtotal:", subtotal, "discount:", discount, "shipping:", shippingPrice, "upsells:", upsellTotal, ")");
        }

        // Build notes with upsell details
        let orderNotes = body.notes || '';
        const currencyCode = body.currency || 'USD';
        // Helper to format price with currency for notes
        const fmtPrice = (amt: number) => {
            try {
                return new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode }).format(amt);
            } catch { return `${currencyCode} ${amt.toFixed(2)}`; }
        };
        if (body.upsell_items && body.upsell_items.length > 0) {
            const upsellNotes = 'UPSELL ITEMS:\n' + body.upsell_items.map(item =>
                `  - ${item.title} (${fmtPrice(item.price)}) x${item.quantity} [${item.type}]`
            ).join('\n');
            orderNotes = orderNotes ? orderNotes + '\n' + upsellNotes : upsellNotes;
        }
        if (shippingPrice > 0 && body.shippingLabel) {
            orderNotes = orderNotes ? orderNotes + '\n' : '';
            orderNotes += `SHIPPING: ${body.shippingLabel} (${fmtPrice(shippingPrice)})`;
        }
        if (discountPercent > 0) {
            orderNotes = orderNotes ? orderNotes + '\n' : '';
            orderNotes += `BUNDLE DISCOUNT: ${discountPercent}% off`;
        }

        // Log order in Supabase - this is the primary order storage
        const orderLog = await logOrder({
            shop_domain: body.shop,
            customer_name: body.customerName,
            customer_phone: body.customerPhone,
            customer_address: body.customerAddress,
            customer_email: body.customerEmail || undefined,
            product_id: body.productId,
            product_title: body.productTitle,
            variant_id: body.variantId,
            quantity: body.quantity,
            price: totalPrice.toString(),
            notes: orderNotes || undefined,
            city: body.customerCity || undefined,
            state: body.customerState || undefined,
            pincode: body.customerZipcode || undefined,
            shipping_label: body.shippingLabel || undefined,
            shipping_price: shippingPrice || undefined,
            currency: currencyCode,
        });

        console.log("[COD Order] Order logged successfully:", orderLog.id, orderName);

        // ── Create Shopify Order (REST Orders API) ──
        let shopifyOrderName = orderName;
        let shopifyOrderId = '';
        try {
            const accessToken = shop.access_token;
            if (accessToken) {
                // Helper: extract numeric variant ID from GID or plain ID
                const toNumericVariantId = (vid: string): number => {
                    if (vid.startsWith('gid://')) {
                        return Number(vid.split('/').pop());
                    }
                    return Number(vid);
                };

                // Helper: format phone to E.164 (Shopify requires +countrycode format)
                const formatPhoneE164 = (phone: string): string => {
                    const digits = phone.replace(/[^\d]/g, '');
                    if (!digits) return '';
                    if (phone.startsWith('+')) return phone;
                    // If 10 digits, assume Indian number
                    if (digits.length === 10) return `+91${digits}`;
                    return `+${digits}`;
                };

                // Helper: safe name split with fallback for empty last name
                const firstName = body.customerName?.split(' ')[0] || 'Customer';
                const lastName = body.customerName?.split(' ').slice(1).join(' ') || '.';

                // Build line items (REST API uses numeric variant_id + explicit price)
                const lineItems: Array<{ variant_id: number; quantity: number; price: string }> = [];

                // Main product — use per-unit price
                const mainUnitPrice = parseFloat(String(body.price));
                lineItems.push({
                    variant_id: toNumericVariantId(body.variantId),
                    quantity: body.quantity,
                    price: mainUnitPrice.toFixed(2),
                });

                // Upsell / Downsell items — each with its own price
                if (body.upsell_items && body.upsell_items.length > 0) {
                    body.upsell_items.forEach(item => {
                        lineItems.push({
                            variant_id: toNumericVariantId(item.variant_id),
                            quantity: item.quantity,
                            price: parseFloat(String(item.price)).toFixed(2),
                        });
                    });
                }

                // Determine country with fallback
                const orderCountry = body.customerCountry || 'IN';

                // Format phone for Shopify E.164 requirement
                const formattedPhone = formatPhoneE164(body.customerPhone || '');

                // Build REST Orders API payload
                const orderPayload: Record<string, any> = {
                    order: {
                        line_items: lineItems,
                        customer: {
                            first_name: firstName,
                            last_name: lastName,
                            email: body.customerEmail || undefined,
                        },
                        phone: formattedPhone || undefined,
                        financial_status: 'pending',
                        fulfillment_status: null,
                        tags: 'FoxCOD, Cash on Delivery, foxcod-app',
                        note: orderNotes || `Order placed via FoxCOD COD Form - ${orderName}`,
                        inventory_behaviour: 'decrement_obeying_policy',
                        source_name: 'FoxCOD',
                        transactions: [
                            {
                                kind: 'authorization',
                                status: 'success',
                                gateway: 'Cash on Delivery',
                                amount: totalPrice.toFixed(2),
                            },
                        ],
                    },
                };

                // Always add shipping line so delivery method name appears in Shopify
                // Smart default: if no label provided, show "Free Shipping" for $0, "Shipping" otherwise
                const shippingTitle = (body.shippingLabel && body.shippingLabel.trim())
                    ? body.shippingLabel.trim()
                    : (shippingPrice > 0 ? 'Shipping' : 'Free Shipping');
                orderPayload.order.shipping_lines = [
                    {
                        title: shippingTitle,
                        price: shippingPrice.toFixed(2),
                        code: 'COD_SHIPPING',
                    },
                ];

                // Add bundle discount if applicable
                if (discountPercent > 0) {
                    // Calculate discount based on sum of all line item prices (correct for both bundle and regular)
                    const itemsSubtotal = lineItems.reduce((sum, li) => sum + (parseFloat(li.price) * li.quantity), 0);
                    const discountAmount = itemsSubtotal * (discountPercent / 100);
                    orderPayload.order.discount_codes = [
                        {
                            code: `BUNDLE-${discountPercent}OFF`,
                            amount: discountAmount.toFixed(2),
                            type: 'fixed_amount',
                        },
                    ];
                }

                // Add shipping address if available
                if (body.customerName || body.customerAddress) {
                    orderPayload.order.shipping_address = {
                        first_name: firstName,
                        last_name: lastName,
                        address1: body.customerAddress || '',
                        city: body.customerCity || '',
                        province: body.customerState || '',
                        zip: body.customerZipcode || '',
                        country: orderCountry,
                        phone: formattedPhone || '',
                    };
                }

                const shopifyApiUrl = `https://${body.shop}/admin/api/2024-04/orders.json`;

                const shopifyRes = await fetch(shopifyApiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Shopify-Access-Token': accessToken,
                    },
                    body: JSON.stringify(orderPayload),
                });

                const shopifyData = await shopifyRes.json();
                console.log("[COD Order] Shopify order response:", JSON.stringify(shopifyData).substring(0, 500));

                if (shopifyData.order) {
                    shopifyOrderId = String(shopifyData.order.id);
                    shopifyOrderName = shopifyData.order.name;

                    // Update Supabase record with Shopify order info
                    await updateOrderStatus(orderLog.id, shopifyOrderId, shopifyOrderName, 'pending');
                    console.log("[COD Order] ✅ Shopify order created:", shopifyOrderName);
                } else {
                    const errors = shopifyData.errors || shopifyData;
                    console.warn("[COD Order] ❌ Shopify order creation errors:", JSON.stringify(errors));
                }
            } else {
                console.log("[COD Order] No access token found, skipping Shopify order creation");
            }
        } catch (shopifyError: any) {
            // Don't fail the order if Shopify order creation fails
            console.error("[COD Order] Shopify order creation error (non-fatal):", shopifyError.message);
        }

        return Response.json({
            success: true,
            orderId: orderLog.id,
            orderName: shopifyOrderName,
            message: "Order placed successfully!",
        }, { headers: corsHeaders });

    } catch (error: any) {
        console.error("[COD Order] Error:", error);

        return Response.json({
            success: false,
            error: "Failed to process order. Please try again.",
        }, { status: 500, headers: corsHeaders });
    }
};

/**
 * Loader: Handle OPTIONS preflight and GET requests
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
    // Handle preflight OPTIONS request
    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    return Response.json(
        { error: "Method not allowed. Use POST to create orders." },
        { status: 405, headers: corsHeaders }
    );
};
