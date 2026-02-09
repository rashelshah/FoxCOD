/**
 * Google Sheets OAuth Connect Route
 * GET /api/integrations/google-sheets/connect
 * 
 * Redirects merchant to Google OAuth consent screen
 */

import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticate } from "../shopify.server";
import { getAuthUrl, isConfigured } from "../services/google-sheets.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    // Authenticate the request
    const { session } = await authenticate.admin(request);
    const shopDomain = session.shop;

    // Check if Google Sheets is configured
    if (!isConfigured()) {
        console.error('[Google Sheets Connect] Missing environment variables');
        return redirect('/app/integrations?error=not_configured');
    }

    console.log('[Google Sheets Connect] Initiating OAuth for:', shopDomain);

    // Generate OAuth URL and redirect
    const authUrl = getAuthUrl(shopDomain);

    return redirect(authUrl);
};
