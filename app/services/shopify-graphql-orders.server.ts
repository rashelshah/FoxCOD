import { unauthenticated } from '../shopify.server';

export interface GraphQLOrderParams {
  shop: string;
  currency?: string;
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
  shippingLine?: { title: string; price: string };
  discount?: { code: string; amount: number; valueType: 'FIXED_AMOUNT' | 'PERCENTAGE' };
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
export async function createPendingOrder(params: GraphQLOrderParams): Promise<GraphQLOrderResult> {
  const { shop } = params;
  const { admin } = await unauthenticated.admin(shop);
  const graphql = admin.graphql;

  // 1. Map Line Items
  const draftLineItems = params.lineItems.map(item => {
    const line: any = { quantity: item.quantity };
    
    // Clean and validate variant ID
    if (item.variantId) {
      const numericId = String(item.variantId).replace(/[^0-9]/g, '');
      if (numericId) {
        line.variantId = `gid://shopify/ProductVariant/${numericId}`;
      }
    }
    
    // Pass custom title if provided or if it's a custom line item
    if (item.title) {
      line.title = item.title;
    }

    // For custom items without variantId
    line.originalUnitPrice = typeof item.price === 'number' ? item.price.toFixed(2) : String(item.price);
    
    // For variant items, Shopify Draft Orders ignore originalUnitPrice. We must use priceOverride.
    if (line.variantId) {
      line.priceOverride = {
        amount: typeof item.price === 'number' ? item.price.toFixed(2) : String(item.price),
        currencyCode: params.currency || 'USD'
      };
    }
    
    return line;
  });

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

  // 3. Map Discount
  let appliedDiscount;
  if (params.discount && params.discount.amount > 0) {
    appliedDiscount = {
      title: params.discount.code || "Discount",
      value: params.discount.amount,
      valueType: params.discount.valueType || 'FIXED_AMOUNT'
    };
  }

  // 4. Build Draft Order Input
  const draftOrderInput: Record<string, any> = {
    lineItems: draftLineItems,
    tags: params.tags || [],
    note: params.note || '',
    customAttributes: params.noteAttributes || [],
    email: params.customer.email || undefined,
  };

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
  if (shippingAddr) {
    draftOrderInput.shippingAddress = shippingAddr;
    draftOrderInput.billingAddress = formatAddress(params.billingAddress) || shippingAddr;
  }

  // 5. Execute draftOrderCreate
  const createRes = await graphql(`
    mutation draftOrderCreate($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder {
          id
        }
        userErrors {
          field
          message
        }
      }
    }
  `, { variables: { input: draftOrderInput } });

  const createData = await createRes.json();
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

  return {
    success: true,
    orderId: numericOrderId,
    orderName: finalOrder.name,
    orderStatusUrl: finalOrder.statusPageUrl
  };
}
