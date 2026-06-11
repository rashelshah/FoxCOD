import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function run() {
  const { data } = await supabase.from('shopify_sessions').select('*').eq('shop', 'fox-cod-test.myshopify.com').limit(1);
  const token = data[0].access_token;
  const shop = data[0].shop;

  const orderId = "gid://shopify/Order/6759690600684";

  const updateQuery = `
    mutation orderUpdate($input: OrderInput!) {
      orderUpdate(input: $input) {
        order { id shippingAddress { firstName address1 } }
        userErrors { field message }
      }
    }
  `;

  const input = {
    id: orderId,
    shippingAddress: {
      firstName: "Test",
      lastName: "User",
      address1: "123 Bypass Street",
      city: "Bypass City",
      province: "California",
      zip: "90001",
      country: "United States"
    }
  };

  const res = await fetch(`https://${shop}/admin/api/2025-10/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ query: updateQuery, variables: { input } })
  });
  
  const json = await res.json();
  console.log("Update:", JSON.stringify(json, null, 2));
}
run();
