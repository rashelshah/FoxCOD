import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

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
          <s-link href="/app">Home</s-link>
          <s-link href="/app/settings">Form Builder</s-link>
          <s-link href="/app/quantity-offers">Bundle Offers</s-link>
          <s-link href="/app/upsell-downsell">Upsells & Downsells</s-link>
          <s-link href="/app/orders">Orders</s-link>
          <s-link href="/app/analytics">Analytics</s-link>
          <s-link href="/app/integrations">Integrations</s-link>
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
