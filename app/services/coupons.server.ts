import { getFormSettings, supabase } from "../config/supabase.server";
import { unauthenticated } from "../shopify.server";

export interface ResolvedCoupon {
    code: string;
    type: "percentage" | "fixed";
    value: number;
    min_order_value?: number;
    max_discount?: number;
    usage_limit?: number;
    enabled: boolean;
    source?: "shopify";
    applies_to_entitled_items_only?: boolean;
    eligible_subtotal?: number;
    shopify_price_rule_id?: string;
}

export interface CouponValidationSuccess {
    valid: true;
    coupon: ResolvedCoupon;
    discount: number;
    finalTotal: number;
    originalTotal: number;
    codFeeAmount: number;
    codFeeName: string;
    message: string;
}

export interface CouponValidationFailure {
    valid: false;
    message: string;
}

export type CouponValidationResult = CouponValidationSuccess | CouponValidationFailure;

export interface OrderDiscountItem {
    productId?: string;
    variantId?: string;
    price: number;
    quantity: number;
}

export interface OrderPricingSummary {
    mainItemsSubtotal: number;
    bundleDiscountAmount: number;
    merchandiseTotal: number;
    shippingPrice: number;
    shippingTitle: string;
    upsellTotal: number;
    originalTotal: number;
    codFeeAmount: number;
    codFeeName: string;
    discountItems: OrderDiscountItem[];
}

interface DiscountSelection {
    allItems: boolean;
    productIds: string[];
    variantIds: string[];
    collectionIds: string[];
}

interface DiscountRequirement {
    minimumSubtotal?: number;
    minimumQuantity?: number;
}

function roundCurrency(value: number) {
    return Math.max(0, Math.round((value + Number.EPSILON) * 100) / 100);
}

export function normalizeCouponCode(code: string) {
    return String(code || "").trim().toUpperCase();
}

function normalizeShopifyId(id: unknown) {
    const value = String(id || "").trim();
    return value ? value.split("/").pop() || value : "";
}

function idsMatch(a: unknown, b: unknown) {
    const normalizedA = normalizeShopifyId(a);
    const normalizedB = normalizeShopifyId(b);
    return !!normalizedA && !!normalizedB && normalizedA === normalizedB;
}

function toShopifyGid(resource: "Product" | "ProductVariant", id: unknown) {
    const raw = String(id || "").trim();
    if (!raw) return "";
    if (raw.startsWith("gid://")) return raw;
    const normalized = normalizeShopifyId(raw);
    return normalized ? `gid://shopify/${resource}/${normalized}` : "";
}

function getConnectionNodes(connection: any): any[] {
    if (Array.isArray(connection?.nodes)) return connection.nodes;
    if (Array.isArray(connection?.edges)) {
        return connection.edges.map((edge: any) => edge?.node).filter(Boolean);
    }
    return [];
}

function getOrderMerchandiseQuantity(discountItems: OrderDiscountItem[]) {
    return discountItems.reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0), 0);
}

function getDiscountRequirement(requirementNode: any): DiscountRequirement {
    if (!requirementNode) return {};

    const minimumSubtotal = Number(
        requirementNode?.greaterThanOrEqualToSubtotal?.amount ??
        requirementNode?.greaterThanOrEqualToSubtotal ??
        0
    );
    const minimumQuantity = Number(requirementNode?.greaterThanOrEqualToQuantity || 0);

    return {
        minimumSubtotal: minimumSubtotal > 0 ? roundCurrency(minimumSubtotal) : undefined,
        minimumQuantity: minimumQuantity > 0 ? minimumQuantity : undefined,
    };
}

