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
} from "../config/supabase.server";
import { validateOrderAgainstFraudRules } from "../services/fraud-protection.server";
import { createShopifyOrderBackground } from "../services/shopify-sync.server";

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
        const customer = normalizeCustomerFields(body);
        const normalizedProductId = body.productId || body.variantId;

        console.log("[COD Order] Received order request:", body.shop, body.productTitle, "qty:", body.quantity, "discount:", body.discountPercent, "finalTotal:", body.finalTotal);

        // Validate shop domain
        if (!body.shop) {
            return Response.json(
                { success: false, error: "Shop domain is required" },
                { status: 400, headers: corsHeaders }
            );
        }

        // ── Parallel: fetch shop + form settings simultaneously ──
        const [shop, formSettings] = await Promise.all([
            getShop(body.shop),
            getFormSettings(body.shop),
        ]);

        if (!shop || shop.uninstalled_at) {
            return Response.json(
                { success: false, error: "Shop not found or app not installed" },
                { status: 404, headers: corsHeaders }
            );
        }
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

        // ── Fraud Protection: server-side validation ──
        const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
            || request.headers.get('cf-connecting-ip')
            || request.headers.get('x-real-ip')
            || request.headers.get('x-shopify-client-ip')
            || '';
        console.log('[COD Order] Fraud check — detected IP:', clientIp);
        const fraudResult = await validateOrderAgainstFraudRules({
            phone: customer.phone,
            email: customer.email,
            ip: clientIp,
            zipcode: customer.zipcode,
            quantity: Number(body.quantity || 0),
            shopDomain: body.shop,
        });
        if (!fraudResult.allowed) {
            console.warn('[COD Order] Blocked by fraud protection:', fraudResult.message);
            return Response.json(
                { success: false, error: fraudResult.message },
                { status: 403, headers: corsHeaders }
            );
        }

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

        // Log order in Supabase — primary storage + save full payload for retry
        const orderLog = await logOrder({
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
        });

        // Create Shopify order — STRICT: customer only sees success when Shopify order exists.
        // NO fallback, NO COD-xxxx, NO "success even if Shopify fails".
        console.log("[COD Order] Creating Shopify order for", orderLog.id);
        let syncResult: { success: boolean; shopifyOrderId?: string; shopifyOrderName?: string; error?: string };
        try {
            syncResult = await createShopifyOrderBackground(String(orderLog.id));
        } catch (syncErr: any) {
            console.error("[COD Order] ❌ Shopify order creation failed:", syncErr.message);
            syncResult = { success: false, error: syncErr.message };
        }

        if (!syncResult.success || !syncResult.shopifyOrderName) {
            // Shopify failed — return FAILURE to customer. No fallback.
            console.error("[COD Order] ❌ Shopify order creation failed for order", orderLog.id, "— Error:", syncResult.error);
            return Response.json({
                success: false,
                error: "Failed to create order. Please try again.",
            }, { status: 500, headers: corsHeaders });
        }

        return Response.json({
            success: true,
            orderId: orderLog.id,
            shopifyOrderId: syncResult.shopifyOrderId || null,
            orderName: syncResult.shopifyOrderName,
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
