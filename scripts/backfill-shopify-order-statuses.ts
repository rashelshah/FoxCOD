import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
// Load environment variables
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const SHOPIFY_API_VERSION = '2024-04';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

interface Config {
  batchSize: number;
  dryRun: boolean;
}

const config: Config = {
  batchSize: 100, // Max 100 nodes per GraphQL query
  dryRun: process.argv.includes('--dry-run'),
};

const BACKFILL_QUERY = `
  query BackfillOrders($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Order {
        id
        name
        displayFinancialStatus
        displayFulfillmentStatus
        cancelledAt
        tags
        updatedAt
      }
    }
  }
`;

// Types
interface OrderLog {
  id: number;
  shop_domain: string;
  shopify_order_id: string;
}

interface ShopifyOrderNode {
  id: string;
  name: string;
  displayFinancialStatus: string | null;
  displayFulfillmentStatus: string | null;
  cancelledAt: string | null;
  tags: string[];
  updatedAt: string;
}

/**
 * Ensures ID is in global ID format
 */
function ensureGid(id: string): string {
  if (id.startsWith('gid://')) return id;
  return `gid://shopify/Order/${id}`;
}

/**
 * Fetch a shop's offline access token
 */
async function getShopToken(shopDomain: string): Promise<string | null> {
  const { data } = await supabase
    .from('shops')
    .select('access_token')
    .eq('shop_domain', shopDomain)
    .single();
  return data?.access_token || null;
}

/**
 * Queries Shopify GraphQL API
 */
async function queryShopify(shopDomain: string, token: string, query: string, variables: any) {
  const url = `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query, variables }),
  });

  const body = await response.json();
  if (!response.ok || body.errors) {
    throw new Error(`Shopify API error: ${JSON.stringify(body.errors || response.statusText)}`);
  }
  return body.data;
}

/**
 * Sleeps if we are hitting rate limits (basic implementation)
 */
async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runBackfill() {
  console.log(`Starting Backfill... [Dry Run: ${config.dryRun}]`);

  // 1. Fetch orders missing shopify_financial_status
  const { data: pendingOrders, error: fetchError } = await supabase
    .from('order_logs')
    .select('id, shop_domain, shopify_order_id')
    .is('shopify_financial_status', null)
    .not('shopify_order_id', 'is', null)
    .order('id', { ascending: false });

  if (fetchError) {
    console.error("Error fetching orders:", fetchError);
    process.exit(1);
  }

  if (!pendingOrders || pendingOrders.length === 0) {
    console.log("No orders found requiring backfill.");
    return;
  }

  console.log(`Found ${pendingOrders.length} orders to backfill.`);

  // 2. Group by shop domain because GraphQL queries must be per-shop
  const ordersByShop = pendingOrders.reduce((acc, order) => {
    if (!acc[order.shop_domain]) acc[order.shop_domain] = [];
    acc[order.shop_domain].push(order);
    return acc;
  }, {} as Record<string, OrderLog[]>);

  let totalUpdated = 0;

  // 3. Process each shop
  for (const [shopDomain, shopOrders] of Object.entries(ordersByShop)) {
    console.log(`\n--- Processing shop: ${shopDomain} (${shopOrders.length} orders) ---`);
    const token = await getShopToken(shopDomain);

    if (!token) {
      console.error(`Missing access token for ${shopDomain}. Skipping.`);
      continue;
    }

    // 4. Batch process orders
    for (let i = 0; i < shopOrders.length; i += config.batchSize) {
      const batch = shopOrders.slice(i, i + config.batchSize);
      const batchIds = batch.map(o => ensureGid(o.shopify_order_id));

      console.log(`Fetching batch ${i / config.batchSize + 1}... (${batch.length} nodes)`);

      try {
        const data = await queryShopify(shopDomain, token, BACKFILL_QUERY, { ids: batchIds });
        const nodes: ShopifyOrderNode[] = data.nodes || [];

        // 5. Upsert back to Supabase
        for (let j = 0; j < nodes.length; j++) {
          const node = nodes[j];
          const order = batch[j];

          if (!node) {
            console.warn(`Warning: Node null for ID ${batchIds[j]} (Order might be deleted in Shopify)`);
            continue;
          }

          if (config.dryRun) {
            console.log(`[DryRun] Would update order_logs.id=${order.id} with status=${node.displayFinancialStatus}`);
            totalUpdated++;
            continue;
          }

          const { error: updateError } = await supabase
            .from('order_logs')
            .update({
              shopify_financial_status: node.displayFinancialStatus?.toLowerCase() || null,
              shopify_fulfillment_status: node.displayFulfillmentStatus?.toLowerCase() || null,
              shopify_cancelled_at: node.cancelledAt || null,
              shopify_tags: node.tags || [],
              shopify_updated_at: node.updatedAt || null,
              shopify_order_name: node.name || null
            })
            .eq('id', order.id);

          if (updateError) {
            console.error(`Failed to update order ${order.id}:`, updateError.message);
          } else {
            totalUpdated++;
          }
        }

        // Rate limit padding (2 seconds per batch to stay safely under 50pts/sec)
        await sleep(2000);

      } catch (err: any) {
        console.error(`Error processing batch: ${err.message}`);
        // Resume safety: The script will pick up where it failed on the next run
      }
    }
  }

  console.log(`\n✅ Backfill Complete!`);
  console.log(`Rows processed: ${totalUpdated} / ${pendingOrders.length}`);
  if (config.dryRun) console.log("Note: This was a dry run. Run without --dry-run to commit changes.");
}

runBackfill();
