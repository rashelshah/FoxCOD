/**
 * Dashboard Page - Main admin view for Fox COD app
 * Route: /app
 * Premium modern design
 */

import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, Link, useNavigate } from "react-router";
import { Button, InlineStack } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { getFormSettings, saveShop } from "../config/supabase.server";
import { getRestClient } from "../shopify/rest-client.server";

const FOX_COD_EXTENSION_UID = "87e0c6dc-4f49-e6ce-990c-7f93eadc93f862473f7f";
const FOX_COD_EMBED_HANDLE = "cod-form-embed";

type ShopifyOrder = {
  created_at: string;
  total_price: string;
  financial_status: string;
  cancelled_at: string | null;
};

type ShopifyOrderStatsResponse = {
  body?: { orders?: ShopifyOrder[] };
  headers?: {
    get?: (name: string) => string | null;
    link?: string;
  };
};

type ShopifyRestClient = {
  get: (args: { path: string; query: Record<string, string> }) => Promise<ShopifyOrderStatsResponse>;
};

/**
 * Returns the theme editor URL using the App Embed approach.
 * App Embeds (target=body) work on ALL Shopify themes — both classic
 * themes (Debut, Vintage, Brooklyn, Narrative) AND modern OS2 themes
 * (Dawn, Horizon, Craft, etc.).
 *
 * The merchant simply toggles the embed ON in Theme Settings > App Embeds.
 * No manual block placement needed.
 */
function getCodThemeEditorUrl(shop: string) {
  // Use the App's Client ID (API Key) as some older Shopify apps use it as the extension UUID
  const extensionId = encodeURIComponent(FOX_COD_EXTENSION_UID);
  const handle = encodeURIComponent(FOX_COD_EMBED_HANDLE);

  // App Embed URL — opens on product template and activates the embed block
  return `https://${shop}/admin/themes/current/editor?context=apps&template=product&activateAppEmbed=${extensionId}/${handle}`;
}

