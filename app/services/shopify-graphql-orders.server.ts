import { unauthenticated } from '../shopify.server';

export interface GraphQLOrderParams {
  shop: string;
  /**
   * The market-resolved currency code for this order.
   * MUST come from contextual pricing result — never from frontend payload.
   * Used for:
   *   - presentmentCurrencyCode on the draft order (locks Shopify's display currency)
   *   - priceOverride.currencyCode on each line item
   */
  currency?: string;
  /**
   * Explicitly set the draft order's presentment currency.
   * When provided, takes priority over `currency` for presentmentCurrencyCode.
   * Always derived from server-side contextual pricing — never from frontend.
   */
  presentmentCurrencyCode?: string;
  lineItems: Array<{
    variantId?: string | number | null;
    title?: string;
    quantity: number;
    price: string | number; // originalUnitPrice
    appliedDiscount?: {
      value: number;
      valueType: 'PERCENTAGE' | 'FIXED_AMOUNT';
      title?: string;
    };
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
  discount?: { code: string; amount: number; valueType: 'FIXED_AMOUNT' | 'PERCENTAGE' };
  nativePrices?: Record<string, number>;
  targetTotal?: number;
}

export interface GraphQLOrderResult {
  success: boolean;
  orderId?: string;
  orderName?: string;
  orderStatusUrl?: string;
  error?: string;
}

/**
 * Creates a Shopify Order by utilizing the Draft Order flow (draftOrderCreate -> draftOrderComplete).
 * This completely replaces the legacy REST orders.json API and satisfies App Store Requirement 2.2.4.
 * 
 * Key benefits of Draft Order flow:
 * 1. Supports guest checkout (no existing customer ID required).
 * 2. Permits exact variant price overrides via originalUnitPrice (unlike orderCreate).
 * 3. Safely reserves inventory and fires standard webhooks upon completion.
 */
async function findOrCreateCustomer(graphql: any, customerData: { firstName?: string, lastName?: string, email?: string, phone?: string }) {
  const email = customerData.email?.trim();
  const phone = customerData.phone?.trim();

  const firstName = customerData.firstName?.trim();
  const lastName = customerData.lastName?.trim();

  if (!email && !phone && !firstName && !lastName) return null;

  try {
    // 1. Search for existing customer (only if email or phone is provided)
    if (email || phone) {
      let queryStr = '';
      if (email) queryStr += `email:${email}`;
      if (phone) queryStr += (queryStr ? ' OR ' : '') + `phone:${phone}`;
      
      const searchRes = await graphql(`
        query findCustomer($query: String!) {
          customers(first: 1, query: $query) {
            edges { node { id } }
          }
        }
      `, { variables: { query: queryStr } });
      
      const searchData = await searchRes.json();
      const edges = searchData?.data?.customers?.edges || [];
      if (edges.length > 0) {
        const existingId = edges[0].node.id;
        
        // Update the existing customer with the name from the form
        if (firstName || lastName) {
          await graphql(`
            mutation customerUpdate($input: CustomerInput!) {
              customerUpdate(input: $input) {
                customer { id }
              }
            }
          `, {
            variables: {
              input: {
                id: existingId,
                firstName: firstName || '',
                lastName: lastName || ''
              }
            }
          });
        }
        
        return existingId;
      }
    }

    // 2. Create customer if not found
    const createRes = await graphql(`
      mutation customerCreate($input: CustomerInput!) {
        customerCreate(input: $input) {
          customer { id }
          userErrors { field message }
        }
      }
    `, {
      variables: {
        input: {
          firstName: firstName || '',
          lastName: lastName || '',
          email: email || undefined,
          phone: phone || undefined,
        }
      }
    });
    
    const createData = await createRes.json();
    const customer = createData?.data?.customerCreate?.customer;
    if (customer) {
      return customer.id;
    }
  } catch (err) {
    console.warn("[GraphQL Order] Error finding or creating customer (scopes might be missing):", err);
  }
  return null;
}

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

  // 1. Map Line Items
  let actualDiscountableSubtotal = 0;