function getDiscountSelection(selectionNode: any): DiscountSelection {
    if (!selectionNode) {
        return { allItems: true, productIds: [], variantIds: [], collectionIds: [] };
    }

    return {
        allItems: Boolean(selectionNode?.allItems),
        productIds: getConnectionNodes(selectionNode?.products).map((node) => String(node?.id || "")).filter(Boolean),
        variantIds: getConnectionNodes(selectionNode?.productVariants).map((node) => String(node?.id || "")).filter(Boolean),
        collectionIds: getConnectionNodes(selectionNode?.collections).map((node) => String(node?.id || "")).filter(Boolean),
    };
}

function filterEligibleDiscountItems(
    discountItems: OrderDiscountItem[],
    selection: DiscountSelection,
    productCollectionMap?: Map<string, string[]>,
) {
    if (selection.allItems || (
        selection.productIds.length === 0 &&
        selection.variantIds.length === 0 &&
        selection.collectionIds.length === 0
    )) {
        return discountItems;
    }

    return discountItems.filter((item) => {
        const matchesProduct = selection.productIds.some((id) => idsMatch(id, item.productId));
        const matchesVariant = selection.variantIds.some((id) => idsMatch(id, item.variantId));
        const itemProductId = normalizeShopifyId(item.productId);
        const itemCollections = itemProductId ? (productCollectionMap?.get(itemProductId) || []) : [];
        const matchesCollection = selection.collectionIds.some((id) =>
            itemCollections.some((collectionId) => idsMatch(id, collectionId))
        );

        return matchesProduct || matchesVariant || matchesCollection;
    });
}

export function getCouponFieldState(settings: { fields?: Array<{ id: string; visible?: boolean; order?: number }>; enable_coupon_field?: boolean | null; coupon_field_position?: number | null } | null | undefined) {
    const couponField = Array.isArray(settings?.fields)
        ? settings!.fields!.find((field) => field.id === "coupon")
        : null;

    return {
        enabled: settings?.enable_coupon_field ?? couponField?.visible ?? false,
        position: settings?.coupon_field_position ?? couponField?.order ?? 13,
    };
}

function buildOrderDiscountItems(body: any): OrderDiscountItem[] {
    const items: OrderDiscountItem[] = [];
    const quantity = Math.max(1, parseInt(String(body?.quantity || 1), 10) || 1);
    const discountMultiplier = Math.max(0, 1 - (Math.max(0, Number(body?.discountPercent) || 0) / 100));
    
    const cartItems = Array.isArray(body?.cart_items) && body.cart_items.length > 0
        ? body.cart_items
        : null;

    const bundleVariants = Array.isArray(body?.bundleVariants) && body.bundleVariants.length > 1
        ? body.bundleVariants
        : null;

    if (cartItems) {
        cartItems.forEach((item: any) => {
            items.push({
                productId: item?.productId,
                variantId: item?.variantId,
                price: roundCurrency((Number(item?.price) || 0) * discountMultiplier),
                quantity: Math.max(1, parseInt(String(item?.quantity || 1), 10) || 1),
            });
        });
    } else if (bundleVariants) {
        bundleVariants.forEach((variant: any) => {
            items.push({
                productId: body?.productId,
                variantId: variant?.variantId,
                price: roundCurrency((Number(variant?.price) || 0) * discountMultiplier),
                quantity: Math.max(1, parseInt(String(variant?.quantity || 1), 10) || 1),
            });
        });
    } else {
        items.push({
            productId: body?.productId,
            variantId: body?.variantId,
            price: roundCurrency((Number(body?.price) || 0) * discountMultiplier),
            quantity,
        });
    }

    (Array.isArray(body?.upsell_items) ? body.upsell_items : []).forEach((item: any) => {
        items.push({
            productId: item?.product_id,
            variantId: item?.variant_id,
            price: roundCurrency(Number(item?.price) || 0),
            quantity: Math.max(1, parseInt(String(item?.quantity || 1), 10) || 1),
        });
    });

    return items;
}

