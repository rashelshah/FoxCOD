/**
 * Shopify Background Sync Service
 *
 * Takes only an orderId — fetches all required data from the DB itself.
 * This makes it safe to call from any context (initial request, retry endpoint, cron).
 *
 * SINGLE SOURCE OF TRUTH: offline session from shopify_sessions table.
 * NO fallback tokens, NO shops.access_token for API calls, NO 401 retry.
 */

import {
    getOrderById,
    getShop,
    markSyncSyncing,
    markSynced,
    markSyncFailed,
    supabase,
} from '../config/supabase.server';
import { createPendingOrder } from './shopify-graphql-orders.server';
import { resolveCountryForOrder } from './contextual-pricing.server';

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function toNumericVariantId(vid: string | null | undefined): number | null {
    if (!vid) return null;
    const s = String(vid);
    if (s.startsWith('gid://')) {
        const num = Number(s.split('/').pop());
        return isNaN(num) || num === 0 ? null : num;
    }
    // Handle values like "ProductVariant/1234567890" or any string ending with digits
    const tailDigits = s.match(/(\d+)\D*$/);
    if (tailDigits) {
        const num = Number(tailDigits[1]);
        if (!isNaN(num) && num !== 0) return num;
    }
    const num = Number(s);
    return isNaN(num) || num === 0 ? null : num;
}

export function formatPhoneE164(phone: string): string {
    const digits = phone.replace(/[^\d]/g, '');
    if (!digits) return '';
    if (phone.startsWith('+')) return phone;
    if (digits.length === 10) return `+91${digits}`;
    return `+${digits}`;
}

export function buildCatalogOrCustomLineItem(input: {
    variantId?: number | null;
    title?: string;
    quantity?: number;
    price?: string;
}) {
    const quantity = input.quantity || 1;
    if (input.variantId) {
        const lineItem: Record<string, any> = {
            variant_id: input.variantId,
            quantity,
            requires_shipping: true,
        };
        if (input.price != null) {
            lineItem.price = input.price;
        }
        return lineItem;
    }

    return {
        title: input.title || 'Product',
        quantity,
        price: input.price || '0.00',
        requires_shipping: true,
    };
}

export function sanitizeVariantPricedLineItems(lineItems: Array<Record<string, any>>) {
    return lineItems.map((item) => {
        if (!item.variant_id) return item;
        return {
            variant_id: item.variant_id,
            quantity: item.quantity,
            requires_shipping: item.requires_shipping === true,
        };
    });
}

// ─── Main Export ──────────────────────────────────────────────────────────────

interface ShopifySyncResult {
    success: boolean;
    shopifyOrderId?: string;
    shopifyOrderName?: string;
    error?: string;
}

/**
 * Create a Shopify order in the background for the given order log ID.
 * Safe to call fire-and-forget; all errors are caught and written to the DB.
 */
