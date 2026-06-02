async function run() {
  const shop = 'fox-cod-dev.myshopify.com';
  const token = process.env.SHOPIFY_TOKEN || '';
  
  const query = `
    mutation draftOrderCreate($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder {
          id
          invoiceUrl
        }
        userErrors {
          field
          message
        }
      }
    }
  `;
  
  const res = await fetch(`https://${shop}/admin/api/2024-01/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token
    },
    body: JSON.stringify({
      query,
      variables: {
        input: {
          lineItems: [
            {
              title: "Custom Downsell Product",
              originalUnitPrice: "674.96",
              quantity: 1
            }
          ],
          appliedDiscount: {
            title: "Partial Payment Remaining",
            value: 574.96,
            valueType: "FIXED_AMOUNT"
          }
        }
      }
    })
  });
  
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

run();
