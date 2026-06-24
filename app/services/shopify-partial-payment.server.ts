import { unauthenticated } from '../shopify.server';
import {
  resolveContextualPricingForOrder,
  assertPricingConsistency,
} from './contextual-pricing.server';

const DISCOUNT_PREFIX = 'FOX-PCOD-';
const DISCOUNT_TTL_MINUTES = 60; 

export interface CustomerFields {
  email?: string;
  firstName?: string;
  lastName?: string;
  address1?: string;
  address2?: string;
  city?: string;
  province?: string;
  zip?: string;
  country?: string;
  phone?: string;
}

export interface LineItemInput {
  variantId: string | number;
  productId?: string | number;
  quantity: number;
  price: number; 
  title?: string;
}

export interface PartialPaymentCheckoutParams {
  shop: string;
  customer: CustomerFields;
  lineItems: LineItemInput[];
  advanceAmount: number;
  totalOrderValue: number;
  remainingAmount: number;
  partialPaymentReference: string;
  /**
   * DEPRECATED: Do not use for presentmentCurrencyCode or priceOverride.
   * The authoritative currency is now always derived from contextual pricing.
   * This field is kept for backward compatibility with note formatting only.
   */
  currency: string;
  /** Customer's detected country from storefront (used for country resolution fallback) */
  detectedCountry?: string;
  notes?: string;
  couponCode?: string;
  shippingPrice?: number;
  shippingTitle?: string;
  codFeeAmount?: number;
  isFullPrepaid?: boolean;
  prepaidDiscountAmount?: number;
  prepaidDiscountType?: 'percentage' | 'fixed';
  prepaidDiscountValue?: number;
  originalTotalBeforeDiscount?: number;
}

export interface PartialPaymentCheckoutResult {
  checkoutId: string;
  checkoutUrl: string;
  discountCode?: string;
  discountExpiresAt?: string;
  partialPaymentReference: string;
  checkoutType: 'cart_permalink' | 'draft_order';
}

// ── Helpers ────────────────────────────────────────────────────────────────

function randomSuffix(len = 8): string {
  return Math.random().toString(36).slice(2, 2 + len).toUpperCase();
}

async function getAdminGraphql(shop: string) {
  const { admin } = await unauthenticated.admin(shop);
  return admin.graphql.bind(admin);
}

// ── Decision Engine ────────────────────────────────────────────────────────

