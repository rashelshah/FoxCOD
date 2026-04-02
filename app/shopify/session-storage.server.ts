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
 */

import { Session } from "@shopify/shopify-api";
import type { SessionStorage } from "@shopify/shopify-app-session-storage";
import { supabase } from "../config/supabase.server";

/**
 * Convert a Supabase row into a Shopify Session object.
 * Restores all fields including onlineAccessInfo.
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

  return new Session(sessionParams);
}

export const supabaseSessionStorage: SessionStorage = {
  /**
   * Store or update a session.
   * Uses upsert on PK `id` — no duplicate rows, full row overwrite.
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
