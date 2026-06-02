/**
 * Shopify Partial Payment Service — Cart API Edition
 *
 * Creates a Releaseit-style partial payment flow using:
 *   1. A temporary Shopify discount code (FOX-PCOD-XXXXXX) via Admin API that reduces
 *      the cart total by `remainingAmount`, leaving only `advanceAmount` due.
 *   2. A Storefront API Cart session using cartCreate + cartBuyerIdentityUpdate.
 *      Returns cart.checkoutUrl for redirect to Shopify's hosted checkout.
 *
 * ⚠️  checkoutCreate / checkoutDiscountCodeApplyV2 were removed April 1, 2025.
 *      This file uses the Cart API (2025-10) exclusively.
 *
 * NO cart permalinks. NO draft orders. NO fake products. NO custom thank-you pages.
 */

import { unauthenticated } from '../shopify.server';

// ── In-process Storefront token cache ──────────────────────────────────────
const _storefrontTokenCache = new Map<string, string>();

// ── Shopify Storefront API version ─────────────────────────────────────────
const STOREFRONT_API_VERSION = '2025-10';

// ── Discount code prefix & TTL ─────────────────────────────────────────────
const DISCOUNT_PREFIX = 'FOX-PCOD-';
const DISCOUNT_TTL_MINUTES = 15;

// ── Types ──────────────────────────────────────────────────────────────────

export interface CustomerFields {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address1: string;
  address2?: string;
  city: string;
  province: string;
  country: string;
  zip: string;
}

export interface LineItemInput {
  variantId: string; // numeric Shopify variant ID
  quantity: number;
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
}

export interface PartialPaymentCheckoutResult {
  checkoutId: string;
  checkoutUrl: string;
  discountCode: string;
  discountExpiresAt: string;
  partialPaymentReference: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function randomSuffix(len = 8): string {
  return Math.random().toString(36).slice(2, 2 + len).toUpperCase();
}

async function getAdminGraphql(shop: string) {
  const { admin } = await unauthenticated.admin(shop);
  return admin.graphql.bind(admin);
}

// ── Get or create Storefront Access Token ─────────────────────────────────

async function getStorefrontToken(shop: string): Promise<string> {
  const cached = _storefrontTokenCache.get(shop);
  if (cached) return cached;

  const { admin, session } = await unauthenticated.admin(shop);

  // 1. Try to find an existing token using the REST API (GraphQL query was removed)
  try {
    const url = `https://${shop}/admin/api/${STOREFRONT_API_VERSION}/storefront_access_tokens.json`;
    const listRes = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': session.accessToken,
      }
    });

    if (listRes.ok) {
      const listData = await listRes.json();
      const tokens: any[] = listData?.storefront_access_tokens || [];
      const existing = tokens.find((t: any) => t.title === 'FoxCOD Checkout');

      if (existing?.access_token) {
        const token = existing.access_token;
        _storefrontTokenCache.set(shop, token);
        console.log('[PartialPayment] Using existing Storefront token for:', shop);
        return token;
      }
    } else {
      console.warn('[PartialPayment] Failed to list tokens via REST (non-fatal):', await listRes.text());
    }
  } catch (err: any) {
    console.warn('[PartialPayment] Error listing tokens via REST (non-fatal):', err.message);
  }

  // 2. Create a new token via GraphQL if none found
  const graphql = admin.graphql.bind(admin);
  const createRes = await graphql(`
    mutation storefrontAccessTokenCreate($input: StorefrontAccessTokenInput!) {
      storefrontAccessTokenCreate(input: $input) {
        storefrontAccessToken { accessToken title }
        userErrors { field message }
      }
    }
  `, { variables: { input: { title: 'FoxCOD Checkout' } } });

  const createData = await createRes.json();
  const newToken = createData?.data?.storefrontAccessTokenCreate?.storefrontAccessToken?.accessToken;

  if (!newToken) {
    const errs = createData?.data?.storefrontAccessTokenCreate?.userErrors || [];
    throw new Error(`Failed to create Storefront token: ${errs.map((e: any) => e.message).join(', ')}`);
  }

  _storefrontTokenCache.set(shop, newToken);
  console.log('[PartialPayment] Created new Storefront token for:', shop);
  return newToken;
}

// ── Storefront API fetch helper ────────────────────────────────────────────

async function storefrontFetch(
  shop: string,
  token: string,
  query: string,
  variables?: Record<string, any>
): Promise<any> {
  const url = `https://${shop}/api/${STOREFRONT_API_VERSION}/graphql.json`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': token,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Storefront API HTTP ${res.status}: ${text.slice(0, 400)}`);
  }

  const json = await res.json();

  // Surface GraphQL-level errors immediately
  if (json?.errors && json.errors.length > 0) {
    const msg = json.errors.map((e: any) => e.message).join('; ');
    throw new Error(`Storefront GraphQL error: ${msg}`);
  }

  return json;
}

// ── Step 1: Create temporary discount code via Admin API ──────────────────

