import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { unauthenticated } from "../shopify.server";
import { getShop } from "../config/supabase.server";

// Provide a simple authentication mechanism for the cron job
const CRON_SECRET = process.env.CRON_SECRET || "default_cron_secret";

/**
 * Route: /api/cleanup-draft-orders
 * Purpose: Periodically called by a cron job to delete abandoned draft orders
 * (Draft orders in INVOICE_SENT status older than 48 hours).
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
    return handleRequest(request);
};

export const action = async ({ request }: ActionFunctionArgs) => {
    return handleRequest(request);
};

async function handleRequest(request: Request) {
    try {
        const url = new URL(request.url);
        const secret = url.searchParams.get("secret") || request.headers.get("Authorization")?.replace("Bearer ", "");

        if (secret !== CRON_SECRET && CRON_SECRET !== "default_cron_secret") {
            return new Response("Unauthorized", { status: 401 });
        }

        const shopDomain = url.searchParams.get("shop");
        if (!shopDomain) {
            return new Response("Missing shop parameter", { status: 400 });
        }

        // Verify shop exists
        const shop = await getShop(shopDomain);
        if (!shop) {
            return new Response("Shop not found", { status: 404 });
        }

        const { admin } = await unauthenticated.admin(shopDomain);

        // Calculate the timestamp for 48 hours ago
        const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

        // Query draft orders with status INVOICE_SENT and older than 48 hours
        const query = `status:INVOICE_SENT created_at:<'${fortyEightHoursAgo}'`;

        const response = await admin.graphql(
            `#graphql
            query getAbandonedDraftOrders($query: String!) {
                draftOrders(first: 50, query: $query) {
                    edges {
                        node {
                            id
                            createdAt
                            status
                        }
                    }
                }
            }`,
            {
                variables: { query },
            }
        );

        const data = await response.json();
        
        if (data.errors) {
            console.error("[Cleanup Draft Orders] GraphQL Error:", data.errors);
            return new Response("GraphQL Error", { status: 500 });
        }

        const draftOrders = data.data?.draftOrders?.edges || [];
        const deletedIds: string[] = [];
        const failedIds: string[] = [];

        for (const edge of draftOrders) {
            const draftOrderId = edge.node.id;
            try {
                const deleteResponse = await admin.graphql(
                    `#graphql
                    mutation draftOrderDelete($input: DraftOrderDeleteInput!) {
                        draftOrderDelete(input: $input) {
                            deletedId
                            userErrors {
                                field
                                message
                            }
                        }
                    }`,
                    {
                        variables: {
                            input: { id: draftOrderId },
                        },
                    }
                );

                const deleteData = await deleteResponse.json();
                
                if (deleteData.data?.draftOrderDelete?.userErrors?.length > 0) {
                    console.error(`[Cleanup Draft Orders] Failed to delete ${draftOrderId}:`, deleteData.data.draftOrderDelete.userErrors);
                    failedIds.push(draftOrderId);
                } else if (deleteData.data?.draftOrderDelete?.deletedId) {
                    deletedIds.push(draftOrderId);
                } else {
                    failedIds.push(draftOrderId);
                }
            } catch (error) {
                console.error(`[Cleanup Draft Orders] Exception deleting ${draftOrderId}:`, error);
                failedIds.push(draftOrderId);
            }
        }

        return new Response(JSON.stringify({
            success: true,
            message: `Cleaned up ${deletedIds.length} abandoned draft orders.`,
            deleted: deletedIds,
            failed: failedIds,
        }), { 
            status: 200,
            headers: { "Content-Type": "application/json" }
        });

    } catch (error: any) {
        console.error("[Cleanup Draft Orders] Unexpected error:", error);
        return new Response(JSON.stringify({
            success: false,
            error: error.message || "Internal Server Error"
        }), { 
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}
