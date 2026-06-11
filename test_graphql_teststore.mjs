import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function run() {
  const { data } = await supabase.from('shopify_sessions').select('*').eq('shop', 'fox-cod-test.myshopify.com').limit(1);
  const token = data[0].access_token;
  const shop = data[0].shop;

  const draftOrderInput = {
    lineItems: [
      {
        variantId: "gid://shopify/ProductVariant/44225448738839", // is this variant ID valid on fox-cod-test? NO!
        quantity: 1,
        priceOverride: {
          amount: "10.00",
          currencyCode: "USD"
        }
      }
    ],
    email: "test@example.com"
  };

  const query = `
    mutation draftOrderCreate($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder { id }
        userErrors { field message }
      }
    }
  `;

  const res = await fetch(`https://${shop}/admin/api/2025-10/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ query, variables: { input: draftOrderInput } })
  });
  
  const json = await res.json();
  console.log("Result:", JSON.stringify(json, null, 2));
}
run();