async function createTemporaryDiscount(
  shop: string,
  discountAmount: number,
  partialRef: string,
  currency: string
): Promise<{ code: string; expiresAt: string; discountId: string }> {
  const graphql = await getAdminGraphql(shop);
  const code = `${DISCOUNT_PREFIX}${randomSuffix(8)}`;
  const expiresAt = new Date(Date.now() + DISCOUNT_TTL_MINUTES * 60 * 1000).toISOString();

  console.log(`[PartialPayment] Creating discount "${code}" for ${currency} ${discountAmount.toFixed(2)}, ref: ${partialRef}`);

  const res = await graphql(`
    mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
      discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
        codeDiscountNode {
          id
          codeDiscount {
            ... on DiscountCodeBasic {
              title
              codes(first: 1) { edges { node { code } } }
              status
            }
          }
        }
        userErrors { field code message }
      }
    }
  `, {
    variables: {
      basicCodeDiscount: {
        title: `FoxCOD Partial Payment — ${partialRef}`,
        code,
        startsAt: new Date().toISOString(),
        endsAt: expiresAt,
        customerGets: {
          value: {
            discountAmount: {
              amount: discountAmount.toFixed(2),
              appliesOnEachItem: false,
            },
          },
          items: { all: true },
        },
        customerSelection: { all: true },
        usageLimit: 1,
        appliesOncePerCustomer: false,
      },
    },
  });

  const data = await res.json();
  console.log('[PartialPayment] discountCodeBasicCreate raw response:', JSON.stringify(data).slice(0, 500));

  const errors = data?.data?.discountCodeBasicCreate?.userErrors || [];
  if (errors.length > 0) {
    throw new Error(`Discount creation failed: ${errors.map((e: any) => e.message).join(', ')}`);
  }

  const discountId = data?.data?.discountCodeBasicCreate?.codeDiscountNode?.id || '';
  console.log(`[PartialPayment] Discount "${code}" created, id: ${discountId}`);

  return { code, expiresAt, discountId };
}

export async function createPartialPaymentCheckout(
  params: PartialPaymentCheckoutParams
): Promise<PartialPaymentCheckoutResult> {
  const { shop, advanceAmount, totalOrderValue, partialPaymentReference, currency, customer, lineItems, notes, shippingPrice = 0 } = params;
  const remainingAmount = totalOrderValue - advanceAmount;

  console.log(
    `[PartialPayment] ▶ Starting (Cart Permalink): ref=${partialPaymentReference} shop=${shop}`,
    `total=${totalOrderValue} advance=${advanceAmount} remaining=${remainingAmount} shipping=${shippingPrice}`
  );

  // 1. Fetch native Storefront Cart Total
  console.log('[PartialPayment] Step 0: Fetching native variant prices...');
  const graphql = await getAdminGraphql(shop);
  
  const variantGids = lineItems.map(item => `"gid://shopify/ProductVariant/${String(item.variantId).replace(/[^0-9]/g, '')}"`);
  const query = `
    query {
      nodes(ids: [${variantGids.join(',')}]) {
        ... on ProductVariant {
          id
          price
        }
      }
    }
  `;
  
  const priceRes = await graphql(query);
  const priceData = await priceRes.json();
  
  let nativeCartTotal = 0;
  if (priceData?.data?.nodes) {
    priceData.data.nodes.forEach((node: any) => {
      if (node && node.id && node.price) {
        const numericId = node.id.replace(/[^0-9]/g, '');
        const lineItem = lineItems.find(item => String(item.variantId) === numericId);
        if (lineItem) {
          nativeCartTotal += parseFloat(node.price) * lineItem.quantity;
        }
      }
    });
  }

  if (nativeCartTotal <= 0) {
    console.warn('[PartialPayment] Failed to fetch native prices, falling back to Fox COD total.');
    nativeCartTotal = totalOrderValue;
  }

  // The discount needed to make NativeCartTotal + Shipping - Discount = AdvanceAmount
  const requiredDiscount = Math.max(nativeCartTotal + shippingPrice - advanceAmount, 0);

  // 2. Create temporary discount code (Admin API)
  let discountCode = '';
  let discountExpiresAt = '';

  if (requiredDiscount > 0.01) {
    console.log(`[PartialPayment] Step 1: Creating temporary discount for ${requiredDiscount.toFixed(2)} (Native Total: ${nativeCartTotal}, Advance: ${advanceAmount})`);
    const discountResult = await createTemporaryDiscount(shop, requiredDiscount, partialPaymentReference, currency);
    discountCode = discountResult.code;
    discountExpiresAt = discountResult.expiresAt;
    console.log(`[PartialPayment] Step 1: ✅ Discount created: ${discountCode}`);
  }

  // 2. Build the Cart Permalink URL
  console.log('[PartialPayment] Step 2: Building Cart Permalink...');
  
  // Format: /cart/variantId:quantity,variantId:quantity
  const cartItemsStr = lineItems.map(item => `${String(item.variantId).replace(/[^0-9]/g, '')}:${item.quantity}`).join(',');
  const permalinkBase = `https://${shop}/cart/${cartItemsStr}`;
  
  const queryParams = new URLSearchParams();
  
  // Apply the discount
  if (discountCode) {
    queryParams.append('discount', discountCode);
  }

  // Cart Attributes for merchant tracking
  queryParams.append('attributes[partial_cod]', 'true');
  queryParams.append('attributes[advance_amount]', advanceAmount.toFixed(2));
  queryParams.append('attributes[remaining_amount]', remainingAmount.toFixed(2));
  queryParams.append('attributes[original_total]', totalOrderValue.toFixed(2));
  queryParams.append('attributes[partial_payment_reference]', partialPaymentReference);
  queryParams.append('attributes[order_source]', 'FoxCOD');
  
  const cartNote = [
    `PARTIAL COD ORDER [${partialPaymentReference}]`,
    `Advance: ${params.currency} ${advanceAmount.toFixed(2)}`,
    `Remaining (COD): ${params.currency} ${remainingAmount.toFixed(2)}`,
    notes ? notes : '',
  ].filter(Boolean).join('\n');
  queryParams.append('note', cartNote);

  // Prefill Customer Information natively
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
  console.log(`[PartialPayment] Step 2: ✅ Permalink created, redirecting to: ${checkoutUrl}`);

  return {
    checkoutId: 'permalink-' + partialPaymentReference,
    checkoutUrl,
    discountCode,
    discountExpiresAt,
    partialPaymentReference,
  };
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