export async function createShopifyOrderBackground(orderId: string): Promise<ShopifySyncResult> {
    const id = String(orderId);
    console.log('[SYNC] Starting background sync for order', id);

    // ── 1. Load order from DB ──
    const order = await getOrderById(id);
    if (!order) {
        console.error('[SYNC] Order not found:', id);
        return { success: false, error: 'Order not found' };
    }

    // ── 2. Duplicate guard ──
    if (order.shopify_order_id) {
        console.log('[SYNC] Already synced, skipping:', id);
        return {
            success: true,
            shopifyOrderId: String(order.shopify_order_id),
            shopifyOrderName: order.shopify_order_name || undefined,
        };
    }
    if (order.sync_status === 'syncing') {
        console.log('[SYNC] Already in progress, skipping:', id);
        return { success: false, error: 'Order sync already in progress' };
    }

    // ── 3. Mark syncing ──
    await markSyncSyncing(id);
    console.log('STEP 2: syncing set for order', id);

    const currentAttempt: number = order.sync_attempts || 0;

    try {
        console.log('[SYNC] Creating Shopify order for', id, '(attempt', currentAttempt + 1, ')');

        // ── 5. Reconstruct payload from stored order_payload ──
        const body = order.order_payload || {};

        // Re-derive customer fields from stored columns (source of truth)
        const customerName: string = order.customer_name || 'Customer';
        const nameParts = customerName.trim().split(/\s+/);
        const firstName = nameParts[0] || 'Customer';
        const lastName = nameParts.slice(1).join(' ') || '';
        const formattedPhone = formatPhoneE164(order.customer_phone || '');
        const customerAddress: string = order.customer_address || body?.customerAddress || body?.address || '';
        
        const orderCountry = await resolveCountryForOrder({
            customerCountry: body?.customerCountry,
            detectedCountry: body?.detectedCountry,
            shop: order.shop_domain,
        });
        
        const customerCity: string = order.city || body?.customerCity || body?.city || '';
        const customerState: string = order.state || body?.customerState || body?.state || '';
        const customerZip: string = order.pincode || body?.customerZipcode || body?.zipcode || body?.zip || '';

        const totalPrice: number = parseFloat(String(order.total_price || 0));
        const shippingPrice: number = parseFloat(String(order.shipping_price || 0));
        const discountPercent: number = body?.discountPercent || 0;
        const currencyCode: string = order.currency || 'USD';
        const mainVariantId = toNumericVariantId(order.variant_id || body?.variantId);

        // ── 6. Build line items ──
        const lineItems: Array<Record<string, any>> = [];
        const discountMultiplier = 1 - (discountPercent / 100);

        // Check for cart items (cart page / cart drawer flow)
        const cartItemsBody: Array<any> =
            Array.isArray(body?.cart_items) && body.cart_items.length > 0
                ? body.cart_items
                : null;

        // Check for bundle variants (user selected different variants per bundle item)
        const bundleVariants: Array<{variantId?: string; variant_id?: string; id?: string; title?: string; price?: number; quantity?: number}> =
            Array.isArray(body?.bundleVariants) && body.bundleVariants.length > 1
                ? body.bundleVariants
                : null;

        if (cartItemsBody) {
            // Cart order: one line item per cart item
            console.log('[SYNC] Cart order detected:', cartItemsBody.length, 'items');
            for (const item of cartItemsBody) {
                const rawVariantId = item?.variantId ?? item?.variant_id ?? item?.id ?? null;
                const itemVariantId = toNumericVariantId(rawVariantId) || mainVariantId;
                const originalPrice = parseFloat(String(item.price || 0));
                const discountedPrice = (originalPrice * discountMultiplier).toFixed(2);
                lineItems.push(buildCatalogOrCustomLineItem({
                    variantId: itemVariantId,
                    title: item.title || 'Cart Item',
                    quantity: item.quantity || 1,
                    price: discountedPrice,
                }));
            }
        } else if (bundleVariants) {
            // Bundle order: create one line item per variant with its own discounted price
            console.log('[SYNC] Bundle order detected:', bundleVariants.length, 'variants');
            for (const bv of bundleVariants) {
                // Product-page bundle offers can sometimes send variant IDs in alternate keys/formats.
                const rawBundleVariantId = bv?.variantId ?? bv?.variant_id ?? bv?.id ?? null;
                const bvVariantId = toNumericVariantId(rawBundleVariantId) || mainVariantId;
                const originalPrice = parseFloat(String(bv.price || 0));
                const discountedPrice = (originalPrice * discountMultiplier).toFixed(2);
                const bvQty = bv.quantity || 1;
                
                lineItems.push(buildCatalogOrCustomLineItem({
                    variantId: bvVariantId,
                    title: bv.title || 'Bundle Item',
                    quantity: bvQty,
                    price: discountedPrice,
                }));
            }
        } else {
            // Standard order: single line item with discounted price
            const originalPrice = parseFloat(String(body?.price || order.total_price || 0));
            const discountedPrice = (originalPrice * discountMultiplier).toFixed(2);
            
            lineItems.push(buildCatalogOrCustomLineItem({
                variantId: mainVariantId,
                title: order.product_title || body?.productTitle || 'Product',
                quantity: order.quantity,
                price: discountedPrice,
            }));
        }

        if (Array.isArray(body?.upsell_items)) {
            body.upsell_items.forEach((item: any) => {
                try {
                    const upsellVariantId = toNumericVariantId(item.variant_id);
                    const upsellPrice = parseFloat(String(item.price || 0)).toFixed(2);
                    const upsellQty = item.quantity || 1;
                    lineItems.push(buildCatalogOrCustomLineItem({
                        variantId: upsellVariantId,
                        title: item.title || 'Upsell Item',
                        quantity: upsellQty,
                        price: upsellPrice,
                    }));
                } catch (e: any) {
                    console.error('[Sync] Upsell item error:', e?.message);
                }
            });
        }

        console.log(
            '[SYNC] Prepared line items:',
            lineItems.map((li) => ({ variant_id: li.variant_id || null, title: li.title || null, requires_shipping: li.requires_shipping === true }))
        );

        const codFee = Number(body?.pureCodFeeAmount) || Number(body?.codFeeAmount) || 0;
        if (codFee > 0) {
            lineItems.push({
                title: body?.codFeeName || 'COD Fee',
                price: codFee.toFixed(2),
                quantity: 1,
                requires_shipping: false,
                taxable: false,
            });
        }

        // ── 7. CALL SHOPIFY GRAPHQL API via centralized service ──
        const shippingLabel: string = order.shipping_label || (shippingPrice > 0 ? 'Shipping' : 'Free Shipping');
        const orderNotes: string = order.customer_notes || '';

        const paramsForGraphql = {
            shop: order.shop_domain,
            currency: currencyCode,
            lineItems: lineItems.map((li: any) => ({
                variantId: li.variant_id,
                title: li.title,
                quantity: li.quantity,
                price: li.price
            })),
            customer: {
                firstName: firstName,
                lastName: lastName,
                email: order.customer_email || undefined,
                phone: formattedPhone || undefined,
            },
            shippingAddress: (order.customer_name || customerAddress) ? {
                firstName: firstName,
                lastName: lastName,
                address1: customerAddress,
                city: customerCity,
                province: customerState,
                zip: customerZip,
                country: orderCountry,
                phone: formattedPhone || '',
            } : undefined,
            tags: ['FoxlyCOD', 'COD'],
            note: orderNotes || `Order placed via FoxlyCOD COD Form`,
            shippingLine: { title: shippingLabel, price: shippingPrice.toFixed(2) }
        };

        /*
        ========================================================
        LEGACY DIRECT COD ORDER FLOW
        Temporarily disabled for Shopify App Review compliance.
        
        const graphqlResult = await createPendingOrder(paramsForGraphql);
        console.log('[SYNC] Shopify response received for order', id);

        if (!graphqlResult.success) {
            throw new Error(graphqlResult.error || 'Shopify order creation failed');
        }

        const shopifyOrderId = graphqlResult.orderId!;
        const shopifyOrderName = graphqlResult.orderName || '';
        ========================================================
        */
        
        const shopifyOrderId = "DISABLED";
        const shopifyOrderName = "DISABLED";
        throw new Error('Direct order creation is disabled for App Review compliance.');

        console.log('[SYNC] Shopify success:', shopifyOrderName, '— writing to DB...');

        const { data: updateData, error: updateError } = await supabase
            .from('order_logs')
            .update({
                shopify_order_id: shopifyOrderId,
                shopify_order_name: shopifyOrderName,
                sync_status: 'synced',
                last_synced_at: new Date().toISOString(),
                sync_error: null,
            })
            .eq('id', id)
            .select();

        if (updateError) {
            console.error('❌ SUPABASE UPDATE FAILED for order', id, ':', updateError);
            // Fail-safe: revert to failed_sync so retry can pick it up
            await supabase
                .from('order_logs')
                .update({
                    sync_status: 'failed_sync',
                    sync_error: `DB update failed: ${updateError.message}`,
                })
                .eq('id', id);
            return {
                success: true,
                shopifyOrderId,
                shopifyOrderName,
            };
        } else {
            console.log('✅ SUPABASE UPDATE SUCCESS:', updateData);
            console.log('STEP 4: DB updated — order', id, 'marked as synced:', shopifyOrderName);
            return {
                success: true,
                shopifyOrderId,
                shopifyOrderName,
            };
        }

    } catch (err: any) {
        console.error('❌ Sync failed for order', id, ':', err.message);
        await markSyncFailed(id, err.message || 'Unknown error', currentAttempt);
        return {
            success: false,
            error: err.message || 'Unknown error',
        };
    }
}
