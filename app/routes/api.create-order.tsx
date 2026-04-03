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
    getFormSettings,
    logOrderWithShopifyIds,
} from "../config/supabase.server";
import { getFraudProtectionSettings, validateOrderAgainstFraudRulesWithSettings } from "../services/fraud-protection.server";
import {
    toNumericVariantId,
    formatPhoneE164,
    buildCatalogOrCustomLineItem,
    sanitizeVariantPricedLineItems,
} from "../services/shopify-sync.server";
import { getRestClient } from "../shopify/rest-client.server";

// CORS headers for storefront requests
const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
};

// Input validation types
interface OrderRequestBody {
    shop: string;
    customerName?: string;
    customerPhone?: string;
    customerAddress?: string;
    customerEmail?: string;
    customerState?: string;
    customerCity?: string;
    customerZipcode?: string;
    customerCountry?: string;
    productId?: string;
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
    customFieldData?: Array<{
        label?: string;
        value?: string | number | null;
    }>;
    [key: string]: any;
}

interface NormalizedCustomerFields {
    name: string;
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    address: string;
    city: string;
    state: string;
    zipcode: string;
}

function normalizeFieldKey(raw: string): string {
    return String(raw || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeCustomerFields(body: any): NormalizedCustomerFields {
    const result: NormalizedCustomerFields = {
        name: "",
        firstName: "",
        lastName: "",
        phone: "",
        email: "",
        address: "",
        city: "",
        state: "",
        zipcode: "",
    };

    const assignByKey = (rawKey: string, rawValue: unknown) => {
        if (rawValue === null || rawValue === undefined) return;
        const value = String(rawValue).trim();
        if (!value) return;

        const key = normalizeFieldKey(rawKey);
        if (!key) return;

        if (["name", "fullname", "customername", "buyername"].includes(key)) {
            if (!result.name) result.name = value;
            return;
        }
        if (["firstname", "givenname", "first"].includes(key)) {
            if (!result.firstName) result.firstName = value;
            return;
        }
        if (["lastname", "familyname", "last", "surname"].includes(key)) {
            if (!result.lastName) result.lastName = value;
            return;
        }
        if (["phone", "mobile", "phonenumber", "customerphone", "tel", "telephone", "whatsappnumber"].includes(key)) {
            if (!result.phone) result.phone = value;
            return;
        }
        if (["email", "customeremail", "mail"].includes(key)) {
            if (!result.email) result.email = value;
            return;
        }
        if (["address", "customeraddress", "deliveryaddress", "streetaddress", "address1"].includes(key)) {
            if (!result.address) result.address = value;
            return;
        }
        if (["city", "town"].includes(key)) {
            if (!result.city) result.city = value;
            return;
        }
        if (["state", "province", "region"].includes(key)) {
            if (!result.state) result.state = value;
            return;
        }
        if (["zipcode", "zip", "postalcode", "pincode", "postcode"].includes(key)) {
            if (!result.zipcode) result.zipcode = value;
        }
    };

    // Top-level body keys
    Object.entries(body || {}).forEach(([key, value]) => assignByKey(key, value));

    // Dynamic custom fields (from storefront payload)
    if (Array.isArray(body?.customFieldData)) {
        body.customFieldData.forEach((field: any) => {
            assignByKey(field?.label || "", field?.value);
        });
    }

    // Backward-compatible hardcoded fallbacks
    if (!result.name && body?.customerName) result.name = String(body.customerName).trim();
    if (!result.phone && body?.customerPhone) result.phone = String(body.customerPhone).trim();
    if (!result.address && body?.customerAddress) result.address = String(body.customerAddress).trim();
    if (!result.email && body?.customerEmail) result.email = String(body.customerEmail).trim();
    if (!result.state && body?.customerState) result.state = String(body.customerState).trim();
    if (!result.city && body?.customerCity) result.city = String(body.customerCity).trim();
    if (!result.zipcode && body?.customerZipcode) result.zipcode = String(body.customerZipcode).trim();

    // Build name from first + last if needed
    if (!result.name) {
        if (result.firstName && result.lastName) {
            result.name = `${result.firstName} ${result.lastName}`.trim();
        } else if (result.firstName) {
            result.name = result.firstName;
        }
    }

    // If only full name exists, split into first/last for Shopify
    if ((!result.firstName || !result.lastName) && result.name) {
        const parts = result.name.trim().split(/\s+/);
        if (!result.firstName) result.firstName = parts[0] || "";
        if (!result.lastName) result.lastName = parts.slice(1).join(" ");
    }

    if (!result.name) result.name = "Customer";

    return result;
}

/**
 * Validate order input
 */
function validateOrderInput(body: OrderRequestBody, formSettings: any, customer: NormalizedCustomerFields): string | null {
    const requiredFields = formSettings?.required_fields || ["name", "phone", "address"];
    const quantity = Number(body.quantity || 0);

    // Check required fields
    if (requiredFields.includes("name") && !customer.name?.trim()) {
        return "Customer name is required";
    }
    if (requiredFields.includes("phone") && !customer.phone?.trim()) {
        return "Phone number is required";
    }
    if (requiredFields.includes("address") && !customer.address?.trim()) {
        return "Delivery address is required";
    }

    // Validate phone format (basic validation)
    if (customer.phone && !/^[\d\s\+\-\(\)]{8,15}$/.test(customer.phone)) {
        return "Invalid phone number format";
    }

    // Validate quantity
    const maxQuantity = formSettings?.max_quantity || 10;
    if (!quantity || quantity < 1) {
        return "Quantity must be at least 1";
    }
    if (quantity > maxQuantity) {
        return `Maximum quantity is ${maxQuantity}`;
    }

    // Validate product/variant IDs
    if (!body.variantId) {
        return "Variant is required";
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
 * Action Handler: Create COD order (optimized)
 *
 * Flow:
 *   1. Parse + validate input
 *   2. Parallel: Load session + fraud settings + form settings
 *   3. Fraud checks (in-memory + DB frequency limit if enabled)
 *   4. Shopify API call (direct)
 *   5. Save order to DB (with Shopify IDs)
 *   6. Return response
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

    const start = Date.now();

    try {
        // Parse request body
        const body: OrderRequestBody = await request.json();
        const customer = normalizeCustomerFields(body);
        const normalizedProductId = body.productId || body.variantId;

        console.log("⏱ [COD Order] Start for:", body.shop, body.productTitle);

        // Validate shop domain
        if (!body.shop) {
            return Response.json(
                { success: false, error: "Shop domain is required" },
                { status: 400, headers: corsHeaders }
            );
        }

        // ── 1. PARALLEL: Load SDK REST client + fraud settings + form settings ──
        const [restClient, fraudSettings, formSettings] = await Promise.all([
            getRestClient(body.shop),
            getFraudProtectionSettings(body.shop),
            getFormSettings(body.shop),
        ]);
        console.log("⏱ [COD Order] Parallel fetch done:", Date.now() - start, "ms");

        if (!formSettings?.enabled) {
            return Response.json(
                { success: false, error: "COD form is not enabled for this shop" },
                { status: 403, headers: corsHeaders }
            );
        }

        // Validate input
        const validationError = validateOrderInput(body, formSettings, customer);
        if (validationError) {
            return Response.json(
                { success: false, error: validationError },
                { status: 400, headers: corsHeaders }
            );
        }

        // ── 2. FRAUD CHECKS ──
        const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
            || request.headers.get('cf-connecting-ip')
            || request.headers.get('x-real-ip')
            || request.headers.get('x-shopify-client-ip')
            || '';

        const fraudResult = await validateOrderAgainstFraudRulesWithSettings({
            phone: customer.phone,
            email: customer.email,
            ip: clientIp,
            zipcode: customer.zipcode,
            quantity: Number(body.quantity || 0),
            shopDomain: body.shop,
        }, fraudSettings);
        if (!fraudResult.allowed) {
            console.warn('[COD Order] Blocked by fraud protection:', fraudResult.message);
            return Response.json(
                { success: false, error: fraudResult.message },
                { status: 403, headers: corsHeaders }
            );
        }
        console.log("⏱ [COD Order] Fraud checks done:", Date.now() - start, "ms");

        // ── 3. BUILD SHOPIFY PAYLOAD ──
        const upsellTotal = (body.upsell_items || []).reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const shippingPrice = body.shippingPrice || 0;
        const discountPercent = body.discountPercent || 0;

        let totalPrice: number;
        if (body.finalTotal && body.finalTotal > 0) {
            totalPrice = body.finalTotal;
        } else {
            const subtotal = body.price * body.quantity;
            const discount = subtotal * (discountPercent / 100);
            totalPrice = subtotal - discount + shippingPrice + upsellTotal;
        }

        // Build notes
        let orderNotes = body.notes || '';
        const currencyCode = body.currency || 'USD';
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

        // Build line items
        const mainVariantId = toNumericVariantId(body.variantId);
        const discountMultiplier = 1 - (discountPercent / 100);
        const lineItems: Array<Record<string, any>> = [];

        const originalPrice = parseFloat(String(body.price || 0));
        const discountedPrice = (originalPrice * discountMultiplier).toFixed(2);
        lineItems.push(buildCatalogOrCustomLineItem({
            variantId: mainVariantId,
            title: body.productTitle || 'Product',
            quantity: body.quantity,
            price: discountedPrice,
        }));

        if (Array.isArray(body.upsell_items)) {
            body.upsell_items.forEach((item) => {
                lineItems.push(buildCatalogOrCustomLineItem({
                    variantId: toNumericVariantId(item.variant_id),
                    title: item.title || 'Upsell Item',
                    quantity: item.quantity || 1,
                    price: parseFloat(String(item.price || 0)).toFixed(2),
                }));
            });
        }

        const formattedPhone = formatPhoneE164(customer.phone || '');
        const shippingLabel = body.shippingLabel || (shippingPrice > 0 ? 'Shipping' : 'Free Shipping');

        const shopifyPayload: Record<string, any> = {
            order: {
                line_items: lineItems,
                customer: {
                    first_name: customer.firstName,
                    last_name: customer.lastName,
                    email: customer.email || undefined,
                },
                phone: formattedPhone || undefined,
                financial_status: 'pending',
                fulfillment_status: null,
                tags: 'FoxCOD, COD',
                note: orderNotes || 'Order placed via FoxCOD COD Form',
                inventory_behavior: 'decrement_obeying_policy',
                source_name: 'FoxCOD',
                shipping_lines: [{
                    title: shippingLabel,
                    price: shippingPrice.toFixed(2),
                    code: 'COD_SHIPPING',
                }],
            },
        };

        if (customer.name || customer.address) {
            shopifyPayload.order.shipping_address = {
                first_name: customer.firstName,
                last_name: customer.lastName,
                address1: customer.address || '',
                city: customer.city || '',
                province: customer.state || '',
                zip: customer.zipcode || '',
                country: body.customerCountry || 'IN',
                phone: formattedPhone || '',
            };
            shopifyPayload.order.billing_address = { ...shopifyPayload.order.shipping_address };
        }

        // ── 4. CALL SHOPIFY API via SDK — automatic token refresh ──
        const idempotencyKey = `foxcod-api-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        let shopifyResponse = await restClient.post({
            path: "orders",
            data: shopifyPayload,
            extraHeaders: {
                'Idempotency-Key': idempotencyKey,
            },
        });

        let shopifyOrder = shopifyResponse?.body?.order;
        console.log("⏱ [COD Order] Shopify responded:", Date.now() - start, "ms");

        // Retry with sanitized line items if first attempt fails (e.g. variant price mismatch)
        if (!shopifyOrder) {
            console.warn('[COD Order] Primary call failed, retrying with sanitized line items');
            shopifyResponse = await restClient.post({
                path: "orders",
                data: {
                    order: {
                        ...shopifyPayload.order,
                        line_items: sanitizeVariantPricedLineItems(lineItems),
                    },
                },
                extraHeaders: {
                    'Idempotency-Key': `${idempotencyKey}-fallback`,
                },
            });

            shopifyOrder = shopifyResponse?.body?.order;

            if (!shopifyOrder) {
                console.error('[COD Order] ❌ Shopify order creation failed');
                return Response.json({
                    success: false,
                    error: "Failed to create order. Please try again.",
                }, { status: 500, headers: corsHeaders });
            }
        }

        const shopifyOrderId = String(shopifyOrder.id);
        const shopifyOrderName = shopifyOrder.name;

        // ── 5. SAVE ORDER TO DB (with Shopify IDs) ──
        const orderLog = await logOrderWithShopifyIds({
            shop_domain: body.shop,
            customer_name: customer.name,
            customer_phone: customer.phone,
            customer_address: customer.address,
            customer_email: customer.email || undefined,
            product_id: normalizedProductId,
            product_title: body.productTitle,
            variant_id: body.variantId,
            quantity: body.quantity,
            price: totalPrice.toString(),
            notes: orderNotes || undefined,
            city: customer.city || undefined,
            state: customer.state || undefined,
            pincode: customer.zipcode || undefined,
            shipping_label: body.shippingLabel || undefined,
            shipping_price: shippingPrice || undefined,
            currency: currencyCode,
            order_payload: body,
        }, shopifyOrderId, shopifyOrderName);

        console.log("⏱ [COD Order] Total time:", Date.now() - start, "ms");

        return Response.json({
            success: true,
            orderId: orderLog.id,
            shopifyOrderId,
            orderName: shopifyOrderName,
            message: "Order placed successfully!",
        }, { headers: corsHeaders });

    } catch (error: any) {
        console.error("[COD Order] Error:", error);
        console.log("⏱ [COD Order] Failed at:", Date.now() - start, "ms");

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