const SHOPIFY_CODE_DISCOUNT_QUERY = `#graphql
query CodeDiscountNodeByCode($code: String!) {
  codeDiscountNodeByCode(code: $code) {
    id
    codeDiscount {
      __typename
      ... on DiscountCodeBasic {
        title
        status
        usageLimit
        appliesOncePerCustomer
        asyncUsageCount
        startsAt
        endsAt
        customerGets {
          value {
            __typename
            ... on DiscountPercentage {
              percentage
            }
            ... on DiscountAmount {
              amount {
                amount
              }
              appliesOnEachItem
            }
          }
          items {
            __typename
            ... on AllDiscountItems {
              allItems
            }
            ... on DiscountProducts {
              products(first: 100) {
                nodes {
                  id
                }
              }
              productVariants(first: 100) {
                nodes {
                  id
                }
              }
            }
            ... on DiscountCollections {
              collections(first: 100) {
                nodes {
                  id
                }
              }
            }
          }
        }
        minimumRequirement {
          __typename
          ... on DiscountMinimumSubtotal {
            greaterThanOrEqualToSubtotal {
              amount
            }
          }
          ... on DiscountMinimumQuantity {
            greaterThanOrEqualToQuantity
          }
        }
      }
      ... on DiscountCodeFreeShipping {
        title
        status
        usageLimit
        appliesOncePerCustomer
        asyncUsageCount
        startsAt
        endsAt
        minimumRequirement {
          __typename
          ... on DiscountMinimumSubtotal {
            greaterThanOrEqualToSubtotal {
              amount
            }
          }
          ... on DiscountMinimumQuantity {
            greaterThanOrEqualToQuantity
          }
        }
      }
    }
  }
}`;

const SHOPIFY_LEGACY_CODE_DISCOUNT_QUERY = `#graphql
query LegacyCodeDiscountNodeByCode($code: String!) {
  discountCodeNodeByCode(code: $code) {
    id
    discountCode {
      __typename
      ... on DiscountCodeBasic {
        title
        status
        usageLimit
        appliesOncePerCustomer
        asyncUsageCount
        startsAt
        endsAt
        customerGets {
          value {
            __typename
            ... on DiscountPercentage {
              percentage
            }
            ... on DiscountAmount {
              amount {
                amount
              }
              appliesOnEachItem
            }
          }
          items {
            __typename
            ... on AllDiscountItems {
              allItems
            }
            ... on DiscountProducts {
              products(first: 100) {
                nodes {
                  id
                }
              }
              productVariants(first: 100) {
                nodes {
                  id
                }
              }
            }
            ... on DiscountCollections {
              collections(first: 100) {
                nodes {
                  id
                }
              }
            }
          }
        }
        minimumRequirement {
          __typename
          ... on DiscountMinimumSubtotal {
            greaterThanOrEqualToSubtotal {
              amount
            }
          }
          ... on DiscountMinimumQuantity {
            greaterThanOrEqualToQuantity
          }
        }
      }
      ... on DiscountCodeFreeShipping {
        title
        status
        usageLimit
        appliesOncePerCustomer
        asyncUsageCount
        startsAt
        endsAt
        minimumRequirement {
          __typename
          ... on DiscountMinimumSubtotal {
            greaterThanOrEqualToSubtotal {
              amount
            }
          }
          ... on DiscountMinimumQuantity {
            greaterThanOrEqualToQuantity
          }
        }
      }
    }
  }
}`;

const SHOPIFY_PRODUCT_COLLECTIONS_QUERY = `#graphql
query ProductCollections($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on Product {
      id
      collections(first: 100) {
        nodes {
          id
        }
      }
    }
  }
}`;

