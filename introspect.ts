import { unauthenticated } from "./app/shopify.server.ts";

async function run() {
  const { admin } = await unauthenticated.admin("rashelshah.myshopify.com");
  const res = await admin.graphql(`
    {
      __type(name: "DraftOrderAppliedDiscountInput") {
        inputFields {
          name
          type {
            name
            kind
            ofType {
              name
              kind
            }
          }
        }
      }
    }
  `);
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

run().catch(console.error);
