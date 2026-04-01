/**
 * Webhook Handler: orders/fulfilled
 *
 * Fires when a Shopify order is fully fulfilled (all items shipped).
 * Updates order_logs status to "delivered".
 *
 * HMAC verification is handled automatically by authenticate.webhook().
 */

import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { supabase } from "../config/supabase.server";

function extractNumericId(id: any): string {
    const s = String(id);
    if (s.startsWith("gid://")) return s.split("/").pop() || s;
    return s;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  console.log(`[Webhook] Received ${topic} for ${shop} - order: ${payload.name}`);

  try {
    const numericId = extractNumericId(payload.id);

    const { data, error } = await supabase
      .from("order_logs")
      .update({ status: "delivered" })
      .or(`shopify_order_id.eq.${numericId},shopify_order_id.eq.gid://shopify/Order/${numericId}`)
      .select("id, status, shopify_order_id");

    if (error) {
      console.error("[Webhook] DB update error:", error);
    } else if (data && data.length > 0) {
      console.log(
        `[Webhook] Order ${payload.name} marked as delivered - rows:`,
        data.map((row) => row.id),
      );
    } else {
      console.log(`[Webhook] No matching row for shopify_order_id=${numericId}`);
    }

    return new Response(null, { status: 200 });
  } catch (error) {
    console.error("[Webhook] Error processing orders/fulfilled:", error);
    return new Response(null, { status: 200 });
  }
};
