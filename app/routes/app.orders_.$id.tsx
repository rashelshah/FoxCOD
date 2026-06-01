/**
 * Order Detail Page - View single order with full details
 * Route: /app/orders/:id
 */

import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useSubmit, useNavigation, Link, redirect } from "react-router";
import { authenticate } from "../shopify.server";
import { supabase, updateOrderStatusSimple } from "../config/supabase.server";
import { ORDER_STATUSES, type OrderStatus } from "../config/constants";

/**
 * Loader: Fetch single order
 */
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
    const { admin, session } = await authenticate.admin(request);
    const shopDomain = session.shop;

    // Query shop currency from Shopify Admin API
    let shopCurrency = 'USD';
    try {
        const currencyRes = await admin.graphql(`{ shop { currencyCode } }`);
        const currencyData = await currencyRes.json();
        shopCurrency = currencyData?.data?.shop?.currencyCode || 'USD';
    } catch (e) { console.log('Error fetching shop currency:', e); }
    const orderId = params.id;

    if (!orderId) {
        throw redirect("/app/orders");
    }

    const { data: order, error } = await supabase
        .from('order_logs')
        .select('*')
        .eq('id', orderId)
        .eq('shop_domain', shopDomain)
        .single();

    if (error || !order) {
        console.error("Error fetching order:", error);
        throw redirect("/app/orders");
    }

    return { order, shop: shopDomain, shopCurrency };
};

/**
 * Action: Update order status
 */
