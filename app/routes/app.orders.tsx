/**
 * All Orders Page - Premium order management with responsive design
 * Route: /app/orders
 */

import { useState, useCallback, useEffect } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useNavigation, useFetcher, Link, useNavigate } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { Page, Select, Button, ButtonGroup, Pagination, Badge, InlineStack, Text } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { getOrders, updateOrderStatusSimple } from "../config/supabase.server";
import { ORDER_STATUSES, type OrderStatus } from "../config/constants";

/**
 * Loader: Fetch all orders
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { admin, session } = await authenticate.admin(request);
    const shopDomain = session.shop;

    // Query shop currency from Shopify Admin API
    let shopCurrency = 'USD';
    try {
        const currencyRes = await admin.graphql(`{ shop { currencyCode } }`);
        const currencyData = await currencyRes.json();
        shopCurrency = currencyData?.data?.shop?.currencyCode || 'USD';
    } catch (e) { console.log('Error fetching shop currency:', e); }

    const url = new URL(request.url);
    const statusFilter = url.searchParams.get("status") as OrderStatus | null;
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = 20;
    const offset = (page - 1) * limit;

    const { orders, totalCount } = await getOrders(shopDomain, {
        status: statusFilter || undefined,
        limit,
        offset,
    });

    // Calculate stats
    const pendingCount = orders.filter((o: any) => o.status === 'pending').length;
    const confirmedCount = orders.filter((o: any) => o.status === 'confirmed').length;

    return {
        shop: shopDomain,
        orders,
        totalCount,
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        statusFilter,
        pendingCount,
        confirmedCount,
        shopCurrency,
    };
};

/**
 * Action: Update order status
 */
export const action = async ({ request }: ActionFunctionArgs) => {
    await authenticate.admin(request);
    const formData = await request.formData();

    const orderId = formData.get("orderId") as string;
    const newStatus = formData.get("status") as OrderStatus;

    console.log(`[Order Action] Updating Order ${orderId} to status: ${newStatus}`);

    if (!orderId || !newStatus) {
        console.error("[Order Action] Failed: Missing orderId or status");
        return { success: false, error: "Missing order ID or status" };
    }

    try {
        const result = await updateOrderStatusSimple(orderId, newStatus);
        console.log(`[Order Action] Success:`, result);
        return { success: true, orderId, newStatus };
    } catch (error: any) {
        console.error(`[Order Action] Exception:`, error);
        return { success: false, error: error.message };
    }
};

/**
 * Orders Page Component - Premium Design
 */
