/**
 * Supabase-backed Shopify Session Storage
 *
 * Implements the SessionStorage interface from @shopify/shopify-app-session-storage
 * so that Shopify sessions (and access tokens) persist across Vercel cold starts.
 *
 * CRITICAL INVARIANTS:
 * 1. Session IDs are stored EXACTLY as Shopify provides (e.g. "offline_fox-cod-dev.myshopify.com")
 * 2. onlineAccessInfo is stored/restored as JSONB
 * 3. expires is round-tripped through timestamptz correctly
 * 4. Upsert on primary key `id` — no duplicates, no partial overwrites
 * 5. All DB operations are awaited — no race conditions
 * 6. shops.access_token is updated ONLY for offline sessions (stable tokens)
 * 7. refreshToken + refreshTokenExpires are persisted for token rotation
 */

import { Session } from "@shopify/shopify-api";
import type { SessionStorage } from "@shopify/shopify-app-session-storage";
import { supabase } from "../config/supabase.server";

/**
 * Convert a Supabase row into a Shopify Session object.
 * Restores ALL fields including onlineAccessInfo, refreshToken, refreshTokenExpires.
 */
function rowToSession(row: any): Session {
  const sessionParams: any = {
    id: row.id,                   // EXACT id as Shopify stored it
    shop: row.shop,
    state: row.state ?? "",
    isOnline: row.is_online ?? false,
  };

  if (row.scope != null) sessionParams.scope = row.scope;
  if (row.access_token != null) sessionParams.accessToken = row.access_token;

  // Restore expires as a Date object — critical for isActive() checks
  if (row.expires_at != null) {
    sessionParams.expires = new Date(row.expires_at);
  }

  // Restore onlineAccessInfo — required for embedded app online sessions
  if (row.online_access_info != null) {
    sessionParams.onlineAccessInfo = row.online_access_info;
  }

  // Restore refresh token fields — critical for expiringOfflineAccessTokens
  if (row.refresh_token != null) {
    sessionParams.refreshToken = row.refresh_token;
  }
  if (row.refresh_token_expires != null) {
    sessionParams.refreshTokenExpires = new Date(row.refresh_token_expires);
  }

  return new Session(sessionParams);
}

