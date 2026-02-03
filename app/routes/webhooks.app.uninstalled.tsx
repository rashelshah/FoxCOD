import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { markShopUninstalled } from "../config/supabase.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  if (session) {
    await db.session.deleteMany({ where: { shop } });
  }

  // Mark shop as uninstalled in Supabase (preserves data for reference)
  try {
    await markShopUninstalled(shop);
    console.log(`Marked ${shop} as uninstalled in Supabase`);
  } catch (error) {
    console.error(`Error marking shop uninstalled in Supabase:`, error);
  }

  return new Response();
};
