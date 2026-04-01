/**
 * Shopify Background Sync Service
 *
 * Takes only an orderId — fetches all required data from the DB itself.
 * This makes it safe to call from any context (initial request, retry endpoint, cron).
 */

import {
    getOrderById,
    getShop,
    markSyncSyncing,
    markSynced,
    markSyncFailed,
    supabase,
} from '../config/supabase.server';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toNumericVariantId(vid: string | null | undefined): number | null {
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

function formatPhoneE164(phone: string): string {
    const digits = phone.replace(/[^\d]/g, '');
    if (!digits) return '';
    if (phone.startsWith('+')) return phone;
    if (digits.length === 10) return `+91${digits}`;
    return `+${digits}`;
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
        // ── 4. Load shop (for access token) ──
        const shop = await getShop(order.shop_domain);
        if (!shop || !shop.access_token) {
            throw new Error(`Shop not found or missing access token: ${order.shop_domain}`);
        }

        // ── 5. Reconstruct payload from stored order_payload ──
        const body = order.order_payload || {};

        // Re-derive customer fields from stored columns (source of truth)
        const customerName: string = order.customer_name || 'Customer';
        const nameParts = customerName.trim().split(/\s+/);
        const firstName = nameParts[0] || 'Customer';
        const lastName = nameParts.slice(1).join(' ') || '';
        const formattedPhone = formatPhoneE164(order.customer_phone || '');
        const orderCountry: string = body?.customerCountry || 'IN';
        const customerAddress: string = order.customer_address || body?.customerAddress || body?.address || '';
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

        // Check for bundle variants (user selected different variants per bundle item)
        const bundleVariants: Array<{variantId?: string; variant_id?: string; id?: string; title?: string; price?: number; quantity?: number}> =
            Array.isArray(body?.bundleVariants) && body.bundleVariants.length > 1
                ? body.bundleVariants
                : null;

        if (bundleVariants) {
            // Bundle order: create one line item per variant with its own discounted price
            console.log('[SYNC] Bundle order detected:', bundleVariants.length, 'variants');
            for (const bv of bundleVariants) {
                // Product-page bundle offers can sometimes send variant IDs in alternate keys/formats.
                const rawBundleVariantId = bv?.variantId ?? bv?.variant_id ?? bv?.id ?? null;
                const bvVariantId = toNumericVariantId(rawBundleVariantId) || mainVariantId;
                const originalPrice = parseFloat(String(bv.price || 0));
                const discountedPrice = (originalPrice * discountMultiplier).toFixed(2);
                const bvQty = bv.quantity || 1;
                
                if (bvVariantId) {
                    lineItems.push({
                        variant_id: bvVariantId,
                        quantity: bvQty,
                        price: discountedPrice,
                        requires_shipping: true,
                    });
                } else {
                    // Last-resort fallback only when no variant can be recovered.
                    lineItems.push({
                        title: bv.title || 'Bundle Item',
                        quantity: bvQty,
                        price: discountedPrice,
                        requires_shipping: true,
                    });
                }
            }
        } else {
            // Standard order: single line item with discounted price
            const originalPrice = parseFloat(String(body?.price || order.total_price || 0));
            const discountedPrice = (originalPrice * discountMultiplier).toFixed(2);
            
            lineItems.push({
                variant_id: mainVariantId!,
                quantity: order.quantity,
                price: discountedPrice,
                requires_shipping: true,
            });
        }

        if (Array.isArray(body?.upsell_items)) {
            body.upsell_items.forEach((item: any) => {
                try {
                    const upsellVariantId = toNumericVariantId(item.variant_id);
                    const upsellPrice = parseFloat(String(item.price || 0)).toFixed(2);
                    const upsellQty = item.quantity || 1;
                    if (upsellVariantId) {
                        lineItems.push({
                            variant_id: upsellVariantId,
                            quantity: upsellQty,
                            price: upsellPrice,
                            requires_shipping: true,
                        });
                    } else {
                        lineItems.push({
                            title: item.title || 'Upsell Item',
                            quantity: upsellQty,
                            price: upsellPrice,
                            requires_shipping: true,
                        });
                    }
                } catch (e: any) {
                    console.error('[Sync] Upsell item error:', e?.message);
                }
            });
        }

        console.log(
            '[SYNC] Prepared line items:',
            lineItems.map((li) => ({ variant_id: li.variant_id || null, title: li.title || null, requires_shipping: li.requires_shipping === true }))
        );

        // ── 7. Build Shopify payload ──
        const shippingLabel: string = order.shipping_label || (shippingPrice > 0 ? 'Shipping' : 'Free Shipping');
        const orderNotes: string = order.customer_notes || '';

        const shopifyPayload: Record<string, any> = {
            order: {
                line_items: lineItems,
                customer: {
                    first_name: firstName,
                    last_name: lastName,
                    email: order.customer_email || undefined,
                },
                phone: formattedPhone || undefined,
                financial_status: 'pending',
                fulfillment_status: null,
                tags: 'FoxCOD, COD',
                note: orderNotes || `Order placed via FoxCOD COD Form`,
                inventory_behaviour: 'decrement_obeying_policy',
                source_name: 'FoxCOD',
                transactions: [{
                    kind: 'authorization',
                    status: 'success',
                    gateway: 'Cash on Delivery',
                    amount: totalPrice.toFixed(2),
                }],
                shipping_lines: [{
                    title: shippingLabel,
                    price: shippingPrice.toFixed(2),
                    code: 'COD_SHIPPING',
                }],
            },
        };

        // Removed discount_codes block because discounts are now directly applied to line item unit prices.

        if (order.customer_name || customerAddress) {
            shopifyPayload.order.shipping_address = {
                first_name: firstName,
                last_name: lastName,
                address1: customerAddress,
                city: customerCity,
                province: customerState,
                zip: customerZip,
                country: orderCountry,
                phone: formattedPhone || '',
            };
            shopifyPayload.order.billing_address = {
                first_name: firstName,
                last_name: lastName,
                address1: customerAddress,
                city: customerCity,
                province: customerState,
                zip: customerZip,
                country: orderCountry,
                phone: formattedPhone || '',
            };
        }

        // ── 8. Call Shopify API ──
        const shopifyApiUrl = `https://${order.shop_domain}/admin/api/2024-04/orders.json`;
        console.log('STEP 3: Shopify called for order', id, '(attempt', currentAttempt + 1, ')');

        const shopifyRes = await fetch(shopifyApiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': shop.access_token,
                'Idempotency-Key': `foxcod-${id}`,
            },
            body: JSON.stringify(shopifyPayload),
        });

        const shopifyData = await shopifyRes.json();
        console.log('[SYNC] Shopify response status:', shopifyRes.status, '— body:', JSON.stringify(shopifyData).substring(0, 500));

        if (!shopifyData.order) {
            throw new Error(JSON.stringify(shopifyData.errors || shopifyData));
        }

        // ── 9. Write result to DB ──
        const shopifyOrderId = String(shopifyData.order.id);
        const shopifyOrderName = shopifyData.order.name;

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
