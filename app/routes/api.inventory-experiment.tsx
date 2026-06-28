import type { LoaderFunctionArgs } from "react-router";
import { unauthenticated } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop) {
    return new Response(JSON.stringify({ error: "Missing ?shop= parameter" }), { status: 400 });
  }

  try {
    const { admin } = await unauthenticated.admin(shop);
    const graphql = admin.graphql;

    const results: any[] = [];
    const log = (step: string, data: any) => {
      results.push({ step, data });
    };

    // 1. Find a variant
    const query = `
      query {
        products(first: 1) {
          edges {
            node {
              variants(first: 1) {
                edges {
                  node {
                    id
                    inventoryItem {
                      id
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;
    const res = await graphql(query);
    const data = await res.json();
    const variant = data.data.products.edges[0].node.variants.edges[0].node;
    const inventoryItemId = variant.inventoryItem.id;

    log("1. Selected Inventory Item", inventoryItemId);

    // Helper to read inventory
    async function readInventory() {
      const q = `
        query {
          inventoryItem(id: "${inventoryItemId}") {
            inventoryLevels(first: 5) {
              edges {
                node {
                  location { id }
                  quantities(names: ["available", "reserved", "on_hand", "committed"]) {
                    name
                    quantity
                  }
                }
              }
            }
          }
        }
      `;
      const r = await graphql(q);
      const d = await r.json();
      const levels = d.data.inventoryItem.inventoryLevels.edges;
      return levels[0].node;
    }

    const initialState = await readInventory();
    const locationId = initialState.location.id;
    log("2. Initial State", initialState.quantities);

    // Ensure we have at least 1 available to run the test
    const availableQty = initialState.quantities.find((q: any) => q.name === "available")?.quantity || 0;
    if (availableQty < 1) {
      log("ERROR", "Not enough available inventory to run the test. Please manually increase available inventory for this product.");
      return new Response(JSON.stringify({ results }, null, 2), { headers: { "Content-Type": "application/json" } });
    }

    // 2. Move available -> reserved
    const moveQ = `
      mutation inventoryMoveQuantities($input: InventoryMoveQuantitiesInput!) {
        inventoryMoveQuantities(input: $input) {
          inventoryAdjustmentGroup { reason }
          userErrors { field message }
        }
      }
    `;
    const moveRes = await graphql(moveQ, {
      variables: {
        input: {
          reason: "reservation",
          name: "available",
          toName: "reserved",
          changes: [{ delta: 1, inventoryItemId, locationId }]
        }
      }
    });
    log("3. Move Result (available -> reserved)", await moveRes.json());

    // 3. Read again
    const postMoveState = await readInventory();
    log("4. State After Move", postMoveState.quantities);

    // 4. Adjust reserved (-1)
    const adjQ = `
      mutation inventoryAdjustQuantities($input: InventoryAdjustQuantitiesInput!) {
        inventoryAdjustQuantities(input: $input) {
          inventoryAdjustmentGroup { reason }
          userErrors { field message }
        }
      }
    `;
    const adjRes = await graphql(adjQ, {
      variables: {
        input: {
          reason: "correction",
          name: "reserved",
          changes: [{ delta: -1, inventoryItemId, locationId }]
        }
      }
    });
    log("5. Adjust Result (reserved -1)", await adjRes.json());

    // 5. Read again
    const postAdjState = await readInventory();
    log("6. State After Adjust", postAdjState.quantities);

    // 6. Restore to original on_hand by adjusting available +1
    // (Since we essentially fulfilled 1 item, on_hand went down. We want to put it back for the user's test store)
    const restoreRes = await graphql(adjQ, {
      variables: {
        input: {
          reason: "correction",
          name: "available",
          changes: [{ delta: 1, inventoryItemId, locationId }]
        }
      }
    });
    log("7. Restore Result (available +1)", await restoreRes.json());

    // 7. Final State
    const finalState = await readInventory();
    log("8. Final State (Should match Initial State)", finalState.quantities);

    return new Response(JSON.stringify({ results }, null, 2), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
};
