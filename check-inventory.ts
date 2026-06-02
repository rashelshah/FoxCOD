async function run() {
  const shop = 'fox-cod-dev.myshopify.com';
  const token = process.env.SHOPIFY_TOKEN || '';
  
  const query = `
    query {
      products(first: 5, query: "title:*Complete Snowboard*") {
        edges {
          node {
            id
            title
            status
            variants(first: 5) {
              edges {
                node {
                  id
                  title
                  inventoryQuantity
                  inventoryPolicy
                  availableForSale
                }
              }
            }
          }
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
    body: JSON.stringify({ query })
  });
  
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

run();