export default function OrdersPage() {
    const { orders, totalCount, currentPage, totalPages, statusFilter, pendingCount, confirmedCount, shopCurrency } = useLoaderData<typeof loader>();
    const navigation = useNavigation();
    const fetcher = useFetcher();
    const shopify = useAppBridge();

    const isPageLoading = navigation.state === "loading";
    const isUpdating = fetcher.state === "submitting" || fetcher.state === "loading";

    // Optimistic status updates
    const [pendingUpdates, setPendingUpdates] = useState<Record<string, string>>({});

    // Handle fetcher response
    useEffect(() => {
        if (fetcher.state === "idle" && fetcher.data) {
            if (fetcher.data.success) {
                shopify.toast.show("Status updated successfully!");
                if (fetcher.data.orderId) {
                    setPendingUpdates(prev => {
                        const next = { ...prev };
                        delete next[fetcher.data.orderId];
                        return next;
                    });
                }
            } else if (fetcher.data.error) {
                shopify.toast.show(`Error: ${fetcher.data.error}`);
            }
        }
    }, [fetcher.state, fetcher.data, shopify]);

    // Format currency
    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat(undefined, {
            style: "currency",
            currency: shopCurrency || "USD",
            minimumFractionDigits: 0,
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

    const handleStatusChange = useCallback((orderId: string, newStatus: string) => {
        setPendingUpdates(prev => ({ ...prev, [orderId]: newStatus }));
        fetcher.submit(
            { orderId, status: newStatus },
            { method: "post" }
        );
    }, [fetcher]);

    const navigate = useNavigate();

    // Build Select options for status dropdown
    const statusSelectOptions = ORDER_STATUSES.map(s => ({ label: s.label, value: s.value }));

    // Get display status
    const getDisplayStatus = (order: any) => {
        return pendingUpdates[order.id] || order.status || 'pending';
    };

    // Get status info
    const getStatusInfo = (status: string) => {
        return ORDER_STATUSES.find(s => s.value === status) || { label: 'Pending', color: '#f59e0b' };
    };

    return (
        <>
            <style>{`
                /* ==================== PREMIUM ORDERS PAGE ==================== */
                
                /* Prevent horizontal scrolling globally */
                html, body {
                    overflow-x: hidden !important;
                    max-width: 100vw !important;
                }
                
                .orders-page {
                    max-width: 1200px;
                    margin: 0 auto;
                    padding: 0;
                    box-sizing: border-box;
                    overflow-x: hidden;
                }

                /* Standard Page Header */
                .page-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-top: 16px;
                    margin-bottom: 24px;
                }

                .page-header-left {
                    display: flex;
                    align-items: center;
                    gap: 16px;
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
                    transition: all 0.2s ease;
                }

                .back-btn:hover {
                    background: #f9fafb;
                }

                .page-title {
                    display: flex;
                    flex-direction: column;
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

                /* Stats Cards */
                .stats-grid {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 16px;
                    margin-bottom: 24px;
                }

                .stat-card {
                    background: white;
                    border-radius: 16px;
                    padding: 20px 24px;
                    border: 1px solid #e5e7eb;
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    transition: all 0.2s ease;
                }

                .stat-card:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 8px 20px rgba(0,0,0,0.08);
                }

                .stat-icon {
                    width: 52px;
                    height: 52px;
                    border-radius: 14px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 24px;
                }

                .stat-icon-blue { background: linear-gradient(135deg, #3b82f6, #1d4ed8); }
                .stat-icon-orange { background: linear-gradient(135deg, #f59e0b, #d97706); }
                .stat-icon-green { background: linear-gradient(135deg, #10b981, #059669); }
                .stat-icon-purple { background: linear-gradient(135deg, #8b5cf6, #7c3aed); }

                .stat-content h3 {
                    font-size: 28px;
                    font-weight: 800;
                    color: #111827;
                    margin: 0;
                    letter-spacing: -1px;
                }

                .stat-content p {
                    font-size: 13px;
                    color: #6b7280;
                    margin: 2px 0 0 0;
                }

                /* Filter Pills */
                .filters-section {
                    margin-bottom: 20px;
                }

                .filters-label {
                    font-size: 13px;
                    color: #6b7280;
                    margin-bottom: 10px;
                    font-weight: 500;
                }

                .filters {
                    display: flex;
                    gap: 10px;
                    flex-wrap: wrap;
                }

                .filter-pill {
                    padding: 10px 20px;
                    border-radius: 50px;
                    font-size: 13px;
                    font-weight: 600;
                    border: 2px solid #e5e7eb;
                    background: white;
                    color: #6b7280;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    text-decoration: none;
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                }

                .filter-pill:hover {
                    border-color: #d1d5db;
                    color: #374151;
                    transform: translateY(-1px);
                }

                .filter-pill.active {
                    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
                    color: white;
                    border-color: transparent;
                    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
                }

                .filter-count {
                    background: rgba(255,255,255,0.2);
                    padding: 2px 8px;
                    border-radius: 12px;
                    font-size: 11px;
                }

                .filter-pill:not(.active) .filter-count {
                    background: #f3f4f6;
                }

                /* Order Cards Container */
                .orders-container {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }

                /* Order Card */
                .order-card {
                    background: white;
                    border: 1px solid #e5e7eb;
                    border-radius: 16px;
                    padding: 20px 24px;
                    transition: all 0.2s ease;
                    display: grid;
                    grid-template-columns: 100px 1.2fr 1fr 100px 140px 120px 80px;
                    align-items: center;
                    gap: 16px;
                }

                .order-card:hover {
                    border-color: #d1d5db;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.05);
                }

                .order-id-cell a {
                    font-weight: 700;
                    font-size: 15px;
                    color: #6366f1;
                    text-decoration: none;
                    transition: color 0.2s ease;
                }

                .order-id-cell a:hover {
                    color: #4f46e5;
                }

                .customer-cell {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }

                .customer-name {
                    font-weight: 600;
                    color: #111827;
                    font-size: 14px;
                }

                .customer-phone {
                    font-size: 13px;
                    color: #6b7280;
                }

                .customer-address {
                    font-size: 12px;
                    color: #9ca3af;
                    max-width: 200px;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .product-cell {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }

                .product-title {
                    font-weight: 500;
                    color: #374151;
                    font-size: 14px;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    max-width: 180px;
                }

                .product-qty {
                    font-size: 12px;
                    color: #9ca3af;
                }

                .amount-cell {
                    font-weight: 700;
                    font-size: 16px;
                    color: #111827;
                }

                .status-cell select {
                    padding: 10px 14px;
                    border-radius: 10px;
                    font-size: 13px;
                    font-weight: 600;
                    border: 2px solid;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    background: white;
                    width: 100%;
                }

                .status-cell select:hover {
                    transform: scale(1.02);
                }

                .date-cell {
                    font-size: 13px;
                    color: #6b7280;
                }

                .action-cell a {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    padding: 10px 16px;
                    border-radius: 10px;
                    font-size: 13px;
                    font-weight: 600;
                    background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
                    color: #374151;
                    text-decoration: none;
                    transition: all 0.2s ease;
                }

                .action-cell a:hover {
                    background: linear-gradient(135deg, #e5e7eb 0%, #d1d5db 100%);
                    transform: translateY(-1px);
                }

                /* Empty State */
                .empty-state {
                    text-align: center;
                    padding: 80px 20px;
                    background: white;
                    border-radius: 20px;
                    border: 2px dashed #e5e7eb;
                }

                .empty-icon {
                    font-size: 64px;
                    margin-bottom: 20px;
                }

                .empty-state h3 {
                    font-size: 20px;
                    font-weight: 700;
                    color: #374151;
                    margin: 0 0 8px 0;
                }

                .empty-state p {
                    font-size: 15px;
                    color: #6b7280;
                    margin: 0;
                }

                /* Pagination */
                .pagination {
                    display: flex;
                    justify-content: center;
                    gap: 8px;
                    padding: 24px 0;
                }

                .page-btn {
                    padding: 10px 18px;
                    border-radius: 10px;
                    font-size: 14px;
                    font-weight: 600;
                    border: 1px solid #e5e7eb;
                    background: white;
                    color: #374151;
                    cursor: pointer;
                    text-decoration: none;
                    transition: all 0.2s ease;
                }

                .page-btn:hover:not(.active) {
                    border-color: #d1d5db;
                    background: #f9fafb;
                }

                .page-btn.active {
                    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
                    color: white;
                    border-color: transparent;
                }

                /* ==================== RESPONSIVE DESIGN ==================== */

                @media (max-width: 1100px) {
                    .order-card {
                        grid-template-columns: 90px 1fr 1fr 90px 120px 100px 70px;
                        padding: 16px 20px;
                        gap: 12px;
                    }
                }

                @media (max-width: 900px) {
                    .stats-grid {
                        grid-template-columns: repeat(2, 1fr);
                    }

                    .order-card {
                        display: flex;
                        flex-direction: column;
                        align-items: stretch;
                        gap: 16px;
                        padding: 20px;
                    }

                    .order-card-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    }

                    .order-card-body {
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: 16px;
                    }

                    .order-card-footer {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding-top: 16px;
                        border-top: 1px solid #f3f4f6;
                    }
                }

                @media (max-width: 768px) {
                    .orders-page {
                        padding: 0 16px;
                    }

                    .stats-grid {
                        grid-template-columns: 1fr 1fr;
                        gap: 12px;
                    }

                    .stat-card {
                        padding: 16px;
                    }

                    .stat-icon {
                        width: 44px;
                        height: 44px;
                        font-size: 20px;
                    }

                    .stat-content h3 {
                        font-size: 22px;
                    }

                    .filters {
                        overflow-x: auto;
                        padding-bottom: 8px;
                        flex-wrap: nowrap;
                        -webkit-overflow-scrolling: touch;
                    }

                    .filter-pill {
                        white-space: nowrap;
                        flex-shrink: 0;
                    }

                    /* Mobile Order Card */
                    .order-card {
                        display: block;
                        padding: 16px;
                    }

                    .order-card-row {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 12px;
                    }

                    .order-card-row:last-child {
                        margin-bottom: 0;
                    }

                    .mobile-label {
                        font-size: 11px;
                        color: #9ca3af;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                        margin-bottom: 4px;
                    }

                    .customer-address {
                        max-width: 100%;
                    }

                    .product-title {
                        max-width: 100%;
                    }
                }

                @media (max-width: 480px) {
                    .stats-grid {
                        grid-template-columns: 1fr;
                    }

                    .pagination {
                        flex-wrap: wrap;
                    }
                }
            `}</style>

            <Page
                title="All Orders"
                subtitle="Manage and track your COD orders"
                backAction={{ content: 'Dashboard', onAction: () => navigate('/app') }}
            >

                {/* Stats Grid */}
                <div className="stats-grid">
                    <div className="stat-card">
                        <div className="stat-icon stat-icon-blue"><svg width="22" height="22" viewBox="0 0 20 20" fill="none"><rect x="3" y="5" width="14" height="12" rx="2" stroke="white" strokeWidth="1.5" fill="none" /><path d="M3 9h14" stroke="white" strokeWidth="1.5" /></svg></div>
                        <div className="stat-content">
                            <h3>{totalCount}</h3>
                            <p>Total Orders</p>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon stat-icon-orange"><svg width="22" height="22" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7" stroke="white" strokeWidth="1.5" fill="none" /><path d="M10 6v4l3 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg></div>
                        <div className="stat-content">
                            <h3>{pendingCount}</h3>
                            <p>Pending</p>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon stat-icon-green"><svg width="22" height="22" viewBox="0 0 20 20" fill="none"><path d="M6 10l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg></div>
                        <div className="stat-content">
                            <h3>{confirmedCount}</h3>
                            <p>Confirmed</p>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon stat-icon-purple"><svg width="22" height="22" viewBox="0 0 20 20" fill="none"><path d="M3 17V5h2v12H3zm4 0V8h2v9H7zm4 0V3h2v14h-2zm4 0V10h2v7h-2z" fill="white" /></svg></div>
                        <div className="stat-content">
                            <h3>{currentPage}/{totalPages || 1}</h3>
                            <p>Current Page</p>
                        </div>
                    </div>
                </div>

                {/* Filter Pills */}
                <div style={{ marginBottom: '20px' }}>
                    <InlineStack gap="200" wrap>
                        <Button
                            variant={!statusFilter ? 'primary' : undefined}
                            onClick={() => navigate('/app/orders')}
                        >
                            All Orders ({totalCount})
                        </Button>
                        {ORDER_STATUSES.map((status) => (
                            <Button
                                key={status.value}
                                variant={statusFilter === status.value ? 'primary' : undefined}
                                onClick={() => navigate(`/app/orders?status=${status.value}`)}
                            >
                                {status.label}
                            </Button>
                        ))}
                    </InlineStack>
                </div>

                {/* Orders List */}
                {orders.length > 0 ? (
                    <>
                        <div className="orders-container">
                            {/* Desktop: Grid layout inside each card */}
                            {orders.map((order: any) => {
                                const displayStatus = getDisplayStatus(order);
                                const statusInfo = getStatusInfo(displayStatus);
                                return (
                                    <div key={order.id} className="order-card">
                                        <div className="order-id-cell">
                                            <Link to={`/app/orders/${order.id}`}>
                                                {order.shopify_order_name || `#${order.id.slice(0, 8)}`}
                                            </Link>
                                        </div>
                                        <div className="customer-cell">
                                            <span className="customer-name">{order.customer_name}</span>
                                            <span className="customer-phone">{order.customer_phone}</span>
                                        </div>
                                        <div className="product-cell">
                                            <span className="product-title">{order.product_title || 'Product'}</span>
                                            <span className="product-qty">Qty: {order.quantity}</span>
                                            {order.customer_notes && order.customer_notes.includes('UPSELL ITEMS') && (() => {
                                                const lines = order.customer_notes.split('\n').filter((l: string) => l.trim().startsWith('-'));
                                                return lines.length > 0 ? (
                                                    <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                                        {lines.map((line: string, idx: number) => {
                                                            const m = line.match(/-\s*(.+?)\s*\(([^)]+)\)/);
                                                            return m ? (
                                                                <span key={idx} style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', background: '#ecfdf5', color: '#059669', fontWeight: 600, display: 'inline-block', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                    + {m[1]} ({m[2]})
                                                                </span>
                                                            ) : null;
                                                        })}
                                                    </div>
                                                ) : null;
                                            })()}
                                        </div>
                                        <div className="amount-cell">
                                            {formatCurrency(order.total_price)}
                                        </div>
                                        <div className="status-cell">
                                            <Select
                                                label=""
                                                labelHidden
                                                options={statusSelectOptions}
                                                value={displayStatus}
                                                onChange={(val) => handleStatusChange(order.id, val)}
                                                disabled={isUpdating && !!pendingUpdates[order.id]}
                                            />
                                        </div>
                                        <div className="date-cell">
                                            {formatDate(order.created_at)}
                                        </div>
                                        <div className="action-cell">
                                            <Button onClick={() => navigate(`/app/orders/${order.id}`)}>View</Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
                                <Pagination
                                    hasPrevious={currentPage > 1}
                                    onPrevious={() => navigate(`/app/orders?page=${currentPage - 1}${statusFilter ? `&status=${statusFilter}` : ''}`)}
                                    hasNext={currentPage < totalPages}
                                    onNext={() => navigate(`/app/orders?page=${currentPage + 1}${statusFilter ? `&status=${statusFilter}` : ''}`)}
                                    label={`Page ${currentPage} of ${totalPages}`}
                                />
                            </div>
                        )}
                    </>
                ) : (
                    <div className="empty-state">
                        <div className="empty-icon"><svg width="48" height="48" viewBox="0 0 20 20" fill="none"><rect x="3" y="5" width="14" height="12" rx="2" stroke="#d1d5db" strokeWidth="1.5" fill="none" /><path d="M3 9h14" stroke="#d1d5db" strokeWidth="1.5" /></svg></div>
                        <h3>No orders found</h3>
                        <p>
                            {statusFilter
                                ? `No ${statusFilter} orders yet`
                                : 'Orders will appear here once customers start placing COD orders'}
                        </p>
                    </div>
                )}
            </Page>
        </>
    );
}
