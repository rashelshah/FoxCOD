import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { supabaseSessionStorage } from "../shopify/session-storage.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, session, topic, shop } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  const current = payload.current as string[];
  if (session) {
    // Update session scope via Supabase session storage
    session.scope = current.toString();
    await supabaseSessionStorage.storeSession(session);
  }

  return new Response(null, { status: 200 });
};
