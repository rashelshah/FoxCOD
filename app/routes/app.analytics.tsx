/**
 * Analytics Page - Order insights and statistics
 * Route: /app/analytics
 */

import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, Link } from "react-router";
import { authenticate } from "../shopify.server";
import { getOrderStats } from "../config/supabase.server";
import { ORDER_STATUSES } from "../config/constants";

/**
 * Loader: Fetch analytics data
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { session } = await authenticate.admin(request);
    const shopDomain = session.shop;

    const stats = await getOrderStats(shopDomain);

    return {
        shop: shopDomain,
        stats,
    };
};

/**
 * Analytics Page Component
 */
export default function AnalyticsPage() {
    const { stats } = useLoaderData<typeof loader>();

    // Format currency
    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat("en-IN", {
            style: "currency",
            currency: "INR",
            minimumFractionDigits: 0,
        }).format(amount);
    };

    // Calculate conversion rate (delivered / total)
    const deliveredCount = stats.ordersByStatus?.delivered || 0;
    const conversionRate = stats.totalOrders > 0
        ? ((deliveredCount / stats.totalOrders) * 100).toFixed(1)
        : 0;

    // Calculate average order value
    const avgOrderValue = stats.totalOrders > 0
        ? stats.totalRevenue / stats.totalOrders
        : 0;

    return (
        <>
            <style>{`
                .analytics-page {
                    max-width: 1200px;
                    margin: 0 auto;
                    padding: 24px;
                }

                .page-header {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    margin-bottom: 32px;
                }

                .back-btn {
                    width: 40px;
                    height: 40px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border: 1px solid #e5e7eb;
                    border-radius: 10px;
                    background: white;
                    text-decoration: none;
                    color: #374151;
                }

                .back-btn:hover {
                    background: #f9fafb;
                }

                .page-title h1 {
                    font-size: 24px;
                    font-weight: 700;
                    color: #111827;
                    margin: 0 0 4px 0;
                }

                .page-title p {
                    font-size: 14px;
                    color: #6b7280;
                    margin: 0;
                }

                /* Stats Grid */
                .stats-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
                    gap: 20px;
                    margin-bottom: 32px;
                }

                .stat-card {
                    background: white;
                    border-radius: 16px;
                    padding: 24px;
                    border: 1px solid #e5e7eb;
                }

                .stat-card-header {
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
                    font-size: 24px;
                }

                .stat-icon-blue { background: linear-gradient(135deg, #3b82f6, #1d4ed8); }
                .stat-icon-green { background: linear-gradient(135deg, #10b981, #059669); }
                .stat-icon-purple { background: linear-gradient(135deg, #8b5cf6, #7c3aed); }
                .stat-icon-orange { background: linear-gradient(135deg, #f59e0b, #d97706); }

                .stat-label {
                    font-size: 14px;
                    color: #6b7280;
                    font-weight: 500;
                }

                .stat-value {
                    font-size: 32px;
                    font-weight: 700;
                    color: #111827;
                    margin: 0;
                }

                .stat-subtext {
                    font-size: 13px;
                    color: #9ca3af;
                    margin-top: 4px;
                }

                /* Section */
                .section {
                    margin-bottom: 32px;
                }

                .section-title {
                    font-size: 18px;
                    font-weight: 600;
                    color: #111827;
                    margin: 0 0 16px 0;
                }

                /* Status Breakdown */
                .status-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                    gap: 12px;
                }

                .status-card {
                    background: white;
                    border: 1px solid #e5e7eb;
                    border-radius: 12px;
                    padding: 16px;
                    text-align: center;
                }

                .status-count {
                    font-size: 28px;
                    font-weight: 700;
                    color: #111827;
                }

                .status-label {
                    font-size: 13px;
                    font-weight: 600;
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    margin-top: 4px;
                }

                .status-dot {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                }

                /* Insights */
                .insights-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
                    gap: 20px;
                }

                .insight-card {
                    background: linear-gradient(135deg, #1f2937 0%, #111827 100%);
                    border-radius: 16px;
                    padding: 24px;
                    color: white;
                }

                .insight-card h3 {
                    font-size: 14px;
                    font-weight: 500;
                    opacity: 0.8;
                    margin: 0 0 8px 0;
                }

                .insight-card .value {
                    font-size: 28px;
                    font-weight: 700;
                }

                .insight-card .description {
                    font-size: 13px;
                    opacity: 0.7;
                    margin-top: 8px;
                }

                /* Progress Bar */
                .progress-container {
                    background: white;
                    border: 1px solid #e5e7eb;
                    border-radius: 16px;
                    padding: 24px;
                    margin-bottom: 32px;
                }

                .progress-header {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 12px;
                }

                .progress-header h3 {
                    font-size: 16px;
                    font-weight: 600;
                    margin: 0;
                }

                .progress-header span {
                    font-size: 14px;
                    color: #10b981;
                    font-weight: 600;
                }

                .progress-bar {
                    height: 12px;
                    background: #f3f4f6;
                    border-radius: 6px;
                    overflow: hidden;
                }

                .progress-fill {
                    height: 100%;
                    background: linear-gradient(90deg, #10b981, #059669);
                    border-radius: 6px;
                    transition: width 0.5s ease;
                }

                /* Empty State */
                .empty-state {
                    text-align: center;
                    padding: 64px;
                    background: white;
                    border: 1px solid #e5e7eb;
                    border-radius: 16px;
                }

                .empty-icon {
                    font-size: 48px;
                    margin-bottom: 16px;
                }

                .empty-state h3 {
                    font-size: 18px;
                    font-weight: 600;
                    margin: 0 0 8px 0;
                }

                .empty-state p {
                    color: #6b7280;
                    margin: 0;
                }
            `}</style>

            <s-page heading="">
                <div className="analytics-page">
                    <div className="page-header">
                        <Link to="/app" className="back-btn">←</Link>
                        <div className="page-title">
                            <h1>Analytics</h1>
                            <p>Track your COD order performance</p>
                        </div>
                    </div>

                    {stats.totalOrders > 0 ? (
                        <>
                            {/* Key Stats */}
                            <div className="stats-grid">
                                <div className="stat-card">
                                    <div className="stat-card-header">
                                        <div className="stat-icon stat-icon-blue">📦</div>
                                        <span className="stat-label">Total Orders</span>
                                    </div>
                                    <p className="stat-value">{stats.totalOrders}</p>
                                    <div className="stat-subtext">All time COD orders</div>
                                </div>

                                <div className="stat-card">
                                    <div className="stat-card-header">
                                        <div className="stat-icon stat-icon-green">💰</div>
                                        <span className="stat-label">Total Revenue</span>
                                    </div>
                                    <p className="stat-value">{formatCurrency(stats.totalRevenue)}</p>
                                    <div className="stat-subtext">From active orders</div>
                                </div>

                                <div className="stat-card">
                                    <div className="stat-card-header">
                                        <div className="stat-icon stat-icon-purple">📊</div>
                                        <span className="stat-label">Avg Order Value</span>
                                    </div>
                                    <p className="stat-value">{formatCurrency(avgOrderValue)}</p>
                                    <div className="stat-subtext">Per order</div>
                                </div>

                                <div className="stat-card">
                                    <div className="stat-card-header">
                                        <div className="stat-icon stat-icon-orange">📅</div>
                                        <span className="stat-label">This Week</span>
                                    </div>
                                    <p className="stat-value">{stats.weekOrders}</p>
                                    <div className="stat-subtext">Orders in last 7 days</div>
                                </div>
                            </div>

                            {/* Conversion Rate */}
                            <div className="progress-container">
                                <div className="progress-header">
                                    <h3>Delivery Rate</h3>
                                    <span>{conversionRate}%</span>
                                </div>
                                <div className="progress-bar">
                                    <div
                                        className="progress-fill"
                                        style={{ width: `${conversionRate}%` }}
                                    />
                                </div>
                            </div>

                            {/* Status Breakdown */}
                            <div className="section">
                                <h2 className="section-title">Orders by Status</h2>
                                <div className="status-grid">
                                    {ORDER_STATUSES.map((status) => (
                                        <div className="status-card" key={status.value}>
                                            <div className="status-count">
                                                {stats.ordersByStatus?.[status.value] || 0}
                                            </div>
                                            <div className="status-label">
                                                <span
                                                    className="status-dot"
                                                    style={{ background: status.color }}
                                                />
                                                {status.label}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Visual Chart Section */}
                            <div className="section">
                                <h2 className="section-title">📊 Order Distribution</h2>
                                <div style={{
                                    background: 'white',
                                    border: '1px solid #e5e7eb',
                                    borderRadius: '16px',
                                    padding: '24px'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', height: '200px', paddingBottom: '40px', position: 'relative' }}>
                                        {ORDER_STATUSES.map((status) => {
                                            const count = stats.ordersByStatus?.[status.value] || 0;
                                            const maxCount = Math.max(...ORDER_STATUSES.map(s => stats.ordersByStatus?.[s.value] || 0), 1);
                                            const heightPercent = (count / maxCount) * 100;
                                            return (
                                                <div
                                                    key={status.value}
                                                    style={{
                                                        flex: 1,
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        alignItems: 'center',
                                                        height: '100%',
                                                        justifyContent: 'flex-end'
                                                    }}
                                                >
                                                    <span style={{
                                                        fontSize: '14px',
                                                        fontWeight: 700,
                                                        color: status.color,
                                                        marginBottom: '8px'
                                                    }}>
                                                        {count}
                                                    </span>
                                                    <div style={{
                                                        width: '100%',
                                                        maxWidth: '60px',
                                                        height: `${Math.max(heightPercent, 5)}%`,
                                                        background: `linear-gradient(180deg, ${status.color} 0%, ${status.color}80 100%)`,
                                                        borderRadius: '8px 8px 0 0',
                                                        transition: 'height 0.5s ease',
                                                        boxShadow: `0 4px 12px ${status.color}30`
                                                    }} />
                                                    <span style={{
                                                        position: 'absolute',
                                                        bottom: '0',
                                                        fontSize: '11px',
                                                        color: '#6b7280',
                                                        fontWeight: 500,
                                                        textAlign: 'center',
                                                        width: '70px',
                                                        whiteSpace: 'nowrap',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis'
                                                    }}>
                                                        {status.label}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* Insights */}
                            <div className="section">
                                <h2 className="section-title">Quick Insights</h2>
                                <div className="insights-grid">
                                    <div className="insight-card">
                                        <h3>Today's Orders</h3>
                                        <div className="value">{stats.todayOrders}</div>
                                        <div className="description">
                                            {formatCurrency(stats.todayRevenue)} revenue today
                                        </div>
                                    </div>
                                    <div className="insight-card">
                                        <h3>Pending Orders</h3>
                                        <div className="value">{stats.pendingOrders}</div>
                                        <div className="description">
                                            Awaiting confirmation or shipping
                                        </div>
                                    </div>
                                    <div className="insight-card">
                                        <h3>Returns & Cancellations</h3>
                                        <div className="value">
                                            {(stats.ordersByStatus?.returned || 0) + (stats.ordersByStatus?.cancelled || 0)}
                                        </div>
                                        <div className="description">
                                            Total unsuccessful orders
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="empty-state">
                            <div className="empty-icon">📊</div>
                            <h3>No analytics data yet</h3>
                            <p>Start receiving COD orders to see your analytics here</p>
                        </div>
                    )}
                </div>
            </s-page>
        </>
    );
}
