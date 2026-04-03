/**
 * Shopify REST Admin Client
 *
 * Single source of truth for all REST API calls.
 * Session ALWAYS comes from unauthenticated.admin(shop) — this guarantees:
 *   - Token auto-refresh (via expiringOfflineAccessTokens)
 *   - Valid accessToken
 *   - Synced with Supabase session storage
 *
 * NO manual token handling. NO dual session sources. NO 401 retry logic.
 */

import { shopifyApi, ApiVersion } from "@shopify/shopify-api";
import { unauthenticated } from "../shopify.server";

// Lightweight Shopify API instance — only used for RestClient class.
// Session management is handled entirely by the Remix SDK.
const api = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY!,
  apiSecretKey: process.env.SHOPIFY_API_SECRET!,
  apiVersion: ApiVersion.October25,
  isEmbeddedApp: true,
  hostName: (process.env.SHOPIFY_APP_URL || "https://localhost").replace(
    /^https?:\/\//,
    "",
  ),
});

/**
 * Get a REST client for a shop with a guaranteed-fresh access token.
 *
 * Usage:
 *   const client = await getRestClient("shop.myshopify.com");
 *   const response = await client.post({ path: "orders", data: payload });
 *   const order = response.body.order;
 */
export async function getRestClient(shop: string) {
  // ✅ Get session from Remix SDK (AUTO REFRESH HAPPENS HERE)
  const { session } = await unauthenticated.admin(shop);

  if (!session?.accessToken) {
    throw new Error(`No valid session for shop: ${shop}`);
  }

  console.log(
    "[RestClient] SDK session for:",
    shop,
    "| id:",
    session.id,
  );

  // ✅ Use SAME session in REST client — no duplication, no desync
  return new api.clients.Rest({
    session: {
      shop: session.shop,
      accessToken: session.accessToken,
    } as any,
  });
}