export async function createPartialPaymentCheckout(
  params: PartialPaymentCheckoutParams
): Promise<PartialPaymentCheckoutResult> {
  const { shop, lineItems } = params;

  // Step 0: Fetch contextual (market-aware) prices — REPLACES old ProductVariant.price fetch.
  // Currency is derived from the contextual result; never from params.currency (untrusted frontend).
  console.log('[PartialPayment] Step 0: Fetching contextual prices for market-aware pricing...');

  const variantIds = lineItems.map(item => item.variantId);
  const contextualResult = await resolveContextualPricingForOrder(shop, variantIds, {
    customerCountry: params.customer.country,
    detectedCountry: params.detectedCountry,
    shop,
  });

  // BACKEND AUTHORITY: currency comes from contextual result, never from frontend
  const marketCurrencyCode = contextualResult.currencyCode;

  console.log('[FOXCOD PRICING DEBUG] PartialPayment decision engine:', {
    SHOP_PRIMARY_MARKET: contextualResult.storeCurrency, // Assuming store currency matches primary market roughly, but we can't easily get primary market country here without importing it.
    CUSTOMER_COUNTRY: params.customer.country,
    DETECTED_COUNTRY: params.detectedCountry,
    RESOLVED_COUNTRY: contextualResult.resolvedCountry,
    MARKET_CURRENCY: marketCurrencyCode,
    PRESENTMENT_CURRENCY: marketCurrencyCode,
    DRAFT_ORDER_CURRENCY: marketCurrencyCode,
    VARIANT_COUNT: variantIds.length,
    CONTEXTUAL_PRICES: Object.fromEntries(
      Array.from(contextualResult.prices.entries()).map(([k, v]) => [k, `${v.amount} ${v.currencyCode}`])
    ),
  });

  // Build contextual prices as a Record for the legacy nativePrices interface
  const nativePrices: Record<string, number> = {};
  let contextualCartTotal = 0;
  lineItems.forEach(item => {
    const numericId = String(item.variantId || '').replace(/[^0-9]/g, '');
    if (numericId) {
      const serverEntry = contextualResult.prices.get(numericId);
      nativePrices[numericId] = serverEntry?.amount ?? item.price;
      contextualCartTotal += (serverEntry?.amount ?? item.price) * item.quantity;
    } else {
      contextualCartTotal += item.price * item.quantity;
    }
  });

  let hasCustomPricing = false;
  let nativeCartTotal = contextualCartTotal;

  // Determine if any item has a custom (non-native) price using contextual prices
  for (const item of lineItems) {
    const numericId = String(item.variantId || '').replace(/[^0-9]/g, '');
    const serverEntry = contextualResult.prices.get(numericId);
    if (!numericId || !serverEntry) {
      hasCustomPricing = true;
    } else if (Math.abs(serverEntry.amount - item.price) > 0.01) {
      hasCustomPricing = true;
    }
  }

  if (params.codFeeAmount && params.codFeeAmount > 0) {
    hasCustomPricing = true;
    console.log('[PartialPayment] Forcing Draft Order because COD Fee is present.');
  }

  // Always use Draft Order when paid shipping is involved.
  if (params.shippingPrice && params.shippingPrice > 0) {
    hasCustomPricing = true;
    console.log('[PartialPayment] Forcing Draft Order because paid shipping is selected.');
  }

  const totalSubtotalForDiscountCheck = nativeCartTotal || lineItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const requiredDiscountForCheck = Math.max(totalSubtotalForDiscountCheck + (params.shippingPrice || 0) - params.advanceAmount, 0);

  if (requiredDiscountForCheck > totalSubtotalForDiscountCheck) {
    hasCustomPricing = true;
    console.log('[PartialPayment] Forcing Draft Order because required discount exceeds subtotal.');
  }

  // ALWAYS use Draft Order when a discount is needed.
  if (requiredDiscountForCheck > 0.01) {
    hasCustomPricing = true;
    console.log('[PartialPayment] Forcing Draft Order because a discount is needed (cart permalink discount codes are unreliable from modal).');
  }

  // Pricing consistency guard — compare widget total vs server total
  assertPricingConsistency(
    params.totalOrderValue,  // widget-submitted total
    totalSubtotalForDiscountCheck + (params.shippingPrice || 0) + (params.codFeeAmount || 0),
    { shop, country: contextualResult.resolvedCountry, flow: params.isFullPrepaid ? 'full_prepaid' : 'partial_cod' },
  );

  // Pass line items and market currency downstream
  const paramsWithCorrections = {
    ...params,
    lineItems: lineItems,
    // Override currency with backend-authoritative market currency
    currency: marketCurrencyCode,
    // Override country with backend-authoritative resolved country
    customer: {
      ...params.customer,
      country: contextualResult.resolvedCountry,
    }
  };

  if (hasCustomPricing) {
    console.log(`[PartialPayment] Path B: Custom pricing detected. Creating Draft Order Checkout... (currency: ${marketCurrencyCode})`);
    return createDraftOrderCheckout(paramsWithCorrections, nativePrices, marketCurrencyCode);
  } else {
    console.log(`[PartialPayment] Path A: Native pricing. Creating Cart Permalink Checkout... (currency: ${marketCurrencyCode})`);
    return createCartPermalinkCheckout(paramsWithCorrections, nativeCartTotal);
  }
}

// ── Path A: Cart Permalink Checkout ────────────────────────────────────────

