import { useEffect, useState } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useFetcher, useLoaderData, useLocation, useNavigation, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { AppProvider as PolarisAppProvider, Modal, Text, BlockStack } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import { getSkeletonForPath, skeletonShimmerCSS } from "./PageSkeletons";
import { BILLING_PLANS } from "../config/billing-plans";
import type { loader as billingStatusLoader } from "./api.billing-status";
import type { action as billingAction } from "./app.billing";

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

/** Dismissing the limit-reached prompt only lasts this browser session — it
 *  reappears next time the merchant opens the app, since they're still
 *  blocked and this is genuinely losing them orders. */
const LIMIT_MODAL_DISMISSED_KEY = "foxCodLimitModalDismissed";

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const location = useLocation();

  const statusFetcher = useFetcher<typeof billingStatusLoader>();
  const upgradeFetcher = useFetcher<typeof billingAction>();
  const [limitModalDismissed, setLimitModalDismissed] = useState(false);

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

  // Cheap, app-wide poll (not the Billing page's full stats) — fetched once
  // per admin session load, not on every navigation, matching how the
  // dashboard defers its own stats fetch behind the initial shell paint.
  useEffect(() => {
    if (statusFetcher.state === "idle" && statusFetcher.data == null) {
      statusFetcher.load("/api/billing-status");
    }
    try {
      setLimitModalDismissed(sessionStorage.getItem(LIMIT_MODAL_DISMISSED_KEY) === "true");
    } catch {
      // sessionStorage unavailable — just never treat it as dismissed.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Shopify's approval screen has to replace the whole page, not render
  // inside the embedded iframe — same pattern as the Billing page itself.
  useEffect(() => {
    if (upgradeFetcher.data?.confirmationUrl) {
      window.open(upgradeFetcher.data.confirmationUrl, "_top");
    }
  }, [upgradeFetcher.data]);

  const showLimitModal = Boolean(statusFetcher.data?.limitReached) && !limitModalDismissed;

  const dismissLimitModal = () => {
    setLimitModalDismissed(true);
    try {
      sessionStorage.setItem(LIMIT_MODAL_DISMISSED_KEY, "true");
    } catch {
      // sessionStorage unavailable — the modal just won't stay dismissed, harmless.
    }
  };

  const upgradeToPro = () => {
    const formData = new FormData();
    formData.set("intent", "subscribe");
    formData.set("planKey", "PRO");
    formData.set("cycle", "monthly");
    upgradeFetcher.submit(formData, { method: "post", action: "/app/billing" });
  };

  const isUpgrading = upgradeFetcher.state === "submitting" || upgradeFetcher.state === "loading";

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
          <s-link href="/app/analytics">Analytics & Integrations</s-link>
          <s-link href="/app/billing">Billing</s-link>
          <s-link href="/app/app-settings">Settings</s-link>
        </s-app-nav>
        {isRouteChanging ? getSkeletonForPath(navigation.location.pathname) : <Outlet />}

        <Modal
          open={showLimitModal}
          onClose={dismissLimitModal}
          title="You've reached your Free plan limit"
          primaryAction={{
            content: `Upgrade to Pro — $${BILLING_PLANS.PRO.monthlyPrice}/mo`,
            onAction: upgradeToPro,
            loading: isUpgrading,
          }}
          secondaryActions={[
            { content: "Maybe later", onAction: dismissLimitModal, disabled: isUpgrading },
          ]}
        >
          <Modal.Section>
            <BlockStack gap="200">
              <Text as="p">
                New orders are being blocked because you&apos;ve used all{" "}
                {BILLING_PLANS.FREE.includedOrders} orders included in the Free plan this
                cycle. Upgrade to Pro for {BILLING_PLANS.PRO.includedOrders.toLocaleString("en-US")}{" "}
                orders a month and keep receiving orders right away.
              </Text>
              {upgradeFetcher.data?.error && (
                <Text as="p" tone="critical">
                  {upgradeFetcher.data.error}
                </Text>
              )}
            </BlockStack>
          </Modal.Section>
        </Modal>
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
