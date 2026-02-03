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
    productId: string;
    variantId: string;
    quantity: number;
    price: number;
    productTitle: string;
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

        console.log("[COD Order] Received order request:", body.shop, body.productTitle);

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

        // Generate order name
        const orderName = generateOrderName();

        // Log order in Supabase - this is the primary order storage
        const orderLog = await logOrder({
            shop_domain: body.shop,
            shopify_order_id: "", // Will be updated if Shopify order is created
            shopify_order_name: orderName,
            customer_name: body.customerName,
            customer_phone: body.customerPhone,
            customer_address: body.customerAddress,
            product_id: body.productId,
            product_title: body.productTitle,
            variant_id: body.variantId,
            quantity: body.quantity,
            total_price: body.price * body.quantity,
            status: "pending", // Pending = awaiting fulfillment
        });

        console.log("[COD Order] Order logged successfully:", orderLog.id, orderName);

        // Return success - order is captured in Supabase
        // Note: Shopify order creation is skipped due to protected customer data access requirements
        // Merchants can view and manage orders from the app dashboard
        return Response.json({
            success: true,
            orderId: orderLog.id,
            orderName: orderName,
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
