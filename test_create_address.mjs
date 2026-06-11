import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function run() {
  const { data } = await supabase.from('shopify_sessions').select('*').eq('shop', 'fox-cod-test.myshopify.com').limit(1);
  const token = data[0].access_token;
  const shop = data[0].shop;

  const createQuery = `
    mutation draftOrderCreate($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder { id }
        userErrors { field message }
      }
    }
  `;

  const input = {
    lineItems: [
      { variantId: "gid://shopify/ProductVariant/47707203567852", quantity: 1 }
    ],
    shippingAddress: {
      firstName: "Test",
      lastName: "User",
      address1: "123 Bypass Street",
      city: "Bypass City",
      province: "California",
      zip: "90001",
      country: "United States"
    },
    shippingLine: { title: "COD Shipping", price: "0.00" },
  };

  const res1 = await fetch(`https://${shop}/admin/api/2025-10/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ query: createQuery, variables: { input } })
  });
  
  const json1 = await res1.json();
  console.log("Create with Address:", JSON.stringify(json1, null, 2));
}
run();
