/**
 * Retry Failed Orders Endpoint
 * Route: POST /api/retry-failed-orders
 * 
 * - POST /api/retry-failed-orders → retry all retryable orders for the shop
 * - POST /api/retry-failed-orders?orderId=123 → retry single order
 * 
 * Uses atomic locking so concurrent calls are safe.
 */

import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
    getShop,
    getRetryableOrders,
    acquireSyncLock,
    markSynced,
    markSyncFailed,
} from "../config/supabase.server";
import { createShopifyOrderBackground } from "./api.create-order";

// ─── Helper: reconstruct customer + pricing from stored order_payload ───
function reconstructSyncOpts(order: any, shop: any) {
    const body = order.order_payload;
    if (!body) {
        throw new Error('No order_payload stored — cannot retry');
    }

    // Reconstruct normalised customer fields
    const customer = {
        name: order.customer_name || body.name || body.customerName || '',
        firstName: body.firstName || (order.customer_name || '').split(' ')[0] || 'Customer',
        lastName: body.lastName || (order.customer_name || '').split(' ').slice(1).join(' ') || '',
        phone: order.customer_phone || body.phone || '',
        email: order.customer_email || body.email || '',
        address: order.customer_address || body.address || '',
        city: order.city || body.city || '',
        state: order.state || body.state || '',
        zipcode: order.pincode || body.zipcode || body.pincode || '',
    };

    const upsellTotal = (body.upsell_items || []).reduce(
        (sum: number, item: any) => sum + (parseFloat(item.price) || 0) * (parseInt(item.quantity) || 1),
        0
    );
    const shippingPrice = body.shippingPrice || order.shipping_price || 0;
    const discountPercent = body.discountPercent || 0;

    let totalPrice: number;
    if (body.finalTotal && body.finalTotal > 0) {
        totalPrice = body.finalTotal;
    } else {
        const subtotal = (parseFloat(body.price) || 0) * (parseInt(body.quantity) || 1);
        const discount = subtotal * (discountPercent / 100);
        totalPrice = subtotal - discount + shippingPrice + upsellTotal;
    }

    // Build notes
    const currencyCode = body.currency || order.currency || 'USD';
    const orderName = order.shopify_order_name || `COD-${String(order.id).slice(-8).toUpperCase()}`;

    let orderNotes = body.notes || order.customer_notes || '';
    if (body.upsell_items && body.upsell_items.length > 0) {
        const upsellNotes = 'UPSELL ITEMS:\n' + body.upsell_items.map((item: any) =>
            `  - ${item.title} (${item.price}) x${item.quantity} [${item.type}]`
        ).join('\n');
        orderNotes = orderNotes ? orderNotes + '\n' + upsellNotes : upsellNotes;
    }

    return {
        shop: order.shop_domain,
        accessToken: shop.access_token,
        body,
        customer,
        totalPrice,
        shippingPrice,
        discountPercent,
        orderNotes,
        orderName,
        orderLog: order,
        currencyCode,
    };
}

export const action = async ({ request }: ActionFunctionArgs) => {
    const { session } = await authenticate.admin(request);
    const shopDomain = session.shop;

    const url = new URL(request.url);
    const singleOrderId = url.searchParams.get('orderId');

    // Get shop for access token
    const shop = await getShop(shopDomain);
    if (!shop || !shop.access_token) {
        return Response.json({ success: false, error: 'Shop not found or no access token' }, { status: 404 });
    }

    let retried = 0;
    let skipped = 0;
    let failed = 0;

    if (singleOrderId) {
        // Retry single order
        try {
            const orders = await getRetryableOrders(shopDomain);
            const order = orders.find((o: any) => String(o.id) === singleOrderId);
            if (!order) {
                return Response.json({ success: false, error: 'Order not retryable (already synced, max attempts, or not ready)' }, { status: 400 });
            }
            const opts = reconstructSyncOpts(order, shop);
            await createShopifyOrderBackground(opts);
            retried = 1;
        } catch (err: any) {
            console.error('[Retry] Single order failed:', err?.message);
            failed = 1;
        }
    } else {
        // Retry all retryable orders
        const orders = await getRetryableOrders(shopDomain);
        for (const order of orders) {
            try {
                const opts = reconstructSyncOpts(order, shop);
                await createShopifyOrderBackground(opts);
                retried++;
            } catch (err: any) {
                console.error('[Retry] Order', order.id, 'failed:', err?.message);
                failed++;
            }
        }
        skipped = orders.length - retried - failed;
    }

    return Response.json({
        success: true,
        retried,
        skipped,
        failed,
        message: `Retried ${retried} order(s)${failed > 0 ? `, ${failed} failed` : ''}`,
    });
};
