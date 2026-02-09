/**
 * Google Sheets Integration Service
 * Handles OAuth, sheet operations, and order sync
 * Server-side only - tokens never exposed to frontend
 */

import { supabase } from '../config/supabase.server';

// =============================================
// ENVIRONMENT CONFIGURATION
// =============================================

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || '';

const SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/userinfo.email',
];

// Sheet headers for COD orders
const ORDER_HEADERS = [
    'Order ID',
    'Order Name',
    'Customer Name',
    'Phone',
    'Email',
    'Address',
    'City',
    'State',
    'Pincode',
    'Product',
    'Quantity',
    'Total Price',
    'Payment Method',
    'Order Status',
    'Created At',
];

// =============================================
// OAUTH FUNCTIONS
// =============================================

/**
 * Generate Google OAuth consent URL
 */
export function getAuthUrl(shopDomain: string): string {
    const params = new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri: GOOGLE_REDIRECT_URI,
        response_type: 'code',
        scope: SCOPES.join(' '),
        access_type: 'offline',
        prompt: 'consent',
        state: shopDomain, // Pass shop domain to callback
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(code: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresAt: string;
}> {
    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            code,
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            redirect_uri: GOOGLE_REDIRECT_URI,
            grant_type: 'authorization_code',
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        console.error('[Google Sheets] Token exchange failed:', error);
        throw new Error('Failed to exchange code for tokens');
    }

    const data = await response.json();
    const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt,
    };
}

/**
 * Refresh expired access token
 */
export async function refreshAccessToken(refreshToken: string): Promise<{
    accessToken: string;
    expiresAt: string;
}> {
    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            refresh_token: refreshToken,
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            grant_type: 'refresh_token',
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        console.error('[Google Sheets] Token refresh failed:', error);
        throw new Error('Failed to refresh access token');
    }

    const data = await response.json();
    const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

    return {
        accessToken: data.access_token,
        expiresAt,
    };
}

/**
 * Get user email from Google
 */
export async function getUserEmail(accessToken: string): Promise<string> {
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
        throw new Error('Failed to get user info');
    }

    const data = await response.json();
    return data.email;
}

/**
 * Revoke access token on disconnect
 */
export async function revokeToken(accessToken: string): Promise<void> {
    try {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${accessToken}`, {
            method: 'POST',
        });
        console.log('[Google Sheets] Token revoked successfully');
    } catch (error) {
        console.error('[Google Sheets] Token revocation failed:', error);
        // Don't throw - revocation failure shouldn't block disconnect
    }
}

// =============================================
// SHEETS API FUNCTIONS
// =============================================

/**
 * Create a new Google Spreadsheet with headers
 */
export async function createSpreadsheet(
    accessToken: string,
    shopDomain: string
): Promise<{ spreadsheetId: string; spreadsheetUrl: string; sheetName: string }> {
    const sheetName = 'Orders';
    const title = `COD Orders – ${shopDomain.replace('.myshopify.com', '')}`;

    // Create spreadsheet
    const createResponse = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            properties: { title },
            sheets: [
                {
                    properties: { title: sheetName },
                    data: [
                        {
                            rowData: [
                                {
                                    values: ORDER_HEADERS.map((header) => ({
                                        userEnteredValue: { stringValue: header },
                                        userEnteredFormat: {
                                            textFormat: { bold: true },
                                            backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 },
                                        },
                                    })),
                                },
                            ],
                        },
                    ],
                },
            ],
        }),
    });

    if (!createResponse.ok) {
        const error = await createResponse.text();
        console.error('[Google Sheets] Create spreadsheet failed:', error);
        throw new Error('Failed to create spreadsheet');
    }

    const data = await createResponse.json();
    console.log('[Google Sheets] Spreadsheet created:', data.spreadsheetId);

    return {
        spreadsheetId: data.spreadsheetId,
        spreadsheetUrl: data.spreadsheetUrl,
        sheetName,
    };
}

/**
 * Append order data to sheet
 */
export async function appendOrderToSheet(
    accessToken: string,
    spreadsheetId: string,
    sheetName: string,
    orderData: {
        orderId: string;
        orderName: string;
        customerName: string;
        phone: string;
        email: string;
        address: string;
        city: string;
        state: string;
        pincode: string;
        product: string;
        quantity: number;
        totalPrice: string;
        paymentMethod: string;
        status: string;
        createdAt: string;
    }
): Promise<void> {
    const values = [
        [
            orderData.orderId,
            orderData.orderName,
            orderData.customerName,
            orderData.phone,
            orderData.email || '',
            orderData.address,
            orderData.city || '',
            orderData.state || '',
            orderData.pincode || '',
            orderData.product,
            orderData.quantity.toString(),
            orderData.totalPrice,
            orderData.paymentMethod,
            orderData.status,
            orderData.createdAt,
        ],
    ];

    const range = `${sheetName}!A:O`;
    const response = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`,
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ values }),
        }
    );

    if (!response.ok) {
        const error = await response.text();
        console.error('[Google Sheets] Append failed:', error);
        throw new Error('Failed to append order to sheet');
    }

    console.log('[Google Sheets] Order appended successfully');
}

