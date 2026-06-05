import { PrismaClient } from '@prisma/client';
import '@shopify/shopify-api/adapters/node';
import { shopifyApi } from '@shopify/shopify-api';

const prisma = new PrismaClient();

async function run() {
  const sessionData = await prisma.session.findFirst({ orderBy: { id: 'desc' } });
  if (!sessionData) {
    console.error("Session not found");
    return;
  }
  console.log("Using shop:", sessionData.shop);
  
  const shopify = shopifyApi({
    apiKey: process.env.SHOPIFY_API_KEY || "dummy",
    apiSecretKey: process.env.SHOPIFY_API_SECRET || "dummy",
    apiVersion: "2024-04",
    scopes: [],
    hostName: "dummy",
    isEmbeddedApp: true
  });
  
  const session = new shopify.session.Storage({
      id: sessionData.id,
      shop: sessionData.shop,
      state: sessionData.state,
      isOnline: sessionData.isOnline,
      accessToken: sessionData.accessToken
  });
  
  const client = new shopify.clients.Graphql({ session });
  
  const query = `
    query {
      metafieldDefinitions(first: 50, ownerType: SHOP, namespace: "fox_cod") {
        edges {
          node {
            key
            access {
              storefront
            }
          }
        }
      }
    }
  `;
  
  try {
    const response = await client.request(query);
    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error("GraphQL error:", error);
  }
}

run();
