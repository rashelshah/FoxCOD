/**
 * Shopify REST Admin Client
 *
 * Creates a REST client using a session with a guaranteed-fresh token.
 * Uses `unauthenticated.admin(shop)` from the Shopify SDK which:
 *   1. Loads the offline session from storage
 *   2. Checks if the token is expired
 *   3. Refreshes it using the stored refreshToken (if expired)
 *   4. Updates the session in storage with the new token
 *   5. Returns the session with a valid accessToken
 *
 * This eliminates ALL manual token handling and 401 retry logic.
 */

import { Session } from "@shopify/shopify-api";
import shopify from "../shopify.server";

// Access the underlying Shopify API instance to get the configured RestClient class.
// The `api` property exists at runtime on the shopifyApp return value (via BasicParams),
// but is not exposed in the public ShopifyApp TypeScript types.
const shopifyApi = (shopify as any).api;
const RestClientClass = shopifyApi.clients.Rest;

/**
 * Get a REST client for a shop with a guaranteed-fresh access token.
 * The SDK handles token refresh automatically via expiringOfflineAccessTokens.
 *
 * Use this for UNAUTHENTICATED contexts (proxy routes, background sync, API endpoints).
 *
 * Usage:
 *   const rest = await getRestClient("shop.myshopify.com");
 *   const response = await rest.post({ path: "orders", data: payload });
 *   const order = response.body.order;
 */
export async function getRestClient(shop: string) {
    // SDK loads session, checks expiry, refreshes token if needed — all automatic
    const { session } = await shopify.unauthenticated.admin(shop);

    if (!session || !session.accessToken) {
        throw new Error(`No valid session found for shop: ${shop}. Merchant must re-open admin panel to re-authenticate.`);
    }

    console.log('[RestClient] Using SDK-managed session for shop:', shop, '| session:', session.id);

    return new RestClientClass({ session });
}

/**
 * Get a REST client from an existing session (e.g. from authenticate.admin()).
 * Use this for AUTHENTICATED admin contexts where you already have a valid session.
 *
 * authenticate.admin() already guarantees the token is fresh, so no additional
 * refresh is needed.
 *
 * Usage:
 *   const { session } = await authenticate.admin(request);
 *   const rest = getRestClientFromSession(session);
 *   const response = await rest.get({ path: "orders", query: { status: "any" } });
 */
export function getRestClientFromSession(session: Session) {
    if (!session || !session.accessToken) {
        throw new Error(`Invalid session — no access token. Merchant must re-authenticate.`);
    }
    return new RestClientClass({ session });
}