// =============================================
// HIGH-LEVEL SYNC FUNCTIONS
// =============================================

/**
 * Get valid access token (refresh if expired)
 */
async function getValidAccessToken(shopDomain: string): Promise<string | null> {
    const { data: settings, error } = await supabase
        .from('integration_settings')
        .select('*')
        .eq('shop_domain', shopDomain)
        .eq('integration_id', 'google_sheets')
        .single();

    if (error || !settings?.connected) {
        return null;
    }

    const now = new Date();
    const expiresAt = new Date(settings.token_expires_at);

    // If token expires in less than 5 minutes, refresh it
    if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
        try {
            const { accessToken, expiresAt: newExpiresAt } = await refreshAccessToken(
                settings.refresh_token
            );

            // Update token in database
            await supabase
                .from('integration_settings')
                .update({
                    access_token: accessToken,
                    token_expires_at: newExpiresAt,
                })
                .eq('id', settings.id);

            return accessToken;
        } catch (error) {
            console.error('[Google Sheets] Token refresh failed:', error);
            return null;
        }
    }

    return settings.access_token;
}

/**
 * Sync order to Google Sheets (non-blocking)
 * Call this after order creation - it will not throw on failure
 */
export async function syncOrderToGoogleSheets(
    shopDomain: string,
    orderData: {
        orderId: string;
        orderName: string;
        customerName: string;
        phone: string;
        email?: string;
        address: string;
        city?: string;
        state?: string;
        pincode?: string;
        product: string;
        quantity: number;
        totalPrice: string;
        paymentMethod: 'full_cod' | 'partial_cod';
        status?: string;
    }
): Promise<boolean> {
    try {
        console.log('[Google Sheets] Starting sync for order:', orderData.orderId);

        // Get integration settings
        const { data: settings, error } = await supabase
            .from('integration_settings')
            .select('*')
            .eq('shop_domain', shopDomain)
            .eq('integration_id', 'google_sheets')
            .single();

        if (error || !settings?.enabled || !settings?.connected) {
            console.log('[Google Sheets] Integration not enabled/connected');
            return false;
        }

        // Get valid access token
        const accessToken = await getValidAccessToken(shopDomain);
        if (!accessToken) {
            console.error('[Google Sheets] Could not get valid access token');
            return false;
        }

        // Get spreadsheet info from config
        const config = settings.config as { spreadsheetId?: string; sheetName?: string };
        if (!config?.spreadsheetId) {
            console.error('[Google Sheets] No spreadsheet configured');
            return false;
        }

        // Append order to sheet
        await appendOrderToSheet(
            accessToken,
            config.spreadsheetId,
            config.sheetName || 'Orders',
            {
                ...orderData,
                email: orderData.email || '',
                city: orderData.city || '',
                state: orderData.state || '',
                pincode: orderData.pincode || '',
                status: orderData.status || 'pending',
                createdAt: new Date().toISOString(),
            }
        );

        // Update last_synced_at
        await supabase
            .from('integration_settings')
            .update({ last_synced_at: new Date().toISOString() })
            .eq('id', settings.id);

        console.log('[Google Sheets] Sync completed successfully');
        return true;
    } catch (error) {
        console.error('[Google Sheets] Sync error (non-blocking):', error);
        return false;
    }
}

/**
 * Check if Google Sheets credentials are configured
 */
export function isConfigured(): boolean {
    return !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_REDIRECT_URI);
}
