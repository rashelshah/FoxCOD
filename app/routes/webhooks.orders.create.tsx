import type { ActionFunctionArgs } from "react-router";
import { authenticate, unauthenticated } from "../shopify.server";
import { logOrder, logOrderWithShopifyIds, type OrderLogEntry, supabase } from "../config/supabase.server";
import { syncOrderToGoogleSheets } from "../services/google-sheets.server";
import { parseInventoryMetadata, deductInventory } from "../services/inventory-sync.server";

/**
 * Webhook Handler: orders/create
 * 
 * This webhook is triggered when a new order is created in Shopify.
 * We use it to detect Partial COD orders (via custom attributes) and log them.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const fs = require('fs');
    fs.appendFileSync('/Users/rashelshah/Desktop/codes/fox-cod-first-test-app/webhook-debug.log', `[${new Date().toISOString()}] Webhook triggered for orders/create\n`);
  } catch (e) {}

  const { topic, shop, payload, admin } = await authenticate.webhook(request);

  console.log(`[WEBHOOK RECEIVED] ${JSON.stringify({ topic, orderId: payload.id, fulfillmentId: undefined, payload: { source: payload.source_name, tags: payload.tags, financialStatus: payload.financial_status } })}`);
  console.log(`[ORDER CREATED] ${JSON.stringify({ orderId: payload.id, source: payload.source_name, tags: payload.tags, financialStatus: payload.financial_status, fulfillmentStatus: payload.fulfillment_status })}`);
  console.log(`[Webhook] Received ${topic} for ${shop}`);
  console.log(
    "[Webhook] Order payload:",
    JSON.stringify(payload, null, 2).substring(0, 2000),
  );

  try {
    const noteAttributes = payload.note_attributes || [];
    const partialCodAttr = noteAttributes.find((attr: any) => attr.name === "partial_cod");
    const fullPrepaidAttr = noteAttributes.find((attr: any) => attr.name === "full_prepaid");
    const discountCodes = payload.discount_codes || [];
    const discountApps = payload.discount_applications || [];
    
    try {
      const fs = require('fs');
      fs.appendFileSync('/Users/rashelshah/Desktop/codes/fox-cod-first-test-app/webhook-debug.log', `[${new Date().toISOString()}] Payload ID: ${payload.id}, Discount Codes: ${JSON.stringify(discountCodes)}, Discount Apps: ${JSON.stringify(discountApps)}, Note Attrs: ${JSON.stringify(noteAttributes)}\n`);
    } catch (e) {}
    
    const pcodCode = discountCodes.find((dc: any) => dc.code?.startsWith("FOX-PCOD-"));
    const pcodApp = discountApps.find((da: any) => da.code?.startsWith("FOX-PCOD-") || da.title?.startsWith("FoxlyCOD Partial Payment"));
    
    const isFullPrepaid = fullPrepaidAttr?.value === "true" || (payload.tags && payload.tags.includes("FoxlyCOD, Full Prepaid")) || (payload.tags && payload.tags.includes("Full Prepaid"));
    const isPartialCod = !isFullPrepaid && (partialCodAttr?.value === "true" || !!pcodCode || !!pcodApp || (payload.tags && payload.tags.includes("Partial COD")));
    const isRegularCod = !isPartialCod && !isFullPrepaid && payload.tags && payload.tags.includes("COD");

    const customAttributes = payload.note_attributes || [];
    const inventoryMetadata = parseInventoryMetadata(customAttributes);

    if (!isPartialCod && !isFullPrepaid && !isRegularCod && inventoryMetadata.length === 0) {
      console.log("[Webhook] Not a FoxlyCOD order and no inventory metadata, skipping");
      return new Response(null, { status: 200 });
    }

    console.log("[Webhook] Detected FoxlyCOD order:", payload.name, "| isFullPrepaid:", isFullPrepaid, "| isPartialCod:", isPartialCod, "| isRegularCod:", isRegularCod, "| hasInventory:", inventoryMetadata.length > 0);

    // ── Idempotency & Inventory Deduction ──
    if (inventoryMetadata.length > 0) {
      console.log(`[Webhook] Order ${payload.id} has inventory metadata for ${inventoryMetadata.length} variants. Deducting inventory...`);
      await deductInventory(shop, String(payload.id), inventoryMetadata);
      console.log(`[Webhook] Successfully evaluated inventory for ${payload.id}`);
    }

    const getAttrValue = (key: string) => {
      const attr = noteAttributes.find((attribute: any) => attribute.name === key);
      return attr?.value || "";
    };

    let advanceAmount = parseFloat(getAttrValue("advance_amount")) || 0;
    let remainingAmount = parseFloat(getAttrValue("remaining_amount")) || 0;
    
    if ((pcodCode || pcodApp) && remainingAmount === 0) {
      // If note_attributes were stripped by Shop Pay / Accelerated Checkout, recover values
      const discountValue = pcodCode ? parseFloat(pcodCode.amount) : parseFloat(pcodApp.value);
      remainingAmount = discountValue || 0;
      advanceAmount = parseFloat(payload.total_price) || 0;
    }

    const originalProductId = getAttrValue("original_product_id");
    const originalVariantId = getAttrValue("original_variant_id");
    const originalQuantity = parseInt(getAttrValue("original_quantity")) || 1;
    const originalPrice = parseFloat(getAttrValue("original_price")) || 0;
    const customerName = getAttrValue("customer_name");
    const customerAddress = getAttrValue("customer_address");
    const customerCity = getAttrValue("customer_city");
    const customerState = getAttrValue("customer_state");
    const customerZipcode = getAttrValue("customer_zipcode");

    const customer = payload.customer || {};
    const shippingAddress = payload.shipping_address || {};
    const lineItem = payload.line_items?.[0] || {};

    const orderLogEntry: OrderLogEntry = {
      shop_domain: shop,
      product_id: originalProductId || lineItem.product_id?.toString() || "",
      product_title: lineItem.title || "Advance Payment",
      variant_id: originalVariantId || lineItem.variant_id?.toString(),
      variant_title: lineItem.variant_title,
      quantity: originalQuantity,
      price: originalPrice.toString(),
      customer_name:
        customerName ||
        `${customer.first_name || ""} ${customer.last_name || ""}`.trim() ||
        shippingAddress.name ||
        "Customer",
      customer_phone: customer.phone || shippingAddress.phone || "",
      customer_address:
        customerAddress ||
        `${shippingAddress.address1 || ""} ${shippingAddress.address2 || ""}`.trim(),
      customer_email: customer.email || "",
      city: customerCity || shippingAddress.city || "",
      state: customerState || shippingAddress.province || "",
      pincode: customerZipcode || shippingAddress.zip || "",
      notes: payload.note || "",
      currency: payload.currency || "USD"
    };

    if (isFullPrepaid) {
      orderLogEntry.payment_method = 'full_prepaid';
      orderLogEntry.is_full_prepaid = true;
      orderLogEntry.advance_amount = advanceAmount;
      orderLogEntry.remaining_cod_amount = remainingAmount; // Should be 0
    } else if (isPartialCod) {
      orderLogEntry.payment_method = 'partial_cod';
      orderLogEntry.is_partial_cod = true;
      orderLogEntry.advance_amount = advanceAmount;
      orderLogEntry.remaining_cod_amount = remainingAmount;
    } else if (isRegularCod) {
      orderLogEntry.payment_method = 'cod'; // Note: logOrder expects 'cod' for regular cod
      orderLogEntry.is_partial_cod = false;
      orderLogEntry.is_full_prepaid = false;
      orderLogEntry.advance_amount = 0;
      orderLogEntry.remaining_cod_amount = parseFloat(payload.total_price) || 0;
    }

    console.log("[Webhook] Logging special COD order:", orderLogEntry);
    await logOrderWithShopifyIds(orderLogEntry, payload.id.toString(), payload.name);
    console.log("[Webhook] Special COD order logged successfully:", payload.name);

    // ── Billing: count this order against the shop's plan allowance ──
    //
    // This is the ONLY place orders are counted. It runs off orders/create, so
    // by definition the order is a real, successfully created Shopify order —
    // draft orders, abandoned checkouts and failed form submissions never get
    // here, no matter which of the four order flows produced them.
    //
    // Excluded: test orders (payload.test) and orders that arrive already
    // cancelled. Non-FoxlyCOD orders were filtered out further up; an order
    // that only carried inventory metadata is not ours to bill for.
    //
    // Shopify marks EVERY order placed on a development store as payload.test
    // = true, regardless of how it was created — there is no way to produce a
    // non-test order on a dev store. That's correct to exclude on a real
    // merchant's live store (it's how Shopify's Bogus/test payment gateway
    // orders are flagged), but it also means order counting can never be
    // exercised on a dev store under this rule. BILLING_COUNT_TEST_ORDERS is
    // an explicit, opt-in-only escape hatch for that: unset or "false" in
    // every real deployment, set to "true" only in a dev store session to
    // validate the counting logic end-to-end.
    const countTestOrders = process.env.BILLING_COUNT_TEST_ORDERS === "true";
    if (isPartialCod || isFullPrepaid || isRegularCod) {
      if (payload.test && !countTestOrders) {
        console.log("[Billing] Skipping test order", payload.id);
      } else if (payload.cancelled_at) {
        console.log("[Billing] Skipping already-cancelled order", payload.id);
      } else {
        try {
          const { incrementOrderCount } = await import("../services/billing/order-counter.server");
          const orderType = isFullPrepaid
            ? "full_prepaid"
            : isPartialCod
              ? "partial_cod"
              : "cod";

          // The Shopify order id is the dedupe key, so a redelivered webhook
          // counts once no matter how many times it fires.
          const counted = await incrementOrderCount(shop, {
            eventKey: payload.id.toString(),
            orderType,
            shopifyOrderId: payload.id.toString(),
            shopifyOrderName: payload.name,
          });

          console.log(
            `[Billing] Order ${payload.name} ${counted.counted ? "counted" : "already counted"}` +
            ` (${counted.usage.orderCount}/${counted.usage.isUnlimited ? "∞" : counted.usage.includedOrders})`,
          );
        } catch (billingError: any) {
          // Metering must never break order processing.
          console.error("[Billing] Failed to count order:", billingError?.message);
        }
      }
    }

    // Sync to Google Sheets
    syncOrderToGoogleSheets(shop, {
      orderId: payload.id?.toString(),
      orderName: payload.name,
      customerName: orderLogEntry.customer_name,
      phone: orderLogEntry.customer_phone,
      email: orderLogEntry.customer_email || '',
      address: orderLogEntry.customer_address,
      city: orderLogEntry.city || '',
      state: orderLogEntry.state || '',
      pincode: orderLogEntry.pincode || '',
      product: orderLogEntry.product_title,
      quantity: orderLogEntry.quantity,
      totalPrice: orderLogEntry.price,
      paymentMethod: orderLogEntry.payment_method === 'full_prepaid' ? 'full_prepaid' : 
                     orderLogEntry.payment_method === 'partial_cod' ? 'partial_cod' : 'full_cod',
      status: 'pending',
    }).catch((err) => {
      console.error('[Webhook] Google Sheets sync error (non-blocking):', err.message);
    });

    // ── Apply Order Edit to Fix Order Total and Payment Status ──
    let graphqlAdmin = admin;
    if (!graphqlAdmin) {
      console.log(`[Webhook] 'admin' context missing, falling back to unauthenticated.admin...`);
      const unauth = await unauthenticated.admin(shop);
      graphqlAdmin = unauth.admin;
    }

    if (graphqlAdmin) {
      try {
        console.log(`[Webhook] Updating tags for order ${payload.id}...`);
        
        try {
          const fs = require('fs');
          fs.appendFileSync('/Users/rashelshah/Desktop/codes/fox-cod-first-test-app/webhook-debug.log', `[${new Date().toISOString()}] Executing tagsAdd and Order Edit for ${payload.id}\n`);
        } catch (e) {}
        
        // 0. Add tags
        await graphqlAdmin.graphql(
          `mutation tagsAdd($id: ID!, $tags: [String!]!) {
            tagsAdd(id: $id, tags: $tags) {
              userErrors {
                message
              }
            }
          }`,
          {
            variables: { 
              id: `gid://shopify/Order/${payload.id}`,
              tags: isFullPrepaid ? ["FoxlyCOD", "Full Prepaid"] : isPartialCod ? ["FoxlyCOD", "Partial COD", "Pending Advance"] : ["FoxlyCOD", "COD"]
            },
          }
        );

        if (remainingAmount > 0) {
          console.log(`[Webhook] Starting Order Edit for order ${payload.id} to add remaining balance...`);
          // 1. Begin Order Edit
          const beginRes = await graphqlAdmin.graphql(
            `mutation orderEditBegin($id: ID!) {
              orderEditBegin(id: $id) {
                calculatedOrder {
                  id
                }
                userErrors {
                  field
                  message
                }
              }
            }`,
            {
              variables: { id: `gid://shopify/Order/${payload.id}` },
            }
          );
          
          const beginData = await beginRes.json();
          const calculatedOrderId = beginData.data?.orderEditBegin?.calculatedOrder?.id;
          
          if (calculatedOrderId) {
            // 2. Add Custom Item for Remaining Balance
            const addRes = await graphqlAdmin.graphql(
              `mutation orderEditAddCustomItem($id: ID!, $price: MoneyInput!, $quantity: Int!, $title: String!) {
                orderEditAddCustomItem(id: $id, price: $price, quantity: $quantity, title: $title) {
                  calculatedOrder {
                    id
                  }
                  userErrors {
                    field
                    message
                  }
                }
              }`,
              {
                variables: {
                  id: calculatedOrderId,
                  title: "Pending Cash on Delivery Balance",
                  price: {
                    amount: remainingAmount.toFixed(2),
                    currencyCode: payload.currency || "USD"
                  },
                  quantity: 1
                }
              }
            );
            
            const addData = await addRes.json();
            const addErrors = addData.data?.orderEditAddCustomItem?.userErrors || [];
            
            if (addErrors.length === 0) {
              // 3. Commit Order Edit
              await graphqlAdmin.graphql(
                `mutation orderEditCommit($id: ID!) {
                  orderEditCommit(id: $id, notifyCustomer: false, staffNote: "Added Pending COD Balance") {
                    order {
                      id
                    }
                    userErrors {
                      field
                      message
                    }
                  }
                }`,
                {
                  variables: { id: calculatedOrderId }
                }
              );
              console.log(`[Webhook] Order ${payload.id} successfully updated with pending COD balance.`);
            } else {
              console.error(`[Webhook] Error adding custom item during order edit:`, addErrors);
            }
          } else {
            console.error(`[Webhook] Error beginning order edit:`, beginData.data?.orderEditBegin?.userErrors);
          }
        }
      } catch (editError: any) {
        try {
          const fs = require('fs');
          fs.appendFileSync('/Users/rashelshah/Desktop/codes/fox-cod-first-test-app/webhook-debug.log', `[${new Date().toISOString()}] Order Edit Error: ${editError.message}\n`);
        } catch (e) {}
        console.error(`[Webhook] Failed to apply Order Edit API or Tags for Partial COD:`, editError);
      }
    } else {
      try {
        const fs = require('fs');
        fs.appendFileSync('/Users/rashelshah/Desktop/codes/fox-cod-first-test-app/webhook-debug.log', `[${new Date().toISOString()}] graphqlAdmin is null\n`);
      } catch (e) {}
    }

    return new Response(null, { status: 200 });
  } catch (error) {
    console.error("[Webhook] Error processing orders/create:", error);
    return new Response(null, { status: 200 });
  }
};