async function fetchCodeDiscountNodeByCode(shop: string, couponCode: string) {
    let admin: any;
    try {
        const t_admin = performance.now();
        const result = await unauthenticated.admin(shop);
        console.log(`[PERF] unauthenticated.admin(shop) in validateCouponForShop: ${performance.now() - t_admin}ms`);
        admin = result.admin;
    } catch (err: any) {
        console.error("❌ [Coupons] Failed to get admin client for shop:", shop, err?.message);
        throw new Error("DISCOUNT_FETCH_FAILED");
    }

    const attempts = [
        { fieldName: "codeDiscountNodeByCode", query: SHOPIFY_CODE_DISCOUNT_QUERY, valueKey: "codeDiscount" },
        { fieldName: "discountCodeNodeByCode", query: SHOPIFY_LEGACY_CODE_DISCOUNT_QUERY, valueKey: "discountCode" },
    ];

    let lastError: any = null;

    for (const attempt of attempts) {
        try {
            const t_gql = performance.now();
            const response = await admin.graphql(attempt.query, { variables: { code: couponCode } });
            console.log(`[PERF] ${attempt.fieldName} GraphQL duration: ${performance.now() - t_gql}ms`);
            const payload = await response.json();
            if (payload?.errors?.length) {
                const errMsg = payload.errors.map((error: any) => error.message).join("; ");
                console.error(`❌ [Coupons] GraphQL ${attempt.fieldName} errors:`, errMsg);
                lastError = new Error(errMsg);
                continue;
            }
            const node = payload?.data?.[attempt.fieldName];
            const discount = node?.[attempt.valueKey];
            if (node && discount) {
                console.log(`🎟 [Coupons] Found discount via ${attempt.fieldName}:`, discount?.__typename, "status:", discount?.status);
                return { node, discount };
            }
            // Node is null — code not found via this query, try next
            console.log(`[Coupons] ${attempt.fieldName} returned null for code: ${couponCode}`);
        } catch (error: any) {
            const errorMessage = String(error?.message || "");
            // If it's an access scope issue, log it loudly and throw
            if (errorMessage.includes("access") || errorMessage.includes("scope") || errorMessage.includes("permission") || errorMessage.includes("denied")) {
                console.error("❌ [Coupons] ACCESS DENIED — missing read_discounts scope?", { shop, code: couponCode, error: errorMessage });
                throw new Error("DISCOUNT_FETCH_FAILED");
            }
            console.error(`❌ [Coupons] GraphQL ${attempt.fieldName} lookup failed:`, { shop, code: couponCode, error: errorMessage });
            lastError = error;
        }
    }

    // If we had errors (not just "not found"), propagate them
    if (lastError) {
        console.error("❌ [Coupons] All GraphQL lookups failed for code:", couponCode, lastError?.message);
        throw new Error("DISCOUNT_FETCH_FAILED");
    }

    // No errors but code not found in either query
    console.log(`[Coupons] Discount code '${couponCode}' not found via GraphQL`);
    return null;
}

async function getProductCollectionMap(shop: string, productIds: Array<string | undefined>) {
    const normalizedIds = Array.from(new Set(
        productIds
            .map((id) => toShopifyGid("Product", id))
            .filter(Boolean)
    ));

    if (normalizedIds.length === 0) {
        return new Map<string, string[]>();
    }

    try {
        const t_admin = performance.now();
        const { admin } = await unauthenticated.admin(shop);
        console.log(`[PERF] unauthenticated.admin(shop) in getProductCollectionMap: ${performance.now() - t_admin}ms`);
        
        const t_gql = performance.now();
        const response = await admin.graphql(SHOPIFY_PRODUCT_COLLECTIONS_QUERY, {
            variables: { ids: normalizedIds },
        });
        console.log(`[PERF] ProductCollections GraphQL duration: ${performance.now() - t_gql}ms`);
        const payload: any = await response.json();
        if (payload?.errors?.length) {
            throw new Error(payload.errors.map((error: any) => error.message).join("; "));
        }

        const result = new Map<string, string[]>();
        (payload?.data?.nodes || []).forEach((node: any) => {
            const productId = normalizeShopifyId(node?.id);
            if (!productId) return;
            result.set(
                productId,
                getConnectionNodes(node?.collections).map((collection: any) => String(collection?.id || "")).filter(Boolean),
            );
        });

        return result;
    } catch (error) {
        console.error("[Coupons] Failed to load product collections:", error);
        return new Map<string, string[]>();
    }
}