async function createCartPermalinkCheckout(
  params: PartialPaymentCheckoutParams,
  nativeCartTotal: number
): Promise<PartialPaymentCheckoutResult> {
  const { shop, advanceAmount, totalOrderValue, partialPaymentReference, currency, customer, lineItems, notes, shippingPrice = 0, codFeeAmount = 0 } = params;
  const remainingAmount = totalOrderValue - advanceAmount + codFeeAmount;

  if (nativeCartTotal <= 0) {
    nativeCartTotal = totalOrderValue;
  }

  // Cart permalink cannot add custom line items.
  // The required discount is still based on bringing the cart total down to the advanceAmount.
  const requiredDiscount = Math.max(nativeCartTotal + shippingPrice - advanceAmount, 0);

  // 2. Create temporary discount code (Admin API)
  let discountCode = '';
  let discountExpiresAt = '';

  if (requiredDiscount > 0.01) {
    const prefix = params.couponCode ? `${params.couponCode.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 8)}-` : DISCOUNT_PREFIX;
    const code = `${prefix}${randomSuffix(6)}`;
    const expiresAt = new Date(Date.now() + DISCOUNT_TTL_MINUTES * 60 * 1000).toISOString();

    const graphql = await getAdminGraphql(shop);
    const res = await graphql(`
      mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
        discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
          codeDiscountNode { id }
          userErrors { message }
        }
      }
    `, {
      variables: {
        basicCodeDiscount: {
          title: `FoxlyCOD Partial Payment — ${partialPaymentReference}`,
          code,
          startsAt: new Date().toISOString(),
          endsAt: expiresAt,
          customerGets: {
            value: {
              discountAmount: { amount: requiredDiscount.toFixed(2), appliesOnEachItem: false }
            },
            items: { all: true }
          },
          customerSelection: { all: true },
          usageLimit: 1,
          appliesOncePerCustomer: false,
        }
      }
    });

    const data = await res.json();
    const errors = data?.data?.discountCodeBasicCreate?.userErrors || [];
    if (errors.length > 0) {
      throw new Error(`Discount creation failed: ${errors.map((e: any) => e.message).join(', ')}`);
    }

    discountCode = code;
    discountExpiresAt = expiresAt;
  }

  // 3. Build the Cart Permalink URL
  const cartItemsStr = lineItems.map(item => `${String(item.variantId).replace(/[^0-9]/g, '')}:${item.quantity}`).join(',');
  const permalinkBase = `https://${shop}/cart/${cartItemsStr}`;
  
  const queryParams = new URLSearchParams();
  
  if (discountCode) {
    queryParams.append('discount', discountCode);
  }

  if (params.isFullPrepaid) {
    queryParams.append('attributes[full_prepaid]', 'true');
  } else {
    queryParams.append('attributes[partial_cod]', 'true');
    queryParams.append('attributes[advance_amount]', advanceAmount.toFixed(2));
    queryParams.append('attributes[remaining_amount]', remainingAmount.toFixed(2));
  }
  
  queryParams.append('attributes[original_total]', totalOrderValue.toFixed(2));
  queryParams.append('attributes[partial_payment_reference]', partialPaymentReference);
  queryParams.append('attributes[order_source]', 'FoxlyCOD');
  queryParams.append('attributes[checkout_type]', 'cart_permalink');
  
  const cartNote = [
    params.isFullPrepaid ? `FULL PREPAID ORDER [${partialPaymentReference}]` : `PARTIAL COD ORDER [${partialPaymentReference}]`,
    !params.isFullPrepaid ? `Advance: ${params.currency} ${advanceAmount.toFixed(2)}` : '',
    !params.isFullPrepaid ? `Remaining (COD): ${params.currency} ${remainingAmount.toFixed(2)}` : '',
    codFeeAmount > 0 ? `Includes COD Fee: ${params.currency} ${codFeeAmount.toFixed(2)}` : '',
    notes ? notes : '',
  ].filter(Boolean).join('\n');
  queryParams.append('note', cartNote);

  if (customer.email) queryParams.append('checkout[email]', customer.email);
  if (customer.firstName) queryParams.append('checkout[shipping_address][first_name]', customer.firstName);
  if (customer.lastName) queryParams.append('checkout[shipping_address][last_name]', customer.lastName);
  if (customer.address1) queryParams.append('checkout[shipping_address][address1]', customer.address1);
  if (customer.address2) queryParams.append('checkout[shipping_address][address2]', customer.address2);
  if (customer.city) queryParams.append('checkout[shipping_address][city]', customer.city);
  if (customer.province) queryParams.append('checkout[shipping_address][province]', customer.province);
  if (customer.zip) queryParams.append('checkout[shipping_address][zip]', customer.zip);
  if (customer.phone) queryParams.append('checkout[shipping_address][phone]', customer.phone);
  if (customer.country) {
    const countryCode = customer.country.toUpperCase().slice(0, 2);
    queryParams.append('checkout[shipping_address][country]', countryCode);
  }

  const checkoutUrl = `${permalinkBase}?${queryParams.toString()}`;

  return {
    checkoutId: 'permalink-' + partialPaymentReference,
    checkoutUrl,
    discountCode,
    discountExpiresAt,
    partialPaymentReference,
    checkoutType: 'cart_permalink',
  };
}

// ── Path B: Draft Order Invoice Checkout ───────────────────────────────────

