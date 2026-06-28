/**
 * Webhook Handler: orders/updated
 *
 * Fires whenever an existing Shopify order is modified.
 * Maps the Shopify status to our internal DB status and updates order_logs.
 *
 * HMAC verification is handled automatically by authenticate.webhook().
 */

import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { supabase } from "../config/supabase.server";
import { editInventory, buildInventoryMetadata } from "../services/inventory-sync.server";

/**
 * Extract numeric order ID from either plain number or GID format.
 * Shopify webhooks send id as number (e.g. 6259483049277)
 * but sometimes the SDK wraps it as GID (gid://shopify/Order/6259483049277).
 */
function extractNumericId(id: any): string {
    const s = String(id);
    if (s.startsWith("gid://")) {
        return s.split("/").pop() || s;
    }
    return s;
}

/**
 * Map Shopify order fields → our internal order status
 */
function mapShopifyStatus(payload: any): string {
    if (payload.cancelled_at) return "cancelled";
    if (payload.fulfillment_status === "fulfilled") return "delivered";
    if (payload.fulfillment_status === "partial") return "confirmed";
    if (payload.financial_status === "paid") return "confirmed";
    if (payload.financial_status === "refunded") return "returned";
    if (payload.financial_status === "partially_refunded") return "returned";
    return "pending";
}

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    require('fs').appendFileSync('/Users/rashelshah/Desktop/codes/fox-cod-first-test-app/webhook-debug.log', `[${new Date().toISOString()}] Webhook triggered for orders/updated\n`);
  } catch (e) {}
  
  const { topic, shop, payload } = await authenticate.webhook(request);

  console.log(`[WEBHOOK RECEIVED] ${JSON.stringify({ topic, orderId: payload.id, fulfillmentId: undefined, payload: { source: payload.source_name, tags: payload.tags, financialStatus: payload.financial_status } })}`);
  console.log(`[Webhook] Received ${topic} for ${shop}`);

  try {
    const rawId = payload.id;
    const numericId = extractNumericId(rawId);
    const newStatus = mapShopifyStatus(payload);

    console.log(
      `[Webhook] Order ${payload.name} — raw id: ${rawId}, numeric: ${numericId} -> status: ${newStatus}`,
    );
    console.log(
      `[Webhook] financial_status=${payload.financial_status}, fulfillment_status=${payload.fulfillment_status}, cancelled_at=${payload.cancelled_at}`,
    );

    const webhookId = request.headers.get("x-shopify-webhook-id");
    if (!webhookId) {
      console.warn("[Webhook] Missing x-shopify-webhook-id header");
    }

    const lineItems = payload.line_items || [];
    const newItemsRaw = lineItems.map((item: any) => ({
      variantId: item.variant_id,
      quantity: item.quantity,
      title: item.title,
      sku: item.sku
    }));
    
    const newItems = await buildInventoryMetadata(shop, newItemsRaw);

    if (newItems.length > 0) {
      console.log(`[Webhook] Order ${payload.id} updated. Checking for inventory edits...`);
      
      // editInventory contains its own idempotency check via tryReserveInventoryEvent
      await editInventory(shop, numericId, newItems);
    }

    const { data, error } = await supabase
      .from("order_logs")
      .update({ 
        status: newStatus,
        shopify_financial_status: payload.financial_status || null,
        shopify_fulfillment_status: payload.fulfillment_status || null,
        shopify_cancelled_at: payload.cancelled_at || null,
        shopify_tags: payload.tags ? payload.tags.split(',').map((t: string) => t.trim()) : [],
        shopify_updated_at: payload.updated_at || null,
        shopify_order_name: payload.name || null
      })
      .or(`shopify_order_id.eq.${numericId},shopify_order_id.eq.gid://shopify/Order/${numericId}`)
      .select("id, status, shopify_order_id");

    if (error) {
      console.error("[Webhook] DB update error:", error);
    } else if (data && data.length > 0) {
      console.log(
        `[Webhook] Updated ${data.length} row(s) to "${newStatus}":`,
        data.map((row) => `${row.id} (${row.shopify_order_id})`),
      );
    } else {
      console.log(`[Webhook] No matching order_logs for shopify_order_id=${numericId}`);
    }

    return new Response(null, { status: 200 });
  } catch (error) {
    console.error("[Webhook] Error processing orders/updated:", error);
    return new Response(null, { status: 200 });
  }
};