async function countCustomerCouponUsage(shop: string, couponCode: string, orderContext?: any) {
    const email = String(orderContext?.customerEmail || orderContext?.customer_email || "").trim();
    const phone = String(orderContext?.customerPhone || orderContext?.customer_phone || "").trim();

    if (!email && !phone) {
        return 0;
    }

    let query = supabase
        .from("order_logs")
        .select("*", { count: "exact", head: true })
        .eq("shop_domain", shop)
        .eq("coupon_code", normalizeCouponCode(couponCode));

    if (email) {
        query = query.ilike("customer_email", email);
    } else if (phone) {
        query = query.eq("customer_phone", phone);
    }

    const { count, error } = await query;
    if (error) {
        console.error("[Coupons] Failed to count per-customer coupon usage:", error);
        return 0;
    }

    return count || 0;
}

async function getShopifyGraphqlCoupon(
    shop: string,
    couponCode: string,
    pricing: OrderPricingSummary,
    orderContext?: any,
): Promise<CouponValidationResult | null> {
    try {
        const payload = await fetchCodeDiscountNodeByCode(shop, couponCode);
        if (!payload?.discount) {
            return null;
        }

        const discountNode = payload.discount;
        const discountType = String(discountNode?.__typename || "");
        const now = Date.now();
        const startsAt = discountNode?.startsAt ? new Date(discountNode.startsAt).getTime() : null;
        const endsAt = discountNode?.endsAt ? new Date(discountNode.endsAt).getTime() : null;
        const status = String(discountNode?.status || "").toUpperCase();

        console.log("🎟 [Coupons] Validating discount:", {
            code: couponCode,
            type: discountType,
            status,
            startsAt: discountNode?.startsAt,
            endsAt: discountNode?.endsAt,
            merchandiseTotal: pricing.merchandiseTotal,
            originalTotal: pricing.originalTotal,
            codFeeAmount: pricing.codFeeAmount,
            codFeeName: pricing.codFeeName,
        });

        if (status && status !== "ACTIVE") {
            return { valid: false, message: "Coupon is not active" };
        }
        if (startsAt && now < startsAt) {
            return { valid: false, message: "Coupon is not active yet" };
        }
        if (endsAt && now > endsAt) {
            return { valid: false, message: "Coupon has expired" };
        }

        const usageLimit = Number(discountNode?.usageLimit || 0);
        const usageCount = Number(discountNode?.asyncUsageCount || 0);
        if (usageLimit > 0 && usageCount >= usageLimit) {
            return { valid: false, message: "Coupon usage limit reached" };
        }

        if (discountNode?.appliesOncePerCustomer) {
            const customerUsageCount = await countCustomerCouponUsage(shop, couponCode, orderContext);
            if (customerUsageCount > 0) {
                return { valid: false, message: "Coupon already used by this customer" };
            }
        }

        const requirement = getDiscountRequirement(discountNode?.minimumRequirement);
        if (requirement.minimumSubtotal && pricing.merchandiseTotal < requirement.minimumSubtotal) {
            return {
                valid: false,
                message: `Minimum order value is ${roundCurrency(requirement.minimumSubtotal).toFixed(2)}`,
            };
        }
        if (requirement.minimumQuantity && getOrderMerchandiseQuantity(pricing.discountItems) < requirement.minimumQuantity) {
            return {
                valid: false,
                message: `Minimum quantity is ${requirement.minimumQuantity}`,
            };
        }

        // ── Handle DiscountCodeFreeShipping ──
        if (discountType === "DiscountCodeFreeShipping") {
            const shippingDiscount = Math.min(roundCurrency(pricing.shippingPrice), roundCurrency(pricing.originalTotal));
            console.log("🎟 [Coupons] Free shipping discount:", shippingDiscount);
            return {
                valid: true,
                coupon: {
                    code: couponCode,
                    type: "fixed",
                    value: shippingDiscount,
                    enabled: true,
                    min_order_value: requirement.minimumSubtotal,
                    usage_limit: usageLimit || undefined,
                    source: "shopify",
                },
                discount: shippingDiscount,
                originalTotal: roundCurrency(pricing.originalTotal),
                finalTotal: roundCurrency(pricing.originalTotal - shippingDiscount),
                codFeeAmount: pricing.codFeeAmount,
                codFeeName: pricing.codFeeName,
                message: shippingDiscount > 0 ? "Free shipping applied" : "Coupon applied",
            };
        }

        // ── Handle DiscountCodeBxgy (Buy X Get Y) — not supported in COD ──
        if (discountType === "DiscountCodeBxgy") {
            console.log("🎟 [Coupons] BXGY discount not supported in COD:", couponCode);
            return { valid: false, message: "Buy X Get Y discounts are not supported in COD form" };
        }

        // ── Handle DiscountCodeBasic (percentage / fixed amount off products) ──
        if (discountType !== "DiscountCodeBasic") {
            console.warn("🎟 [Coupons] Unknown discount type:", discountType, "for code:", couponCode);
            return { valid: false, message: "This Shopify discount type is not supported in COD" };
        }

        const selection = getDiscountSelection(discountNode?.customerGets?.items);
        const requiresCollections = selection.collectionIds.length > 0;
        const productCollectionMap = requiresCollections
            ? await getProductCollectionMap(shop, pricing.discountItems.map((item) => item.productId))
            : new Map<string, string[]>();
        const eligibleItems = filterEligibleDiscountItems(pricing.discountItems, selection, productCollectionMap);
        const eligibleSubtotal = roundCurrency(
            eligibleItems.reduce((sum, item) => sum + (item.price * item.quantity), 0)
        );
        const eligibleQuantity = getOrderMerchandiseQuantity(eligibleItems);

        console.log("🎟 [Coupons] Product eligibility:", {
            allItems: selection.allItems,
            productIds: selection.productIds.length,
            variantIds: selection.variantIds.length,
            collectionIds: selection.collectionIds.length,
            cartItems: pricing.discountItems.length,
            eligibleItems: eligibleItems.length,
            eligibleSubtotal,
        });

        if (!selection.allItems && eligibleSubtotal <= 0) {
            return { valid: false, message: "Coupon not applicable for these products" };
        }

        const valueNode = discountNode?.customerGets?.value;
        let discount = 0;
        let resolvedCoupon: ResolvedCoupon | null = null;

        if (valueNode?.__typename === "DiscountPercentage") {
            // Shopify returns percentage as a decimal: 0.1 = 10%, 0.5 = 50%
            const rawPercentage = Math.abs(Number(valueNode?.percentage || 0));
            const percentage = rawPercentage <= 1 ? rawPercentage * 100 : rawPercentage;
            discount = (eligibleSubtotal * percentage) / 100;
            console.log("🎟 [Coupons] Percentage discount:", { rawPercentage, percentage, eligibleSubtotal, discount });
            resolvedCoupon = {
                code: couponCode,
                type: "percentage",
                value: percentage,
                enabled: true,
                min_order_value: requirement.minimumSubtotal,
                usage_limit: usageLimit || undefined,
                source: "shopify",
                applies_to_entitled_items_only: !selection.allItems,
                eligible_subtotal: eligibleSubtotal,
            };
        } else if (valueNode?.__typename === "DiscountAmount") {
            const amount = Math.abs(Number(valueNode?.amount?.amount || 0));
            discount = valueNode?.appliesOnEachItem ? amount * eligibleQuantity : amount;
            console.log("🎟 [Coupons] Fixed amount discount:", { amount, appliesOnEachItem: valueNode?.appliesOnEachItem, eligibleQuantity, discount });
            resolvedCoupon = {
                code: couponCode,
                type: "fixed",
                value: amount,
                enabled: true,
                min_order_value: requirement.minimumSubtotal,
                usage_limit: usageLimit || undefined,
                source: "shopify",
                applies_to_entitled_items_only: !selection.allItems,
                eligible_subtotal: eligibleSubtotal,
            };
        }

        if (!resolvedCoupon) {
            console.warn("🎟 [Coupons] Unsupported value type:", valueNode?.__typename);
            return { valid: false, message: "This Shopify discount value is not supported in COD" };
        }

        discount = Math.min(roundCurrency(discount), eligibleSubtotal, roundCurrency(pricing.originalTotal));

        console.log("🎟 [Coupons] ✅ Coupon validated:", {
            code: couponCode,
            discount,
            originalTotal: roundCurrency(pricing.originalTotal),
            finalTotal: roundCurrency(pricing.originalTotal - discount),
        });

        return {
            valid: true,
            coupon: resolvedCoupon,
            discount,
            originalTotal: roundCurrency(pricing.originalTotal),
            finalTotal: roundCurrency(pricing.originalTotal - discount),
            codFeeAmount: pricing.codFeeAmount,
            codFeeName: pricing.codFeeName,
            message: "Coupon applied",
        };
    } catch (error: any) {
        // Propagate DISCOUNT_FETCH_FAILED so validateCouponForShop can distinguish it
        if (error?.message === "DISCOUNT_FETCH_FAILED") {
            throw error;
        }
        console.error("❌ [Coupons] GraphQL discount lookup failed:", error?.message, error);
        return null;
    }
}

