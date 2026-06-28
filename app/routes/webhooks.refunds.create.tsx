/**
 * Webhook Handler: refunds/create
 *
 * Fires when a Shopify order refund is created.
 * Parses the refunded line items and restores partial inventory for FoxlyCOD
 * orders that used custom line items (no variantId).
 *
 * HMAC verification is handled automatically by authenticate.webhook().
 */

import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { refundInventory } from "../services/inventory-sync.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  console.log(`[WEBHOOK RECEIVED] ${JSON.stringify({ topic, orderId: payload.order_id, fulfillmentId: undefined, payload: { source: payload.source_name, tags: payload.tags, financialStatus: payload.financial_status } })}`);
  console.log(`[Webhook] Received ${topic} for ${shop} - refund ID: ${payload.id}, order ID: ${payload.order_id}`);

  try {
    const refundId = String(payload.id);
    const orderId = String(payload.order_id);
    const webhookId = request.headers.get("x-shopify-webhook-id");
    if (!webhookId) {
      console.warn("[Webhook] Missing x-shopify-webhook-id header");
    }

    const refundLineItems = payload.refund_line_items || [];
    if (refundLineItems.length === 0) {
      console.log(`[Webhook] Refund ${refundId} has no line items. Skipping.`);
      return new Response(null, { status: 200 });
    }

    // Only restore inventory when restock_type != no_restock
    const refundedItems = refundLineItems
      .filter((rli: any) => rli.restock_type !== "no_restock" && rli.line_item?.variant_id)
      .map((rli: any) => ({
        variantId: `gid://shopify/ProductVariant/${rli.line_item.variant_id}`,
        quantity: rli.quantity,
      }))
      .filter((item: any) => item.quantity > 0);

    if (refundedItems.length > 0) {
      console.log(`[Webhook] Refund ${refundId} has ${refundedItems.length} valid restock items for order ${orderId}. Restoring inventory...`);
      await refundInventory(shop, orderId, refundedItems);
      console.log(`[Webhook] Successfully restored inventory for refund ${refundId}`);
    } else {
      console.log(`[Webhook] No recognizable or restockable line items to restore for refund ${refundId}.`);
    }

    return new Response(null, { status: 200 });
  } catch (error) {
    console.error("[Webhook] Error processing refunds/create:", error);
    return new Response(null, { status: 200 });
  }
};
