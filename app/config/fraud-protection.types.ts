/**
 * Fraud Protection Types
 * Defines settings interface and defaults for fraud protection rules
 */

export interface FraudProtectionSettings {
    id?: string;
    shop_domain: string;

    // Order limit rules
    limit_orders_enabled: boolean;
    max_orders?: number;
    limit_hours?: number;

    // Quantity limit rules
    limit_quantity_enabled: boolean;
    max_quantity?: number;

    // Block lists
    blocked_phone_numbers: string[];
    blocked_emails: string[];
    blocked_ip_addresses: string[];
    allowed_ip_addresses: string[];

    // Postal code restrictions
    postal_code_mode: 'none' | 'allow_only' | 'block_only';
    postal_codes: string[];

    // Block message
    blocked_message: string;

    created_at?: string;
    updated_at?: string;
}

export const DEFAULT_FRAUD_SETTINGS: Omit<FraudProtectionSettings, 'shop_domain'> = {
    limit_orders_enabled: false,
    max_orders: undefined,
    limit_hours: undefined,

    limit_quantity_enabled: false,
    max_quantity: undefined,

    blocked_phone_numbers: [],
    blocked_emails: [],
    blocked_ip_addresses: [],
    allowed_ip_addresses: [],

    postal_code_mode: 'none',
    postal_codes: [],

    blocked_message: 'Sorry, you are not allowed to place orders.',
};
