import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  console.log(`[Webhook] Received ${topic} for ${shop}`);
  console.log("[Webhook] shop/redact payload:", payload);

  return new Response(null, { status: 200 });
};
