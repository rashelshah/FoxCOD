import { createPendingOrder } from './app/services/shopify-graphql-orders.server.ts';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  try {
    const res = await createPendingOrder({
      shop: 'fox-cod-test.myshopify.com',
      currency: 'USD',
      lineItems: [
        {
          variantId: "gid://shopify/ProductVariant/47707203567852",
          quantity: 1,
          price: "10.00"
        }
      ],
      customer: {
        firstName: "Test",
        lastName: "User",
      }
    });
    console.log("Result:", res);
  } catch(e) {
    console.error("Caught error:", e);
  }
}
run();
