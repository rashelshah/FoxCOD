/**
 * Contextual Pricing Service
 *
 * This is the SINGLE SOURCE OF TRUTH for all pricing in FoxCOD.
 *
 * Key design decisions:
 *
 * 1. BACKEND IS AUTHORITY — currency is NEVER read from frontend payload.
 *    `data.currency` from the widget is untrusted; the market currency is
 *    always derived from the contextualPricing GraphQL response.
 *
 * 2. PRICE TAMPER GUARD — frontend prices are compared against server-fetched
 *    contextual prices. Divergence > PRICE_TOLERANCE triggers a correction and
 *    a [FOXCOD PRICE TAMPER] warning log.
 *
 * 3. PRICING CONSISTENCY GUARD — widget total vs server-calculated total is
 *    compared before every Draft Order creation. Divergence triggers a
 *    [FOXCOD PRICE MISMATCH] warning log.
 *
 * 4. AGGRESSIVE CACHING:
 *    - Primary market country: 24-hour TTL (changes only when merchant reconfigures)
 *    - Contextual prices:       5-minute TTL (can change during sales/flash events)
 */

import { unauthenticated } from '../shopify.server';

// ─── Cache TTLs ───────────────────────────────────────────────────────────────

const PRIMARY_MARKET_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours — primary market rarely changes
const CONTEXTUAL_PRICE_CACHE_TTL_MS = 5 * 60 * 1000;     // 5 minutes — prices can change during sales

/**
 * Threshold for flagging a price as potentially tampered.
 * 1% allows for minor floating-point rounding in themes while catching
 * deliberate manipulation.
 */
const PRICE_TOLERANCE = 0.01; // 1%

// ─── Cache Stores ─────────────────────────────────────────────────────────────

interface CacheEntry<T> {
    value: T;
    expiresAt: number;
}

const _primaryMarketCache = new Map<string, CacheEntry<string | null>>();
const _storeCurrencyCache = new Map<string, CacheEntry<string>>();
const _contextualPriceCache = new Map<string, CacheEntry<ContextualPriceResult>>();

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ContextualPriceEntry {
    amount: number;
    currencyCode: string;
}

export interface ContextualPriceResult {
    /** Map from numeric variant ID string → contextual price */
    prices: Map<string, ContextualPriceEntry>;
    /** The market currency code (e.g. "INR", "AED", "GBP") — BACKEND AUTHORITY */
    currencyCode: string;
    /** The shop's own store currency (for debug logging) */
    storeCurrency: string;
    /** The country that was used for this pricing lookup */
    resolvedCountry: string;
}

export interface CountryResolutionInput {
    /** From shipping address — highest priority */
    customerCountry?: string | null;
    /** From Shopify's storefront detection — second priority */
    detectedCountry?: string | null;
    /** Shop domain — used to fetch primary market as final fallback */
    shop: string;
}

// ─── GraphQL Queries ──────────────────────────────────────────────────────────

const GET_CONTEXTUAL_PRICES_QUERY = `#graphql
  query GetContextualPrices($ids: [ID!]!, $country: CountryCode!) {
    nodes(ids: $ids) {
      ... on ProductVariant {
        id
        contextualPricing(context: { country: $country }) {
          price {
            amount
            currencyCode
          }
        }
      }
    }
  }
`;

const GET_SHOP_PRIMARY_MARKET_QUERY = `#graphql
  query GetShopPrimaryMarket {
    shop {
      currencyCode
      billingAddress {
        countryCodeV2
      }
    }
  }
`;

// ─── Country Resolution ───────────────────────────────────────────────────────

/**
 * Fetch and cache the shop's primary market country code.
 * Cached for 24 hours since primary market changes are extremely rare.
 */
async function getShopPrimaryMarketCountry(shop: string): Promise<string | null> {
    const now = Date.now();
    const cached = _primaryMarketCache.get(shop);
    if (cached && cached.expiresAt > now) return cached.value;

    try {
        const { admin } = await unauthenticated.admin(shop);
        const response = await admin.graphql(GET_SHOP_PRIMARY_MARKET_QUERY);
        const data = (await response.json()) as any;

        const countryCode: string | null = data?.data?.shop?.billingAddress?.countryCodeV2 || null;

        const storeCurrency: string = data?.data?.shop?.currencyCode || 'USD';

        _primaryMarketCache.set(shop, {
            value: countryCode,
            expiresAt: now + PRIMARY_MARKET_CACHE_TTL_MS,
        });
        _storeCurrencyCache.set(shop, {
            value: storeCurrency,
            expiresAt: now + PRIMARY_MARKET_CACHE_TTL_MS,
        });

        console.log(`[ContextualPricing] Primary market country for ${shop}: ${countryCode} (store currency: ${storeCurrency})`);
        return countryCode;
    } catch (err: any) {
        console.error(`[ContextualPricing] Failed to fetch primary market for ${shop}:`, err?.message);
        _primaryMarketCache.set(shop, { value: null, expiresAt: now + 60_000 }); // short retry on error
        return null;
    }
}

