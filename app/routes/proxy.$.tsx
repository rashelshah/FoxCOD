/**
 * App Proxy Route Handler
 * This handles requests from the storefront via Shopify App Proxy
 * 
 * Storefront calls: https://store.myshopify.com/apps/fox-cod/create-order
 * Shopify proxies to: https://your-app/proxy/create-order
 * 
 * This eliminates the need for hardcoded app URLs!
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { getFormSettings, logOrder, logOrderWithShopifyIds, supabase } from "../config/supabase.server";
import { lookupCustomerByPhone } from "../services/customer-lookup.server";
import { syncOrderToGoogleSheets } from "../services/google-sheets.server";
import { getFraudProtectionSettings, validateOrderAgainstFraudRulesWithSettings } from "../services/fraud-protection.server";
import { calculateOrderPricing, normalizeCouponCode, validateCouponForShop } from "../services/coupons.server";
import {
    toNumericVariantId,
    formatPhoneE164,
    buildCatalogOrCustomLineItem,
    sanitizeVariantPricedLineItems,
} from "../services/shopify-sync.server";
import { createPartialPaymentCheckout, createFullPrepaidCheckout, createNativeCodCheckout } from "../services/shopify-partial-payment.server";
import { getPartialPaymentSettings, isPaymentMethodEligible, getPrepaidDiscount } from "../services/partial-payment-settings.server";
import { createPendingOrder } from "../services/shopify-graphql-orders.server";
import {
    resolveCountryForOrder,
    getContextualPricesForVariants,
    assertPricingConsistency,
} from "../services/contextual-pricing.server";

// ── In-process caches to avoid repeated DB/session round-trips ──
// REST clients and fraud settings are stable per shop for minutes at a time.
// Caching them eliminates 200-400ms of cold-start latency on every order.
const CACHE_TTL_MS = 60 * 1000; // 1 minute

interface CacheEntry<T> { value: T; expiresAt: number; }
const _fraudSettingsCache = new Map<string, CacheEntry<any>>();
const _partialPaymentSettingsCache = new Map<string, CacheEntry<any>>();

async function getCachedFraudSettings(shop: string) {
    const now = Date.now();
    const cached = _fraudSettingsCache.get(shop);
    if (cached && cached.expiresAt > now) return cached.value;
    const settings = await getFraudProtectionSettings(shop);
    _fraudSettingsCache.set(shop, { value: settings, expiresAt: now + CACHE_TTL_MS });
    return settings;
}

async function getCachedPartialPaymentSettings(shop: string) {
    const now = Date.now();
    const cached = _partialPaymentSettingsCache.get(shop);
    if (cached && cached.expiresAt > now) return cached.value;
    const settings = await getPartialPaymentSettings(shop);
    _partialPaymentSettingsCache.set(shop, { value: settings, expiresAt: now + CACHE_TTL_MS });
    return settings;
}

const corsHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS, POST",
    "Access-Control-Allow-Headers": "Content-Type",
};

// Handle GET requests - proxy for api/customer-by-phone (autofill)
// Storefront: /apps/fox-cod/api/customer-by-phone → /proxy/api/customer-by-phone
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
    const url = new URL(request.url);
    const path = params["*"] || params["$"] || "";
    const shop = url.searchParams.get("shop");
    const phone = url.searchParams.get("phone");

    if ((path === "api/settings" || path.endsWith("settings")) && shop) {
        const settings = await getFormSettings(shop);
        return new Response(JSON.stringify({
            success: true,
            appUrl: process.env.SHOPIFY_APP_URL || url.origin,
            settings: settings ? {
                enabled: settings.enabled,
                button_text: settings.button_text,
                form_title: settings.form_title,
                form_subtitle: settings.form_subtitle,
                submit_button_text: settings.submit_button_text,
                primary_color: settings.primary_color,
                button_style: settings.button_style,
                button_size: settings.button_size,
                button_styles: settings.button_styles,
                required_fields: settings.required_fields,
                max_quantity: settings.max_quantity,
                branding: settings.branding,
            } : {
                enabled: false,
                button_text: "Buy Now - Cash on Delivery",
                form_title: "Enter your Details",
                form_subtitle: "Fill in your details to place a COD orders.",
                primary_color: "#000000",
                button_style: "solid",
                button_size: "large",
                button_styles: { showAddToCart: true },
                required_fields: ["phone", "name", "address"],
                max_quantity: 10,
                branding: null,
            },
        }), { headers: corsHeaders });
    }

    // Route customer lookup for autofill
    if ((path === "api/customer-by-phone" || path.endsWith("customer-by-phone")) && phone && shop) {
        const result = await lookupCustomerByPhone(phone, shop);
        return new Response(JSON.stringify(result), { headers: corsHeaders });
    }

    // Route order status polling (for storefront to poll Shopify order ID after background sync)
    const orderId = url.searchParams.get("orderId");
    if ((path === "api/get-order-status" || path.endsWith("get-order-status")) && orderId) {
        const { supabase: sb } = await import("../config/supabase.server");
        const { data, error } = await sb
            .from("order_logs")
            .select("shopify_order_id, shopify_order_name, sync_status")
            .eq("id", orderId)
            .single();

        return new Response(JSON.stringify({
            success: !error && !!data,
            order: data || null,
        }), { headers: corsHeaders });
    }

    // Proxy static data requests (e.g. countries.json, states.json)
    if (path.startsWith("data/")) {
        const appUrl = process.env.SHOPIFY_APP_URL || url.origin;
        try {
            const res = await fetch(`${appUrl}/${path}`);
            if (res.ok) {
                const data = await res.text();
                return new Response(data, {
                    headers: {
                        ...corsHeaders
                    }
                });
            }
        } catch (e) {
            console.error('[Proxy] Failed to fetch static data:', e);
        }
        return new Response("[]", { status: 404, headers: corsHeaders });
    }

    return new Response(JSON.stringify({
        success: true,
        message: "Foxly COD App Proxy is working",
        shop: shop
    }), { headers: corsHeaders });
};

// Handle POST requests (for order creation)
export const action = async ({ request, params }: ActionFunctionArgs) => {
    console.log('[Proxy] ===== ACTION HANDLER INVOKED =====');

    try {
        // Handle CORS preflight
        if (request.method === "OPTIONS") {
            return new Response(null, {
                headers: {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "POST, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type"
                }
            });
        }

        const path = params["*"] || params["$"] || "";

        console.log('[Proxy] URL:', request.url);
        console.log('[Proxy] Path param:', path);

        let data: any;
        try {
            data = await request.json();
            console.log('[Proxy] Request data keys:', Object.keys(data));
            console.log('[Proxy] paymentMethod:', data.paymentMethod);
        } catch (parseError: any) {
            console.error('[Proxy] JSON parse error:', parseError.message);
            return new Response(JSON.stringify({
                success: false,
                error: "Invalid JSON in request body"
            }), { status: 400, headers: corsHeaders });
        }

        if (path.includes("validate-coupon")) {
            const pricing = calculateOrderPricing(data);
            const result = await validateCouponForShop(data.shop, data.couponCode, pricing.originalTotal, data);
            return new Response(JSON.stringify(result), {
                status: result.valid ? 200 : 400,
                headers: corsHeaders,
            });
        }

        if (path.includes("contextual-prices")) {
            const { getContextualPricesForVariants } = await import("../services/contextual-pricing.server");
            const result = await getContextualPricesForVariants(data.shop, data.variantIds || [], data.marketCountry || 'US');
            
            // Format for frontend consumption
            const pricesData: Record<string, any> = {};
            result.prices.forEach((value, key) => {
                pricesData[key] = { amount: value.amount, currencyCode: value.currencyCode };
            });

            return new Response(JSON.stringify({
                success: true,
                resolvedCountry: result.resolvedCountry,
                currencyCode: result.currencyCode,
                prices: pricesData
            }), { headers: corsHeaders });
        }

        // Route: Checkout Creation (Partial COD + Full Prepaid share one endpoint)
        const isCheckoutPath = path.includes("partial-cod") || path.includes("create-checkout");
        const isPartialCodPayload = data.paymentMethod === 'partial_cod' ||
            (data.advanceAmount !== undefined && data.advanceAmount !== null && parseFloat(data.advanceAmount) > 0);
        const isNativeCodPayload = data.paymentMethod === 'native_cod';
        const isFullPrepaidPayload = data.paymentMethod === 'full_prepaid';

        if (isCheckoutPath || isPartialCodPayload || isFullPrepaidPayload || isNativeCodPayload) {
            switch (data.paymentMethod) {
                case 'native_cod':
                    console.log('[Proxy] ✅ Matched Native COD route');
                    return await handleNativeCodCheckout(request, data);
                case 'full_prepaid':
                    console.log('[Proxy] ✅ Matched Full Prepaid route');
                    return await handleFullPrepaidCheckout(request, data);
                case 'partial_cod':
                default:
                    if (isPartialCodPayload || isCheckoutPath) {
                        console.log('[Proxy] ✅ Matched Partial COD route (path:', isCheckoutPath, ', payload:', isPartialCodPayload, ')');
                        return await handlePartialCodCheckout(request, data);
                    }
            }
        }

        // Default Route: Regular COD Order Creation
        console.log('[Proxy] Using default order creation route');
        return await handleRegularOrder(request, data);

    } catch (error: any) {
        console.error('[Proxy] Error:', error);
        return new Response(JSON.stringify({
            success: false,
            error: error.message || "Failed to process request"
        }), {
            status: 200, // Return 200 so Shopify proxy doesn't block JSON
            headers: corsHeaders
        });
    }
};

// ─── Handle Partial COD Checkout v2 ───────────────────────────────────────────
// Releaseit-style: temporary Shopify discount code + Storefront API checkout.
// Customer always pays through real Shopify Checkout → real Thank You page.
// NO cart permalinks. NO draft orders. NO fake products.
async function handlePartialCodCheckout(request: Request, data: any) {
    const start = Date.now();
    console.log('[Proxy Partial COD v2] Starting Storefront checkout flow');

    try {
        const {
            shop,
            productId,
            variantId,
            productTitle,
            quantity,
            price,
            advanceAmount,
            customerName,
            customerPhone,
            customerAddress,
            customerEmail,
            customerCity,
            customerState,
            customerZipcode,
            customerCountry,
            shippingPrice,
            notes,
            couponCode,
            upsell_items,
            bundleVariants,
            discountPercent,
            currency,
            partialCodFeeAmount,
        } = data;

        // ── Contextual Pricing & Country Resolution ─────────────────────────
        const orderCountry = await resolveCountryForOrder({
            customerCountry: customerCountry || data.country,
            detectedCountry: data.detectedCountry,
            shop: shop,
        });

        const allVariantIds: any[] = [];
        if (data.cart_items) {
            data.cart_items.forEach((item: any) => allVariantIds.push(item.variantId || item.variant_id || item.id));
        } else if (data.bundleVariants) {
            data.bundleVariants.forEach((bv: any) => allVariantIds.push(bv.variantId || bv.variant_id || bv.id));
        } else {
            allVariantIds.push(variantId);
        }
        if (data.upsell_items) {
            data.upsell_items.forEach((u: any) => allVariantIds.push(u.variant_id));
        }

        const contextualResult = await getContextualPricesForVariants(shop, allVariantIds, orderCountry);
        // BACKEND AUTHORITY: override frontend currency with the one from contextual pricing
        const currencyCode = contextualResult.currencyCode;

        // ── Validate required fields ────────────────────────────────────────
        // For cart page / cart drawer flow, cart_items replaces the single variantId
        const hasCartItems = Array.isArray(data.cart_items) && data.cart_items.length > 0;
        if (!shop || (!variantId && !hasCartItems) || !advanceAmount) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Missing required fields: shop, variantId, advanceAmount',
            }), { status: 400, headers: corsHeaders });
        }

        const parsedAdvance = parseFloat(advanceAmount);
        if (isNaN(parsedAdvance) || parsedAdvance <= 0) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Invalid advance amount',
            }), { status: 400, headers: corsHeaders });
        }

        const [fraudSettings, ppSettings] = await Promise.all([
            getCachedFraudSettings(shop),
            getCachedPartialPaymentSettings(shop),
        ]);

        if (ppSettings) {
            // Note: passing contextualResult.prices enforces server prices for eligibility subtotal calculation
            const pricing = calculateOrderPricing(data, null, contextualResult.prices);
            const eligibility = isPaymentMethodEligible(ppSettings, 'partial_payment', {
                orderTotal: pricing.originalTotal,
                productId,
                collectionIds: data.productCollectionIds || data.collectionIds || [],
                country: orderCountry,
            });

            if (!eligibility.eligible) {
                console.warn('[Proxy Partial COD v2] Blocked by partial payment eligibility:', eligibility.reason);
                return new Response(JSON.stringify({
                    success: false,
                    error: eligibility.reason || "Partial payments are not available in your country."
                }), { status: 403, headers: corsHeaders });
            }
        }

        // ── Fraud Protection (was missing in v1) ────────────────────────────
        const clientIp =
            request.headers.get('x-shopify-client-ip')
            || request.headers.get('cf-connecting-ip')
            || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
            || request.headers.get('x-real-ip')
            || 'unknown';

        try {
            const fraudResult = await validateOrderAgainstFraudRulesWithSettings({
                phone: customerPhone,
                email: customerEmail,
                ip: clientIp,
                zipcode: customerZipcode,
                quantity: parseInt(quantity) || 1,
                shopDomain: shop,
            }, fraudSettings);

            if (!fraudResult.allowed) {
                console.warn('[Proxy Partial COD v2] Blocked by fraud protection:', fraudResult.message);
                return new Response(JSON.stringify({
                    success: false,
                    error: fraudResult.message,
                }), { status: 403, headers: corsHeaders });
            }
        } catch (fraudErr: any) {
            console.error('[Proxy Partial COD v2] Fraud check error (allowing order):', fraudErr.message);
        }
        console.log('⏱ [Proxy Partial COD v2] Fraud checks done:', Date.now() - start, 'ms');

        // ── Pricing: base subtotal ──────────────────────────────────────────
        const pricing = calculateOrderPricing(data, null, contextualResult.prices);
        let totalOrderValue = pricing.originalTotal;
        let couponDiscount = 0;
        let normalizedCouponCode = '';

        // ── Coupon validation ───────────────────────────────────────────────
        if (couponCode) {
            const couponResult = await validateCouponForShop(shop, couponCode, pricing.originalTotal, data);
            if (!couponResult.valid) {
                return new Response(JSON.stringify({
                    success: false,
                    error: couponResult.message || 'Invalid coupon',
                }), { status: 400, headers: corsHeaders });
            }
            couponDiscount = couponResult.discount;
            totalOrderValue = couponResult.finalTotal;
            normalizedCouponCode = normalizeCouponCode(couponCode);
            console.log('[Proxy Partial COD v2] Coupon applied:', normalizedCouponCode, 'discount:', couponDiscount);
        }

        // ── Partial Payment Discount ─────────────────────────────────────────
        let partialDiscountAmount = 0;
        let partialDiscountType: 'percentage' | 'fixed' | undefined;
        let partialDiscountValue: number | undefined;

        if (ppSettings && ppSettings.partial_payment_discount_enabled && ppSettings.partial_payment_discount_value > 0) {
            if (ppSettings.partial_payment_discount_type === 'percentage') {
                partialDiscountAmount = (totalOrderValue * ppSettings.partial_payment_discount_value) / 100;
            } else {
                partialDiscountAmount = ppSettings.partial_payment_discount_value;
            }
            partialDiscountAmount = Math.min(partialDiscountAmount, totalOrderValue);
            partialDiscountType = ppSettings.partial_payment_discount_type;
            partialDiscountValue = ppSettings.partial_payment_discount_value;
            
            totalOrderValue -= partialDiscountAmount;
            console.log('[Proxy Partial COD v2] Partial payment discount applied:', partialDiscountAmount);
        }

        // Safety: advance must not exceed total + cod fee
        const parsedCodFee = parseFloat(partialCodFeeAmount) || 0;
        const safeAdvance = Math.min(parsedAdvance, totalOrderValue + parsedCodFee);
        const remainingAmount = Math.max(totalOrderValue + parsedCodFee - safeAdvance, 0);

        console.log(
            '[Proxy Partial COD v2] Pricing — total:', totalOrderValue,
            'advance:', safeAdvance, 'remaining:', remainingAmount
        );

        console.log('[FOXCOD PRICING DEBUG] Partial COD Checkout:', {
            STORE_CURRENCY: contextualResult.storeCurrency,
            MARKET_CURRENCY: currencyCode,
            CUSTOMER_COUNTRY: orderCountry,
            CONTEXTUAL_PRICES: Object.fromEntries(
                Array.from(contextualResult.prices.entries()).map(([k, v]) => [k, `${v.amount} ${v.currencyCode}`])
            ),
            WIDGET_PRICE: price,
            WIDGET_TOTAL: data.finalTotal,
            SERVER_TOTAL: pricing.originalTotal,
            BUNDLE_DISCOUNT: pricing.bundleDiscountAmount,
            COUPON_DISCOUNT: couponDiscount,
            PREPAID_DISCOUNT: partialDiscountAmount,
            COD_FEE: pricing.codFeeAmount,
            SHIPPING: pricing.shippingPrice,
        });

        // ── Normalize customer name ─────────────────────────────────────────
        const nameStr = (customerName || 'Customer').trim();
        const nameParts = nameStr.split(/\s+/);
        const firstName = nameParts[0] || 'Customer';
        const lastName = nameParts.slice(1).join(' ') || '';
        const formattedPhone = formatPhoneE164(customerPhone || '');

        // ── Generate unique partial payment reference ───────────────────────
        const partialRef = 'PCOD-' + Date.now().toString(36).toUpperCase() + randomHex(4);

        // ── Build line items with accurate pricing (main + upsells + bundle variants)
        const discountMult = 1 - ((parseFloat(discountPercent) || 0) / 100);
        const storefrontLineItems = pricing.discountItems.map((item: any) => {
            let title = data.productTitle || 'Product';
            let isUpsell = false;
            // Attempt to find specific titles if it's an upsell
            const upsellMatch = Array.isArray(upsell_items) && upsell_items.find((u: any) => toNumericVariantId(u.variant_id) === toNumericVariantId(item.variantId));
            if (upsellMatch && upsellMatch.title) {
                title = upsellMatch.title;
                isUpsell = true;
            }
            
            return {
                variantId: item.variantId,
                productId: item.productId,
                quantity: item.quantity,
                price: item.price,
                title,
                isUpsell
            };
        });

        // ── Distribute discounts across non-upsell line items so Shopify Checkout shows it properly
        const totalDiscountToDistribute = couponDiscount + partialDiscountAmount;
        if (totalDiscountToDistribute > 0) {
            let remainingDiscount = totalDiscountToDistribute;
            // Only distribute across NON-upsell items so tick upsells retain exact prices
            const distributableItems = storefrontLineItems.filter(item => !item.isUpsell);
            const itemsToDiscount = distributableItems.length > 0 ? distributableItems : storefrontLineItems;
            
            const totalItemsPrice = itemsToDiscount.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            if (totalItemsPrice > 0) {
                itemsToDiscount.forEach((item, index) => {
                    if (index === itemsToDiscount.length - 1) {
                        item.price = Math.max(0, item.price - (remainingDiscount / item.quantity));
                    } else {
                        const proportion = (item.price * item.quantity) / totalItemsPrice;
                        const discountForItem = Number((totalDiscountToDistribute * proportion).toFixed(2));
                        remainingDiscount -= discountForItem;
                        item.price = Math.max(0, item.price - (discountForItem / item.quantity));
                    }
                });
            }
        }
        // ── Build notes ────────────────────────────────────────────────────
        const fmtAmt = (amt: number) => {
            try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode }).format(amt); }
            catch { return `${currencyCode} ${amt.toFixed(2)}`; }
        };
        let orderNotes = [
            notes || '',
            `PARTIAL COD [${partialRef}]`,
            `Advance: ${fmtAmt(safeAdvance)}`,
            `Remaining (COD): ${fmtAmt(remainingAmount)}`,
            normalizedCouponCode ? `Coupon: ${normalizedCouponCode} (-${fmtAmt(couponDiscount)})` : '',
            partialDiscountAmount > 0 ? `Partial Payment Discount: -${fmtAmt(partialDiscountAmount)}` : '',
        ].filter(Boolean).join('\n');

        // ── Create Shopify Checkout via Storefront API ─────────────────────
        console.log('[Proxy Partial COD v2] Calling createPartialPaymentCheckout, ref:', partialRef);

        const checkoutResult = await createPartialPaymentCheckout({
            shop,
            customer: {
                firstName,
                lastName,
                email: customerEmail || '',
                phone: formattedPhone || customerPhone || '',
                address1: customerAddress || '',
                city: customerCity || '',
                province: customerState || '',
                country: customerCountry || '',
                zip: customerZipcode || '',
            },
            lineItems: storefrontLineItems,
            advanceAmount: safeAdvance,
            totalOrderValue,
            remainingAmount,
            partialPaymentReference: partialRef,
            currency: currencyCode,
            notes: orderNotes,
            couponCode: normalizedCouponCode || undefined,
            shippingPrice: pricing.shippingPrice,
            shippingTitle: pricing.shippingTitle,
            codFeeAmount: parseFloat(partialCodFeeAmount) || 0,
            detectedCountry: data.detectedCountry,
            originalTotalBeforeDiscount: pricing.originalTotal,
        });

        console.log('⏱ [Proxy Partial COD v2] Checkout created:', Date.now() - start, 'ms');

        // ── Non-blocking DB log ────────────────────────────────────────────
        Promise.resolve(
            logOrder({
                shop_domain: shop,
                customer_name: nameStr,
                customer_phone: customerPhone || '',
                customer_address: customerAddress || '',
                customer_email: customerEmail || '',
                notes: orderNotes,
                city: customerCity || '',
                state: customerState || '',
                pincode: customerZipcode || '',
                product_id: productId || variantId,
                product_title: productTitle || 'Product',
                variant_id: variantId,
                quantity: parseInt(quantity) || 1,
                price: String(price),
                shipping_label: data.shippingLabel || '',
                shipping_price: parseFloat(shippingPrice) || 0,
                coupon_code: normalizedCouponCode || undefined,
                discount_amount: couponDiscount || undefined,
                original_total: pricing.originalTotal,
                final_total: totalOrderValue,
                currency: currencyCode,
                is_partial_cod: true,
                advance_amount: safeAdvance,
                remaining_cod_amount: remainingAmount,
                payment_method: 'partial_cod' as const,
                order_payload: {
                    ...data,
                    partial_payment_reference: partialRef,
                    checkout_id: checkoutResult.checkoutId,
                    checkout_url: checkoutResult.checkoutUrl,
                    discount_code: checkoutResult.discountCode,
                    discount_expiry: checkoutResult.discountExpiresAt,
                    couponCode: normalizedCouponCode || '',
                    discountAmount: couponDiscount,
                    originalTotal: pricing.originalTotal,
                    finalTotal: totalOrderValue,
                    discount_type: partialDiscountType || null,
                    discount_value: partialDiscountValue || null,
                    discount_amount: partialDiscountAmount || 0,
                    discount_source: partialDiscountAmount > 0 ? 'partial_payment' : null,
                },
            })
        ).then(() => {
            console.log('⏱ [Proxy Partial COD v2] DB log done (async):', Date.now() - start, 'ms');
        }).catch((dbErr: any) => {
            console.error('[Proxy Partial COD v2] DB log failed (non-fatal):', dbErr.message);
        });

        // ── Non-blocking Google Sheets sync ────────────────────────────────
        syncOrderToGoogleSheets(shop, {
            orderId: partialRef,
            orderName: partialRef,
            customerName: nameStr,
            phone: customerPhone || '',
            email: customerEmail || '',
            address: customerAddress || '',
            city: customerCity || '',
            state: customerState || '',
            pincode: customerZipcode || '',
            product: productTitle || 'Product',
            quantity: parseInt(quantity) || 1,
            totalPrice: totalOrderValue.toString(),
            paymentMethod: 'partial_cod',
            status: 'partial_checkout_pending',
        }).catch((err: any) => {
            console.error('[Proxy Partial COD v2] Google Sheets sync error (non-blocking):', err.message);
        });

        console.log('⏱ [Proxy Partial COD v2] Total time to response:', Date.now() - start, 'ms');

        return new Response(JSON.stringify({
            success: true,
            checkoutUrl: checkoutResult.checkoutUrl,
            partialPaymentReference: partialRef,
            discountCode: checkoutResult.discountCode,
            discountExpiresAt: checkoutResult.discountExpiresAt,
        }), { headers: corsHeaders });

    } catch (error: any) {
        console.error('[Proxy Partial COD v2] ❌ Unexpected error:', error?.message);
        console.error('[Proxy Partial COD v2] Stack:', error?.stack);
        try {
            require('fs').appendFileSync('debug-error.log', new Date().toISOString() + '\n' + error?.message + '\n' + error?.stack + '\n\n');
        } catch (e) {}
        // Return the real error message so browser console shows what failed
        return new Response(JSON.stringify({
            success: false,
            error: error.message || 'Unable to create checkout. Please try again.',
            _debug: process.env.NODE_ENV !== 'production' ? error?.stack?.slice(0, 500) : undefined,
        }), { status: 200, headers: corsHeaders });
    }
}

// Tiny helper for random hex suffix
function randomHex(bytes: number): string {
    return Math.random().toString(16).slice(2, 2 + bytes * 2).toUpperCase();
}

// ─── Handle Full Prepaid Checkout ─────────────────────────────────────────────
// Customer pays 100% upfront through Shopify Checkout.
// Reuses all partial COD infrastructure: pricing engine, fraud check, coupon validation.
async function handleFullPrepaidCheckout(request: Request, data: any) {
    const start = Date.now();
    console.log('[Proxy Full Prepaid] Starting checkout flow');

    try {
        const {
            shop,
            productId,
            variantId,
            productTitle,
            quantity,
            price,
            customerName,
            customerPhone,
            customerAddress,
            customerEmail,
            customerCity,
            customerState,
            customerZipcode,
            customerCountry,
            shippingPrice,
            notes,
            couponCode,
            upsell_items,
            currency,
        } = data;

        // ── Contextual Pricing & Country Resolution ─────────────────────────
        const orderCountry = await resolveCountryForOrder({
            customerCountry: customerCountry || data.country,
            detectedCountry: data.detectedCountry,
            shop: shop,
        });

        const allVariantIds: any[] = [];
        if (data.cart_items) {
            data.cart_items.forEach((item: any) => allVariantIds.push(item.variantId || item.variant_id || item.id));
        } else if (data.bundleVariants) {
            data.bundleVariants.forEach((bv: any) => allVariantIds.push(bv.variantId || bv.variant_id || bv.id));
        } else {
            allVariantIds.push(variantId);
        }
        if (data.upsell_items) {
            data.upsell_items.forEach((u: any) => allVariantIds.push(u.variant_id));
        }

        const contextualResult = await getContextualPricesForVariants(shop, allVariantIds, orderCountry);
        // BACKEND AUTHORITY: override frontend currency with the one from contextual pricing
        const currencyCode = contextualResult.currencyCode;

        // ── Validate required fields ────────────────────────────────────────
        // For cart page / cart drawer flow, cart_items replaces the single variantId
        const hasCartItems = Array.isArray(data.cart_items) && data.cart_items.length > 0;
        if (!shop || (!variantId && !hasCartItems)) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Missing required fields: shop, variantId',
            }), { status: 400, headers: corsHeaders });
        }

        // ── Fraud Protection ────────────────────────────────────────────────
        const clientIp =
            request.headers.get('x-shopify-client-ip')
            || request.headers.get('cf-connecting-ip')
            || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
            || request.headers.get('x-real-ip')
            || 'unknown';

        const fraudSettings = await getCachedFraudSettings(shop);

        try {
            const fraudResult = await validateOrderAgainstFraudRulesWithSettings({
                phone: customerPhone,
                email: customerEmail,
                ip: clientIp,
                zipcode: customerZipcode,
                quantity: parseInt(quantity) || 1,
                shopDomain: shop,
            }, fraudSettings);

            if (!fraudResult.allowed) {
                console.warn('[Proxy Full Prepaid] Blocked by fraud protection:', fraudResult.message);
                return new Response(JSON.stringify({
                    success: false,
                    error: fraudResult.message,
                }), { status: 403, headers: corsHeaders });
            }
        } catch (fraudErr: any) {
            console.error('[Proxy Full Prepaid] Fraud check error (allowing order):', fraudErr.message);
        }
        console.log('⏱ [Proxy Full Prepaid] Fraud checks done:', Date.now() - start, 'ms');

        // ── Pricing ─────────────────────────────────────────────────────────
        const pricing = calculateOrderPricing(data, null, contextualResult.prices);
        let totalOrderValue = pricing.originalTotal;
        let couponDiscount = 0;
        let normalizedCouponCode = '';

        // ── Coupon validation ────────────────────────────────────────────────
        if (couponCode) {
            const couponResult = await validateCouponForShop(shop, couponCode, pricing.originalTotal, data);
            if (!couponResult.valid) {
                return new Response(JSON.stringify({
                    success: false,
                    error: couponResult.message || 'Invalid coupon',
                }), { status: 400, headers: corsHeaders });
            }
            couponDiscount = couponResult.discount;
            totalOrderValue = couponResult.finalTotal;
            normalizedCouponCode = normalizeCouponCode(couponCode);
            console.log('[Proxy Full Prepaid] Coupon applied:', normalizedCouponCode, 'discount:', couponDiscount);
        }

        console.log('[Proxy Full Prepaid] Pricing — total:', totalOrderValue);

        // ── Prepaid Discount (after coupon) ─────────────────────────────────────────
        const ppSettings = await getCachedPartialPaymentSettings(shop);
        let prepaidDiscountAmount = 0;
        let prepaidDiscountType: 'percentage' | 'fixed' | undefined;
        let prepaidDiscountValue: number | undefined;
        const originalTotalBeforeDiscount = totalOrderValue; // post-coupon

        if (ppSettings) {
            // Only calculate if Full Prepaid itself is eligible
            const fpEligible = isPaymentMethodEligible(ppSettings, 'full_prepaid', {
                orderTotal: totalOrderValue,
                productId,
                collectionIds: data.productCollectionIds || data.collectionIds || [],
                country: orderCountry,
            });

            if (fpEligible.eligible) {
                const discountResult = getPrepaidDiscount(ppSettings, totalOrderValue);
                if (discountResult.eligible && discountResult.discountAmount && discountResult.discountAmount > 0) {
                    prepaidDiscountAmount = discountResult.discountAmount;
                    prepaidDiscountType = discountResult.discountType;
                    prepaidDiscountValue = discountResult.discountValue;
                    totalOrderValue = discountResult.finalPrice!;
                    console.log('[Proxy Full Prepaid] Prepaid discount applied:', prepaidDiscountAmount);
                }
            }
        }

        console.log('[FOXCOD PRICING DEBUG] Full Prepaid Checkout:', {
            STORE_CURRENCY: contextualResult.storeCurrency,
            MARKET_CURRENCY: currencyCode,
            CUSTOMER_COUNTRY: orderCountry,
            CONTEXTUAL_PRICES: Object.fromEntries(
                Array.from(contextualResult.prices.entries()).map(([k, v]) => [k, `${v.amount} ${v.currencyCode}`])
            ),
            WIDGET_PRICE: price,
            WIDGET_TOTAL: data.finalTotal,
            SERVER_TOTAL: pricing.originalTotal,
            BUNDLE_DISCOUNT: pricing.bundleDiscountAmount,
            COUPON_DISCOUNT: couponDiscount,
            PREPAID_DISCOUNT: prepaidDiscountAmount,
            COD_FEE: pricing.codFeeAmount,
            SHIPPING: pricing.shippingPrice,
        });

        // ── Normalize customer name ──────────────────────────────────────────
        const nameStr = (customerName || 'Customer').trim();
        const nameParts = nameStr.split(/\s+/);
        const firstName = nameParts[0] || 'Customer';
        const lastName = nameParts.slice(1).join(' ') || '';
        const formattedPhone = formatPhoneE164(customerPhone || '');

        // ── Build line items ─────────────────────────────────────────────────
        const storefrontLineItems = pricing.discountItems.map((item: any) => {
            let title = data.productTitle || 'Product';
            const upsellMatch = Array.isArray(upsell_items) && upsell_items.find(
                (u: any) => toNumericVariantId(u.variant_id) === toNumericVariantId(item.variantId)
            );
            if (upsellMatch && upsellMatch.title) title = upsellMatch.title;
            return { variantId: item.variantId, productId: item.productId, quantity: item.quantity, price: item.price, title };
        });

        // ── Build notes (no advance/remaining split) ─────────────────────────
        const fmtAmt = (amt: number) => {
            try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode }).format(amt); }
            catch { return `${currencyCode} ${amt.toFixed(2)}`; }
        };
        const orderNotes = [
            notes || '',
            `Total paid: ${fmtAmt(totalOrderValue)}`,
            normalizedCouponCode ? `Coupon: ${normalizedCouponCode} (-${fmtAmt(couponDiscount)})` : '',
        ].filter(Boolean).join('\n');

        // ── Create Shopify Checkout ──────────────────────────────────────────
        console.log('[Proxy Full Prepaid] Calling createFullPrepaidCheckout, total:', totalOrderValue);

        const checkoutResult = await createFullPrepaidCheckout({
            shop,
            customer: {
                firstName,
                lastName,
                email: customerEmail || '',
                phone: formattedPhone || customerPhone || '',
                address1: customerAddress || '',
                city: customerCity || '',
                province: customerState || '',
                country: customerCountry || '',
                zip: customerZipcode || '',
            },
            lineItems: storefrontLineItems,
            totalOrderValue,
            currency: currencyCode,
            notes: orderNotes,
            couponCode: normalizedCouponCode || undefined,
            shippingPrice: pricing.shippingPrice,
            shippingTitle: pricing.shippingTitle,
            prepaidDiscountAmount,
            prepaidDiscountType,
            prepaidDiscountValue,
            originalTotalBeforeDiscount,
            detectedCountry: data.detectedCountry,
        });

        const fullPrepaidRef = checkoutResult.partialPaymentReference; // FPAID-* reference
        console.log('⏱ [Proxy Full Prepaid] Checkout created:', Date.now() - start, 'ms', '| ref:', fullPrepaidRef);

        // ── Non-blocking DB log ──────────────────────────────────────────────
        Promise.resolve(
            logOrder({
                shop_domain: shop,
                customer_name: nameStr,
                customer_phone: customerPhone || '',
                customer_address: customerAddress || '',
                customer_email: customerEmail || '',
                notes: orderNotes,
                city: customerCity || '',
                state: customerState || '',
                pincode: customerZipcode || '',
                product_id: productId || variantId,
                product_title: productTitle || 'Product',
                variant_id: variantId,
                quantity: parseInt(quantity) || 1,
                price: String(price),
                shipping_label: data.shippingLabel || '',
                shipping_price: parseFloat(shippingPrice) || 0,
                coupon_code: normalizedCouponCode || undefined,
                discount_amount: couponDiscount || undefined,
                original_total: pricing.originalTotal,
                final_total: totalOrderValue,
                currency: currencyCode,
                is_full_prepaid: true,
                payment_method: 'full_prepaid' as const,
                order_payload: {
                    ...data,
                    full_prepaid_reference: fullPrepaidRef,
                    checkout_id: checkoutResult.checkoutId,
                    checkout_url: checkoutResult.checkoutUrl,
                    checkout_type: checkoutResult.checkoutType,
                    couponCode: normalizedCouponCode || '',
                    discountAmount: couponDiscount,
                    originalTotal: pricing.originalTotal,
                    finalTotal: totalOrderValue,
                    prepaid_discount_type: prepaidDiscountType || null,
                    prepaid_discount_value: prepaidDiscountValue || null,
                    prepaid_discount_amount: prepaidDiscountAmount || 0,
                },
            })
        ).then(() => {
            console.log('⏱ [Proxy Full Prepaid] DB log done (async):', Date.now() - start, 'ms');
        }).catch((dbErr: any) => {
            console.error('[Proxy Full Prepaid] DB log failed (non-fatal):', dbErr.message);
        });

        // ── Non-blocking Google Sheets sync ─────────────────────────────────
        syncOrderToGoogleSheets(shop, {
            orderId: fullPrepaidRef,
            orderName: fullPrepaidRef,
            customerName: nameStr,
            phone: customerPhone || '',
            email: customerEmail || '',
            address: customerAddress || '',
            city: customerCity || '',
            state: customerState || '',
            pincode: customerZipcode || '',
            product: productTitle || 'Product',
            quantity: parseInt(quantity) || 1,
            totalPrice: totalOrderValue.toString(),
            paymentMethod: 'full_prepaid' as any,
            status: 'full_prepaid_checkout_pending',
        }).catch((err: any) => {
            console.error('[Proxy Full Prepaid] Google Sheets sync error (non-blocking):', err.message);
        });

        console.log('⏱ [Proxy Full Prepaid] Total time to response:', Date.now() - start, 'ms');

        return new Response(JSON.stringify({
            success: true,
            checkoutUrl: checkoutResult.checkoutUrl,
            fullPrepaidReference: fullPrepaidRef,
        }), { headers: corsHeaders });

    } catch (error: any) {
        console.error('[Proxy Full Prepaid] ❌ Unexpected error:', error?.message);
        console.error('[Proxy Full Prepaid] Stack:', error?.stack);
        return new Response(JSON.stringify({
            success: false,
            error: error.message || 'Unable to create Full Prepaid checkout. Please try again.',
            _debug: process.env.NODE_ENV !== 'production' ? error?.stack?.slice(0, 500) : undefined,
        }), { status: 200, headers: corsHeaders });
    }
}

// ─── Optimized Regular COD Order Flow ─────────────────────────────────────────
// Target: <3s warm, <5s cold. 4 DB calls total (down from 8-12).
//
// Flow:
//   1. Session + fraud settings (2 parallel DB calls)
//   2. FAST fraud checks (in-memory) + heavy fraud checks (if enabled)
//   3. Shopify API call (direct, from request data — no DB round-trip)
//   4. Save order to DB (1 call, with Shopify IDs included)
//   5. Non-blocking: customer upsert + Sheets sync
// ─── Pre-fill Shopify Checkout URL ──────────────────────────────────────────────
function appendCheckoutParams(invoiceUrl: string, formData: any): string {
    try {
        const url = new URL(invoiceUrl);

        const nameStr = (formData.customerName || 'Customer').trim();
        const nameParts = nameStr.split(/\s+/);
        const firstName = nameParts[0] || 'Customer';
        const lastName = nameParts.slice(1).join(" ") || "";

        if (formData.customerEmail) {
            url.searchParams.set("checkout[email]", formData.customerEmail);
        }
        
        url.searchParams.set("checkout[shipping_address][first_name]", firstName);
        url.searchParams.set("checkout[shipping_address][last_name]", lastName);
        
        if (formData.customerAddress) {
            url.searchParams.set("checkout[shipping_address][address1]", formData.customerAddress);
        }

        if (formData.customerCity) {
            url.searchParams.set("checkout[shipping_address][city]", formData.customerCity);
        }
        
        if (formData.customerZipcode) {
            url.searchParams.set("checkout[shipping_address][zip]", formData.customerZipcode);
        }
        
        const orderCountry = formData.customerCountry || formData.country || 'US';
        url.searchParams.set("checkout[shipping_address][country]", orderCountry);

        if (formData.customerState) {
            url.searchParams.set("checkout[shipping_address][province]", formData.customerState);
        }

        return url.toString();
    } catch (e) {
        console.error("[Proxy] Failed to append checkout params", e);
        return invoiceUrl; // fallback to original url if parsing fails
    }
}

// ─── Handle Regular COD Order ─────────────────────────────────────────────────
async function handleRegularOrder(request: Request, data: any) {
    const start = Date.now();
    console.log('⏱ [Proxy] Start order for shop:', data.shop);

    const normalizedProductId = data.productId || data.variantId || "";

    // Validate required fields
    // For cart page / cart drawer flow, cart_items replaces the single variantId
    const hasCartItems = Array.isArray(data.cart_items) && data.cart_items.length > 0;
    if (!data.shop || (!data.variantId && !hasCartItems)) {
        return new Response(JSON.stringify({
            success: false,
            error: "Missing required fields: shop, variantId"
        }), { status: 400, headers: corsHeaders });
    }

    // ── Contextual Pricing & Country Resolution ─────────────────────────
    const orderCountry = await resolveCountryForOrder({
        customerCountry: data.customerCountry || data.country,
        detectedCountry: data.detectedCountry,
        shop: data.shop,
    });

    const allVariantIds: any[] = [];
    if (data.cart_items) {
        data.cart_items.forEach((item: any) => allVariantIds.push(item.variantId || item.variant_id || item.id));
    } else if (data.bundleVariants) {
        data.bundleVariants.forEach((bv: any) => allVariantIds.push(bv.variantId || bv.variant_id || bv.id));
    } else {
        allVariantIds.push(data.variantId);
    }
    if (data.upsell_items) {
        data.upsell_items.forEach((u: any) => allVariantIds.push(u.variant_id));
    }

    const contextualResult = await getContextualPricesForVariants(data.shop, allVariantIds, orderCountry);
    // BACKEND AUTHORITY: override frontend currency with the one from contextual pricing
    const currencyCode = contextualResult.currencyCode;

    // ── 1. PARALLEL: Load fraud settings (cached) ──
    // Cache eliminates 200-400ms of DB/session round-trips on warm requests.
    const t_fraud = performance.now();
    const fraudSettings = await getCachedFraudSettings(data.shop);
    console.log(`[PERF] getCachedFraudSettings complete: ${performance.now() - t_fraud}ms`);

    const t_partial = performance.now();
    const ppSettings = await getCachedPartialPaymentSettings(data.shop);
    console.log(`[PERF] getCachedPartialPaymentSettings complete: ${performance.now() - t_partial}ms`);
    
    console.log('⏱ [Proxy] Fraud settings ready:', Date.now() - start, 'ms');

    // ── 2. FRAUD CHECKS ──
    const clientIp =
        request.headers.get('x-shopify-client-ip')
        || request.headers.get('cf-connecting-ip')
        || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || request.headers.get('x-real-ip')
        || 'unknown';

    try {
        const fraudResult = await validateOrderAgainstFraudRulesWithSettings({
            phone: data.customerPhone,
            email: data.customerEmail,
            ip: clientIp,
            zipcode: data.customerZipcode,
            quantity: parseInt(data.quantity) || 1,
            shopDomain: data.shop,
        }, fraudSettings);
        if (!fraudResult.allowed) {
            console.warn('[Proxy] Blocked by fraud protection:', fraudResult.message);
            return new Response(JSON.stringify({
                success: false,
                error: fraudResult.message
            }), { status: 403, headers: corsHeaders });
        }
    } catch (fraudErr: any) {
        console.error('[Proxy] Fraud check error (allowing order):', fraudErr.message);
    }
    console.log('⏱ [Proxy] Fraud checks done:', Date.now() - start, 'ms');

    // ── 3. BUILD SHOPIFY PAYLOAD (from request data — no DB round-trip) ──
    const upsellItems = data.upsell_items || [];
    const shippingPrice = parseFloat(data.shippingPrice) || 0;
    const discountPercent = parseFloat(data.discountPercent) || 0;
    const pricing = calculateOrderPricing(data, ppSettings, contextualResult.prices);
    let totalPrice = pricing.originalTotal;
    let couponDiscount = 0;
    let couponType: "percentage" | "fixed" | null = null;
    let couponValue = 0; // The raw coupon value (e.g. 10 for 10%, or 50 for $50 off)
    let couponCode: string | null = null;
    if (data.couponCode) {
        const t_coupon = performance.now();
        const couponResult = await validateCouponForShop(data.shop, data.couponCode, pricing.originalTotal, data);
        console.log(`[PERF] validateCouponForShop total duration: ${performance.now() - t_coupon}ms`);
        if (!couponResult.valid) {
            return new Response(JSON.stringify({
                success: false,
                error: couponResult.message || "Invalid coupon",
            }), { status: 400, headers: corsHeaders });
        }
        couponDiscount = couponResult.discount;
        totalPrice = couponResult.finalTotal;
        couponType = couponResult.coupon.type;
        couponValue = couponResult.coupon.value;
        couponCode = normalizeCouponCode(data.couponCode);
        console.log('🎟 [Proxy] Coupon validated for order:', { code: couponCode, type: couponType, value: couponValue, discount: couponDiscount, originalTotal: pricing.originalTotal, finalTotal: totalPrice });
    }

    // pure cod logic
    console.log('[COD DEBUG] Payment Method:', data.paymentMethod);
    if (data.paymentMethod === 'full_cod' && ppSettings && ppSettings.pure_cod_enabled) {
        const eligibility = isPaymentMethodEligible(ppSettings, 'pure_cod', {
            orderTotal: pricing.originalTotal,
            productId: normalizedProductId,
            collectionIds: data.collectionIds || [],
            country: orderCountry,
        });
        if (!eligibility.eligible) {
            return new Response(JSON.stringify({ success: false, error: eligibility.reason }), { status: 400, headers: corsHeaders });
        }
    }
    
    // Build notes
    let orderNotes = data.notes || data.customerNotes || '';
    const fmtPrice = (amt: number) => { try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode }).format(amt); } catch { return `${currencyCode} ${amt.toFixed(2)}`; } };
    if (upsellItems.length > 0) {
        const upsellNotes = 'UPSELL ITEMS:\n' + upsellItems.map((item: any) =>
            `  - ${item.title} (${fmtPrice(parseFloat(item.price))}) x${item.quantity} [${item.type}]`
        ).join('\n');
        orderNotes = orderNotes ? orderNotes + '\n' + upsellNotes : upsellNotes;
    }
    if (shippingPrice > 0 && data.shippingLabel) {
        orderNotes = orderNotes ? orderNotes + '\n' : '';
        orderNotes += `SHIPPING: ${data.shippingLabel} (${fmtPrice(shippingPrice)})`;
    }
    if (discountPercent > 0) {
        orderNotes = orderNotes ? orderNotes + '\n' : '';
        orderNotes += `BUNDLE DISCOUNT: ${discountPercent}% off`;
    }
    if (couponCode && couponDiscount > 0) {
        orderNotes = orderNotes ? orderNotes + '\n' : '';
        const couponDesc = couponType === 'percentage' ? `${couponValue}% off` : `${fmtPrice(couponValue)} off`;
        orderNotes += `COUPON: ${couponCode} (${couponDesc} = -${fmtPrice(couponDiscount)})`;
    }
    if (data.customFieldData && Array.isArray(data.customFieldData) && data.customFieldData.length > 0) {
        const cfNotes = 'CUSTOM FIELDS:\n' + data.customFieldData.map((cf: any) => `  ${cf.label}: ${cf.value}`).join('\n');
        orderNotes = orderNotes ? orderNotes + '\n' + cfNotes : cfNotes;
    }

    // Build line items directly from request data
    const mainVariantId = toNumericVariantId(data.variantId);
    const discountMultiplier = 1 - (discountPercent / 100);
    const lineItems: Array<Record<string, any>> = [];

    const cartItems: Array<any> =
        Array.isArray(data.cart_items) && data.cart_items.length > 0
            ? data.cart_items : null;

    const bundleVariants: Array<any> =
        Array.isArray(data.bundleVariants) && data.bundleVariants.length > 1
            ? data.bundleVariants : null;

    if (cartItems) {
        for (const item of cartItems) {
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
        for (const bv of bundleVariants) {
            const rawBundleVariantId = bv?.variantId ?? bv?.variant_id ?? bv?.id ?? null;
            const bvVariantId = toNumericVariantId(rawBundleVariantId) || mainVariantId;
            const originalPrice = parseFloat(String(bv.price || 0));
            const discountedPrice = (originalPrice * discountMultiplier).toFixed(2);
            lineItems.push(buildCatalogOrCustomLineItem({
                variantId: bvVariantId,
                title: bv.title || 'Bundle Item',
                quantity: bv.quantity || 1,
                price: discountedPrice,
            }));
        }
    } else {
        const originalPrice = parseFloat(String(data.price || 0));
        const discountedPrice = (originalPrice * discountMultiplier).toFixed(2);
        lineItems.push(buildCatalogOrCustomLineItem({
            variantId: mainVariantId,
            title: data.productTitle || 'Product',
            quantity: parseInt(data.quantity) || 1,
            price: discountedPrice,
        }));
    }

    if (pricing.codFeeAmount > 0) {
        lineItems.push({
            title: pricing.codFeeName || 'COD Fee',
            price: pricing.codFeeAmount.toFixed(2),
            quantity: 1,
            requires_shipping: false,
            taxable: false,
        });
        orderNotes = orderNotes ? orderNotes + '\n' : '';
        orderNotes += `COD FEE: ${fmtPrice(pricing.codFeeAmount)}`;
        data.pureCodFeeAmount = pricing.codFeeAmount;
    }

    if (Array.isArray(data.upsell_items)) {
        data.upsell_items.forEach((item: any) => {
            try {
                lineItems.push(buildCatalogOrCustomLineItem({
                    variantId: toNumericVariantId(item.variant_id),
                    title: item.title || 'Upsell Item',
                    quantity: item.quantity || 1,
                    price: parseFloat(String(item.price || 0)).toFixed(2),
                }));
            } catch (e: any) {
                console.error('[Proxy] Upsell item error:', e?.message);
            }
        });
    }

    // Customer data
    const customerName = data.customerName || 'Customer';
    const nameParts = customerName.trim().split(/\s+/);
    const firstName = nameParts[0] || 'Customer';
    const lastName = nameParts.slice(1).join(' ') || '';
    const formattedPhone = formatPhoneE164(data.customerPhone || '');
    const shippingLabel = data.shippingLabel || (shippingPrice > 0 ? 'Shipping' : 'Free Shipping');

    // ── SAFETY: cap discount to never exceed the order total ──
    couponDiscount = Math.min(couponDiscount, totalPrice);
    totalPrice = Math.round((totalPrice + Number.EPSILON) * 100) / 100;

    console.log('[FOXCOD PRICING DEBUG] Regular Order Checkout:', {
        STORE_CURRENCY: contextualResult.storeCurrency,
        MARKET_CURRENCY: currencyCode,
        CUSTOMER_COUNTRY: orderCountry,
        CONTEXTUAL_PRICES: Object.fromEntries(
            Array.from(contextualResult.prices.entries()).map(([k, v]) => [k, `${v.amount} ${v.currencyCode}`])
        ),
        WIDGET_PRICE: data.price,
        WIDGET_TOTAL: data.finalTotal,
        SERVER_TOTAL: pricing.originalTotal,
        BUNDLE_DISCOUNT: pricing.bundleDiscountAmount,
        COUPON_DISCOUNT: couponDiscount,
        COD_FEE: pricing.codFeeAmount,
        SHIPPING: pricing.shippingPrice,
    });

    // ── Pricing Consistency Guard ──
    assertPricingConsistency(
        data.finalTotal, // frontend widget total
        totalPrice,      // server contextual total
        { shop: data.shop, country: orderCountry, flow: 'full_cod' }
    );

    // ── 4. CALL SHOPIFY GRAPHQL API via centralized service ──
    const nativePrices: Record<string, number> = {};
    for (const [k, v] of contextualResult.prices.entries()) {
        nativePrices[k] = v.amount;
    }

    const paramsForGraphql = {
        shop: data.shop,
        lineItems: lineItems.map((li: any) => ({
            variantId: li.variant_id,
            title: li.title,
            quantity: li.quantity,
            price: li.price
        })),
        nativePrices: nativePrices,
        targetTotal: totalPrice,
        currency: currencyCode,
        customer: {
            firstName: firstName,
            lastName: lastName,
            email: data.customerEmail || undefined,
            phone: formattedPhone || undefined,
        },
        shippingAddress: (customerName || data.customerAddress) ? {
            firstName: firstName,
            lastName: lastName,
            address1: data.customerAddress || '',
            city: data.customerCity || '',
            province: data.customerState || '',
            zip: data.customerZipcode || '',
            country: orderCountry,
            phone: formattedPhone || '',
        } : undefined,
        tags: ['FoxlyCOD', 'COD'],
        note: orderNotes || 'Order placed via FoxlyCOD COD Form',
        shippingLine: { title: shippingLabel, price: shippingPrice.toFixed(2) },
        discount: (couponCode && couponDiscount > 0) ? {
            code: couponCode,
            amount: couponDiscount,
            valueType: 'FIXED_AMOUNT' as const
        } : undefined,
        noteAttributes: [
            { key: 'Order Source', value: 'FoxlyCOD' },
            ...(couponCode && couponDiscount > 0 ? [
                { key: 'Coupon Code', value: couponCode },
                { key: 'Coupon Type', value: couponType === 'percentage' ? `${couponValue}% off` : `Fixed ${fmtPrice(couponValue)}` },
                { key: 'Discount Applied', value: fmtPrice(couponDiscount) },
            ] : []),
            ...(discountPercent > 0 ? [
                { key: 'Bundle Discount', value: `${discountPercent}%` },
            ] : []),
            { key: 'Original Total', value: fmtPrice(pricing.originalTotal) },
            { key: 'Final Total', value: fmtPrice(totalPrice) },
        ]
    };

    const t_create_pending = performance.now();
    // ========================================================
    // LEGACY DIRECT COD ORDER FLOW
    // Temporarily disabled for Shopify App Review compliance.
    
    const graphqlResult = await createPendingOrder(paramsForGraphql);
    console.log(`[PERF] createPendingOrder total duration: ${performance.now() - t_create_pending}ms`);
    console.log('⏱ [Proxy] Shopify API responded:', Date.now() - start, 'ms');

    if (!graphqlResult.success) {
        console.error('[Proxy] ❌ Shopify order creation failed:', graphqlResult.error);
        return new Response(JSON.stringify({
            success: false,
            error: graphqlResult.error || 'Failed to create order. Please try again.',
        }), { status: 200, headers: corsHeaders }); // Status 200 so UI gets the error message
    }

    const shopifyDraftOrderId = graphqlResult.orderId!;
    let invoiceUrl = graphqlResult.invoiceUrl || null;

    if (invoiceUrl) {
        invoiceUrl = appendCheckoutParams(invoiceUrl, data);
    }

    console.log('[COD] Draft Order ID:', shopifyDraftOrderId);
    console.log('[COD] Invoice URL:', invoiceUrl);
    console.log('[FOXCOD API] Sending response to frontend:', {
        success: true,
        draftOrderId: shopifyDraftOrderId,
        invoiceUrl,
    });
    console.log('⏱ [Proxy] Shopify draft order created in:', Date.now() - start, 'ms — returning to frontend now');

    console.log('⏱ [Proxy] Shopify draft order created in:', Date.now() - start, 'ms — returning to frontend now');

    // ── 6. NON-BLOCKING: Customer upsert ──
    // Fire-and-forget — do NOT await
    if (data.customerPhone && data.customerPhone.trim()) {
        Promise.resolve(
            supabase
                .from('customers')
                .upsert({
                    shop_domain: data.shop,
                    phone: data.customerPhone.trim(),
                    name: data.customerName || '',
                    address: data.customerAddress || '',
                    state: data.customerState || '',
                    city: data.customerCity || '',
                    zipcode: data.customerZipcode || '',
                    email: data.customerEmail || '',
                    updated_at: new Date().toISOString()
                }, { onConflict: 'shop_domain,phone', ignoreDuplicates: false })
        ).catch((err: any) => console.error('[Proxy] Customer upsert error (non-blocking):', err.message));
    }

    console.log('⏱ [Proxy] Total time to response:', Date.now() - start, 'ms');

    return new Response(JSON.stringify({
        success: true,
        checkoutUrl: invoiceUrl,
        draftOrderId: shopifyDraftOrderId,
    }), { headers: corsHeaders });

    console.log('⏱ [Proxy] Total time to response:', Date.now() - start, 'ms');
    console.log('[FOXCOD API] Response returned successfully');

    return new Response(JSON.stringify({
        success: true,
        orderType: 'cod',
        draftOrderId: shopifyDraftOrderId,
        invoiceUrl,
    }), { headers: corsHeaders });
    // ========================================================
}

// ─── Handle Native COD Checkout ───────────────────────────────────────────────
// Customer pays 100% on delivery, but uses Shopify Checkout.
async function handleNativeCodCheckout(request: Request, data: any) {
    const start = Date.now();
    console.log('[Proxy Native COD] Starting checkout flow');

    try {
        const {
            shop,
            productId,
            variantId,
            productTitle,
            quantity,
            price,
            customerName,
            customerPhone,
            customerAddress,
            customerEmail,
            customerCity,
            customerState,
            customerZipcode,
            customerCountry,
            shippingPrice,
            notes,
            couponCode,
            upsell_items,
            currency,
        } = data;

        // ── Contextual Pricing & Country Resolution ─────────────────────────
        const orderCountry = await resolveCountryForOrder({
            customerCountry: customerCountry || data.country,
            detectedCountry: data.detectedCountry,
            shop: shop,
        });

        const allVariantIds: any[] = [];
        if (data.cart_items) {
            data.cart_items.forEach((item: any) => allVariantIds.push(item.variantId || item.variant_id || item.id));
        } else if (data.bundleVariants) {
            data.bundleVariants.forEach((bv: any) => allVariantIds.push(bv.variantId || bv.variant_id || bv.id));
        } else {
            allVariantIds.push(variantId);
        }
        if (data.upsell_items) {
            data.upsell_items.forEach((u: any) => allVariantIds.push(u.variant_id));
        }

        const contextualResult = await getContextualPricesForVariants(shop, allVariantIds, orderCountry);
        const currencyCode = contextualResult.currencyCode;

        // ── Validate required fields ────────────────────────────────────────
        const hasCartItems = Array.isArray(data.cart_items) && data.cart_items.length > 0;
        if (!shop || (!variantId && !hasCartItems)) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Missing required fields: shop, variantId',
            }), { status: 400, headers: corsHeaders });
        }

        // ── Fraud Protection ────────────────────────────────────────────────
        const clientIp =
            request.headers.get('x-shopify-client-ip')
            || request.headers.get('cf-connecting-ip')
            || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
            || request.headers.get('x-real-ip')
            || 'unknown';

        const fraudSettings = await getCachedFraudSettings(shop);

        try {
            const fraudResult = await validateOrderAgainstFraudRulesWithSettings({
                phone: customerPhone,
                email: customerEmail,
                ip: clientIp,
                zipcode: customerZipcode,
                quantity: parseInt(quantity) || 1,
                shopDomain: shop,
            }, fraudSettings);

            if (!fraudResult.allowed) {
                console.warn('[Proxy Native COD] Blocked by fraud protection:', fraudResult.message);
                return new Response(JSON.stringify({
                    success: false,
                    error: fraudResult.message,
                }), { status: 403, headers: corsHeaders });
            }
        } catch (fraudErr: any) {
            console.error('[Proxy Native COD] Fraud check error (allowing order):', fraudErr.message);
        }

        // ── Pricing ─────────────────────────────────────────────────────────
        const pricing = calculateOrderPricing(data, null, contextualResult.prices);
        let totalOrderValue = pricing.originalTotal; // Already includes COD fee
        let couponDiscount = 0;
        let normalizedCouponCode = '';

        // ── Coupon validation ────────────────────────────────────────────────
        if (couponCode) {
            const couponResult = await validateCouponForShop(shop, couponCode, pricing.originalTotal, data);
            if (!couponResult.valid) {
                return new Response(JSON.stringify({
                    success: false,
                    error: couponResult.message || 'Invalid coupon',
                }), { status: 400, headers: corsHeaders });
            }
            couponDiscount = couponResult.discount;
            totalOrderValue = couponResult.finalTotal;
            normalizedCouponCode = normalizeCouponCode(couponCode);
        }

        // ── Normalize customer name ──────────────────────────────────────────
        const nameStr = (customerName || 'Customer').trim();
        const nameParts = nameStr.split(/\s+/);
        const firstName = nameParts[0] || 'Customer';
        const lastName = nameParts.slice(1).join(' ') || '';
        const formattedPhone = formatPhoneE164(customerPhone || '');

        // ── Build line items ─────────────────────────────────────────────────
        const storefrontLineItems = pricing.discountItems.map((item: any) => {
            let title = data.productTitle || 'Product';
            const upsellMatch = Array.isArray(upsell_items) && upsell_items.find(
                (u: any) => toNumericVariantId(u.variant_id) === toNumericVariantId(item.variantId)
            );
            if (upsellMatch && upsellMatch.title) title = upsellMatch.title;
            return { variantId: item.variantId, productId: item.productId, quantity: item.quantity, price: item.price, title };
        });

        // ── Build notes ──────────────────────────────────────────────────────
        const fmtAmt = (amt: number) => {
            try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode }).format(amt); }
            catch { return `${currencyCode} ${amt.toFixed(2)}`; }
        };
        const orderNotes = [
            notes || '',
            `Cash on Delivery`,
            normalizedCouponCode ? `Coupon: ${normalizedCouponCode} (-${fmtAmt(couponDiscount)})` : '',
        ].filter(Boolean).join('\n');

        // ── Create Shopify Checkout ──────────────────────────────────────────
        const checkoutResult = await createNativeCodCheckout({
            shop,
            customer: {
                firstName,
                lastName,
                email: customerEmail || '',
                phone: formattedPhone || customerPhone || '',
                address1: customerAddress || '',
                city: customerCity || '',
                province: customerState || '',
                country: customerCountry || '',
                zip: customerZipcode || '',
            },
            lineItems: storefrontLineItems,
            totalOrderValue,
            currency: currencyCode,
            notes: orderNotes,
            couponCode: normalizedCouponCode || undefined,
            shippingPrice: pricing.shippingPrice,
            shippingTitle: pricing.shippingTitle,
            originalTotalBeforeDiscount: pricing.originalTotal,
            detectedCountry: data.detectedCountry,
            codFeeAmount: pricing.codFeeAmount,
        });

        const nativeCodRef = checkoutResult.partialPaymentReference;

        // ── Non-blocking DB log ──────────────────────────────────────────────
        Promise.resolve(
            logOrder({
                shop_domain: shop,
                customer_name: nameStr,
                customer_phone: customerPhone || '',
                customer_address: customerAddress || '',
                customer_email: customerEmail || '',
                notes: orderNotes,
                city: customerCity || '',
                state: customerState || '',
                pincode: customerZipcode || '',
                product_id: productId || variantId,
                product_title: productTitle || 'Product',
                variant_id: variantId,
                quantity: parseInt(quantity) || 1,
                price: String(price),
                shipping_label: data.shippingLabel || '',
                shipping_price: parseFloat(shippingPrice) || 0,
                coupon_code: normalizedCouponCode || undefined,
                discount_amount: couponDiscount || undefined,
                original_total: pricing.originalTotal,
                final_total: totalOrderValue,
                currency: currencyCode,
                is_full_prepaid: false,
                is_partial_cod: false,
                payment_method: 'native_cod' as any,
                order_payload: {
                    ...data,
                    checkout_id: checkoutResult.checkoutId,
                    checkout_url: checkoutResult.checkoutUrl,
                    discount_code: checkoutResult.discountCode,
                    couponCode: normalizedCouponCode || '',
                    discountAmount: couponDiscount,
                    originalTotal: pricing.originalTotal,
                    finalTotal: totalOrderValue,
                },
            })
        ).catch(() => {});

        // ── Non-blocking Google Sheets sync ────────────────────────────────
        syncOrderToGoogleSheets(shop, {
            orderId: nativeCodRef,
            orderName: nativeCodRef,
            customerName: nameStr,
            phone: customerPhone || '',
            email: customerEmail || '',
            address: customerAddress || '',
            city: customerCity || '',
            state: customerState || '',
            pincode: customerZipcode || '',
            product: productTitle || 'Product',
            quantity: parseInt(quantity) || 1,
            totalPrice: totalOrderValue.toString(),
            paymentMethod: 'full_cod',
            status: 'checkout_pending',
        }).catch(() => {});

        return new Response(JSON.stringify({
            success: true,
            checkoutUrl: checkoutResult.checkoutUrl,
            partialPaymentReference: nativeCodRef,
            discountCode: checkoutResult.discountCode,
            discountExpiresAt: checkoutResult.discountExpiresAt,
        }), { headers: corsHeaders });

    } catch (error: any) {
        console.error('[Proxy Native COD] ❌ Unexpected error:', error?.message);
        return new Response(JSON.stringify({
            success: false,
            error: error.message || 'Unable to create checkout. Please try again.',
        }), { status: 200, headers: corsHeaders });
    }
}
