/**
 * All Orders Page - Full order management with status updates
 * Route: /app/orders
 */

import { useState, useCallback, useEffect } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useSubmit, useNavigation, useRevalidator, Link } from "react-router";
import { authenticate } from "../shopify.server";
import { getOrders, updateOrderStatusSimple } from "../config/supabase.server";
import { ORDER_STATUSES, type OrderStatus } from "../config/constants";

/**
 * Loader: Fetch all orders
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { session } = await authenticate.admin(request);
    const shopDomain = session.shop;

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

    return {
        shop: shopDomain,
        orders,
        totalCount,
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        statusFilter,
    };
};

/**
 * Action: Update order status
 */
export const action = async ({ request }: ActionFunctionArgs) => {
    const { session } = await authenticate.admin(request);
    const formData = await request.formData();

    const orderId = formData.get("orderId") as string;
    const newStatus = formData.get("status") as OrderStatus;

    if (!orderId || !newStatus) {
        return { success: false, error: "Missing order ID or status" };
    }

    try {
        await updateOrderStatusSimple(orderId, newStatus);
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
};

/**
 * Orders Page Component
 */
export default function OrdersPage() {
    const { orders, totalCount, currentPage, totalPages, statusFilter } = useLoaderData<typeof loader>();
    const submit = useSubmit();
    const navigation = useNavigation();
    const revalidator = useRevalidator();

    const isUpdating = navigation.state === "submitting";

    // Revalidate after status update completes
    useEffect(() => {
        if (navigation.state === "idle" && revalidator.state === "idle") {
            // Check if we just finished submitting
            const wasSubmitting = navigation.formMethod === "post";
            if (wasSubmitting) {
                revalidator.revalidate();
            }
        }
    }, [navigation.state]);

    // Format currency
    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat("en-IN", {
            style: "currency",
            currency: "INR",
            minimumFractionDigits: 0,
        }).format(amount);
    };

    // Format date
    const formatDate = (date: string) => {
        return new Date(date).toLocaleDateString("en-IN", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    // Handle status change
    const handleStatusChange = useCallback((orderId: string, newStatus: string) => {
        const formData = new FormData();
        formData.append("orderId", orderId);
        formData.append("status", newStatus);
        submit(formData, { method: "post" });
    }, [submit]);

    // Get status color
    const getStatusColor = (status: string) => {
        return ORDER_STATUSES.find(s => s.value === status)?.color || '#6b7280';
    };

    return (
        <>
            <style>{`
                .orders-page {
                    max-width: 1200px;
                    margin: 0 auto;
                    padding: 24px;
                }

                .page-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
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
                    border-color: #d1d5db;
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

                .filters {
                    display: flex;
                    gap: 12px;
                    margin-bottom: 20px;
                }

                .filter-btn {
                    padding: 8px 16px;
                    border-radius: 8px;
                    font-size: 13px;
                    font-weight: 500;
                    border: 1px solid #e5e7eb;
                    background: white;
                    color: #374151;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    text-decoration: none;
                }

                .filter-btn:hover {
                    border-color: #d1d5db;
                }

                .filter-btn.active {
                    background: #1f2937;
                    color: white;
                    border-color: #1f2937;
                }

                .orders-card {
                    background: white;
                    border: 1px solid #e5e7eb;
                    border-radius: 16px;
                    overflow: hidden;
                }

                .orders-table {
                    width: 100%;
                    border-collapse: collapse;
                }

                .orders-table th {
                    text-align: left;
                    padding: 16px 20px;
                    font-size: 12px;
                    font-weight: 600;
                    color: #6b7280;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    background: #f9fafb;
                    border-bottom: 1px solid #e5e7eb;
                }

                .orders-table td {
                    padding: 16px 20px;
                    font-size: 14px;
                    color: #374151;
                    border-bottom: 1px solid #f3f4f6;
                    vertical-align: middle;
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

                .customer-info {
                    line-height: 1.5;
                }

                .customer-name {
                    font-weight: 500;
                    color: #111827;
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

                .order-amount {
                    font-weight: 600;
                    color: #111827;
                }

                .status-select {
                    padding: 8px 12px;
                    border-radius: 8px;
                    font-size: 13px;
                    font-weight: 600;
                    border: 2px solid;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    background: white;
                }

                .status-select:hover {
                    transform: scale(1.02);
                }

                .status-select:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }

                .order-date {
                    font-size: 13px;
                    color: #6b7280;
                }

                .order-id-link {
                    font-weight: 600;
                    color: #6366f1;
                    text-decoration: none;
                    transition: color 0.2s ease;
                }

                .order-id-link:hover {
                    color: #4f46e5;
                    text-decoration: underline;
                }

                .view-btn {
                    padding: 8px 14px;
                    border-radius: 8px;
                    font-size: 13px;
                    font-weight: 600;
                    background: #f3f4f6;
                    color: #374151;
                    text-decoration: none;
                    transition: all 0.2s ease;
                    display: inline-block;
                }

                .view-btn:hover {
                    background: #e5e7eb;
                    color: #111827;
                }

                .empty-state {
                    text-align: center;
                    padding: 64px 20px;
                    color: #6b7280;
                }

                .empty-icon {
                    font-size: 48px;
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

                .pagination {
                    display: flex;
                    justify-content: center;
                    gap: 8px;
                    padding: 20px;
                }

                .page-btn {
                    padding: 8px 16px;
                    border-radius: 8px;
                    font-size: 13px;
                    font-weight: 500;
                    border: 1px solid #e5e7eb;
                    background: white;
                    color: #374151;
                    cursor: pointer;
                    text-decoration: none;
                    transition: all 0.2s ease;
                }

                .page-btn:hover:not(:disabled) {
                    border-color: #d1d5db;
                    background: #f9fafb;
                }

                .page-btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }

                .page-btn.active {
                    background: #1f2937;
                    color: white;
                    border-color: #1f2937;
                }

                .stats-row {
                    display: flex;
                    gap: 16px;
                    margin-bottom: 24px;
                }

                .stat-badge {
                    padding: 12px 20px;
                    background: white;
                    border: 1px solid #e5e7eb;
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }

                .stat-badge-icon {
                    font-size: 24px;
                }

                .stat-badge-content h4 {
                    font-size: 20px;
                    font-weight: 700;
                    margin: 0;
                    color: #111827;
                }

                .stat-badge-content p {
                    font-size: 12px;
                    color: #6b7280;
                    margin: 0;
                }
            `}</style>

            <s-page heading="">
                <div className="orders-page">
                    <div className="page-header">
                        <div className="page-header-left">
                            <Link to="/app" className="back-btn">←</Link>
                            <div className="page-title">
                                <h1>All Orders</h1>
                                <p>{totalCount} total COD orders</p>
                            </div>
                        </div>
                    </div>

                    {/* Stats Row */}
                    <div className="stats-row">
                        <div className="stat-badge">
                            <span className="stat-badge-icon">📦</span>
                            <div className="stat-badge-content">
                                <h4>{totalCount}</h4>
                                <p>Total Orders</p>
                            </div>
                        </div>
                    </div>

                    {/* Status Filters */}
                    <div className="filters">
                        <Link
                            to="/app/orders"
                            className={`filter-btn ${!statusFilter ? 'active' : ''}`}
                        >
                            All
                        </Link>
                        {ORDER_STATUSES.map((status) => (
                            <Link
                                key={status.value}
                                to={`/app/orders?status=${status.value}`}
                                className={`filter-btn ${statusFilter === status.value ? 'active' : ''}`}
                            >
                                {status.label}
                            </Link>
                        ))}
                    </div>

                    {/* Orders Table */}
                    <div className="orders-card">
                        {orders.length > 0 ? (
                            <>
                                <table className="orders-table">
                                    <thead>
                                        <tr>
                                            <th>Order</th>
                                            <th>Customer</th>
                                            <th>Product</th>
                                            <th>Amount</th>
                                            <th>Status</th>
                                            <th>Date</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {orders.map((order: any) => (
                                            <tr key={order.id}>
                                                <td>
                                                    <Link to={`/app/orders/${order.id}`} className="order-id-link">
                                                        {order.shopify_order_name || `#${order.id.slice(0, 8)}`}
                                                    </Link>
                                                </td>
                                                <td>
                                                    <div className="customer-info">
                                                        <div className="customer-name">{order.customer_name}</div>
                                                        <div className="customer-phone">{order.customer_phone}</div>
                                                    </div>
                                                </td>
                                                <td>
                                                    <div>{order.product_title || 'Product'}</div>
                                                    <div style={{ fontSize: '12px', color: '#6b7280' }}>
                                                        Qty: {order.quantity}
                                                    </div>
                                                </td>
                                                <td>
                                                    <span className="order-amount">{formatCurrency(order.total_price)}</span>
                                                </td>
                                                <td>
                                                    <select
                                                        className="status-select"
                                                        value={order.status || 'pending'}
                                                        onChange={(e) => handleStatusChange(order.id, e.target.value)}
                                                        disabled={isUpdating}
                                                        style={{
                                                            borderColor: getStatusColor(order.status || 'pending'),
                                                            color: getStatusColor(order.status || 'pending'),
                                                        }}
                                                    >
                                                        {ORDER_STATUSES.map((status) => (
                                                            <option key={status.value} value={status.value}>
                                                                {status.label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </td>
                                                <td>
                                                    <span className="order-date">{formatDate(order.created_at)}</span>
                                                </td>
                                                <td>
                                                    <Link to={`/app/orders/${order.id}`} className="view-btn">
                                                        View →
                                                    </Link>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>

                                {/* Pagination */}
                                {totalPages > 1 && (
                                    <div className="pagination">
                                        {currentPage > 1 && (
                                            <Link
                                                to={`/app/orders?page=${currentPage - 1}${statusFilter ? `&status=${statusFilter}` : ''}`}
                                                className="page-btn"
                                            >
                                                ← Previous
                                            </Link>
                                        )}
                                        <span className="page-btn active">
                                            Page {currentPage} of {totalPages}
                                        </span>
                                        {currentPage < totalPages && (
                                            <Link
                                                to={`/app/orders?page=${currentPage + 1}${statusFilter ? `&status=${statusFilter}` : ''}`}
                                                className="page-btn"
                                            >
                                                Next →
                                            </Link>
                                        )}
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="empty-state">
                                <div className="empty-icon">📦</div>
                                <h3>No orders found</h3>
                                <p>
                                    {statusFilter
                                        ? `No ${statusFilter} orders yet`
                                        : 'Orders will appear here once customers start placing COD orders'}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </s-page>
        </>
    );
}
