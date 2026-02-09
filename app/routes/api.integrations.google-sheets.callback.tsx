/**
 * Google Sheets OAuth Callback Route
 * GET /api/integrations/google-sheets/callback
 * 
 * Handles OAuth callback from Google:
 * 1. Exchange code for tokens
 * 2. Get user email
 * 3. Create spreadsheet
 * 4. Save settings to database
 * 5. Redirect back to integrations page
 */

import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import {
    exchangeCodeForTokens,
    getUserEmail,
    createSpreadsheet,
} from "../services/google-sheets.server";
import { supabase } from "../config/supabase.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state'); // shop_domain
    const error = url.searchParams.get('error');

    // Handle OAuth errors
    if (error) {
        console.error('[Google Sheets Callback] OAuth error:', error);
        return redirect('/app/integrations?error=oauth_denied');
    }

    // Validate required params
    if (!code || !state) {
        console.error('[Google Sheets Callback] Missing code or state');
        return redirect('/app/integrations?error=invalid_callback');
    }

    const shopDomain = state;
    console.log('[Google Sheets Callback] Processing callback for:', shopDomain);

    try {
        // 1. Exchange code for tokens
        console.log('[Google Sheets Callback] Exchanging code for tokens...');
        const { accessToken, refreshToken, expiresAt } = await exchangeCodeForTokens(code);

        // 2. Get user email
        console.log('[Google Sheets Callback] Getting user email...');
        const userEmail = await getUserEmail(accessToken);

        // 3. Create spreadsheet with headers
        console.log('[Google Sheets Callback] Creating spreadsheet...');
        const { spreadsheetId, spreadsheetUrl, sheetName } = await createSpreadsheet(
            accessToken,
            shopDomain
        );

        // 4. Save to database
        console.log('[Google Sheets Callback] Saving integration settings...');
        const { error: dbError } = await supabase
            .from('integration_settings')
            .upsert(
                {
                    shop_domain: shopDomain,
                    integration_id: 'google_sheets',
                    enabled: true,
                    connected: true,
                    connected_email: userEmail,
                    connected_at: new Date().toISOString(),
                    access_token: accessToken,
                    refresh_token: refreshToken,
                    token_expires_at: expiresAt,
                    config: {
                        spreadsheetId,
                        spreadsheetUrl,
                        sheetName,
                    },
                },
                { onConflict: 'shop_domain,integration_id' }
            );

        if (dbError) {
            console.error('[Google Sheets Callback] Database error:', dbError);
            throw new Error('Failed to save integration settings');
        }

        console.log('[Google Sheets Callback] Successfully connected!');

        // 5. Redirect back to integrations page with success
        return redirect('/app/integrations?success=google_sheets_connected');

    } catch (err: any) {
        console.error('[Google Sheets Callback] Error:', err.message);
        return redirect('/app/integrations?error=connection_failed');
    }
};
