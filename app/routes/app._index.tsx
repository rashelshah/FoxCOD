/**
 * Dashboard Page - Main admin view for Fox COD app
 * Route: /app
 * Premium modern design
 */

import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, Link } from "react-router";
import { authenticate } from "../shopify.server";
import { getOrderStats, getFormSettings, saveShop } from "../config/supabase.server";
import { ORDER_STATUSES } from "../config/constants";

/**
 * Loader: Fetch dashboard data from Supabase
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

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

  // Get order statistics
  let stats = {
    totalOrders: 0,
    pendingOrders: 0,
    totalRevenue: 0,
    todayRevenue: 0,
    recentOrders: [] as any[],
    todayOrders: 0,
    weekOrders: 0,
    ordersByStatus: {} as Record<string, number>,
  };

  try {
    stats = await getOrderStats(shopDomain);

    // Ensure recent orders is an array
    if (!Array.isArray(stats.recentOrders)) {
      stats.recentOrders = [];
    }
  } catch (error) {
    console.log("Error fetching order stats:", error);
  }

  return {
    shop: shopDomain,
    enabled: settings?.enabled || false,
    settings,
    stats,
  };
};

/**
 * Dashboard Component - Premium Design
 */
export default function Index() {
  const { shop, enabled, stats } = useLoaderData<typeof loader>();

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Format date
  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-IN", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Get status info
  const getStatusInfo = (status: string) => {
    return ORDER_STATUSES.find(s => s.value === status) || { label: 'Pending', color: '#f59e0b' };
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
        .fox-dashboard {
          padding: 0;
        }
        
        /* Smooth transitions for all interactive elements */
        * {
          -webkit-font-smoothing: antialiased;
        }
        
        /* Welcome Banner - Premium Dark Theme */
        .welcome-banner {
          background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%);
          border-radius: 20px;
          padding: 32px 36px;
          color: white;
          margin-bottom: 28px;
          position: relative;
          overflow: hidden;
          box-shadow: 0 20px 40px rgba(0,0,0,0.15);
          will-change: transform;
          transform: translateZ(0);
        }
        
        .welcome-banner::before {
          content: '';
          position: absolute;
          top: -100px;
          right: -100px;
          width: 300px;
          height: 300px;
          background: radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, transparent 70%);
          border-radius: 50%;
        }

        .welcome-banner::after {
          content: '';
          position: absolute;
          bottom: -50px;
          left: 50%;
          width: 200px;
          height: 200px;
          background: radial-gradient(circle, rgba(16, 185, 129, 0.1) 0%, transparent 70%);
          border-radius: 50%;
        }
        
        .welcome-banner h1 {
          font-size: 28px;
          font-weight: 700;
          margin: 0 0 8px 0;
          letter-spacing: -0.5px;
        }
        
        .welcome-banner p {
          font-size: 15px;
          opacity: 0.75;
          margin: 0;
        }
        
        .welcome-actions {
          display: flex;
          gap: 12px;
          margin-top: 24px;
          position: relative;
          z-index: 1;
        }
        
        .welcome-btn {
          padding: 12px 24px;
          border-radius: 10px;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s ease;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          border: none;
        }
        
        .welcome-btn-primary {
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          color: white;
        }
        
        .welcome-btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(99, 102, 241, 0.4);
        }
        
        .welcome-btn-secondary {
          background: rgba(255,255,255,0.1);
          color: white;
          border: 1px solid rgba(255,255,255,0.2);
          backdrop-filter: blur(10px);
        }
        
        .welcome-btn-secondary:hover {
          background: rgba(255,255,255,0.15);
          border-color: rgba(255,255,255,0.3);
        }
        
        /* Status Pill */
        .status-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          border-radius: 24px;
          font-size: 13px;
          font-weight: 600;
          backdrop-filter: blur(10px);
        }
        
        .status-active {
          background: rgba(16, 185, 129, 0.2);
          color: #34d399;
          border: 1px solid rgba(16, 185, 129, 0.3);
        }
        
        .status-inactive {
          background: rgba(239, 68, 68, 0.2);
          color: #f87171;
          border: 1px solid rgba(239, 68, 68, 0.3);
        }
        
        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          animation: pulse 2s infinite;
        }
        
        .status-active .status-dot {
          background: #34d399;
        }
        
        .status-inactive .status-dot {
          background: #f87171;
        }
        
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(0.9); }
        }
        
        /* Stats Grid */
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 20px;
          margin-bottom: 28px;
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
        
        /* Quick Actions - Premium Horizontal Design */
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
        
        .quick-actions {
          display: flex;
          gap: 12px;
          margin-bottom: 28px;
          flex-wrap: wrap;
        }
        
        .action-btn {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 14px 24px;
          border-radius: 50px;
          font-size: 14px;
          font-weight: 600;
          text-decoration: none;
          color: white;
          cursor: pointer;
          border: none;
          transition: all 0.2s ease;
          position: relative;
          overflow: hidden;
          will-change: transform;
        }
        
        .action-btn::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
          transition: left 0.5s ease;
        }
        
        .action-btn:hover::before {
          left: 100%;
        }
        
        .action-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(0,0,0,0.2);
        }
        
        .action-btn:active {
          transform: scale(0.98);
        }
        
        .action-btn-settings {
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          box-shadow: 0 4px 15px rgba(99, 102, 241, 0.4);
        }
        
        .action-btn-orders {
          background: linear-gradient(135deg, #10b981, #059669);
          box-shadow: 0 4px 15px rgba(16, 185, 129, 0.4);
        }
        
        .action-btn-analytics {
          background: linear-gradient(135deg, #3b82f6, #1d4ed8);
          box-shadow: 0 4px 15px rgba(59, 130, 246, 0.4);
        }
        
        .action-btn-icon {
          font-size: 18px;
          display: flex;
          align-items: center;
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
          
          .quick-actions {
            flex-direction: column;
          }
          
          .action-btn {
            justify-content: center;
            width: 100%;
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', zIndex: 1 }}>
              <div>
                <h1>Welcome to Fox COD 🦊</h1>
                <p>Manage your Cash on Delivery orders efficiently</p>
              </div>
              <span className={`status-pill ${enabled ? 'status-active' : 'status-inactive'}`}>
                <span className="status-dot" />
                {enabled ? 'COD Active' : 'COD Inactive'}
              </span>
            </div>
            <div className="welcome-actions">
              <Link to="/app/settings" className="welcome-btn welcome-btn-primary">
                ⚙️ Configure Form
              </Link>
              <button
                className="welcome-btn welcome-btn-secondary"
                onClick={() => window.open(`https://${shop}/admin/themes/current/editor?context=apps`, '_blank')}
              >
                🎨 Add to Theme
              </button>
            </div>
          </div>

          {/* Setup Progress (show only if not complete) */}
          {setupProgress < 100 && (
            <div className="setup-card">
              <div className="setup-header">
                <h3>🚀 Quick Setup</h3>
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
                <div className="stat-icon stat-icon-blue">📦</div>
                <span className="stat-label">Total Orders</span>
              </div>
              <p className="stat-value">{stats.totalOrders}</p>
              <div className="stat-subtext">All time COD orders</div>
            </div>

            <div className="stat-card">
              <div className="stat-header">
                <div className="stat-icon stat-icon-orange">⏳</div>
                <span className="stat-label">Pending</span>
              </div>
              <p className="stat-value">{stats.pendingOrders}</p>
              <div className="stat-subtext">Awaiting action</div>
            </div>

            <div className="stat-card">
              <div className="stat-header">
                <div className="stat-icon stat-icon-green">💰</div>
                <span className="stat-label">Revenue</span>
              </div>
              <p className="stat-value">{formatCurrency(stats.totalRevenue)}</p>
              <div className="stat-subtext">Total COD revenue</div>
            </div>

            <div className="stat-card">
              <div className="stat-header">
                <div className="stat-icon stat-icon-purple">📅</div>
                <span className="stat-label">Today</span>
              </div>
              <p className="stat-value">{stats.todayOrders}</p>
              <div className="stat-subtext">Orders today</div>
            </div>
          </div>

          {/* Quick Actions - Premium Pill Buttons */}
          <div className="section-header">
            <h2>Quick Actions</h2>
          </div>
          <div className="quick-actions">
            <Link to="/app/settings" className="action-btn action-btn-settings">
              <span className="action-btn-icon">⚙️</span>
              Form Builder
            </Link>

            <Link to="/app/orders" className="action-btn action-btn-orders">
              <span className="action-btn-icon">📋</span>
              View All Orders
            </Link>

            <Link to="/app/analytics" className="action-btn action-btn-analytics">
              <span className="action-btn-icon">📊</span>
              Analytics
            </Link>
          </div>

          {/* Recent Orders */}
          <div className="section-header">
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
          </div>
        </div>
      </s-page>
    </>
  );
}
