/**
 * Route: GET /api/dashboard-stats
 * Fetched client-side by app._index.tsx after the dashboard shell has
 * already painted (see that file for why: the Shopify/Supabase calls here
 * are too slow to block the initial document response behind, and shell-then-
 * stream doesn't survive proxies that buffer the whole SSR response before
 * forwarding it — a plain follow-up fetch does, regardless of buffering).
 */
import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getFormSettings, getOrderStats, getCachedShopCurrency } from "../config/supabase.server";

export const defaultStats = {
  totalOrders: 0,
  pendingOrders: 0,
  totalRevenue: 0,
  todayRevenue: 0,
  recentOrders: [] as unknown[],
  todayOrders: 0,
  weekOrders: 0,
  ordersByStatus: {} as Record<string, number>,
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  const [shopCurrency, settings, supabaseStats] = await Promise.all([
    getCachedShopCurrency(shopDomain, admin),
    getFormSettings(shopDomain),
    getOrderStats(shopDomain).catch((error) => {
      console.log("Error fetching Supabase order stats:", error);
      return null;
    }),
  ]);

  return {
    enabled: settings?.enabled || false,
    stats: supabaseStats ? { ...defaultStats, ...supabaseStats } : defaultStats,
    shopCurrency,
  };
};
