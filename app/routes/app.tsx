import { useEffect } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useLocation, useNavigation, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import { getSkeletonForPath, skeletonShimmerCSS } from "./PageSkeletons";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  // No manual token sync needed — supabaseSessionStorage.storeSession()
  // automatically persists the access token to both shopify_sessions and
  // shops.access_token on every OAuth / session refresh.

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

// Shopify doesn't reliably include `shop`/`host` on every embedded navigation
// that reloads the iframe (e.g. clicking the app name in Admin's sidebar from
// a subpage) — see routes/_index/route.tsx, which falls back to these when
// its own URL is missing them. Every real /app/* load DOES carry them, so
// cache the latest ones here for that fallback to use.
const SHOP_STORAGE_KEY = "foxCodShop";
const HOST_STORAGE_KEY = "foxCodHost";

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const location = useLocation();

  // Only swap in a skeleton for an actual tab-to-tab navigation — navigation.state
  // also goes "loading" during the revalidation after a same-page form submit (e.g.
  // clicking Save), and we don't want a full-page skeleton flashing over a form the
  // merchant is actively editing in that case.
  const isRouteChanging =
    navigation.state === "loading" &&
    navigation.location.pathname !== location.pathname;

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const shop = params.get("shop");
      const host = params.get("host");
      if (shop) sessionStorage.setItem(SHOP_STORAGE_KEY, shop);
      if (host) sessionStorage.setItem(HOST_STORAGE_KEY, host);
    } catch {
      // sessionStorage unavailable (e.g. privacy mode) — harmless, just no fallback cache.
    }
  }, [location.search]);

  return (
    <PolarisAppProvider i18n={enTranslations}>
      <AppProvider embedded apiKey={apiKey}>
        <style>{skeletonShimmerCSS}</style>
        <s-app-nav>
          <s-link href="/app/partial-payments">Payment Methods</s-link>
          <s-link href="/app/settings">Form Builder</s-link>
          <s-link href="/app/quantity-offers">Bundle Offers</s-link>
          <s-link href="/app/upsell-downsell">Upsells & Downsells</s-link>
          {/* <s-link href="/app/orders">Orders</s-link> */}
          <s-link href="/app/analytics">Analytics</s-link>
          <s-link href="/app/integrations">Integrations</s-link>
          <s-link href="/app/app-settings">Settings</s-link>
        </s-app-nav>
        {isRouteChanging ? getSkeletonForPath(navigation.location.pathname) : <Outlet />}
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
