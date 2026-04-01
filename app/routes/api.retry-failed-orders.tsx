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
} from "../config/supabase.server";
import { createShopifyOrderBackground } from "../services/shopify-sync.server";

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
            await createShopifyOrderBackground(String(order.id));
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
                await createShopifyOrderBackground(String(order.id));
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
