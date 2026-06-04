import { unauthenticated } from '../shopify.server';

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
  currency: string;
  notes?: string;
  couponCode?: string;
  shippingPrice?: number;
  codFeeAmount?: number;
  isFullPrepaid?: boolean;
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

  // Step 0: Fetch native variant prices to determine if we have custom pricing
  console.log('[PartialPayment] Step 0: Fetching native variant prices for decision engine...');
  const graphql = await getAdminGraphql(shop);
  
  const validVariantGids = lineItems
    .map(item => String(item.variantId || '').replace(/[^0-9]/g, ''))
    .filter(id => id.length > 0)
    .map(id => `"gid://shopify/ProductVariant/${id}"`);

  let hasCustomPricing = false;
  let nativeCartTotal = 0;
  const nativePrices: Record<string, number> = {};

  if (validVariantGids.length > 0) {
    const query = `
      query {
        nodes(ids: [${validVariantGids.join(',')}]) {
          ... on ProductVariant {
            id
            price
          }
        }
      }
    `;

    try {
      const priceRes = await graphql(query);
      const priceData = await priceRes.json();
      
      if (priceData?.data?.nodes) {
        priceData.data.nodes.forEach((node: any) => {
          if (node && node.id && node.price) {
            const numericId = node.id.replace(/[^0-9]/g, '');
            const lineItem = lineItems.find(item => String(item.variantId || '').replace(/[^0-9]/g, '') === numericId);
            if (lineItem) {
              const nativePrice = parseFloat(node.price);
              nativePrices[numericId] = nativePrice;
              nativeCartTotal += nativePrice * lineItem.quantity;
              
              // Compare native price with Fox COD's passed price
              if (Math.abs(nativePrice - lineItem.price) > 0.01) {
                hasCustomPricing = true;
              }
            }
          }
        });
      }
    } catch (error) {
      console.warn('[PartialPayment] Failed to fetch native prices for decision engine.', error);
      // Safe fallback to Draft Order if we can't verify native prices
      hasCustomPricing = true;
    }
  }

  // Find any items that don't have a variant ID, or have a variant ID but weren't in nativePrices
  for (const item of lineItems) {
    const numericId = String(item.variantId || '').replace(/[^0-9]/g, '');
    if (!numericId || !nativePrices[numericId]) {
      hasCustomPricing = true;
      nativeCartTotal += Number(item.price) * item.quantity;
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
  // The Cart Permalink approach passes the discount as ?discount=CODE in the URL.
  // When the checkout URL is opened from a modal (new window/tab), Shopify frequently does
  // NOT auto-apply the code — the customer lands on full-price checkout with no discount.
  // Draft orders apply the discount server-side (applied_discount field), which is 100%
  // reliable and always shows the correct advance amount to the customer.
  if (requiredDiscountForCheck > 0.01) {
    hasCustomPricing = true;
    console.log('[PartialPayment] Forcing Draft Order because a discount is needed (cart permalink discount codes are unreliable from modal).');
  }


  if (hasCustomPricing) {
    console.log(`[PartialPayment] Path B: Custom pricing detected. Creating Draft Order Checkout...`);
    return createDraftOrderCheckout(params, nativePrices);
  } else {
    console.log(`[PartialPayment] Path A: Native pricing. Creating Cart Permalink Checkout...`);
    // Pass nativeCartTotal down to avoid refetching
    return createCartPermalinkCheckout(params, nativeCartTotal);
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
    const code = `${DISCOUNT_PREFIX}${randomSuffix(8)}`;
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
          title: `FoxCOD Partial Payment — ${partialPaymentReference}`,
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
  queryParams.append('attributes[order_source]', 'FoxCOD');
  queryParams.append('attributes[checkout_type]', 'cart_permalink');
  
  const cartNote = [
    `PARTIAL COD ORDER [${partialPaymentReference}]`,
    `Advance: ${params.currency} ${advanceAmount.toFixed(2)}`,
    `Remaining (COD): ${params.currency} ${remainingAmount.toFixed(2)}`,
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
  nativePrices: Record<string, number>
): Promise<PartialPaymentCheckoutResult> {
  const { shop, advanceAmount, totalOrderValue, partialPaymentReference, currency, customer, lineItems, notes, shippingPrice = 0, codFeeAmount = 0 } = params;
  const remainingAmount = totalOrderValue - advanceAmount + codFeeAmount;

  const { session } = await unauthenticated.admin(shop);

  let actualDiscountableSubtotal = 0;

  const draftLineItems = lineItems.map(item => {
    const numericId = String(item.variantId || '').replace(/[^0-9]/g, '');
    const nativePrice = numericId ? (nativePrices[numericId] || item.price) : item.price;
    
    let applied_discount = undefined;
    let effectivePrice = nativePrice;
    
    if (nativePrice > item.price + 0.01) {
      const unitDiscount = nativePrice - item.price;
      const totalDiscount = (unitDiscount * item.quantity).toFixed(2);
      applied_discount = {
        title: "Fox COD Offer",
        value: unitDiscount.toFixed(2),
        value_type: "fixed_amount",
        amount: totalDiscount
      };
      effectivePrice = item.price;
    }

    actualDiscountableSubtotal += effectivePrice * item.quantity;

    if (numericId) {
      return {
        variant_id: Number(numericId),
        quantity: item.quantity,
        price: nativePrice.toFixed(2), // We MUST pass native price, Shopify ignores price overrides
        applied_discount
      };
    } else {
      return {
        title: item.title || "Custom Item",
        quantity: item.quantity,
        price: nativePrice.toFixed(2),
        custom: true
      };
    }
  });


  // Add COD Fee as a custom line item so it formally appears in the draft order
  if (codFeeAmount > 0) {
    draftLineItems.push({
      variant_id: undefined,
      quantity: 1,
      price: codFeeAmount.toFixed(2),
      title: "COD Fee",
      custom: true
    } as any);
    actualDiscountableSubtotal += codFeeAmount;
  }

  const discountableSubtotal = actualDiscountableSubtotal;
  const totalBeforeOrderDiscount = discountableSubtotal + shippingPrice;
  const neededDiscount = Math.max(0, totalBeforeOrderDiscount - advanceAmount);

  let appliedDiscountValue = neededDiscount;
  let finalShippingPrice = shippingPrice;

  // If the needed discount is greater than the subtotal, Shopify will cap the discount,
  // preventing the grand total from reaching the advance amount. 
  // To fix this without destroying the original order total (so it shows correctly in checkout),
  // we move the shipping cost into a line item, which increases the subtotal and allows the full discount.
  if (neededDiscount > discountableSubtotal && shippingPrice > 0) {
    draftLineItems.push({
      variant_id: undefined,
      quantity: 1,
      price: shippingPrice.toFixed(2),
      title: "Shipping Cost",
      custom: true
    } as any);
    finalShippingPrice = 0;
  }

  const finalShippingLine = finalShippingPrice > 0 ? {
    title: "Shipping",
    price: finalShippingPrice.toFixed(2),
    custom: true
  } : {
    title: "Free Shipping",
    price: "0.00",
    custom: true
  };

  const cartNote = [
    `PARTIAL COD ORDER [${partialPaymentReference}]`,
    `Advance: ${params.currency} ${advanceAmount.toFixed(2)}`,
    `Remaining (COD): ${params.currency} ${remainingAmount.toFixed(2)}`,
    codFeeAmount > 0 ? `Includes COD Fee: ${params.currency} ${codFeeAmount.toFixed(2)}` : '',
    notes ? notes : '',
  ].filter(Boolean).join('\n');

  const customAttributes = [
    { name: 'partial_cod', value: 'true' },
    { name: 'advance_amount', value: advanceAmount.toFixed(2) },
    { name: 'remaining_amount', value: remainingAmount.toFixed(2) },
    { name: 'original_total', value: totalOrderValue.toFixed(2) },
    { name: 'partial_payment_reference', value: partialPaymentReference },
    { name: 'order_source', value: 'FoxCOD' },
    { name: 'checkout_type', value: 'draft_order' }
  ];

  // Recompute the discount based on final line items + final shipping line,
  // so the checkout grand total is exactly advanceAmount regardless of how
  // the shipping was handled above.
  const finalSubtotalForDiscount = actualDiscountableSubtotal +
    (neededDiscount > discountableSubtotal && shippingPrice > 0 ? shippingPrice : 0);
  const finalAppliedDiscountValue = Math.max(0, finalSubtotalForDiscount + finalShippingPrice - advanceAmount);

  let appliedDiscount = undefined;
  if (finalAppliedDiscountValue > 0.01) {
    appliedDiscount = {
      title: "Partial Payment Remaining",
      description: "Remaining amount to be collected on delivery.",
      value: finalAppliedDiscountValue.toFixed(2),
      value_type: "fixed_amount"
    };
  }

  const addressInput = {
    first_name: customer.firstName || undefined,
    last_name: customer.lastName || undefined,
    address1: customer.address1 || undefined,
    address2: customer.address2 || undefined,
    city: customer.city || undefined,
    province: customer.province || undefined,
    zip: customer.zip || undefined,
    country_code: customer.country ? customer.country.toUpperCase().slice(0, 2) : undefined,
    phone: customer.phone || undefined
  };

  const draftOrderPayload: any = {
    line_items: draftLineItems,
    shipping_line: finalShippingLine,
    applied_discount: appliedDiscount,
    note: cartNote,
    note_attributes: customAttributes,
    tags: params.isFullPrepaid ? "FoxCOD, Full Prepaid" : "FoxCOD, Partial COD, Pending Advance",
  };

  if (Object.keys(addressInput).length > 0) {
    draftOrderPayload.shipping_address = addressInput;
    draftOrderPayload.billing_address = addressInput;
  }

  if (customer.email) {
    draftOrderPayload.email = customer.email;
  }

  const url = `https://${shop}/admin/api/2024-01/draft_orders.json`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': session.accessToken as string,
    },
    body: JSON.stringify({ draft_order: draftOrderPayload }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(`Draft Order creation failed: ${JSON.stringify(data.errors)}`);
  }

  const draftOrder = data.draft_order;
  if (!draftOrder || !draftOrder.invoice_url) {
    throw new Error(`Draft Order created but no invoice_url returned.`);
  }

  return {
    checkoutId: String(draftOrder.id),
    checkoutUrl: draftOrder.invoice_url,
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
 *     so checkout always shows the correct Fox COD price.
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
  `, { variables: { query: `title:FoxCOD Partial Payment AND status:expired` } });

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
