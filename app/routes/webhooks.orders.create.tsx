import type { ActionFunctionArgs } from "react-router";
import { authenticate, unauthenticated } from "../shopify.server";
import { logOrder, type OrderLogEntry } from "../config/supabase.server";

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
    const pcodApp = discountApps.find((da: any) => da.code?.startsWith("FOX-PCOD-") || da.title?.startsWith("FoxCOD Partial Payment"));
    
    const isFullPrepaid = fullPrepaidAttr?.value === "true" || (payload.tags && payload.tags.includes("FoxCOD, Full Prepaid"));
    const isPartialCod = !isFullPrepaid && (partialCodAttr?.value === "true" || !!pcodCode || !!pcodApp);

    if (!isPartialCod && !isFullPrepaid) {
      console.log("[Webhook] Not a partial COD or Full Prepaid order, skipping");
      return new Response(null, { status: 200 });
    }

    console.log("[Webhook] Detected Special COD order:", payload.name, "| isFullPrepaid:", isFullPrepaid);

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
    } else {
      orderLogEntry.payment_method = 'partial_cod';
      orderLogEntry.is_partial_cod = true;
      orderLogEntry.advance_amount = advanceAmount;
      orderLogEntry.remaining_cod_amount = remainingAmount;
    }

    console.log("[Webhook] Logging special COD order:", orderLogEntry);
    await logOrder(orderLogEntry);
    console.log("[Webhook] Special COD order logged successfully:", payload.name);

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
              tags: isFullPrepaid ? ["FoxCOD", "Full Prepaid"] : ["FoxCOD", "Partial COD", "Pending Advance"]
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