export const supabaseSessionStorage: SessionStorage = {
  /**
   * Store or update a session.
   * Uses upsert on PK `id` — no duplicate rows, full row overwrite.
   * Stores ALL session fields including refreshToken.
   * Also syncs access_token to `shops` table for OFFLINE sessions only.
   */
  async storeSession(session: Session): Promise<boolean> {
    const payload = {
      id: session.id,                            // EXACT — never modified
      shop: session.shop,
      state: session.state,
      is_online: session.isOnline,
      scope: session.scope ?? null,
      access_token: session.accessToken ?? null,
      expires_at: session.expires
        ? session.expires.toISOString()           // Date → ISO string → timestamptz
        : null,
      online_access_info: session.onlineAccessInfo ?? null,
      refresh_token: session.refreshToken ?? null,
      refresh_token_expires: session.refreshTokenExpires
        ? session.refreshTokenExpires.toISOString()
        : null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("shopify_sessions")
      .upsert(payload, { onConflict: "id" });    // PK upsert — atomic, no duplicates

    if (error) {
      console.error("[SessionStorage] storeSession error:", error);
      return false;
    }

    // 🔴 Safeguard #6: Only update shops.access_token for OFFLINE sessions.
    // Offline tokens are stable (one per shop). Online tokens are user-specific
    // and should NOT overwrite the shop-level token.
    if (!session.isOnline && session.accessToken) {
      const { error: shopError } = await supabase
        .from("shops")
        .update({
          access_token: session.accessToken,
          scope: session.scope ?? undefined,
        })
        .eq("shop_domain", session.shop);

      if (shopError) {
        // Non-fatal: the session is stored, shops sync is best-effort
        console.warn("[SessionStorage] shops.access_token sync failed:", shopError.message);
      }
    }

    return true;
  },

  /**
   * Load a session by its exact ID.
   * Returns undefined if not found (Shopify expects this).
   */
  async loadSession(id: string): Promise<Session | undefined> {
    const { data, error } = await supabase
      .from("shopify_sessions")
      .select("*")
      .eq("id", id)                               // EXACT match on id
      .single();

    if (error || !data) {
      if (error && error.code !== "PGRST116") {    // PGRST116 = "no rows" — expected
        console.error("[SessionStorage] loadSession error:", error);
      }
      return undefined;
    }

    return rowToSession(data);
  },

  /**
   * Delete a session by ID.
   */
  async deleteSession(id: string): Promise<boolean> {
    const { error } = await supabase
      .from("shopify_sessions")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("[SessionStorage] deleteSession error:", error);
      return false;
    }
    return true;
  },

  /**
   * Delete multiple sessions by IDs.
   */
  async deleteSessions(ids: string[]): Promise<boolean> {
    if (ids.length === 0) return true;

    const { error } = await supabase
      .from("shopify_sessions")
      .delete()
      .in("id", ids);

    if (error) {
      console.error("[SessionStorage] deleteSessions error:", error);
      return false;
    }
    return true;
  },

  /**
   * Find all sessions for a given shop domain.
   * Used by Shopify internals for session cleanup.
   */
  async findSessionsByShop(shop: string): Promise<Session[]> {
    const { data, error } = await supabase
      .from("shopify_sessions")
      .select("*")
      .eq("shop", shop);

    if (error) {
      console.error("[SessionStorage] findSessionsByShop error:", error);
      return [];
    }
    if (!data || data.length === 0) return [];

    return data.map(rowToSession);
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// TOKEN REFRESH UTILITY — for background services (sync, retry) that run
// without the seller having the admin panel open.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get a valid access token for a shop, refreshing if expired.
 *
 * Flow:
 * 1. Load the offline session from shopify_sessions
 * 2. If token is not expired → return it
 * 3. If token IS expired → use refresh_token to get a new one from Shopify
 * 4. Store the new token in shopify_sessions + shops.access_token
 * 5. Return the fresh token
 *
 * This allows background order sync to work even when the seller's
 * admin panel is closed and the offline token has expired.
 */
export async function getValidAccessToken(shopDomain: string): Promise<string> {
  const sessionId = `offline_${shopDomain}`;

  // 1. Load the offline session
  const session = await supabaseSessionStorage.loadSession(sessionId);
  if (!session) {
    throw new Error(`[TokenRefresh] No offline session found for ${shopDomain}`);
  }
  if (!session.accessToken) {
    throw new Error(`[TokenRefresh] Offline session has no access token for ${shopDomain}`);
  }

  // 2. Check if the token is still valid
  //    If no expiry is set, treat as non-expiring (always valid)
  const isExpired = session.expires && session.expires.getTime() < Date.now();
  if (!isExpired) {
    return session.accessToken;
  }

  // 3. Token is expired — attempt to refresh using the refresh token
  console.log(`[TokenRefresh] Access token expired for ${shopDomain}, attempting refresh...`);

  if (!session.refreshToken) {
    throw new Error(`[TokenRefresh] Token expired but no refresh token available for ${shopDomain}. Seller must re-open admin panel.`);
  }

  const apiKey = process.env.SHOPIFY_API_KEY;
  const apiSecret = process.env.SHOPIFY_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error("[TokenRefresh] SHOPIFY_API_KEY or SHOPIFY_API_SECRET not set");
  }

  // 4. Call Shopify's token refresh endpoint
  const tokenRes = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: apiKey,
      client_secret: apiSecret,
      grant_type: "refresh_token",
      refresh_token: session.refreshToken,
    }),
  });

  if (!tokenRes.ok) {
    const errorBody = await tokenRes.text();
    throw new Error(`[TokenRefresh] Shopify token refresh failed (${tokenRes.status}): ${errorBody}`);
  }

  const tokenData = await tokenRes.json();
  const newAccessToken = tokenData.access_token;
  const newRefreshToken = tokenData.refresh_token;
  const expiresIn = tokenData.expires_in; // seconds

  if (!newAccessToken) {
    throw new Error("[TokenRefresh] Shopify returned no access_token in refresh response");
  }

  console.log(`[TokenRefresh] ✅ Token refreshed successfully for ${shopDomain}`);

  // 5. Update the session with the new tokens
  session.accessToken = newAccessToken;
  if (newRefreshToken) {
    session.refreshToken = newRefreshToken;
  }
  if (expiresIn) {
    session.expires = new Date(Date.now() + expiresIn * 1000);
  }

  // Store the updated session — this also updates shops.access_token
  await supabaseSessionStorage.storeSession(session);

  return newAccessToken;
}