/**
 * Get the shop's store currency code (cached alongside primary market).
 */
async function getShopStoreCurrency(shop: string): Promise<string> {
    const now = Date.now();
    const cached = _storeCurrencyCache.get(shop);
    if (cached && cached.expiresAt > now) return cached.value;
    // Trigger a fetch which will populate the cache
    await getShopPrimaryMarketCountry(shop);
    return _storeCurrencyCache.get(shop)?.value || 'USD';
}

/**
 * Resolve the country code to use for contextual pricing.
 *
 * Priority chain:
 *   1. Shipping address country (most precise — customer has committed to an address)
 *   2. Detected country from storefront (Shopify's geolocation)
 *   3. Shop's primary market country (safe default for merchants with a single market)
 *
 * Returns a valid ISO 3166-1 alpha-2 country code, or 'US' as a last resort.
 */
export async function resolveCountryForOrder(input: CountryResolutionInput): Promise<string> {
    // Priority 1: Shipping address country
    const shippingCountry = normalizeCountryCode(input.customerCountry);
    if (shippingCountry) {
        console.log(`[ContextualPricing] Country resolved from shipping address: ${shippingCountry}`);
        return shippingCountry;
    }

    // Priority 2: Detected country from storefront
    const detectedCountry = normalizeCountryCode(input.detectedCountry);
    if (detectedCountry) {
        console.log(`[ContextualPricing] Country resolved from detectedCountry: ${detectedCountry}`);
        return detectedCountry;
    }

    // Priority 3: Shop's primary market country
    const primaryMarketCountry = await getShopPrimaryMarketCountry(input.shop);
    if (primaryMarketCountry) {
        console.log(`[ContextualPricing] Country resolved from shop primary market: ${primaryMarketCountry}`);
        return primaryMarketCountry;
    }

    // Last resort fallback (should never reach here for a properly configured store)
    console.warn(`[ContextualPricing] Could not resolve country for ${input.shop} — using US fallback`);
    return 'US';
}

/** Normalize a raw country string to a 2-letter ISO code or return null */
function normalizeCountryCode(raw?: string | null): string | null {
    if (!raw) return null;
    const code = raw.trim().toUpperCase().slice(0, 2);
    if (/^[A-Z]{2}$/.test(code)) return code;
    return null;
}

// ─── Contextual Price Fetching ────────────────────────────────────────────────

/**
 * Fetch contextual prices for a set of variant IDs in a given market country.
 *
 * Results are cached for 5 minutes per (shop, country, variantIds) key.
 * The currency code in the result is the BACKEND AUTHORITY — it must be used
 * for presentmentCurrencyCode and priceOverride.currencyCode on draft orders.
 */
export async function getContextualPricesForVariants(
    shop: string,
    variantIds: Array<string | number | null | undefined>,
    country: string,
): Promise<ContextualPriceResult> {
    // Normalize all variant IDs to numeric strings
    const numericIds = Array.from(new Set(
        variantIds
            .map(id => String(id || '').replace(/[^0-9]/g, ''))
            .filter(id => id.length > 0)
    ));

    if (numericIds.length === 0) {
        const storeCurrency = await getShopStoreCurrency(shop);
        return {
            prices: new Map(),
            currencyCode: storeCurrency,
            storeCurrency,
            resolvedCountry: country,
        };
    }

    // Build cache key
    const cacheKey = `${shop}::${country}::${numericIds.sort().join(',')}`;
    const now = Date.now();
    const cached = _contextualPriceCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
        console.log(`[ContextualPricing] Cache hit for ${shop} / ${country} (${numericIds.length} variants)`);
        return cached.value;
    }

    const storeCurrency = await getShopStoreCurrency(shop);
    const gids = numericIds.map(id => `gid://shopify/ProductVariant/${id}`);

    try {
        const { admin } = await unauthenticated.admin(shop);
        const t0 = performance.now();
        const response = await admin.graphql(GET_CONTEXTUAL_PRICES_QUERY, {
            variables: { ids: gids, country },
        });
        console.log(`[ContextualPricing] GraphQL fetch in ${(performance.now() - t0).toFixed(0)}ms — shop: ${shop}, country: ${country}, variants: ${numericIds.length}`);

        const data = (await response.json()) as any;

        if (data?.errors?.length) {
            const msg = data.errors.map((e: any) => e.message).join('; ');
            console.error(`[ContextualPricing] GraphQL errors for ${shop}:`, msg);
            throw new Error(msg);
        }

        const prices = new Map<string, ContextualPriceEntry>();
        let dominantCurrencyCode = storeCurrency;

        (data?.data?.nodes || []).forEach((node: any) => {
            if (!node?.id) return;
            const numericId = node.id.replace(/[^0-9]/g, '');
            const priceData = node.contextualPricing?.price;
            if (!priceData) return;

            const amount = parseFloat(priceData.amount || '0');
            const currencyCode = String(priceData.currencyCode || storeCurrency);
            prices.set(numericId, { amount, currencyCode });
            dominantCurrencyCode = currencyCode; // All items in same market will have same currency
        });

        const result: ContextualPriceResult = {
            prices,
            currencyCode: dominantCurrencyCode,
            storeCurrency,
            resolvedCountry: country,
        };

        _contextualPriceCache.set(cacheKey, { value: result, expiresAt: now + CONTEXTUAL_PRICE_CACHE_TTL_MS });
        return result;
    } catch (err: any) {
        console.error(`[ContextualPricing] Failed to fetch contextual prices for ${shop} / ${country}:`, err?.message);
        // Return store currency as safe fallback — order will still be created,
        // but without market price override (better than failing the order entirely)
        return {
            prices: new Map(),
            currencyCode: storeCurrency,
            storeCurrency,
            resolvedCountry: country,
        };
    }
}

