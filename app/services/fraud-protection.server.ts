/**
 * Fraud Protection Service — Supabase Backend Operations
 * CRUD operations + Shopify metafield sync + order validation
 */

import { supabase } from '../config/supabase.server';
import type { FraudProtectionSettings } from '../config/fraud-protection.types';
import { DEFAULT_FRAUD_SETTINGS } from '../config/fraud-protection.types';

// =============================================
// CRUD OPERATIONS
// =============================================

export async function getFraudProtectionSettings(shopDomain: string): Promise<FraudProtectionSettings> {
    const { data, error } = await supabase
        .from('fraud_protection_settings')
        .select('*')
        .eq('shop_domain', shopDomain)
        .single();

    if (error && error.code !== 'PGRST116') {
        // PGRST116 = no rows found — that's fine, return defaults
        console.error('[FraudProtection] Fetch error:', error);
    }

    if (data) return data as FraudProtectionSettings;

    // Return defaults if no settings exist yet
    return {
        ...DEFAULT_FRAUD_SETTINGS,
        shop_domain: shopDomain,
    } as FraudProtectionSettings;
}

export async function saveFraudProtectionSettings(settings: FraudProtectionSettings): Promise<{ id: string }> {
    const { id, created_at, updated_at, ...data } = settings;

    if (id) {
        // Update existing
        const { data: result, error } = await supabase
            .from('fraud_protection_settings')
            .update({ ...data, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select('id')
            .single();
        if (error) { console.error('[FraudProtection] Update error:', error); throw error; }
        return { id: result?.id || id };
    } else {
        // Insert new — use upsert on shop_domain to avoid duplicates
        const { data: result, error } = await supabase
            .from('fraud_protection_settings')
            .upsert({ ...data }, { onConflict: 'shop_domain' })
            .select('id')
            .single();
        if (error) { console.error('[FraudProtection] Insert error:', error); throw error; }
        return { id: result!.id };
    }
}

// =============================================
// METAFIELD SYNC
// =============================================

async function ensureFraudMetafield(admin: any): Promise<void> {
    try {
        await admin.graphql(`
            mutation CreateMetafieldDefinition($definition: MetafieldDefinitionInput!) {
                metafieldDefinitionCreate(definition: $definition) {
                    createdDefinition { id key }
                    userErrors { field message }
                }
            }
        `, {
            variables: {
                definition: {
                    name: "Fraud Protection Settings JSON",
                    namespace: "fox_cod",
                    key: "fraud_protection_settings_json",
                    type: "json",
                    ownerType: "SHOP",
                    access: { storefront: "PUBLIC_READ" }
                }
            }
        });
    } catch (e) {
        console.log('[FraudProtection] Metafield definition already exists');
    }
}

export async function syncFraudSettingsToMetafield(admin: any, shopDomain: string): Promise<void> {
    await ensureFraudMetafield(admin);

    const settings = await getFraudProtectionSettings(shopDomain);

    // Build storefront-friendly object (exclude sensitive/internal fields)
    const storefrontData = {
        limit_orders_enabled: settings.limit_orders_enabled,
        max_orders: settings.max_orders,
        limit_hours: settings.limit_hours,
        limit_quantity_enabled: settings.limit_quantity_enabled,
        max_quantity: settings.max_quantity,
        blocked_phone_numbers: settings.blocked_phone_numbers || [],
        blocked_emails: settings.blocked_emails || [],
        blocked_ip_addresses: settings.blocked_ip_addresses || [],
        allowed_ip_addresses: settings.allowed_ip_addresses || [],
        postal_code_mode: settings.postal_code_mode,
        postal_codes: settings.postal_codes || [],
        blocked_message: settings.blocked_message || 'Sorry, you are not allowed to place orders.',
    };

    const shopResponse = await admin.graphql(`{ shop { id } }`);
    const shopData = await shopResponse.json();
    const shopId = shopData.data.shop.id;

    const response = await admin.graphql(`
        mutation SetMetafield($metafields: [MetafieldsSetInput!]!) {
            metafieldsSet(metafields: $metafields) {
                metafields { id key value }
                userErrors { field message }
            }
        }
    `, {
        variables: {
            metafields: [{
                ownerId: shopId,
                namespace: "fox_cod",
                key: "fraud_protection_settings_json",
                value: JSON.stringify(storefrontData),
                type: "json"
            }]
        }
    });

    const result = await response.json();
    if (result.data?.metafieldsSet?.userErrors?.length > 0) {
        console.error('[FraudProtection] Metafield sync errors:', result.data.metafieldsSet.userErrors);
    }
    console.log('[FraudProtection] Synced fraud settings to metafield');
}

// =============================================
// ORDER VALIDATION
// =============================================

interface FraudValidationResult {
    allowed: boolean;
    message: string;
}

interface OrderValidationData {
    phone?: string;
    email?: string;
    ip?: string;
    zipcode?: string;
    quantity?: number;
    shopDomain: string;
}

function normalizePhone(phone: string): string {
    return phone.replace(/[\s\-\(\)]/g, '');
}

function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}

export async function validateOrderAgainstFraudRules(orderData: OrderValidationData): Promise<FraudValidationResult> {
    const settings = await getFraudProtectionSettings(orderData.shopDomain);

    const blockedMessage = settings.blocked_message || 'Sorry, you are not allowed to place orders.';

    // 1. Check allowed IP override first — if IP is in allow list, skip all blocks
    if (orderData.ip && settings.allowed_ip_addresses?.length > 0) {
        const isAllowed = settings.allowed_ip_addresses.some(
            (ip: string) => ip.trim() === orderData.ip
        );
        if (isAllowed) {
            return { allowed: true, message: '' };
        }
    }

    // 2. Check blocked IP addresses
    if (orderData.ip && settings.blocked_ip_addresses?.length > 0) {
        const isBlocked = settings.blocked_ip_addresses.some(
            (ip: string) => ip.trim() === orderData.ip
        );
        if (isBlocked) {
            return { allowed: false, message: blockedMessage };
        }
    }

    // 3. Check blocked phone numbers
    if (orderData.phone && settings.blocked_phone_numbers?.length > 0) {
        const normalizedInput = normalizePhone(orderData.phone);
        const isBlocked = settings.blocked_phone_numbers.some(
            (phone: string) => normalizePhone(phone) === normalizedInput
        );
        if (isBlocked) {
            return { allowed: false, message: blockedMessage };
        }
    }

    // 4. Check blocked emails
    if (orderData.email && settings.blocked_emails?.length > 0) {
        const normalizedInput = normalizeEmail(orderData.email);
        const isBlocked = settings.blocked_emails.some(
            (email: string) => normalizeEmail(email) === normalizedInput || normalizedInput.endsWith('@' + email.trim().toLowerCase())
        );
        if (isBlocked) {
            return { allowed: false, message: blockedMessage };
        }
    }

    // 5. Check postal code restrictions
    if (orderData.zipcode && settings.postal_code_mode !== 'none' && settings.postal_codes?.length > 0) {
        const normalizedZip = orderData.zipcode.trim().toUpperCase();
        const matchFound = settings.postal_codes.some(
            (code: string) => code.trim().toUpperCase() === normalizedZip
        );

        if (settings.postal_code_mode === 'allow_only' && !matchFound) {
            return { allowed: false, message: blockedMessage };
        }
        if (settings.postal_code_mode === 'block_only' && matchFound) {
            return { allowed: false, message: blockedMessage };
        }
    }

    // 6. Check quantity limit
    if (settings.limit_quantity_enabled && settings.max_quantity && orderData.quantity) {
        if (orderData.quantity > settings.max_quantity) {
            return { allowed: false, message: `Maximum ${settings.max_quantity} items allowed per order.` };
        }
    }

    // 7. Check order frequency limit (requires DB query for recent orders)
    if (settings.limit_orders_enabled && settings.max_orders && settings.limit_hours) {
        const windowStart = new Date(Date.now() - settings.limit_hours * 60 * 60 * 1000).toISOString();

        // Count recent orders from this phone or email
        let recentCount = 0;

        if (orderData.phone) {
            const { count } = await supabase
                .from('order_logs')
                .select('*', { count: 'exact', head: true })
                .eq('shop_domain', orderData.shopDomain)
                .eq('customer_phone', orderData.phone)
                .gte('created_at', windowStart);
            recentCount = count || 0;
        }

        // Also check by email if provided (take the higher count)
        if (orderData.email && recentCount < settings.max_orders) {
            const { count } = await supabase
                .from('order_logs')
                .select('*', { count: 'exact', head: true })
                .eq('shop_domain', orderData.shopDomain)
                .eq('customer_email', orderData.email)
                .gte('created_at', windowStart);
            recentCount = Math.max(recentCount, count || 0);
        }

        if (recentCount >= settings.max_orders) {
            return {
                allowed: false,
                message: blockedMessage,
            };
        }
    }

    return { allowed: true, message: '' };
}
