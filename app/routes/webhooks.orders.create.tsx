import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { logOrder, type OrderLogEntry } from "../config/supabase.server";

/**
 * Webhook Handler: orders/create
 * 
 * This webhook is triggered when a new order is created in Shopify.
 * We use it to detect Partial COD orders (via custom attributes) and log them.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
    const { topic, shop, payload } = await authenticate.webhook(request);

    console.log(`[Webhook] Received ${topic} for ${shop}`);
    console.log("[Webhook] Order payload:", JSON.stringify(payload, null, 2).substring(0, 2000));

    try {
        // Check if this is a partial COD order by looking at custom attributes (note_attributes)
        const noteAttributes = payload.note_attributes || [];
        const partialCodAttr = noteAttributes.find((attr: any) => attr.name === "partial_cod");
        const isPartialCod = partialCodAttr?.value === "true";

        if (!isPartialCod) {
            console.log("[Webhook] Not a partial COD order, skipping");
            return new Response("OK", { status: 200 });
        }

        console.log("[Webhook] Detected Partial COD order:", payload.name);

        // Extract partial COD details from custom attributes
        const getAttrValue = (key: string) => {
            const attr = noteAttributes.find((a: any) => a.name === key);
            return attr?.value || "";
        };

        const advanceAmount = parseFloat(getAttrValue("advance_amount")) || 0;
        const remainingAmount = parseFloat(getAttrValue("remaining_amount")) || 0;
        const originalProductId = getAttrValue("original_product_id");
        const originalVariantId = getAttrValue("original_variant_id");
        const originalQuantity = parseInt(getAttrValue("original_quantity")) || 1;
        const originalPrice = parseFloat(getAttrValue("original_price")) || 0;
        const customerName = getAttrValue("customer_name");
        const customerAddress = getAttrValue("customer_address");
        const customerCity = getAttrValue("customer_city");
        const customerState = getAttrValue("customer_state");
        const customerZipcode = getAttrValue("customer_zipcode");

        // Get customer details from the order
        const customer = payload.customer || {};
        const shippingAddress = payload.shipping_address || {};

        // Get first line item (the advance payment item)
        const lineItem = payload.line_items?.[0] || {};

        // Create order log entry
        const orderLogEntry: OrderLogEntry = {
            shop_domain: shop,
            product_id: originalProductId || lineItem.product_id?.toString() || "",
            product_title: lineItem.title || "Advance Payment",
            variant_id: originalVariantId || lineItem.variant_id?.toString(),
            variant_title: lineItem.variant_title,
            quantity: originalQuantity,
            price: originalPrice.toString(),
            customer_name: customerName || `${customer.first_name || ""} ${customer.last_name || ""}`.trim() || shippingAddress.name || "Customer",
            customer_phone: customer.phone || shippingAddress.phone || "",
            customer_address: customerAddress || `${shippingAddress.address1 || ""} ${shippingAddress.address2 || ""}`.trim(),
            customer_email: customer.email || "",
            city: customerCity || shippingAddress.city || "",
            state: customerState || shippingAddress.province || "",
            pincode: customerZipcode || shippingAddress.zip || "",
            notes: payload.note || "",
            // Partial COD specific fields
            is_partial_cod: true,
            advance_amount: advanceAmount,
            remaining_cod_amount: remainingAmount,
        };

        console.log("[Webhook] Logging partial COD order:", orderLogEntry);

        // Log to database
        await logOrder(orderLogEntry);

        console.log("[Webhook] Partial COD order logged successfully:", payload.name);

        return new Response("OK", { status: 200 });
    } catch (error) {
        console.error("[Webhook] Error processing orders/create:", error);
        // Return 200 to acknowledge receipt (Shopify will retry if we return error)
        return new Response("Error but acknowledged", { status: 200 });
    }
};