  const draftLineItems = params.lineItems.map(item => {
    const line: any = { quantity: item.quantity };
    
    // Clean and validate variant ID
    let numericId = '';
    if (item.variantId) {
      numericId = String(item.variantId).replace(/[^0-9]/g, '');
      if (numericId) {
        line.variantId = `gid://shopify/ProductVariant/${numericId}`;
      }
    }
    
    // Pass custom title if provided or if it's a custom line item
    if (item.title) {
      line.title = item.title;
    }

    const itemPrice = typeof item.price === 'number' ? item.price : parseFloat(String(item.price));
    let nativePrice = itemPrice;
    if (numericId && params.nativePrices && params.nativePrices[numericId] !== undefined) {
      nativePrice = params.nativePrices[numericId];
    }

    // Shopify draft orders ignore appliedDiscount on variant line items.
    // Instead of applying line-level discounts, we calculate the total subtotal
    // using the native variant prices. Any difference between this native subtotal
    // and the requested targetTotal will be covered by the unified order-level discount.
    actualDiscountableSubtotal += nativePrice * item.quantity;

    // For custom items without variantId
    line.originalUnitPrice = nativePrice.toFixed(2);
    
    // For variant items, Shopify Draft Orders ignore originalUnitPrice. We must use priceOverride.
    // Important: currencyCode MUST match presentmentCurrencyCode
    if (line.variantId) {
      line.priceOverride = {
        amount: nativePrice.toFixed(2),
        currencyCode: params.presentmentCurrencyCode || params.currency || 'USD'
      };
    }
    
    return line;
  });

  const discountableSubtotal = actualDiscountableSubtotal;
  const shippingPrice = params.shippingLine ? parseFloat(String(params.shippingLine.price)) : 0;

  // We rely on the frontend's finalTotal (which was already validated by assertPricingConsistency).
  // If targetTotal is not provided, we fall back to a naive calculation using the line items' requested price.
  let targetTotal = params.targetTotal;
  if (targetTotal === undefined) {
      let requestedSubtotal = 0;
      params.lineItems.forEach(item => {
          const itemPrice = typeof item.price === 'number' ? item.price : parseFloat(String(item.price));
          requestedSubtotal += itemPrice * item.quantity;
      });
      targetTotal = requestedSubtotal + shippingPrice;
      if (params.discount && params.discount.amount > 0) {
          if (params.discount.valueType === 'PERCENTAGE') {
              targetTotal -= requestedSubtotal * (params.discount.amount / 100);
          } else {
              targetTotal -= params.discount.amount;
          }
      }
  }

  const unifiedDiscountAmount = Math.max(0, discountableSubtotal + shippingPrice - targetTotal);

  let appliedDiscount = undefined;
  if (unifiedDiscountAmount > 0.01) {
      let title = params.discount?.code ? params.discount.code : "Offers Applied";
      if (params.discount?.code && unifiedDiscountAmount > params.discount.amount + 0.01) {
          title = "Offers + " + params.discount.code;
      }
      appliedDiscount = {
          title: title,
          description: "Order discount",
          value: parseFloat(unifiedDiscountAmount.toFixed(2)),
          valueType: "FIXED_AMOUNT"
      };
  }

  // 2. Map Shipping Address
  const formatAddress = (addr: any) => {
    if (!addr) return undefined;
    return {
      firstName: addr.first_name || addr.firstName,
      lastName: addr.last_name || addr.lastName,
      address1: addr.address1,
      city: addr.city,
      province: addr.province,
      zip: addr.zip,
      country: addr.country,
      phone: addr.phone,
    };
  };

  // 3. Map Discount (Unified discount is already calculated above as `appliedDiscount`)

  // 4. Find or Create Customer to ensure it is linked in the Shopify Admin UI
  let customerId = null;
  if (!params.customer.email && params.customer.phone) {
    customerId = await findOrCreateCustomer(graphql, {
      firstName: params.customer.firstName || params.billingAddress?.firstName || params.shippingAddress?.firstName,
      lastName: params.customer.lastName || params.billingAddress?.lastName || params.shippingAddress?.lastName,
      email: params.customer.email,
      phone: params.customer.phone
    });
  }

  // 5. Build Draft Order Input
  // presentmentCurrencyCode locks the draft order (and resulting order) to the
  // customer's market currency. This is the critical fix for multi-currency stores.
  // It MUST come from the server-side contextual pricing result — never from frontend.
  const resolvedPresentmentCurrency = params.presentmentCurrencyCode || params.currency || undefined;
  const draftOrderInput: Record<string, any> = {
    lineItems: draftLineItems,
    tags: params.tags || [],
    note: params.note || '',
    customAttributes: params.noteAttributes || [],
    email: params.customer.email || undefined,
    sourceName: "Foxly COD + Partial & Prepaid",
    ...(resolvedPresentmentCurrency ? { presentmentCurrencyCode: resolvedPresentmentCurrency } : {}),
  };

  if (customerId) {
    draftOrderInput.purchasingEntity = { customerId };
  }

  if (params.shippingLine) {
    draftOrderInput.shippingLine = {
      title: params.shippingLine.title,
      price: typeof params.shippingLine.price === 'number' ? params.shippingLine.price.toFixed(2) : String(params.shippingLine.price)
    };
  }

  if (appliedDiscount) {
    draftOrderInput.appliedDiscount = appliedDiscount;
  }