export async function validateCouponForShop(shop: string, couponCode: string, cartTotal: number, orderContext?: any): Promise<CouponValidationResult> {
    const normalizedCode = normalizeCouponCode(couponCode);
    if (!shop || !normalizedCode) {
        return { valid: false, message: "Coupon code is required" };
    }

    const settings = await getFormSettings(shop);
    const couponField = getCouponFieldState(settings);
    if (!couponField.enabled) {
        return { valid: false, message: "Coupons are not enabled for this shop" };
    }

    const normalizedCartTotal = roundCurrency(cartTotal);
    if (normalizedCartTotal <= 0) {
        return { valid: false, message: "Cart total must be greater than zero" };
    }

    const pricing = calculateOrderPricing(orderContext || {});

    console.log("🎟 [Coupons] Starting validation:", {
        shop,
        code: normalizedCode,
        cartTotal: normalizedCartTotal,
        merchandiseTotal: pricing.merchandiseTotal,
        originalTotal: pricing.originalTotal,
        codFeeAmount: pricing.codFeeAmount,
        codFeeName: pricing.codFeeName,
        itemCount: pricing.discountItems.length,
        items: pricing.discountItems.map(i => ({ productId: i.productId, variantId: i.variantId, price: i.price, qty: i.quantity })),
    });

    // ── Try GraphQL discount lookup (primary) ──
    try {
        const graphqlCoupon = await getShopifyGraphqlCoupon(
            shop,
            normalizedCode,
            pricing,
            orderContext,
        );
        if (graphqlCoupon) {
            return graphqlCoupon;
        }
    } catch (error: any) {
        if (error?.message === "DISCOUNT_FETCH_FAILED") {
            console.error("❌ [Coupons] Discount fetch failed — possible missing read_discounts scope");
            return { valid: false, message: "Coupon system temporarily unavailable. Please try again." };
        }
        console.error("❌ [Coupons] Unexpected error in GraphQL coupon lookup:", error?.message);
    }












    console.log("🎟 [Coupons] ❌ Coupon not found in GraphQL:", normalizedCode);
    return { valid: false, message: "Invalid or expired coupon" };
}

