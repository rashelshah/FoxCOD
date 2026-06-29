import { unauthenticated } from '../shopify.server';

export interface GraphQLOrderParams {
  shop: string;
  /**
   * The market-resolved currency code for this order.
   * MUST come from contextual pricing result — never from frontend payload.
   */
  currency?: string;
  /**
   * Explicitly set the order's presentment currency.
   * When provided, takes priority over `currency`.
   * Always derived from server-side contextual pricing — never from frontend.
   */
  presentmentCurrencyCode?: string;
  lineItems: Array<{
    variantId?: string | number | null;
    title?: string;
    quantity: number;
    price: string | number;
    /** true for product items (default), false only for COD fee */
    requiresShipping?: boolean;
    /** true for product items (default), false only for COD fee */
    taxable?: boolean;
  }>;
  customer: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
  };
  shippingAddress?: any;
  billingAddress?: any;
  tags?: string[];
  note?: string;
  noteAttributes?: Array<{ key: string; value: string }>;
  shippingLine?: { title: string; price: string | number };
  /** Pre-built inventory metadata from buildInventoryMetadata() — embedded in customAttributes */
  inventoryMetadata?: import('./inventory-sync.server').InventoryLineItem[];
}

export interface GraphQLOrderResult {
  success: boolean;
  orderId?: string;
  orderName?: string;
  /** Shopify order status page URL — used for customer redirect. */
  statusPageUrl?: string | null;
  error?: string;
}

/**
 * Find or create a Shopify customer by email/phone.
 * Links the order to an existing Shopify customer record for CRM continuity.
 */
export async function findOrCreateCustomer(
  graphql: any,
  customerData: { firstName?: string; lastName?: string; email?: string; phone?: string }
) {
  const email = customerData.email?.trim();
  const phone = customerData.phone?.trim();
  const firstName = customerData.firstName?.trim();
  const lastName = customerData.lastName?.trim();

  if (!email && !phone && !firstName && !lastName) return null;

  try {
    if (email || phone) {
      let queryStr = '';
      if (email) queryStr += `email:${email}`;
      if (phone) queryStr += (queryStr ? ' OR ' : '') + `phone:${phone}`;

      const searchRes = await graphql(
        `query findCustomer($query: String!) {
          customers(first: 1, query: $query) {
            edges { node { id } }
          }
        }`,
        { variables: { query: queryStr } }
      );

      const searchData = await searchRes.json();
      const edges = searchData?.data?.customers?.edges || [];
      if (edges.length > 0) {
        const existingId = edges[0].node.id;

        // Update name if provided
        if (firstName || lastName) {
          await graphql(
            `mutation customerUpdate($input: CustomerInput!) {
              customerUpdate(input: $input) { customer { id } }
            }`,
            {
              variables: {
                input: {
                  id: existingId,
                  firstName: firstName || '',
                  lastName: lastName || '',
                },
              },
            }
          );
        }

        return existingId;
      }
    }

    // Create new customer
    const createRes = await graphql(
      `mutation customerCreate($input: CustomerInput!) {
        customerCreate(input: $input) {
          customer { id }
          userErrors { field message }
        }
      }`,
      {
        variables: {
          input: {
            firstName: firstName || '',
            lastName: lastName || '',
            email: email || undefined,
            phone: phone || undefined,
          },
        },
      }
    );

    const createData = await createRes.json();
    return createData?.data?.customerCreate?.customer?.id || null;
  } catch (err) {
    console.warn('[GraphQL Order] Error finding/creating customer (scopes may be missing):', err);
    return null;
  }
}

/**
 * Creates a Shopify order using the orderCreate mutation with custom sale line items.
 *
 * Architecture:
 *   - All line items are custom sale items (no variantId) to allow exact custom pricing.
 *   - Pricing: priceSet with shopMoney + presentmentMoney (preserves multi-currency).
 *   - taxable: false only for COD Fee line items; products default to true.
 *   - requiresShipping: false only for COD Fee line items; products default to true.
 *   - Inventory: tracked separately via _foxcod_inventory customAttribute,
 *     deducted by the orders/create webhook via inventory-sync.server.ts.
 *   - statusPageUrl: returned from the created order for customer redirect.
 *
 * This completely replaces the draftOrderCreate + draftOrderInvoiceSend flow.
 */
