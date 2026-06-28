import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { fulfillInventory } from "../services/inventory-sync.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  console.log(`[WEBHOOK RECEIVED] ${JSON.stringify({ topic, orderId: payload.order_id, fulfillmentId: payload.id, payload: { source: payload.source_name, tags: payload.tags, financialStatus: payload.financial_status } })}`);

  const webhookId = request.headers.get("x-shopify-webhook-id");
  if (!webhookId) {
    console.warn("[Webhook] Missing x-shopify-webhook-id header in fulfillments/create");
  }

  const orderId = String(payload.order_id);
  const lineItems = payload.line_items || [];
  
  const fulfillments = lineItems
    .filter((item: any) => item.variant_id)
    .map((item: any) => ({
      variantId: `gid://shopify/ProductVariant/${item.variant_id}`,
      quantity: item.quantity || 1
    }));

  if (fulfillments.length > 0) {
    console.log(`[Webhook] Fulfilling inventory for order ${orderId}`);
    await fulfillInventory(shop, orderId, fulfillments);
    console.log(`[Webhook] Successfully processed fulfillment for order ${orderId}`);
  }

  return new Response(null, { status: 200 });
};