  const shippingAddr = formatAddress(params.shippingAddress);
  const billingAddr = formatAddress(params.billingAddress) || shippingAddr;
  
  if (billingAddr) {
    draftOrderInput.billingAddress = billingAddr;
  }
  
  // NOTE: For COD, we intentionally OMIT shippingAddress during draftOrderCreate
  // to bypass Shopify's strict shipping zone validations during draftOrderComplete.
  // We will append it via orderUpdate immediately after the order is completed.

  console.log('[FOXCOD SHOPIFY PAYLOAD]', JSON.stringify(draftOrderInput, null, 2));
  console.log('[DRAFT ORDER VARIABLES]', JSON.stringify({ variables: { input: draftOrderInput } }, null, 2));

  // 5. Execute draftOrderCreate
  const createRes = await graphql(`
    mutation draftOrderCreate($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder {
          id
          lineItems(first: 20) {
            nodes {
              title
              quantity
              originalUnitPrice
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `, { variables: { input: draftOrderInput } });

  const createData = await createRes.json();
  console.log('[DRAFT ORDER CREATE RESPONSE]', JSON.stringify(createData, null, 2));
  const createErrors = createData?.data?.draftOrderCreate?.userErrors || [];
  
  if (createErrors.length > 0) {
    const errorMsg = createErrors.map((e: any) => e.message).join(', ');
    console.error(`[GraphQL Order] draftOrderCreate failed: ${errorMsg}`);
    return { success: false, error: errorMsg };
  }

  const draftOrderId = createData?.data?.draftOrderCreate?.draftOrder?.id;
  if (!draftOrderId) {
    console.error(`[GraphQL Order] draftOrderCreate returned no ID.`);
    return { success: false, error: 'Failed to create draft order.' };
  }

  // 6. Execute draftOrderComplete with paymentPending: true
  const completeRes = await graphql(`
    mutation draftOrderComplete($id: ID!, $paymentPending: Boolean!) {
      draftOrderComplete(id: $id, paymentPending: $paymentPending) {
        draftOrder {
          id
          order {
            id
            name
            statusPageUrl
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `, { variables: { id: draftOrderId, paymentPending: true } });

  const completeData = await completeRes.json();
  console.log('[DRAFT ORDER COMPLETE RESPONSE]', JSON.stringify(completeData, null, 2));
  const completeErrors = completeData?.data?.draftOrderComplete?.userErrors || [];

  if (completeErrors.length > 0) {
    const errorMsg = completeErrors.map((e: any) => e.message).join(', ');
    console.error(`[GraphQL Order] draftOrderComplete failed: ${errorMsg}`);
    return { success: false, error: `Draft completion failed: ${errorMsg}` };
  }

  const finalOrder = completeData?.data?.draftOrderComplete?.draftOrder?.order;
  if (!finalOrder) {
    console.error(`[GraphQL Order] draftOrderComplete returned no final order.`);
    return { success: false, error: 'Failed to complete draft order.' };
  }

  // Extract the raw numeric ID to preserve backward compatibility across the app
  const numericOrderId = String(finalOrder.id).split('/').pop() || '';

  // 7. Apply shipping/billing address via orderUpdate
  if (shippingAddr) {
    console.log(
      "[DEBUG SHIPPING ADDRESS]",
      JSON.stringify(shippingAddr, null, 2)
    );
    console.log(
      "[DEBUG ORDER UPDATE INPUT]",
      JSON.stringify(
        {
          id: finalOrder.id,
          shippingAddress: shippingAddr
        },
        null,
        2
      )
    );
    graphql(`
      mutation orderUpdate($input: OrderInput!) {
        orderUpdate(input: $input) {
          order { id }
          userErrors { field message }
        }
      }
    `, {
      variables: {
        input: {
          id: finalOrder.id,
          shippingAddress: shippingAddr
        }
      }
    }).then(async (updateRes: any) => {
      const updateData = await updateRes.json();
      console.log(
        "[DEBUG ORDER UPDATE RESPONSE]",
        JSON.stringify(updateData, null, 2)
      );
      const updateErrors = updateData?.data?.orderUpdate?.userErrors || [];
      if (updateErrors.length > 0) {
        console.warn(`[GraphQL Order] orderUpdate (address bypass) failed:`, updateErrors.map((e: any) => e.message).join(', '));
        // Non-fatal, the order is already created successfully.
      }
    }).catch((err: any) => {
      console.warn(`[GraphQL Order] orderUpdate (address bypass) caught error:`, err);
    });
  }

  return {
    success: true,
    orderId: numericOrderId,
    orderName: finalOrder.name,
    orderStatusUrl: finalOrder.statusPageUrl
  };
}