export async function createPendingOrder(params: GraphQLOrderParams): Promise<GraphQLOrderResult> {
  const { shop } = params;
  const t_admin = performance.now();
  const { admin } = await unauthenticated.admin(shop);
  console.log(`[PERF] unauthenticated.admin(shop) in createPendingOrder: ${performance.now() - t_admin}ms`);

  const originalGraphql = admin.graphql;
  const graphql = async (query: string, vars?: any) => {
    const nameMatch = query.match(/(query|mutation)\s+(\w+)/);
    const name = nameMatch ? nameMatch[2] : 'unknown';
    const t0 = performance.now();
    const res = await originalGraphql(query, vars);
    console.log(`[PERF] ${name} GraphQL duration: ${performance.now() - t0}ms`);
    return res;
  };

  const currencyCode = params.presentmentCurrencyCode || params.currency || 'USD';

  // ── 1. Map line items as custom sale items (no variantId) ──
  // This is the only architecture that preserves custom pricing, contextual
  // prices, discounts, COD fees, and multi-currency. See implementation plan.
  const orderLineItems = params.lineItems.map((item) => {
    const priceAmount = (
      typeof item.price === 'number' ? item.price : parseFloat(String(item.price))
    ).toFixed(2);

    const lineItemInput: any = {
      quantity: item.quantity,
      priceSet: {
        shopMoney: { amount: priceAmount, currencyCode },
        presentmentMoney: { amount: priceAmount, currencyCode },
      },
      // requiresShipping defaults to true; only COD Fee sets it to false
      requiresShipping: item.requiresShipping !== false,
      // taxable defaults to true (Shopify's default); only COD Fee sets it to false
      taxable: item.taxable !== false,
    };

    if (item.variantId) {
      // Ensure variantId is a proper GraphQL GID
      const vid = String(item.variantId);
      lineItemInput.variantId = vid.includes('gid://') ? vid : `gid://shopify/ProductVariant/${vid}`;
    } else {
      lineItemInput.title = item.title || 'Product';
    }

    return lineItemInput;
  });

  // ── 2. Build customAttributes ──
  // _foxcod_inventory carries variant metadata for the inventory sync webhook.
  // This is the critical link between the order and inventory tracking.
  const customAttributes: Array<{ key: string; value: string }> = [
    { key: 'Order Source', value: 'FoxlyCOD' },
    ...(params.noteAttributes || []).filter((a) => a.key !== 'Order Source'),
  ];

  if (params.inventoryMetadata && params.inventoryMetadata.length > 0) {
    customAttributes.push({
      key: '_foxcod_inventory',
      value: JSON.stringify(params.inventoryMetadata),
    });
    console.log('[GraphQL Order] Embedding inventory metadata for', params.inventoryMetadata.length, 'variants');
  }

  // ── 3. Format addresses ──
  const formatAddress = (addr: any) => {
    if (!addr) return undefined;
    const isCode = addr.country && addr.country.length === 2;
    return {
      firstName: addr.first_name || addr.firstName,
      lastName: addr.last_name || addr.lastName,
      address1: addr.address1,
      city: addr.city,
      province: addr.province,
      zip: addr.zip,
      country: isCode ? undefined : addr.country,
      countryCode: isCode ? addr.country.toUpperCase() : undefined,
      phone: addr.phone,
    };
  };

  const shippingAddr = formatAddress(params.shippingAddress);
  const billingAddr = formatAddress(params.billingAddress) || shippingAddr;

  // ── 4. Find or create customer ──
  const customerId = await findOrCreateCustomer(graphql, params.customer);

  // ── 5. Build shipping lines ──
  const shippingLines = params.shippingLine
    ? [
        {
          title: params.shippingLine.title,
          priceSet: {
            shopMoney: {
              amount:
                typeof params.shippingLine.price === 'number'
                  ? params.shippingLine.price.toFixed(2)
                  : String(params.shippingLine.price),
              currencyCode,
            },
          },
        },
      ]
    : [];

  // ── 6. Build orderCreate input ──
  const orderInput: Record<string, any> = {
    currency: currencyCode,
    financialStatus: 'PENDING',
    lineItems: orderLineItems,
    customAttributes,
    tags: params.tags || [],
    note: params.note || '',
    email: params.customer.email || undefined,
    phone: params.customer.phone || undefined,
    shippingLines,
    ...(shippingAddr ? { shippingAddress: shippingAddr } : {}),
    ...(billingAddr ? { billingAddress: billingAddr } : {}),
    ...(customerId ? { customerId } : {}),
  };

  console.log('[FOXCOD SHOPIFY PAYLOAD]', JSON.stringify(orderInput, null, 2));

  // ── 7. Execute orderCreate ──
  const createRes = await graphql(
    `mutation orderCreate($order: OrderCreateOrderInput!) {
      orderCreate(order: $order) {
        order {
          id
          name
          statusPageUrl
          displayFinancialStatus
          lineItems(first: 20) {
            nodes {
              title
              quantity
              originalUnitPriceSet {
                shopMoney { amount currencyCode }
              }
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }`,
    { variables: { order: orderInput } }
  );

  const createData = await createRes.json();
  console.log('[ORDER CREATE RESPONSE]', JSON.stringify(createData, null, 2));

  const createErrors = createData?.data?.orderCreate?.userErrors || [];
  if (createErrors.length > 0) {
    const errorMsg = createErrors.map((e: any) => `${e.field?.join('.') || 'field'}: ${e.message}`).join(', ');
    console.error('[GraphQL Order] orderCreate failed:', errorMsg);
    return { success: false, error: errorMsg };
  }

  const order = createData?.data?.orderCreate?.order;
  if (!order?.id) {
    console.error('[GraphQL Order] orderCreate returned no order ID');
    return { success: false, error: 'Failed to create order — no ID returned.' };
  }

  const numericOrderId = String(order.id).split('/').pop() || '';
  console.log('[FOXCOD] Order Created', {
    orderId: order.id,
    name: order.name,
    statusPageUrl: order.statusPageUrl,
    financialStatus: order.displayFinancialStatus,
    shop,
    lineItemsCount: params.lineItems.length,
  });

  return {
    success: true,
    orderId: numericOrderId,
    orderName: order.name || '',
    statusPageUrl: order.statusPageUrl || null,
  };
}
