import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function run() {
  const { data } = await supabase.from('shopify_sessions').select('*').eq('shop', 'fox-cod-test.myshopify.com').limit(1);
  const token = data[0].access_token;
  const shop = data[0].shop;

  const query = `
    mutation draftOrderComplete($id: ID!, $paymentPending: Boolean!) {
      draftOrderComplete(id: $id, paymentPending: $paymentPending) {
        draftOrder { id }
        userErrors { field message }
      }
    }
  `;

  const res = await fetch(`https://${shop}/admin/api/2025-10/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ query, variables: { id: "gid://shopify/DraftOrder/1304660967660", paymentPending: true } })
  });
  
  const json = await res.json();
  console.log(JSON.stringify(json, null, 2));
}
run();
