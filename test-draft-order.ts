import { PrismaClient } from '@prisma/client';
async function run() {
  const prisma = new PrismaClient();
  const session = await prisma.session.findFirst({
    where: { shop: 'fox-cod-dev.myshopify.com' }
  });
  
  if (!session?.accessToken) return;
  
  const payload = {
    draft_order: {
      line_items: [
        {
          variant_id: 44225448017943, // The Collection Snowboard: Liquid
          quantity: 1,
          price: "674.96",
          title: "The Collection Snowboard: Liquid"
        }
      ]
    }
  };
  
  const res = await fetch(`https://fox-cod-dev.myshopify.com/admin/api/2024-01/draft_orders.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': session.accessToken
    },
    body: JSON.stringify(payload)
  });
  
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

run();
