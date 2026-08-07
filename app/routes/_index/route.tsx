import { useEffect, useState } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

// Kept in sync with the same keys app.tsx writes to on every successful /app/*
// load — see the comment there for why this cache exists.
const SHOP_STORAGE_KEY = "foxCodShop";
const HOST_STORAGE_KEY = "foxCodHost";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const params = url.searchParams;

  // Shopify Admin's "go to app home" navigation (clicking the app name in the
  // sidebar) doesn't always include `shop` here, but always includes `host`
  // and/or `embedded` for any embedded-context load. Redirect on any of
  // those so the real dashboard renders instead of the public landing page —
  // /app's own loader still fully validates shop/host and redirects to login
  // if something is actually missing.
  if (params.get("shop") || params.get("host") || params.get("embedded")) {
    throw redirect(`/app?${params.toString()}`);
  }

  return { showForm: Boolean(login) };
};

/**
 * Runs synchronously the instant the browser parses this <script> tag — well
 * before the React/ReactDOM/react-router bundle has even started downloading,
 * let alone hydrated. This ONLY ever calls location.replace (a real
 * navigation) and never touches the DOM itself: an earlier version of this
 * script toggled element visibility directly, but React hydrating that same
 * tree afterward reconciled it back to match the component's declared output,
 * silently undoing the toggle and leaving the page stuck on the skeleton.
 * Because this version makes no DOM changes, there is nothing for hydration
 * to conflict with — it either navigates away (tearing down the page before
 * hydration matters) or does nothing, leaving hydration to proceed normally.
 */
const earlyRedirectScript = `(function () {
  try {
    if (window.top === window.self) return;
    var params = new URLSearchParams(window.location.search);
    if (!params.get('shop')) {
      try {
        var cachedShop = sessionStorage.getItem('${SHOP_STORAGE_KEY}');
        if (cachedShop) params.set('shop', cachedShop);
      } catch (e) {}
    }
    if (!params.get('host')) {
      try {
        var cachedHost = sessionStorage.getItem('${HOST_STORAGE_KEY}');
        if (cachedHost) params.set('host', cachedHost);
      } catch (e) {}
    }
    if (!params.get('embedded')) params.set('embedded', '1');
    window.location.replace('/app?' + params.toString());
  } catch (e) {}
})();`;

const shimmerCSS = `
@keyframes foxIndexShimmer {
  0% { background-position: -400px 0; }
  100% { background-position: 400px 0; }
}
.fox-index-shimmer {
  background: linear-gradient(90deg, #e4e5e7 25%, #f1f2f3 37%, #e4e5e7 63%);
  background-size: 400px 100%;
  animation: foxIndexShimmer 1.4s ease-in-out infinite;
  border-radius: 8px;
}
`;

function LoadingSkeleton() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        padding: 24,
      }}
    >
      <style>{shimmerCSS}</style>
      <div className="fox-index-shimmer" style={{ height: 28, width: "55%", maxWidth: 320 }} />
      <div style={{ display: "flex", gap: 16, width: "100%", maxWidth: 640 }}>
        <div className="fox-index-shimmer" style={{ height: 90, flex: 1 }} />
        <div className="fox-index-shimmer" style={{ height: 90, flex: 1 }} />
        <div className="fox-index-shimmer" style={{ height: 90, flex: 1 }} />
      </div>
    </div>
  );
}

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  // Belt-and-braces backstop for the inline script above, in case its
  // embedded-check somehow doesn't fire the redirect: rendered entirely
  // through React state (never raw DOM mutation), so it's consistent with
  // what gets hydrated and can't be reverted by hydration reconciliation.
  // Server-renders (and initially hydrates) as the skeleton — showMarketingPage
  // only flips to true once we've confirmed we're not embedded.
  const [showMarketingPage, setShowMarketingPage] = useState(false);
  useEffect(() => {
    if (window.top !== window.self) {
      const params = new URLSearchParams(window.location.search);
      try {
        if (!params.get("shop")) {
          const cachedShop = sessionStorage.getItem(SHOP_STORAGE_KEY);
          if (cachedShop) params.set("shop", cachedShop);
        }
        if (!params.get("host")) {
          const cachedHost = sessionStorage.getItem(HOST_STORAGE_KEY);
          if (cachedHost) params.set("host", cachedHost);
        }
      } catch {
        // sessionStorage unavailable (e.g. privacy mode) — fall through with whatever the URL had.
      }
      if (!params.get("embedded")) params.set("embedded", "1");
      window.location.replace(`/app?${params.toString()}`);
      return;
    }
    setShowMarketingPage(true);
  }, []);

  return (
    <>
      {/* eslint-disable-next-line react/no-danger */}
      <script dangerouslySetInnerHTML={{ __html: earlyRedirectScript }} />

      {!showMarketingPage ? (
        <LoadingSkeleton />
      ) : (
        <div className={styles.index}>
          <div className={styles.content}>
            <h1 className={styles.heading}>Foxly COD</h1>

            <p className={styles.text}>
              One-click Cash on Delivery checkout for Shopify stores.
            </p>

            {showForm && (
              <Form className={styles.form} method="post" action="/auth/login">
                <label className={styles.label}>
                  <span>Enter your store domain</span>
                  <input
                    className={styles.input}
                    type="text"
                    name="shop"
                    placeholder="your-store.myshopify.com"
                  />
                </label>

                <button className={styles.button} type="submit">
                  Connect Store
                </button>
              </Form>
            )}

            <ul className={styles.list}>
              <li>
                <strong>Universal COD Form</strong> – Customers place orders using a
                single fast form.
              </li>

              <li>
                <strong>Reduce Checkout Friction</strong> – Skip long Shopify
                checkout steps.
              </li>

              <li>
                <strong>Seller Dashboard</strong> – Manage COD orders in one place.
              </li>
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
