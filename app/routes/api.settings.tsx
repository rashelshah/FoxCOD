/**
 * Settings API Endpoint
 * Route: GET /api/settings
 * 
 * Returns form settings for storefront extension (public endpoint)
 * Also returns the app URL for API calls
 */

import type { LoaderFunctionArgs } from "react-router";
import { getFormSettings } from "../config/supabase.server";

// CORS headers
const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
};

/**
 * Loader: Get form settings and app URL for a shop
 * Query param: ?shop=mystore.myshopify.com
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
    // Handle preflight OPTIONS request
    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);
    const shop = url.searchParams.get("shop");

    // Validate shop parameter
    if (!shop) {
        return Response.json({
            success: false,
            error: "Shop parameter is required"
        }, {
            status: 400,
            headers: corsHeaders,
        });
    }

    try {
        // Get app URL from request
        let appUrl = process.env.SHOPIFY_APP_URL || '';

        if (!appUrl) {
            // Get from request URL
            appUrl = url.origin;
        }

        // Get form settings from Supabase
        const settings = await getFormSettings(shop);

        if (!settings) {
            // Return default disabled settings if none exist
            return Response.json({
                success: true,
                appUrl: appUrl,
                settings: {
                    enabled: false,
                    button_text: "Buy with COD",
                    primary_color: "#667eea",
                    required_fields: ["name", "phone", "address"],
                    max_quantity: 10,
                }
            }, {
                headers: corsHeaders,
            });
        }

        // Return settings with app URL
        return Response.json({
            success: true,
            appUrl: appUrl,
            settings: {
                enabled: settings.enabled,
                button_text: settings.button_text,
                primary_color: settings.primary_color,
                required_fields: settings.required_fields,
                max_quantity: settings.max_quantity,
            }
        }, {
            headers: corsHeaders,
        });
    } catch (error: any) {
        console.error("Error fetching settings:", error);

        return Response.json({
            success: false,
            error: "Failed to fetch settings",
        }, {
            status: 500,
            headers: corsHeaders,
        });
    }
};
