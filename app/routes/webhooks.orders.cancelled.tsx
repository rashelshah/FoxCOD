/**
 * Webhook Handler: orders/cancelled
 *
 * Fires when a Shopify order is cancelled.
 * Updates order_logs status to "cancelled".
 *
 * HMAC verification is handled automatically by authenticate.webhook().
 */

import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { supabase } from "../config/supabase.server";
import { parseInventoryMetadata, cancelInventory } from "../services/inventory-sync.server";

function extractNumericId(id: any): string {
    const s = String(id);
    if (s.startsWith("gid://")) return s.split("/").pop() || s;
    return s;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  console.log(`[WEBHOOK RECEIVED] ${JSON.stringify({ topic, orderId: payload.id, fulfillmentId: undefined, payload: { source: payload.source_name, tags: payload.tags, financialStatus: payload.financial_status } })}`);
  console.log(`[Webhook] Received ${topic} for ${shop} - order: ${payload.name}`);

  try {
    const numericId = extractNumericId(payload.id);
    const webhookId = request.headers.get("x-shopify-webhook-id");
    if (!webhookId) {
      console.warn("[Webhook] Missing x-shopify-webhook-id header");
    }

    // ── Inventory Restoration ──
    console.log(`[Webhook] Order ${payload.id} restoring cancelled inventory...`);
    await cancelInventory(shop, numericId);
    console.log(`[Webhook] Successfully restored inventory for cancelled order ${payload.id}`);

    const { data, error } = await supabase
      .from("order_logs")
      .update({ status: "cancelled" })
      .or(`shopify_order_id.eq.${numericId},shopify_order_id.eq.gid://shopify/Order/${numericId}`)
      .select("id, status, shopify_order_id");

    if (error) {
      console.error("[Webhook] DB update error:", error);
    } else if (data && data.length > 0) {
      console.log(
        `[Webhook] Order ${payload.name} marked as cancelled - rows:`,
        data.map((row) => row.id),
      );
    } else {
      console.log(`[Webhook] No matching row for shopify_order_id=${numericId}`);
    }

    return new Response(null, { status: 200 });
  } catch (error) {
    console.error("[Webhook] Error processing orders/cancelled:", error);
    return new Response(null, { status: 200 });
  }
};
