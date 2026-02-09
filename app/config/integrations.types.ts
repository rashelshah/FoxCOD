/**
 * Integration Types and Configuration
 * Config-driven integration system for third-party services
 */

// =============================================
// TYPE DEFINITIONS
// =============================================

/**
 * Integration configuration field schema
 */
export interface IntegrationConfigField {
    key: string;
    label: string;
    type: 'text' | 'email' | 'toggle' | 'select';
    required?: boolean;
    options?: { value: string; label: string }[];
    description?: string;
}

/**
 * Integration definition
 */
export interface Integration {
    id: string;
    name: string;
    description: string;
    icon: string;
    status: 'active' | 'coming_soon' | 'disabled';
    isPremium: boolean;
    requiresOAuth?: boolean;
    configSchema?: IntegrationConfigField[];
}

/**
 * Integration settings stored in database
 */
export interface IntegrationSettings {
    id?: string;
    shop_domain: string;
    integration_id: string;
    enabled: boolean;
    connected: boolean;
    config: Record<string, unknown>;
    connected_email?: string;
    connected_at?: string;
    last_synced_at?: string;
    created_at?: string;
    updated_at?: string;
}

/**
 * Google Sheets specific config
 */
export interface GoogleSheetsConfig {
    spreadsheetId: string;
    spreadsheetUrl: string;
    sheetName: string;
}

// =============================================
// INTEGRATION CONFIGURATIONS
// =============================================

/**
 * Google Sheets Integration
 * Automatically sync COD orders to a Google Sheet
 */
const GOOGLE_SHEETS: Integration = {
    id: 'google_sheets',
    name: 'Google Sheets',
    description: 'Automatically save COD order details to a Google Sheet in real-time.',
    icon: '📊',
    status: 'active',
    isPremium: false,
    requiresOAuth: true,
    configSchema: [
        {
            key: 'sheet_name',
            label: 'Sheet Name',
            type: 'text',
            required: false,
            description: 'Name of the sheet to sync orders to (default: COD Orders)',
        },
        {
            key: 'sync_enabled',
            label: 'Real-time Sync',
            type: 'toggle',
            required: false,
            description: 'Automatically sync new orders as they come in',
        },
    ],
};

/**
 * SMS & WhatsApp Integration
 * Send order notifications via SMS/WhatsApp
 */
const SMS_WHATSAPP: Integration = {
    id: 'sms_whatsapp',
    name: 'SMS & WhatsApp Messages',
    description: 'Send order confirmations, abandoned checkout reminders, and COD verification messages.',
    icon: '💬',
    status: 'coming_soon',
    isPremium: true,
    requiresOAuth: false,
    configSchema: [
        {
            key: 'provider',
            label: 'Provider',
            type: 'select',
            required: true,
            options: [
                { value: 'twilio', label: 'Twilio' },
                { value: 'msg91', label: 'MSG91' },
                { value: 'interakt', label: 'Interakt' },
            ],
            description: 'Select your SMS/WhatsApp provider',
        },
        {
            key: 'api_key',
            label: 'API Key',
            type: 'text',
            required: true,
            description: 'Your provider API key',
        },
    ],
};

/**
 * Google Address Autocomplete Integration
 * Improve address accuracy with Google Places
 */
const ADDRESS_AUTOCOMPLETE: Integration = {
    id: 'address_autocomplete',
    name: 'Google Address Autocomplete',
    description: 'Improve address accuracy and reduce failed COD deliveries using Google Places Autocomplete.',
    icon: '📍',
    status: 'coming_soon',
    isPremium: true,
    requiresOAuth: false,
    configSchema: [
        {
            key: 'google_api_key',
            label: 'Google API Key',
            type: 'text',
            required: true,
            description: 'Your Google Places API key',
        },
        {
            key: 'country_restriction',
            label: 'Restrict to Country',
            type: 'select',
            required: false,
            options: [
                { value: 'IN', label: 'India' },
                { value: 'US', label: 'United States' },
                { value: 'GB', label: 'United Kingdom' },
                { value: 'all', label: 'All Countries' },
            ],
            description: 'Limit suggestions to a specific country',
        },
    ],
};

// =============================================
// EXPORTS
// =============================================

/**
 * All available integrations
 * Add new integrations here - UI will automatically render them
 */
export const INTEGRATIONS: Integration[] = [
    GOOGLE_SHEETS,
    SMS_WHATSAPP,
    ADDRESS_AUTOCOMPLETE,
];

/**
 * Get integration by ID
 */
export function getIntegrationById(id: string): Integration | undefined {
    return INTEGRATIONS.find((i) => i.id === id);
}

/**
 * Get active integrations (not coming soon)
 */
export function getActiveIntegrations(): Integration[] {
    return INTEGRATIONS.filter((i) => i.status === 'active');
}

/**
 * Status badge configuration
 */
export const STATUS_BADGES: Record<string, { label: string; color: string; bgColor: string }> = {
    connected: { label: 'Connected', color: '#059669', bgColor: '#d1fae5' },
    not_connected: { label: 'Not Connected', color: '#6b7280', bgColor: '#f3f4f6' },
    coming_soon: { label: 'Coming Soon', color: '#d97706', bgColor: '#fef3c7' },
};
