import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

/**
 * API Endpoint: Create Partial COD Checkout
 * 
 * This endpoint creates a draft order with only the advance payment amount,
 * then returns the checkout URL for the customer to complete payment.
 * 
 * The remaining amount will be collected on delivery (COD).
 */

// CORS headers for all responses
const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
};

// Helper function to create JSON responses (replacing json() from remix)
function jsonResponse(data: any, options?: { status?: number; headers?: Record<string, string> }) {
    return new Response(JSON.stringify(data), {
        status: options?.status || 200,
        headers: { ...corsHeaders, ...(options?.headers || {}) },
    });
}

// Handle CORS preflight
export async function loader() {
    return new Response(null, {
        status: 204,
        headers: corsHeaders,
    });
}

export async function action({ request }: ActionFunctionArgs) {
    console.log("[Partial COD] Create checkout request received");

    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
        const body = await request.json();
        console.log("[Partial COD] Request body:", body);

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
        } = body;

        // Validate required fields
        if (!shop || !productId || !advanceAmount) {
            return jsonResponse(
                { success: false, error: "Missing required fields" },
                { status: 400 }
            );
        }

        // Try to authenticate with admin API via app proxy
        let admin;
        try {
            const auth = await authenticate.public.appProxy(request);
            admin = auth.admin;
        } catch (authError) {
            console.log("[Partial COD] App proxy auth error, trying admin auth:", authError);
            try {
                const auth = await authenticate.admin(request);
                admin = auth.admin;
            } catch (adminAuthError) {
                console.error("[Partial COD] Admin auth also failed:", adminAuthError);
                return jsonResponse(
                    { success: false, error: "Authentication failed" },
                    { status: 401 }
                );
            }
        }

        if (!admin) {
            return jsonResponse(
                { success: false, error: "Could not authenticate with Shopify" },
                { status: 401 }
            );
        }

        // Calculate the total order value (for note purposes)
        const totalOrderValue = (price * quantity) + (shippingPrice || 0);
        const actualRemainingAmount = totalOrderValue - advanceAmount;

        // Create a draft order with the advance amount as a custom line item
        const draftOrderInput = {
            note: `PARTIAL COD ORDER | Advance: ₹${advanceAmount} | Remaining (COD): ₹${actualRemainingAmount.toFixed(2)} | Original Product: ${productTitle} (Qty: ${quantity})`,
            email: customerEmail || undefined,
            phone: customerPhone || undefined,
            tags: ["partial-cod", "advance-payment"],
            customAttributes: [
                { key: "partial_cod", value: "true" },
                { key: "advance_amount", value: String(advanceAmount) },
                { key: "remaining_amount", value: String(actualRemainingAmount.toFixed(2)) },
                { key: "original_product_id", value: String(productId) },
                { key: "original_variant_id", value: String(variantId) },
                { key: "original_quantity", value: String(quantity) },
                { key: "original_price", value: String(price) },
                { key: "customer_name", value: customerName || "" },
                { key: "customer_address", value: customerAddress || "" },
                { key: "customer_city", value: customerCity || "" },
                { key: "customer_state", value: customerState || "" },
                { key: "customer_zipcode", value: customerZipcode || "" },
            ],
            lineItems: [
                {
                    title: `Advance Payment for ${productTitle}`,
                    quantity: 1,
                    originalUnitPrice: advanceAmount,
                    requiresShipping: false,
                    taxable: false,
                }
            ],
            shippingAddress: customerAddress ? {
                firstName: customerName?.split(" ")[0] || "Customer",
                lastName: customerName?.split(" ").slice(1).join(" ") || "",
                address1: customerAddress,
                city: customerCity || "",
                province: customerState || "",
                zip: customerZipcode || "",
                country: "IN",
                phone: customerPhone || "",
            } : undefined,
            billingAddress: customerAddress ? {
                firstName: customerName?.split(" ")[0] || "Customer",
                lastName: customerName?.split(" ").slice(1).join(" ") || "",
                address1: customerAddress,
                city: customerCity || "",
                province: customerState || "",
                zip: customerZipcode || "",
                country: "IN",
                phone: customerPhone || "",
            } : undefined,
        };

        console.log("[Partial COD] Creating draft order:", JSON.stringify(draftOrderInput, null, 2));

        // Create the draft order via GraphQL
        const draftOrderResponse = await admin.graphql(`
            mutation draftOrderCreate($input: DraftOrderInput!) {
                draftOrderCreate(input: $input) {
                    draftOrder {
                        id
                        name
                        invoiceUrl
                        status
                    }
                    userErrors {
                        field
                        message
                    }
                }
            }
        `, {
            variables: {
                input: draftOrderInput
            }
        });

        const draftOrderResult = await draftOrderResponse.json();
        console.log("[Partial COD] Draft order result:", JSON.stringify(draftOrderResult, null, 2));

        if (draftOrderResult.data?.draftOrderCreate?.userErrors?.length > 0) {
            const errors = draftOrderResult.data.draftOrderCreate.userErrors;
            console.error("[Partial COD] Draft order errors:", errors);
            return jsonResponse(
                { success: false, error: errors.map((e: any) => e.message).join(", ") },
                { status: 400 }
            );
        }

        const draftOrder = draftOrderResult.data?.draftOrderCreate?.draftOrder;
        if (!draftOrder) {
            return jsonResponse(
                { success: false, error: "Failed to create draft order" },
                { status: 500 }
            );
        }

        const checkoutUrl = draftOrder.invoiceUrl;
        console.log("[Partial COD] Draft order created:", draftOrder.name, "Checkout URL:", checkoutUrl);

        return jsonResponse({
            success: true,
            checkoutUrl: checkoutUrl,
            draftOrderId: draftOrder.id,
            draftOrderName: draftOrder.name,
        });

    } catch (error) {
        console.error("[Partial COD] Error:", error);
        return jsonResponse(
            { success: false, error: "Internal server error" },
            { status: 500 }
        );
    }
}
