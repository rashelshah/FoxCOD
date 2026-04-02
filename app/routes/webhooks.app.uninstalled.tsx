import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { supabaseSessionStorage } from "../shopify/session-storage.server";
import { markShopUninstalled } from "../config/supabase.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  if (session) {
    // Delete all sessions for this shop from Supabase
    const sessions = await supabaseSessionStorage.findSessionsByShop(shop);
    if (sessions.length > 0) {
      await supabaseSessionStorage.deleteSessions(sessions.map((s) => s.id));
    }
  }

  // Mark shop as uninstalled in Supabase (preserves data for reference)
  try {
    await markShopUninstalled(shop);
    console.log(`Marked ${shop} as uninstalled in Supabase`);
  } catch (error) {
    console.error(`Error marking shop uninstalled in Supabase:`, error);
  }

  return new Response(null, { status: 200 });
};