// ─── Price Tamper Guard (Change #2) ───────────────────────────────────────────

export interface PriceValidationItem {
    variantId?: string | number | null;
    price: number;
    quantity: number;
    title?: string;
    _priceWasOverridden?: boolean;
}

/**
 * Compare frontend-submitted prices against server-fetched contextual prices.
 *
 * For each line item:
 *   - If the variant has a contextual price and the frontend price diverges by more
 *     than PRICE_TOLERANCE (1%), log a [FOXCOD PRICE TAMPER] warning and correct
 *     the price to the server value.
 *   - Items without a contextual price (custom items, COD fees) are left as-is.
 *
 * Returns the (potentially corrected) items array.
 * NOTE: Prices are corrected silently to avoid false positives from theme rounding.
 *       Hard rejection can be enabled via a shop setting in a future iteration.
 */
export function validateAndRecalculatePrices(
    items: PriceValidationItem[],
    contextualPrices: Map<string, ContextualPriceEntry>,
): PriceValidationItem[] {
    if (contextualPrices.size === 0) return items;

    return items.map(item => {
        const numericId = String(item.variantId || '').replace(/[^0-9]/g, '');
        if (!numericId) return item;

        const serverEntry = contextualPrices.get(numericId);
        if (!serverEntry || serverEntry.amount <= 0) return item;

        const frontendPrice = item.price;
        const serverPrice = serverEntry.amount;
        const diff = Math.abs(frontendPrice - serverPrice);
        const tolerance = serverPrice * PRICE_TOLERANCE;

        if (diff > tolerance && diff > 0.01) {
            const diffPct = ((diff / serverPrice) * 100).toFixed(2);
            console.warn('[FOXCOD PRICE TAMPER]', {
                variantId: numericId,
                title: item.title || '(unknown)',
                frontendPrice,
                serverContextualPrice: serverPrice,
                divergence: diff.toFixed(4),
                divergencePct: `${diffPct}%`,
                action: 'corrected_to_server_price',
            });
            return { ...item, price: serverPrice, _priceWasOverridden: true };
        }

        return item;
    });
}

// ─── Pricing Consistency Guard (Change #4) ────────────────────────────────────

/**
 * Compare the widget-submitted total against the server-recalculated total.
 *
 * Logs a [FOXCOD PRICE MISMATCH] warning when divergence exceeds 1 cent.
 * Always returns the server total as the authoritative value.
 *
 * @param widgetTotal   The total as submitted by the frontend (data.finalTotal)
 * @param serverTotal   The total as recalculated by the server (pricing.originalTotal)
 * @param context       Additional context for the log (shop, country, flow type)
 * @returns             The server total (authoritative)
 */
export function assertPricingConsistency(
    widgetTotal: number | null | undefined,
    serverTotal: number,
    context: Record<string, any>,
): number {
    if (widgetTotal == null || isNaN(widgetTotal)) {
        // Widget didn't send a total — no comparison possible, use server total
        return serverTotal;
    }

    const diff = Math.abs(widgetTotal - serverTotal);
    if (diff > 0.01) {
        const diffPct = widgetTotal > 0 ? ((diff / widgetTotal) * 100).toFixed(2) : 'N/A';
        console.warn('[FOXCOD PRICE MISMATCH]', {
            widgetTotal: widgetTotal.toFixed(4),
            serverTotal: serverTotal.toFixed(4),
            diff: diff.toFixed(4),
            diffPct: `${diffPct}%`,
            authority: 'server_total',
            ...context,
        });
    }

    // Server is always the authority
    return serverTotal;
}

// ─── Convenience Helper ───────────────────────────────────────────────────────

/**
 * Convenience function that combines country resolution + contextual price fetch.
 * Use this as the single entry point in order handlers.
 */
export async function resolveContextualPricingForOrder(
    shop: string,
    variantIds: Array<string | number | null | undefined>,
    countryInput: CountryResolutionInput,
): Promise<ContextualPriceResult> {
    const country = await resolveCountryForOrder(countryInput);
    return getContextualPricesForVariants(shop, variantIds, country);
}