async function fetchShopifyOrderStats(restClient: ShopifyRestClient) {
  const fields = "id,created_at,total_price,financial_status,cancelled_at";

  const allOrders: ShopifyOrder[] = [];

  // First page via SDK RestClient
  let response = await restClient.get({
    path: "orders",
    query: { status: "any", limit: "250", fields },
  });

  if (response?.body?.orders) {
    allOrders.push(...response.body.orders);
  }

  // Paginate using Link header
  while (response?.headers?.get?.("link") || response?.headers?.link) {
    const linkHeader = typeof response.headers.get === 'function'
      ? response.headers.get("link")
      : response.headers.link;

    if (!linkHeader || !linkHeader.includes('rel="next"')) break;

    const nextPageInfo = linkHeader
      .split(",")
      .find((l: string) => l.includes('rel="next"'))
      ?.match(/<[^>]*page_info=([^&>]+)/)?.[1];

    if (!nextPageInfo) break;

    response = await restClient.get({
      path: "orders",
      query: { status: "any", limit: "250", fields, page_info: nextPageInfo },
    });

    if (response?.body?.orders) {
      allOrders.push(...response.body.orders);
    }
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  let totalRevenue = 0;
  let todayOrders = 0;
  let weekOrders = 0;
  let pendingOrders = 0;

  for (const order of allOrders) {
    const createdAt = new Date(order.created_at);
    const price = parseFloat(order.total_price) || 0;
    const isCancelled = order.cancelled_at !== null;

    if (!isCancelled && order.financial_status !== "refunded") totalRevenue += price;
    if (createdAt >= todayStart) todayOrders++;
    if (createdAt >= weekStart) weekOrders++;
    if (!isCancelled && order.financial_status === "pending") pendingOrders++;
  }

  return {
    totalOrders: allOrders.length,
    totalRevenue,
    todayOrders,
    weekOrders,
    pendingOrders,
    todayRevenue: 0,
    recentOrders: [] as unknown[],
    ordersByStatus: {} as Record<string, number>,
  };
}

/**
 * Loader: Fetch dashboard data from Supabase
 * authenticate.admin() guarantees a fresh session token —
 * the SDK auto-refreshes expired tokens before returning.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  // Get REST client — session always from unauthenticated.admin(shop)
  const restClient = await getRestClient(shopDomain);

  // Query shop currency from Shopify Admin API
  let shopCurrency = 'USD';
  try {
    const currencyRes = await admin.graphql(`{ shop { currencyCode } }`);
    const currencyData = await currencyRes.json();
    shopCurrency = currencyData?.data?.shop?.currencyCode || 'USD';
  } catch (e) { console.log('Error fetching shop currency:', e); }

  // Save/update shop in Supabase on each visit
  try {
    if (session.accessToken) {
      await saveShop(shopDomain, session.accessToken, session.scope || "");
    }
  } catch (error) {
    console.log("Error saving shop to Supabase:", error);
  }

  // Get current settings
  const settings = await getFormSettings(shopDomain);

  // Get order statistics from Shopify Orders API via SDK
  let stats = {
    totalOrders: 0,
    pendingOrders: 0,
    totalRevenue: 0,
    todayRevenue: 0,
    recentOrders: [] as unknown[],
    todayOrders: 0,
    weekOrders: 0,
    ordersByStatus: {} as Record<string, number>,
  };

  try {
    const shopifyStats = await fetchShopifyOrderStats(restClient);
    stats = { ...stats, ...shopifyStats };
  } catch (error) {
    console.log("Error fetching Shopify order stats:", error);
  }

  return {
    shop: shopDomain,
    themeEditorUrl: getCodThemeEditorUrl(shopDomain),
    enabled: settings?.enabled || false,
    settings,
    stats,
    shopCurrency,
  };
};

/**
 * Dashboard Component - Premium Design
 */
export default function Index() {
  const { themeEditorUrl, enabled, stats, shopCurrency } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: shopCurrency || "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Calculate setup progress
  const setupSteps = [
    { done: true, label: "App installed" },
    { done: enabled, label: "COD form enabled" },
    { done: stats.totalOrders > 0, label: "First order received" },
  ];
  const completedSteps = setupSteps.filter(s => s.done).length;
  const setupProgress = Math.round((completedSteps / setupSteps.length) * 100);

  return (
    <>
      {/* Custom Styles for Premium Dashboard */}
      <style>{`
        /* Prevent horizontal scrolling globally */
        html, body {
          overflow-x: hidden !important;
          max-width: 100vw !important;
        }
        
        .fox-dashboard {
          padding: 0;
          box-sizing: border-box;
          overflow-x: hidden;
        }
        
        /* Welcome Banner - Premium Orange Theme */
        @import url('https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&family=Playfair+Display:wght@700&display=swap');
        
        .welcome-banner {
          background: linear-gradient(135deg, #ef4444 0%, #f97316 100%);
          border-radius: 20px;
          padding: 24px 32px;
          color: white;
          margin-bottom: 24px;
          position: relative;
          overflow: hidden;
          box-shadow: 0 15px 30px rgba(239, 68, 68, 0.15);
          will-change: transform;
          transform: translateZ(0);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .welcome-banner::before {
          content: '';
          position: absolute;
          top: -100px;
          right: -100px;
          width: 300px;
          height: 300px;
          background: radial-gradient(circle, rgba(255, 255, 255, 0.15) 0%, transparent 70%);
          border-radius: 50%;
        }

        .welcome-banner::after {
          content: '';
          position: absolute;
          bottom: -50px;
          left: 30%;
          width: 200px;
          height: 200px;
          background: radial-gradient(circle, rgba(255, 255, 255, 0.1) 0%, transparent 70%);
          border-radius: 50%;
        }
        
        .welcome-content {
          position: relative;
          z-index: 2;
          max-width: 500px;
        }
        
        .welcome-script {
          font-family: 'Dancing Script', cursive;
          font-size: 24px;
          color: #fcd34d;
          margin: 0 0 -3px 0;
          font-weight: 700;
        }

        .welcome-title-row {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 8px;
        }
        
        .welcome-banner h1 {
          font-family: 'Playfair Display', serif;
          font-size: 38px;
          font-weight: 700;
          margin: 0;
          letter-spacing: -0.5px;
          line-height: 1.1;
        }
        
        .welcome-fox-icon {
          width: 36px;
          height: 36px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .welcome-fox-icon svg {
          width: 20px;
          height: 20px;
        }
        
        .welcome-banner p {
          font-size: 14px;
          opacity: 0.95;
          margin: 0;
          line-height: 1.4;
        }
        
        .welcome-actions {
          display: flex;
          gap: 12px;
          margin-top: 20px;
          position: relative;
          z-index: 2;
        }
        
        .welcome-btn {
          padding: 10px 20px;
          border-radius: 8px;
          font-weight: 600;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s ease;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border: none;
        }
        
        .welcome-btn-primary {
          background: #ffffff;
          color: #ef4444;
          box-shadow: 0 4px 10px rgba(0,0,0,0.08);
        }
        
        .welcome-btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 15px rgba(0,0,0,0.12);
        }
        
        .welcome-btn-secondary {
          background: transparent;
          color: white;
          border: 1px solid rgba(255,255,255,0.4);
        }
        
        .welcome-btn-secondary:hover {
          background: rgba(255,255,255,0.1);
          border-color: white;
        }
        
        .welcome-illustration {
          position: relative;
          z-index: 1;
          height: 150px;
          margin-right: 20px;
        }
        
        .welcome-illustration img {
          height: 100%;
          object-fit: contain;
        }
        
        /* Status Pill */
        .status-pill-container {
          position: absolute;
          top: 24px;
          right: 32px;
          z-index: 10;
        }
        
        .status-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          border-radius: 24px;
          font-size: 13px;
          font-weight: 700;
          background: white;
        }
        
        .status-active {
          color: #22c55e;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }
        
        .status-inactive {
          color: #f87171;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }
        
        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          animation: pulse 2s infinite;
        }
        
        .status-active .status-dot {
          background: #22c55e;
        }
        
        .status-inactive .status-dot {
          background: #f87171;
        }
        
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(0.9); }
        }
        
        @media (max-width: 768px) {
          .welcome-banner {
            flex-direction: column;
            padding: 24px;
            align-items: flex-start;
          }
          .welcome-illustration {
            display: none;
          }
          .status-pill-container {
            position: relative;
            top: auto;
            right: auto;
            margin-bottom: 20px;
          }
        }
        
        /* Stats Grid */
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 20px;
          margin-bottom: 28px;
        }

        @media (max-width: 1100px) {
          .stats-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 900px) {
          .stats-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        
        .stat-card {
          background: white;
          border-radius: 16px;
          padding: 24px;
          border: 1px solid #e5e7eb;
          transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
          position: relative;
          overflow: hidden;
          will-change: transform;
          transform: translateZ(0);
        }
        
        .stat-card:hover {
          border-color: #d1d5db;
          box-shadow: 0 8px 24px rgba(0,0,0,0.08);
          transform: translateY(-2px) translateZ(0);
        }
        
        .stat-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 16px;
        }
        
        .stat-icon {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 22px;
        }
        
        .stat-icon-blue { background: linear-gradient(135deg, #3b82f6, #1d4ed8); }
        .stat-icon-green { background: linear-gradient(135deg, #10b981, #059669); }
        .stat-icon-purple { background: linear-gradient(135deg, #8b5cf6, #7c3aed); }
        .stat-icon-orange { background: linear-gradient(135deg, #f59e0b, #d97706); }
        
        .stat-label {
          font-size: 13px;
          color: #6b7280;
          font-weight: 500;
        }
        
        .stat-value {
          font-size: 32px;
          font-weight: 800;
          color: #111827;
          margin: 0;
          letter-spacing: -1px;
        }
        
        .stat-subtext {
          font-size: 12px;
          color: #9ca3af;
          margin-top: 6px;
        }
        
        /* Quick Actions */
        .section-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
        }
        
        .section-header h2 {
          font-size: 18px;
          font-weight: 700;
          color: #111827;
          margin: 0;
        }
        
        .section-header a {
          font-size: 13px;
          color: #6366f1;
          text-decoration: none;
          font-weight: 600;
        }
        
        .section-header a:hover {
          text-decoration: underline;
        }
        
        .quick-actions-polaris {
          margin-bottom: 28px;
        }
        
        /* Orders Table */
        .orders-card {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 16px;
          overflow: hidden;
          margin-bottom: 24px;
        }
        
        .orders-table {
          width: 100%;
          border-collapse: collapse;
        }
        
        .orders-table th {
          text-align: left;
          padding: 16px 24px;
          font-size: 12px;
          font-weight: 600;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          background: #f9fafb;
          border-bottom: 1px solid #e5e7eb;
        }
        
        .orders-table td {
          padding: 18px 24px;
          font-size: 14px;
          color: #374151;
          border-bottom: 1px solid #f3f4f6;
        }
        
        .orders-table tr:last-child td {
          border-bottom: none;
        }
        
        .orders-table tr:hover td {
          background: #f9fafb;
        }
        
        .order-id {
          font-weight: 600;
          color: #111827;
        }
        
        .customer-name {
          font-weight: 500;
          color: #111827;
        }
        
        .customer-phone {
          font-size: 13px;
          color: #6b7280;
        }
        
        .order-amount {
          font-weight: 700;
          color: #111827;
        }
        
        .order-date {
          font-size: 13px;
          color: #6b7280;
        }
        
        .order-status {
          display: inline-flex;
          padding: 6px 12px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
        }
        
        .empty-state {
          text-align: center;
          padding: 64px 20px;
          color: #6b7280;
        }
        
        .empty-state-icon {
          font-size: 56px;
          margin-bottom: 16px;
        }
        
        .empty-state h3 {
          font-size: 18px;
          font-weight: 600;
          color: #374151;
          margin: 0 0 8px 0;
        }
        
        .empty-state p {
          font-size: 14px;
          margin: 0;
        }
        
        /* Setup Progress */
        .setup-card {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 16px;
          padding: 24px;
          margin-bottom: 28px;
        }
        
        .setup-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
        }
        
        .setup-header h3 {
          font-size: 16px;
          font-weight: 600;
          color: #111827;
          margin: 0;
        }
        
        .setup-progress-text {
          font-size: 14px;
          font-weight: 600;
          color: #6366f1;
        }
        
        .setup-progress-bar {
          height: 8px;
          background: #e5e7eb;
          border-radius: 4px;
          overflow: hidden;
          margin-bottom: 20px;
        }
        
        .setup-progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #6366f1, #8b5cf6);
          border-radius: 4px;
          transition: width 0.5s ease;
        }
        
        .setup-steps {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        
        .setup-step {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 14px;
        }
        
        .setup-step-icon {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          flex-shrink: 0;
        }
        
        .setup-step-done .setup-step-icon {
          background: linear-gradient(135deg, #10b981, #059669);
          color: white;
        }
        
        .setup-step-pending .setup-step-icon {
          background: #e5e7eb;
          color: #9ca3af;
        }
        
        .setup-step-done {
          color: #374151;
        }
        
        .setup-step-pending {
          color: #9ca3af;
        }
        
        /* ==================== RESPONSIVE DESIGN ==================== */
        
        @media (max-width: 768px) {
          .fox-dashboard {
            padding: 0 16px;
          }
          
          .welcome-banner {
            padding: 20px;
            border-radius: 16px;
          }
          
          .welcome-banner > div:first-child {
            flex-direction: column !important;
            gap: 16px;
          }
          
          .welcome-banner h1 {
            font-size: 22px;
          }
          
          .welcome-banner p {
            font-size: 14px;
          }
          
          .welcome-actions {
            flex-direction: column;
            gap: 10px;
          }
          
          .welcome-btn {
            justify-content: center;
            width: 100%;
          }
          
          .stats-grid {
            grid-template-columns: 1fr 1fr !important;
            gap: 12px;
          }
          
          .stat-card {
            padding: 16px;
          }
          
          .stat-icon {
            width: 40px;
            height: 40px;
            font-size: 18px;
          }
          
          .stat-value {
            font-size: 24px;
          }
          
          .quick-actions-polaris {
            margin-bottom: 20px;
          }
          
          .orders-card {
            border-radius: 12px;
          }
          
          .orders-table th,
          .orders-table td {
            padding: 12px 16px;
          }
          
          .section-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 8px;
          }
        }
        
        @media (max-width: 480px) {
          .stats-grid {
            grid-template-columns: 1fr !important;
          }
          
          .welcome-banner h1 {
            font-size: 20px;
          }
          
          .stat-header {
            gap: 8px;
          }
          
          .stat-label {
            font-size: 12px;
          }
          
          .stat-value {
            font-size: 22px;
          }
          
          .orders-table {
            display: block;
            overflow-x: auto;
          }
        }
      `}</style>

      <s-page heading="">
        <div className="fox-dashboard">
          {/* Welcome Banner with Status */}
          <div className="welcome-banner">
            <div className="status-pill-container">
              <span className={`status-pill ${enabled ? 'status-active' : 'status-inactive'}`}>
                <span className="status-dot" />
                {enabled ? 'COD Active' : 'COD Inactive'}
              </span>
            </div>
            
            <div className="welcome-content">
              <div className="welcome-script">Welcome to</div>
              <div className="welcome-title-row">
                <h1>Fox COD</h1>
                <div className="welcome-fox-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 12c0 5.523-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2s10 4.477 10 10z"/>
                    <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
                    <line x1="9" y1="9" x2="9.01" y2="9"/>
                    <line x1="15" y1="9" x2="15.01" y2="9"/>
                  </svg>
                </div>
              </div>
              <p>Manage your Cash on Delivery orders efficiently<br/>and grow your business.</p>
              
              <div className="welcome-actions">
                <Link to="/app/settings" className="welcome-btn welcome-btn-primary">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
                  Form Builder
                </Link>
                <button
                  className="welcome-btn welcome-btn-secondary"
                  onClick={() => window.open(themeEditorUrl, '_blank', 'noopener,noreferrer')}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>
                  Add to Theme
                </button>
              </div>
            </div>
          </div>

          {/* Setup Progress (show only if not complete) */}
          {setupProgress < 100 && (
            <div className="setup-card">
              <div className="setup-header">
                <h3>Quick Setup</h3>
                <span className="setup-progress-text">{setupProgress}% complete</span>
              </div>
              <div className="setup-progress-bar">
                <div className="setup-progress-fill" style={{ width: `${setupProgress}%` }} />
              </div>
              <div className="setup-steps">
                {setupSteps.map((step, index) => (
                  <div key={index} className={`setup-step ${step.done ? 'setup-step-done' : 'setup-step-pending'}`}>
                    <span className="setup-step-icon">
                      {step.done ? '✓' : index + 1}
                    </span>
                    {step.label}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Stats Grid */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-header">
                <div className="stat-icon stat-icon-blue"><svg width="22" height="22" viewBox="0 0 20 20" fill="none"><rect x="3" y="5" width="14" height="12" rx="2" stroke="white" strokeWidth="1.5" fill="none" /><path d="M3 9h14" stroke="white" strokeWidth="1.5" /></svg></div>
                <span className="stat-label">Total Orders</span>
              </div>
              <p className="stat-value">{stats.totalOrders}</p>
              <div className="stat-subtext">All time COD orders</div>
            </div>

            {/* TEMPORARILY HIDDEN - Component preserved for future use */}
            {/* <div className="stat-card">
              <div className="stat-header">
                <div className="stat-icon stat-icon-orange">⏳</div>
                <span className="stat-label">Pending</span>
              </div>
              <p className="stat-value">{stats.pendingOrders}</p>
              <div className="stat-subtext">Awaiting action</div>
            </div> */}

            <div className="stat-card">
              <div className="stat-header">
                <div className="stat-icon stat-icon-green"><svg width="22" height="22" viewBox="0 0 20 20" fill="none"><path d="M10 2a8 8 0 100 16 8 8 0 000-16z" stroke="white" strokeWidth="1.5" fill="none" /><path d="M6 10l3 3 5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg></div>
                <span className="stat-label">Revenue</span>
              </div>
              <p className="stat-value">{formatCurrency(stats.totalRevenue)}</p>
              <div className="stat-subtext">Total COD revenue</div>
            </div>

            <div className="stat-card">
              <div className="stat-header">
                <div className="stat-icon stat-icon-purple"><svg width="22" height="22" viewBox="0 0 20 20" fill="none"><rect x="3" y="3" width="14" height="14" rx="2" stroke="white" strokeWidth="1.5" fill="none" /><path d="M3 8h14M8 3v14" stroke="white" strokeWidth="1.5" /></svg></div>
                <span className="stat-label">Today</span>
              </div>
              <p className="stat-value">{stats.todayOrders}</p>
              <div className="stat-subtext">Orders today</div>
            </div>

            <div className="stat-card">
              <div className="stat-header">
                <div className="stat-icon stat-icon-orange"><svg width="22" height="22" viewBox="0 0 20 20" fill="none"><path d="M3 17V5h2v12H3zm4 0V8h2v9H7zm4 0V3h2v14h-2zm4 0V10h2v7h-2z" fill="white" /></svg></div>
                <span className="stat-label">This Week</span>
              </div>
              <p className="stat-value">{stats.weekOrders || 0}</p>
              <div className="stat-subtext">Orders in last 7 days</div>
            </div>
          </div>

          {/* Quick Actions - Polaris Buttons */}
          <div className="section-header">
            <h2>Quick Actions</h2>
          </div>
          <div className="quick-actions-polaris">
            <InlineStack gap="300" wrap>
              <Button variant="primary" size="large" onClick={() => navigate('/app/settings')}>Form Builder</Button>
              <Button variant="primary" size="large" onClick={() => navigate('/app/quantity-offers')}>Bundle Offers</Button>
              <Button variant="primary" size="large" onClick={() => navigate('/app/upsell-downsell')}>Upsells & Downsells</Button>
              <Button variant="primary" size="large" onClick={() => navigate('/app/partial-payments')}>Partial Payment</Button>
              <Button variant="primary" size="large" onClick={() => navigate('/app/analytics')}>Analytics</Button>
              <Button variant="primary" size="large" onClick={() => navigate('/app/app-settings?tab=pixels')}>Pixel Tracking</Button>
              <Button variant="primary" size="large" onClick={() => navigate('/app/app-settings?tab=fraud')}>Fraud Protection</Button>
              <Button variant="primary" size="large" onClick={() => navigate('/app/integrations')}>Integrations</Button>
            </InlineStack>
          </div>

          {/* TEMPORARILY HIDDEN - Components preserved for future use */}
          {/* Recent Orders */}
          {/* <div className="section-header">
            <h2>Recent Orders</h2>
            <Link to="/app/orders">View all →</Link>
          </div>
          <div className="orders-card">
            {stats.recentOrders && stats.recentOrders.length > 0 ? (
              <table className="orders-table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Customer</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentOrders.slice(0, 5).map((order: any) => {
                    const statusInfo = getStatusInfo(order.status || 'pending');
                    return (
                      <tr key={order.id}>
                        <td>
                          <Link to={`/app/orders/${order.id}`} className="order-id" style={{ color: '#6366f1', textDecoration: 'none' }}>
                            {order.shopify_order_name || `#${order.id.slice(0, 8)}`}
                          </Link>
                        </td>
                        <td>
                          <div className="customer-name">{order.customer_name}</div>
                          <div className="customer-phone">{order.customer_phone}</div>
                        </td>
                        <td>
                          <span className="order-amount">{formatCurrency(order.total_price)}</span>
                        </td>
                        <td>
                          <span
                            className="order-status"
                            style={{
                              background: `${statusInfo.color}20`,
                              color: statusInfo.color
                            }}
                          >
                            {statusInfo.label}
                          </span>
                        </td>
                        <td>
                          <span className="order-date">{formatDate(order.created_at)}</span>
                        </td>
                        <td>
                          <Link to={`/app/orders/${order.id}`} style={{ color: '#6366f1', textDecoration: 'none', fontWeight: 500 }}>
                            View →
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon">📦</div>
                <h3>No orders yet</h3>
                <p>Enable your COD form and start receiving orders!</p>
              </div>
            )}
          </div> */}
        </div>
      </s-page>
    </>
  );
}