async function createDraftOrderCheckout(
  params: PartialPaymentCheckoutParams,
  nativePrices: Record<string, number>,
  marketCurrencyCode: string,
): Promise<PartialPaymentCheckoutResult> {
  const { shop, advanceAmount, totalOrderValue, partialPaymentReference, currency, customer, lineItems, notes, shippingPrice = 0, codFeeAmount = 0 } = params;
  // Use the backend-authoritative market currency, not params.currency (which may be stale/wrong)
  const displayCurrency = marketCurrencyCode || currency;
  const remainingAmount = totalOrderValue - advanceAmount + codFeeAmount;

  let actualDiscountableSubtotal = 0;
  let totalLineItemDiscounts = 0;

  const graphqlInput: any = {
    lineItems: [],
    customAttributes: [],
    tags: []
  };

  const draftLineItems = lineItems.map(item => {
    const numericId = String(item.variantId || '').replace(/[^0-9]/g, '');
    const nativePrice = numericId ? (nativePrices[numericId] || item.price) : item.price;
    
    // Use priceOverride to directly lock in the discounted frontend price (item.price).
    // This allows bundle and upsell discounts to reflect exactly on the line item
    // instead of being merged into the order-level unified COD BALANCE discount.
    actualDiscountableSubtotal += item.price * item.quantity;

    if (numericId) {
      return {
        variantId: `gid://shopify/ProductVariant/${numericId}`,
        quantity: item.quantity,
        priceOverride: {
          amount: item.price.toFixed(2),
          currencyCode: marketCurrencyCode || currency || 'USD'
        }
      };
    } else {
      return {
        title: item.title || "Custom Item",
        quantity: item.quantity,
        originalUnitPrice: item.price.toFixed(2)
      };
    }
  });

  // Add COD Fee as a custom line item so it formally appears in the draft order
  if (codFeeAmount > 0) {
    draftLineItems.push({
      title: "COD Fee",
      quantity: 1,
      originalUnitPrice: codFeeAmount.toFixed(2)
    });
    actualDiscountableSubtotal += codFeeAmount;
  }

  const discountableSubtotal = actualDiscountableSubtotal;
  const totalBeforeOrderDiscount = discountableSubtotal + shippingPrice;
  // We need the final total to perfectly match advanceAmount.
  // We apply ONE unified discount that covers BOTH the line item discounts (Upsells/Downsells) AND the order level discount (Prepaid/Partial).
  const neededDiscount = Math.max(0, totalBeforeOrderDiscount - advanceAmount);

  let appliedDiscountValue = neededDiscount;
  let finalShippingPrice = shippingPrice;

  // If the needed discount is greater than the subtotal, Shopify will cap the discount,
  // preventing the grand total from reaching the advance amount. 
  // To fix this without destroying the original order total (so it shows correctly in checkout),
  // we move the shipping cost into a line item, which increases the subtotal and allows the full discount.
  if (neededDiscount > discountableSubtotal && shippingPrice > 0) {
    draftLineItems.push({
      title: "Shipping Cost",
      quantity: 1,
      originalUnitPrice: shippingPrice.toFixed(2)
    });
    finalShippingPrice = 0;
  }

  const finalShippingLine = finalShippingPrice > 0 ? {
    title: params.shippingTitle || "Shipping",
    price: finalShippingPrice.toFixed(2)
  } : {
    title: params.shippingTitle || "Free Shipping",
    price: "0.00"
  };

  const cartNote = [
    params.isFullPrepaid ? `FULL PREPAID ORDER [${partialPaymentReference}]` : `PARTIAL COD ORDER [${partialPaymentReference}]`,
    params.prepaidDiscountAmount && params.prepaidDiscountAmount > 0 ? `Prepaid Discount Type: ${params.prepaidDiscountType}` : '',
    params.prepaidDiscountAmount && params.prepaidDiscountAmount > 0 ? `Prepaid Discount Value: ${params.prepaidDiscountValue}${params.prepaidDiscountType === 'percentage' ? '%' : ''}` : '',
    params.prepaidDiscountAmount && params.prepaidDiscountAmount > 0 ? `Prepaid Discount Amount: ${displayCurrency} ${params.prepaidDiscountAmount.toFixed(2)}` : '',
    params.originalTotalBeforeDiscount && params.originalTotalBeforeDiscount > 0 ? `Original Total: ${displayCurrency} ${params.originalTotalBeforeDiscount.toFixed(2)}` : '',
    !params.isFullPrepaid ? `Advance: ${displayCurrency} ${advanceAmount.toFixed(2)}` : '',
    !params.isFullPrepaid ? `Remaining (COD): ${displayCurrency} ${remainingAmount.toFixed(2)}` : '',
    codFeeAmount > 0 ? `Includes COD Fee: ${displayCurrency} ${codFeeAmount.toFixed(2)}` : '',
    notes ? notes : '',
  ].filter(Boolean).join('\n');

  const customAttributes = [
    { key: params.isFullPrepaid ? 'full_prepaid' : 'partial_cod', value: 'true' },
    !params.isFullPrepaid ? { key: 'advance_amount', value: advanceAmount.toFixed(2) } : null,
    !params.isFullPrepaid ? { key: 'remaining_amount', value: remainingAmount.toFixed(2) } : null,
    { key: 'original_total', value: totalOrderValue.toFixed(2) },
    { key: 'partial_payment_reference', value: partialPaymentReference },
    { key: 'order_source', value: 'FoxlyCOD' },
    { key: 'checkout_type', value: 'draft_order' }
  ].filter(Boolean) as { key: string; value: string }[];

  // Recompute the unified discount based on final line items + final shipping line
  const finalSubtotalForDiscount = actualDiscountableSubtotal +
    (neededDiscount > discountableSubtotal && shippingPrice > 0 ? shippingPrice : 0);
  const finalAppliedDiscountValue = Math.max(0, finalSubtotalForDiscount + finalShippingPrice - advanceAmount);

  let appliedDiscount = undefined;
  if (finalAppliedDiscountValue > 0.01) {
    let discountTitle = params.isFullPrepaid ? "Discount" : "COD Balance";
    if (params.couponCode && params.isFullPrepaid) {
        // Only Full Prepaid needs to show coupon code here if there's an extra order-level discount
        discountTitle = params.couponCode;
    }

    appliedDiscount = {
      title: discountTitle,
      description: params.isFullPrepaid ? "Order discount" : "Remaining amount to be collected on delivery.",
      value: parseFloat(finalAppliedDiscountValue.toFixed(2)),
      valueType: "FIXED_AMOUNT"
    };
  }

  const addressInput = {
    firstName: customer.firstName || undefined,
    lastName: customer.lastName || undefined,
    address1: customer.address1 || undefined,
    address2: customer.address2 || undefined,
    city: customer.city || undefined,
    province: customer.province || undefined,
    zip: customer.zip || undefined,
    countryCode: customer.country ? customer.country.toUpperCase().slice(0, 2) : undefined,
    phone: customer.phone || undefined
  };
  
  const cleanAddressInput = Object.fromEntries(Object.entries(addressInput).filter(([_, v]) => v !== undefined));

  graphqlInput.lineItems = draftLineItems;
  graphqlInput.shippingLine = finalShippingLine;
  if (appliedDiscount) graphqlInput.appliedDiscount = appliedDiscount;
  graphqlInput.note = cartNote;
  graphqlInput.customAttributes = customAttributes;
  graphqlInput.tags = params.isFullPrepaid
    ? (params.prepaidDiscountAmount && params.prepaidDiscountAmount > 0 ? ["FoxlyCOD", "Full Prepaid", "Prepaid Discount"] : ["FoxlyCOD", "Full Prepaid"])
    : ["FoxlyCOD", "Partial COD", "Pending Advance"];

  if (Object.keys(cleanAddressInput).length > 0) {
    graphqlInput.shippingAddress = cleanAddressInput;
    graphqlInput.billingAddress = cleanAddressInput;
  }

  // Set the sourceName so Shopify associates this draft order (and the resulting order) with the app
  graphqlInput.sourceName = "Foxly COD + Partial & Prepaid";

  // presentmentCurrencyCode locks the draft order to the customer's market currency.
  // MUST be the backend-authoritative market currency code from contextual pricing.
  // Never use params.currency directly here — it may come from an untrusted frontend source.
  if (marketCurrencyCode) {
    graphqlInput.presentmentCurrencyCode = marketCurrencyCode;
  }

  if (customer.email) {
    graphqlInput.email = customer.email;
  }

  const graphql = await getAdminGraphql(shop);
  
  const query = `
    mutation draftOrderCreate($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder {
          id
          invoiceUrl
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  console.log('[PartialPayment] Executing draftOrderCreate GraphQL mutation...', JSON.stringify(graphqlInput, null, 2));
  
  const res = await graphql(query, {
    variables: { input: graphqlInput }
  });

  const data = (await res.json()) as any;
  const mutationResult = data?.data?.draftOrderCreate;

  if (data.errors) {
    console.error('[PartialPayment] GraphQL Network/Parse Errors:', JSON.stringify(data.errors, null, 2));
    throw new Error(`GraphQL Errors: ${data.errors.map((e: any) => e.message).join(', ')}`);
  }

  if (mutationResult?.userErrors && mutationResult.userErrors.length > 0) {
    console.error('[PartialPayment] GraphQL User Errors during draftOrderCreate:', JSON.stringify(mutationResult.userErrors, null, 2));
    throw new Error(`Draft Order creation failed: ${mutationResult.userErrors.map((e: any) => e.message).join(', ')}`);
  }

  const draftOrder = mutationResult?.draftOrder;
  if (!draftOrder || !draftOrder.invoiceUrl) {
    throw new Error(`Draft Order created but no invoiceUrl returned. Full response: ${JSON.stringify(data)}`);
  }

  return {
    checkoutId: draftOrder.id.split('/').pop() as string,
    checkoutUrl: draftOrder.invoiceUrl,
    partialPaymentReference,
    checkoutType: 'draft_order',
  };
}

// ── Full Prepaid Checkout ──────────────────────────────────────────────────

/**
 * Create a Full Prepaid checkout where the customer pays 100% upfront.
 *
 * This is a thin wrapper around createPartialPaymentCheckout that sets:
 *   advanceAmount = totalOrderValue  (customer pays everything now)
 *   remainingAmount = 0              (no COD split)
 *
 * The existing decision engine automatically:
 *   - Uses Cart Permalink when pricing is native (fastest path)
 *   - Falls back to Draft Order when custom pricing exists
 *     (bundle variants, upsells, downsells, coupons, paid shipping)
 *     so checkout always shows the correct Foxly COD price.
 *
 * No discount code is generated for standard products since
 * requiredDiscount = nativeCartTotal - totalOrderValue = 0 in that case.
 */
export async function createFullPrepaidCheckout(
  params: Omit<PartialPaymentCheckoutParams, 'advanceAmount' | 'remainingAmount' | 'partialPaymentReference' | 'isFullPrepaid'>
): Promise<PartialPaymentCheckoutResult> {
  const reference = 'FPAID-' + Date.now().toString(36).toUpperCase() + randomSuffix(4);

  return createPartialPaymentCheckout({
    ...params,
    advanceAmount: params.totalOrderValue,
    remainingAmount: 0,
    partialPaymentReference: reference,
    isFullPrepaid: true
  });
}

// ── Discount Cleanup ───────────────────────────────────────────────────────

export async function cleanupPartialPaymentDiscounts(
  shop: string,
  maxAgeHours = 24
): Promise<{ deleted: number; errors: number }> {
  const graphql = await getAdminGraphql(shop);
  const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000).toISOString();

  console.log(`[PartialPayment Cleanup] Finding expired FOX-PCOD-* discounts for: ${shop}`);

  const listRes = await graphql(`
    query listExpiredPartialDiscounts($query: String!) {
      codeDiscountNodes(first: 50, query: $query) {
        edges {
          node {
            id
            codeDiscount {
              ... on DiscountCodeBasic {
                title
                endsAt
                status
              }
            }
          }
        }
      }
    }
  `, { variables: { query: `title:FoxlyCOD Partial Payment AND status:expired` } });

  const listData = await listRes.json();
  const nodes: any[] = listData?.data?.codeDiscountNodes?.edges?.map((e: any) => e.node) || [];

  let deleted = 0;
  let errors = 0;

  for (const node of nodes) {
    const endsAt = node.codeDiscount?.endsAt;
    if (endsAt && endsAt < cutoff) {
      try {
        const delRes = await graphql(`
          mutation discountCodeDelete($id: ID!) {
            discountCodeDelete(id: $id) {
              deletedCodeDiscountId
              userErrors { field message }
            }
          }
        `, { variables: { id: node.id } });

        const delData = await delRes.json();
        const delErrors = delData?.data?.discountCodeDelete?.userErrors || [];
        if (delErrors.length === 0) {
          deleted++;
        } else {
          errors++;
          console.warn(`[PartialPayment Cleanup] Delete error for ${node.id}:`, delErrors);
        }
      } catch (e: any) {
        errors++;
        console.error(`[PartialPayment Cleanup] Exception deleting ${node.id}:`, e.message);
      }
    }
  }

  console.log(`[PartialPayment Cleanup] Done for ${shop}: deleted=${deleted} errors=${errors}`);
  return { deleted, errors };
}