export function calculateOrderPricing(body: any, formSettings?: any): OrderPricingSummary {
    const discountItems = buildOrderDiscountItems(body);
    const shippingPrice = roundCurrency(Number(body?.shippingPrice) || 0);
    const shippingTitle = String(body?.shippingTitle || body?.shippingLabel || "Shipping");
    const discountPercent = Math.max(0, Number(body?.discountPercent) || 0);
    const quantity = Math.max(1, parseInt(String(body?.quantity || 1), 10) || 1);
    
    const cartItems = Array.isArray(body?.cart_items) && body.cart_items.length > 0
        ? body.cart_items
        : null;

    const bundleVariants = Array.isArray(body?.bundleVariants) && body.bundleVariants.length > 1
        ? body.bundleVariants
        : null;

    let mainItemsSubtotal = 0;
    let bundleDiscountAmount = 0;

    if (cartItems) {
        cartItems.forEach((item: any) => {
            const itemQuantity = Math.max(1, parseInt(String(item?.quantity || 1), 10) || 1);
            const itemPrice = Number(item?.price) || 0;
            const rawLineTotal = itemPrice * itemQuantity;
            mainItemsSubtotal += rawLineTotal;
            bundleDiscountAmount += rawLineTotal * (discountPercent / 100);
        });
    } else if (bundleVariants) {
        bundleVariants.forEach((variant: any) => {
            const variantQuantity = Math.max(1, parseInt(String(variant?.quantity || 1), 10) || 1);
            const variantPrice = Number(variant?.price) || 0;
            const rawLineTotal = variantPrice * variantQuantity;
            mainItemsSubtotal += rawLineTotal;
            bundleDiscountAmount += rawLineTotal * (discountPercent / 100);
        });
    } else {
        const unitPrice = Number(body?.price) || 0;
        mainItemsSubtotal = unitPrice * quantity;
        bundleDiscountAmount = mainItemsSubtotal * (discountPercent / 100);
    }

    mainItemsSubtotal = roundCurrency(mainItemsSubtotal);
    bundleDiscountAmount = roundCurrency(bundleDiscountAmount);

    const upsellTotal = roundCurrency(
        (Array.isArray(body?.upsell_items) ? body.upsell_items : []).reduce((sum: number, item: any) => {
            const itemPrice = Number(item?.price) || 0;
            const itemQuantity = Math.max(1, parseInt(String(item?.quantity || 1), 10) || 1);
            return sum + (itemPrice * itemQuantity);
        }, 0)
    );

    const merchandiseTotal = roundCurrency(mainItemsSubtotal - bundleDiscountAmount + upsellTotal);

    // Rely on the frontend's calculation for COD fee to ensure it matches checkout exact amounts post-coupon
    let codFeeAmount = Number(body?.codFeeAmount) || Number(body?.pureCodFeeAmount) || 0;
    let codFeeName = String(body?.codFeeName || formSettings?.pure_cod_fee_name || "COD Fee");

    // Fallback if frontend didn't pass it (older clients)
    if (codFeeAmount === 0 && formSettings?.pure_cod_fee_enabled && formSettings?.pure_cod_fee_amount > 0) {
        if (formSettings.pure_cod_fee_type === "percentage") {
            codFeeAmount = ((merchandiseTotal + shippingPrice) * formSettings.pure_cod_fee_amount) / 100;
        } else {
            codFeeAmount = formSettings.pure_cod_fee_amount;
        }
    }

    codFeeAmount = roundCurrency(codFeeAmount);
    const originalTotal = roundCurrency(merchandiseTotal + shippingPrice + codFeeAmount);

    console.log('[COD DEBUG] Pricing Result', {
        codFeeAmount,
        codFeeName,
        merchandiseTotal,
        shippingPrice,
        originalTotal,
    });

    return {
        mainItemsSubtotal,
        bundleDiscountAmount,
        merchandiseTotal,
        shippingPrice,
        shippingTitle,
        upsellTotal,
        originalTotal,
        codFeeAmount,
        codFeeName,
        discountItems,
    };
}