export const action = async ({ request, params }: ActionFunctionArgs) => {
    const { session } = await authenticate.admin(request);
    const formData = await request.formData();
    const orderId = params.id;

    const newStatus = formData.get("status") as OrderStatus;

    if (!orderId || !newStatus) {
        return { success: false, error: "Missing data" };
    }

    try {
        await updateOrderStatusSimple(orderId, newStatus);
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
};

/**
 * Order Detail Component
 */
export default function OrderDetailPage() {
    const { order, shopCurrency } = useLoaderData<typeof loader>();
    const submit = useSubmit();
    const navigation = useNavigation();

    const isUpdating = navigation.state === "submitting";

    // Format currency
    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat(undefined, {
            style: "currency",
            currency: order.currency || shopCurrency || "USD",
            minimumFractionDigits: 0,
        }).format(amount);
    };

    // Strip currency symbols/commas from note-parsed price strings before parseFloat
    const parsePrice = (s: string) => parseFloat(s.replace(/[^\d.-]/g, '')) || 0;

    // Format date
    const formatDate = (date: string) => {
        return new Date(date).toLocaleDateString("en-IN", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    // Handle status change
    const handleStatusChange = (newStatus: string) => {
        const formData = new FormData();
        formData.append("status", newStatus);
        submit(formData, { method: "post" });
    };

    // Get status info
    const getStatusInfo = (status: string) => {
        return ORDER_STATUSES.find(s => s.value === status) || { label: 'Pending', color: '#f59e0b' };
    };

    const statusInfo = getStatusInfo(order.status || 'pending');

    return (
        <>
            <style>{`
                /* Prevent horizontal scrolling globally */
                html, body {
                    overflow-x: hidden;
                    max-width: 100vw;
                }
                
                .order-detail-page {
                    max-width: 900px;
                    margin: 0 auto;
                    padding: 24px;
                    box-sizing: border-box;
                    overflow-x: hidden;
                }

                .page-header {
                    display: flex;
                    align-items: flex-start;
                    justify-content: space-between;
                    margin-bottom: 24px;
                    gap: 16px;
                    flex-wrap: wrap;
                }

                .page-header-left {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    flex: 1;
                    min-width: 0;
                }

                .back-btn {
                    width: 40px;
                    height: 40px;
                    min-width: 40px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border: 1px solid #e5e7eb;
                    border-radius: 10px;
                    background: white;
                    text-decoration: none;
                    color: #374151;
                    font-size: 16px;
                    transition: all 0.2s ease;
                }

                .back-btn:hover {
                    background: #f9fafb;
                    border-color: #d1d5db;
                }

                .page-title {
                    min-width: 0;
                    overflow: hidden;
                }

                .page-title h1 {
                    font-size: 22px;
                    font-weight: 700;
                    color: #111827;
                    margin: 0 0 4px 0;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .page-title p {
                    font-size: 13px;
                    color: #6b7280;
                    margin: 0;
                }

                .order-card {
                    background: white;
                    border: 1px solid #e5e7eb;
                    border-radius: 16px;
                    overflow: hidden;
                    margin-bottom: 20px;
                }

                .order-card-header {
                    padding: 20px;
                    border-bottom: 1px solid #f3f4f6;
                    background: #f9fafb;
                }

                .order-card-header h2 {
                    font-size: 15px;
                    font-weight: 600;
                    color: #374151;
                    margin: 0;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .order-card-body {
                    padding: 20px;
                }

                .detail-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 16px;
                }

                .detail-item {
                    padding: 14px;
                    background: #f9fafb;
                    border-radius: 10px;
                    overflow: hidden;
                }

                .detail-item-label {
                    font-size: 11px;
                    font-weight: 600;
                    color: #6b7280;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    margin-bottom: 6px;
                }

                .detail-item-value {
                    font-size: 14px;
                    font-weight: 500;
                    color: #111827;
                    line-height: 1.5;
                    word-break: break-word;
                }

                .status-options {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px;
                }

                .status-option {
                    padding: 10px 16px;
                    border-radius: 10px;
                    font-size: 13px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    border: 2px solid transparent;
                    background: #f3f4f6;
                    color: #6b7280;
                }

                .status-option:hover:not(:disabled) {
                    transform: scale(1.02);
                }

                .status-option.active {
                    color: white;
                }

                .status-option:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                    transform: none;
                }

                .amount-display {
                    font-size: 28px;
                    font-weight: 800;
                    color: #111827;
                }

                .current-status {
                    padding: 10px 18px;
                    border-radius: 10px;
                    font-size: 13px;
                    font-weight: 700;
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    flex-shrink: 0;
                }

                .address-text {
                    white-space: pre-wrap;
                    word-break: break-word;
                }

                .notes-text {
                    white-space: pre-wrap;
                    word-break: break-word;
                    font-style: italic;
                }

                /* ==================== RESPONSIVE DESIGN ==================== */

                @media (max-width: 768px) {
                    .order-detail-page {
                        padding: 16px;
                    }

                    .page-header {
                        flex-direction: column;
                        align-items: stretch;
                    }

                    .page-header-left {
                        width: 100%;
                    }

                    .current-status {
                        align-self: flex-start;
                    }

                    .page-title h1 {
                        font-size: 18px;
                    }

                    .detail-grid {
                        grid-template-columns: 1fr;
                        gap: 12px;
                    }

                    .order-card {
                        border-radius: 12px;
                    }

                    .order-card-header,
                    .order-card-body {
                        padding: 16px;
                    }

                    .status-options {
                        gap: 6px;
                    }

                    .status-option {
                        padding: 8px 14px;
                        font-size: 12px;
                        flex: 1;
                        min-width: calc(50% - 6px);
                        text-align: center;
                        justify-content: center;
                    }

                    .amount-display {
                        font-size: 24px;
                    }
                }

                @media (max-width: 480px) {
                    .order-detail-page {
                        padding: 12px;
                    }

                    .back-btn {
                        width: 36px;
                        height: 36px;
                        min-width: 36px;
                    }

                    .page-title h1 {
                        font-size: 16px;
                    }

                    .order-card-header h2 {
                        font-size: 14px;
                    }

                    .detail-item {
                        padding: 12px;
                    }

                    .status-option {
                        min-width: 100%;
                    }
                }
            `}</style>

            <s-page heading="">
                <div className="order-detail-page">
                    <div className="page-header">
                        <div className="page-header-left">
                            <Link to="/app/orders" className="back-btn">←</Link>
                            <div className="page-title">
                                <h1>Order {order.shopify_order_name || `#${order.id.slice(0, 8)}`}</h1>
                                <p>{formatDate(order.created_at)}</p>
                            </div>
                        </div>
                        <div
                            className="current-status"
                            style={{
                                background: `${statusInfo.color}20`,
                                color: statusInfo.color
                            }}
                        >
                            {statusInfo.label}
                        </div>
                    </div>

                    {/* Customer Information */}
                    <div className="order-card">
                        <div className="order-card-header">
                            <h2>👤 Customer Information</h2>
                        </div>
                        <div className="order-card-body">
                            <div className="detail-grid">
                                <div className="detail-item">
                                    <div className="detail-item-label">Full Name</div>
                                    <div className="detail-item-value">{order.customer_name}</div>
                                </div>
                                <div className="detail-item">
                                    <div className="detail-item-label">Phone Number</div>
                                    <div className="detail-item-value">{order.customer_phone}</div>
                                </div>
                                {/* Show email only if provided */}
                                {order.customer_email && (
                                    <div className="detail-item">
                                        <div className="detail-item-label">Email</div>
                                        <div className="detail-item-value">{order.customer_email}</div>
                                    </div>
                                )}
                            </div>
                            <div className="detail-item" style={{ marginTop: '12px' }}>
                                <div className="detail-item-label">Delivery Address</div>
                                <div className="detail-item-value address-text">{order.customer_address}</div>
                            </div>
                            {/* Show notes only if provided */}
                            {order.customer_notes && (
                                <div className="detail-item" style={{ marginTop: '12px' }}>
                                    <div className="detail-item-label">📝 Order Notes</div>
                                    <div className="detail-item-value notes-text">{order.customer_notes}</div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Order Details */}
                    <div className="order-card">
                        <div className="order-card-header">
                            <h2>📦 Order Details</h2>
                        </div>
                        <div className="order-card-body">
                            <div className="detail-grid">
                                <div className="detail-item">
                                    <div className="detail-item-label">Product</div>
                                    <div className="detail-item-value">{order.product_title || 'Product'}</div>
                                </div>
                                <div className="detail-item">
                                    <div className="detail-item-label">Quantity</div>
                                    <div className="detail-item-value">{order.quantity}</div>
                                </div>
                                {order.city && (
                                    <div className="detail-item">
                                        <div className="detail-item-label">City</div>
                                        <div className="detail-item-value">{order.city}</div>
                                    </div>
                                )}
                                {order.state && (
                                    <div className="detail-item">
                                        <div className="detail-item-label">State</div>
                                        <div className="detail-item-value">{order.state}</div>
                                    </div>
                                )}
                                {order.pincode && (
                                    <div className="detail-item">
                                        <div className="detail-item-label">Pincode</div>
                                        <div className="detail-item-value">{order.pincode}</div>
                                    </div>
                                )}
                            </div>

                            {/* Price Breakdown */}
                            <div style={{ marginTop: '16px', padding: '16px', background: '#f9fafb', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
                                <div style={{ fontSize: '13px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: '12px' }}>Price Breakdown</div>

                                {/* Parse notes for breakdown */}
                                {(() => {
                                    const notes = order.customer_notes || '';
                                    const hasDiscount = notes.includes('BUNDLE DISCOUNT:');
                                    const hasShipping = notes.includes('SHIPPING:');
                                    const discountMatch = notes.match(/BUNDLE DISCOUNT:\s*([\d.]+)% off/);
                                    const shippingMatch = notes.match(/SHIPPING:\s*(.+?)\s*\(([^)]+)\)/);
                                    const downsellMatch = notes.match(/DOWNSELL APPLIED:\s*(.+?)\s*\(([^)]+)\)/);
                                    const upsellLines = notes.split('\n').filter((l: string) => l.trim().startsWith('-'));

                                    // Parse bundle variant lines
                                    const bundleVariantLines = notes.includes('BUNDLE VARIANTS:')
                                        ? notes.split('\n').filter((l: string) => l.trim().startsWith('- Item'))
                                        : [];

                                    return (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            {/* Bundle variant line items */}
                                            {bundleVariantLines.map((line: string, idx: number) => {
                                                const m = line.match(/-\s*Item\s*(\d+):\s*(.+?)\s*\(([^)]+)\)/);
                                                if (!m) return null;
                                                return (
                                                    <div key={'bv-' + idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#374151' }}>
                                                        <span>Item {m[1]}: {m[2]}</span>
                                                        <span>{m[3]}</span>
                                                    </div>
                                                );
                                            })}

                                            {downsellMatch ? (
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#374151' }}>
                                                    <span>Downsell: {downsellMatch[1]}</span>
                                                    <span>{formatCurrency(parsePrice(downsellMatch[2]))} × {order.quantity}</span>
                                                </div>
                                            ) : null}

                                            {hasDiscount && discountMatch ? (
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#059669' }}>
                                                    <span>Bundle Discount</span>
                                                    <span>-{discountMatch[1]}%</span>
                                                </div>
                                            ) : null}

                                            {upsellLines.length > 0 && upsellLines.map((line: string, idx: number) => {
                                                const m = line.match(/-\s*(.+?)\s*\(([^)]+)\)\s*x(\d+)\s*\[(.+?)\]/);
                                                if (!m) return null;
                                                return (
                                                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#059669' }}>
                                                        <span>+ {m[1]} ({m[4] === 'click_upsell' ? '1-Click' : m[4] === 'downsell' ? 'Downsell' : 'Tick'})</span>
                                                        <span>{formatCurrency(parsePrice(m[2]))} × {m[3]}</span>
                                                    </div>
                                                );
                                            })}

                                            {hasShipping && shippingMatch ? (
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#374151' }}>
                                                    <span>Shipping: {shippingMatch[1]}</span>
                                                    <span>{formatCurrency(parsePrice(shippingMatch[2]))}</span>
                                                </div>
                                            ) : null}

                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: 800, color: '#111827', borderTop: '1px dashed #d1d5db', paddingTop: '8px', marginTop: '4px' }}>
                                                <span>Total (COD)</span>
                                                <span>{formatCurrency(order.total_price)}</span>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>

                    {/* Bundle Variants */}
                    {order.customer_notes && order.customer_notes.includes('BUNDLE VARIANTS:') && (
                        <div className="order-card">
                            <div className="order-card-header">
                                <h2>🎨 Bundle Variant Selections</h2>
                            </div>
                            <div className="order-card-body">
                                {order.customer_notes
                                    .split('\n')
                                    .filter((line: string) => {
                                        // Only include lines after "BUNDLE VARIANTS:" and before next section
                                        const idx = order.customer_notes.indexOf('BUNDLE VARIANTS:');
                                        const lineIdx = order.customer_notes.indexOf(line);
                                        if (lineIdx <= idx) return false;
                                        // Stop at next section marker (UPSELL, SHIPPING, BUNDLE DISCOUNT, DOWNSELL)
                                        const nextSection = order.customer_notes.substring(idx + 17).search(/\n(?:UPSELL|SHIPPING|BUNDLE DISCOUNT|DOWNSELL)/);
                                        if (nextSection !== -1 && lineIdx > idx + 17 + nextSection) return false;
                                        return line.trim().startsWith('- Item');
                                    })
                                    .map((line: string, idx: number) => {
                                        const match = line.match(/-\s*Item\s*(\d+):\s*(.+?)\s*\(([^)]+)\)/);
                                        if (!match) return null;
                                        const [, itemNum, variantTitle, price] = match;
                                        return (
                                            <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: '10px', background: '#f0f9ff', marginBottom: '8px', border: '1px solid #bae6fd' }}>
                                                <div>
                                                    <div style={{ fontWeight: 600, fontSize: '14px', color: '#111827' }}>Item {itemNum}</div>
                                                    <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '2px' }}>{variantTitle}</div>
                                                </div>
                                                <div style={{ fontWeight: 700, fontSize: '14px', color: '#0369a1' }}>{price}</div>
                                            </div>
                                        );
                                    })}
                            </div>
                        </div>
                    )}

                    {/* Upsell & Downsell Items */}
                    {order.customer_notes && (order.customer_notes.includes('UPSELL ITEMS') || order.customer_notes.includes('DOWNSELL APPLIED')) && (
                        <div className="order-card">
                            <div className="order-card-header">
                                <h2>🎯 Upsell & Downsell Items</h2>
                            </div>
                            <div className="order-card-body">
                                {/* Downsell items */}
                                {order.customer_notes.includes('DOWNSELL APPLIED') && (() => {
                                    const dsMatch = order.customer_notes.match(/DOWNSELL APPLIED:\s*(.+?)\s*\(([^)]+)\)/);
                                    if (!dsMatch) return null;
                                    return (
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: '10px', background: '#fffbeb', marginBottom: '8px', border: '1px solid #fde68a' }}>
                                            <div>
                                                <div style={{ fontWeight: 600, fontSize: '14px', color: '#111827' }}>{dsMatch[1]}</div>
                                                <span style={{ display: 'inline-block', marginTop: '4px', padding: '2px 8px', borderRadius: '6px', background: '#fef3c7', color: '#92400e', fontSize: '11px', fontWeight: 600 }}>Downsell</span>
                                            </div>
                                            <div style={{ fontWeight: 700, fontSize: '16px', color: '#b45309' }}>{dsMatch[2]}</div>
                                        </div>
                                    );
                                })()}

                                {/* Upsell items */}
                                {order.customer_notes.includes('UPSELL ITEMS') && order.customer_notes.split('\n').filter((line: string) => line.trim().startsWith('-')).map((line: string, idx: number) => {
                                    const match = line.match(/-\s*(.+?)\s*\(([^)]+)\)\s*x(\d+)\s*\[(.+?)\]/);
                                    if (!match) return null;
                                    const [, title, price, qty, type] = match;
                                    return (
                                        <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: '10px', background: '#f0fdf4', marginBottom: '8px', border: '1px solid #d1fae5' }}>
                                            <div>
                                                <div style={{ fontWeight: 600, fontSize: '14px', color: '#111827' }}>{title}</div>
                                                <span style={{ display: 'inline-block', marginTop: '4px', padding: '2px 8px', borderRadius: '6px', background: type === 'click_upsell' ? '#dbeafe' : type === 'downsell' ? '#fef3c7' : '#e0e7ff', color: type === 'click_upsell' ? '#1d4ed8' : type === 'downsell' ? '#92400e' : '#4338ca', fontSize: '11px', fontWeight: 600 }}>{type === 'click_upsell' ? '1-Click Upsell' : type === 'downsell' ? 'Downsell' : 'Tick Upsell'}</span>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ fontWeight: 700, fontSize: '16px', color: '#059669' }}>{formatCurrency(parseFloat(price))}</div>
                                                <div style={{ fontSize: '12px', color: '#6b7280' }}>x{qty}</div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Update Status */}
                    <div className="order-card">
                        <div className="order-card-header">
                            <h2>🔄 Update Status</h2>
                        </div>
                        <div className="order-card-body">
                            <div className="status-options">
                                {ORDER_STATUSES.map((status) => (
                                    <button
                                        key={status.value}
                                        className={`status-option ${order.status === status.value ? 'active' : ''}`}
                                        style={order.status === status.value ? {
                                            background: status.color,
                                            borderColor: status.color
                                        } : {}}
                                        onClick={() => handleStatusChange(status.value)}
                                        disabled={isUpdating || order.status === status.value}
                                    >
                                        {status.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </s-page>
        </>
    );
}
