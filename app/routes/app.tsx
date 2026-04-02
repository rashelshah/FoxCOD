import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";
import { saveShop } from "../config/supabase.server";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  // CRITICAL: Save access token to Supabase on EVERY admin page load.
  // MemorySessionStorage on Vercel loses sessions on cold starts.
  // When Shopify re-authenticates, this ensures the fresh token is always
  // persisted to Supabase so the order sync service can use it.
  try {
    if (session?.accessToken) {
      await saveShop(session.shop, session.accessToken, session.scope || "");
    }
  } catch (e) {
    console.error("[App Layout] Error saving access token to Supabase:", e);
  }

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <PolarisAppProvider i18n={enTranslations}>
      <AppProvider embedded apiKey={apiKey}>
        <s-app-nav>
          <s-link href="/app/settings">Form Builder</s-link>
          <s-link href="/app/quantity-offers">Bundle Offers</s-link>
          <s-link href="/app/upsell-downsell">Upsells & Downsells</s-link>
          {/* <s-link href="/app/orders">Orders</s-link> */}
          <s-link href="/app/analytics">Analytics</s-link>
          <s-link href="/app/integrations">Integrations</s-link>
          <s-link href="/app/app-settings">Settings</s-link>
        </s-app-nav>
        <Outlet />
      </AppProvider>
    </PolarisAppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
