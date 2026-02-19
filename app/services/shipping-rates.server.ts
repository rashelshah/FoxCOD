/**
 * Shipping Rates Service - Supabase Backend Operations
 * Manages shipping rates with conditions, restrictions, and Shopify integration
 */

import { supabase } from '../config/supabase.server';

/**
 * Shipping Rate Type Definition
 */
export interface ShippingRate {
    id?: string;
    shop_domain: string;
    name: string;
    description?: string;
    price: number;

    // Conditions
    condition_type: 'none' | 'order_price' | 'order_quantity' | 'order_weight';
    min_value?: number;
    max_value?: number;

    // Restrictions
    applies_to_products: boolean;
    product_ids: string[];

    applies_to_countries: boolean;
    country_codes: string[];

    applies_to_states: boolean;
    state_codes: string[];

    // Collection/Category restrictions
    applies_to_collections: boolean;
    collection_ids: string[];

    is_active: boolean;

    created_at?: string;
    updated_at?: string;
}

/**
 * Get all shipping rates for a shop
 */
export async function getShippingRates(shopDomain: string): Promise<ShippingRate[]> {
    const { data, error } = await supabase
        .from('shipping_rates')
        .select('*')
        .eq('shop_domain', shopDomain)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('[ShippingRates] Error fetching shipping rates:', error);
        throw error;
    }

    return data || [];
}

/**
 * Get active shipping rates for a shop (for storefront)
 */
export async function getActiveShippingRates(shopDomain: string): Promise<ShippingRate[]> {
    const { data, error } = await supabase
        .from('shipping_rates')
        .select('*')
        .eq('shop_domain', shopDomain)
        .eq('is_active', true)
        .order('price', { ascending: true });

    if (error) {
        console.error('[ShippingRates] Error fetching active shipping rates:', error);
        throw error;
    }

    return data || [];
}

/**
 * Create a new shipping rate
 */
export async function createShippingRate(rate: Omit<ShippingRate, 'id' | 'created_at' | 'updated_at'>): Promise<ShippingRate> {
    const { data, error } = await supabase
        .from('shipping_rates')
        .insert({
            shop_domain: rate.shop_domain,
            name: rate.name,
            description: rate.description ?? '',
            price: rate.price ?? 0,
            condition_type: rate.condition_type ?? 'none',
            min_value: rate.min_value != null ? Number(rate.min_value) : null,
            max_value: rate.max_value != null ? Number(rate.max_value) : null,
            applies_to_products: rate.applies_to_products ?? false,
            product_ids: rate.product_ids ?? [],
            applies_to_countries: rate.applies_to_countries ?? false,
            country_codes: rate.country_codes ?? [],
            applies_to_states: rate.applies_to_states ?? false,
            state_codes: rate.state_codes ?? [],
            applies_to_collections: rate.applies_to_collections ?? false,
            collection_ids: rate.collection_ids ?? [],
            is_active: rate.is_active ?? true,
        })
        .select()
        .single();

    if (error) {
        console.error('[ShippingRates] Error creating shipping rate:', error);
        throw error;
    }

    return data;
}

/**
 * Update an existing shipping rate
 */
export async function updateShippingRate(
    rateId: string,
    updates: Partial<Omit<ShippingRate, 'id' | 'shop_domain' | 'created_at' | 'updated_at'>>
): Promise<ShippingRate> {
    const updateData: Record<string, any> = {
        updated_at: new Date().toISOString(),
    };

    // Explicitly map only valid columns to prevent schema errors
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.description !== undefined) updateData.description = updates.description ?? '';
    if (updates.price !== undefined) updateData.price = updates.price ?? 0;
    if (updates.condition_type !== undefined) updateData.condition_type = updates.condition_type ?? 'none';
    if ('min_value' in updates) updateData.min_value = updates.min_value != null ? Number(updates.min_value) : null;
    if ('max_value' in updates) updateData.max_value = updates.max_value != null ? Number(updates.max_value) : null;
    if (updates.applies_to_products !== undefined) updateData.applies_to_products = updates.applies_to_products ?? false;
    if (updates.product_ids !== undefined) updateData.product_ids = updates.product_ids ?? [];
    if (updates.applies_to_countries !== undefined) updateData.applies_to_countries = updates.applies_to_countries ?? false;
    if (updates.country_codes !== undefined) updateData.country_codes = updates.country_codes ?? [];
    if (updates.applies_to_states !== undefined) updateData.applies_to_states = updates.applies_to_states ?? false;
    if (updates.state_codes !== undefined) updateData.state_codes = updates.state_codes ?? [];
    if (updates.applies_to_collections !== undefined) updateData.applies_to_collections = updates.applies_to_collections ?? false;
    if (updates.collection_ids !== undefined) updateData.collection_ids = updates.collection_ids ?? [];
    if (updates.is_active !== undefined) updateData.is_active = updates.is_active ?? true;

    const { data, error } = await supabase
        .from('shipping_rates')
        .update(updateData)
        .eq('id', rateId)
        .select()
        .single();

    if (error) {
        console.error('[ShippingRates] Error updating shipping rate:', error);
        throw error;
    }

    return data;
}

/**
 * Delete a shipping rate
 */
export async function deleteShippingRate(rateId: string): Promise<void> {
    const { error } = await supabase
        .from('shipping_rates')
        .delete()
        .eq('id', rateId);

    if (error) {
        console.error('[ShippingRates] Error deleting shipping rate:', error);
        throw error;
    }
}

/**
 * Toggle shipping rate active status
 */
export async function toggleShippingRateActive(rateId: string, isActive: boolean): Promise<ShippingRate> {
    return updateShippingRate(rateId, { is_active: isActive });
}

/**
 * Bulk create shipping rates (for importing from Shopify)
 */
export async function bulkCreateShippingRates(
    shopDomain: string,
    rates: Omit<ShippingRate, 'id' | 'shop_domain' | 'created_at' | 'updated_at'>[]
): Promise<ShippingRate[]> {
    const ratesWithShop = rates.map(rate => ({
        shop_domain: shopDomain,
        name: rate.name,
        description: rate.description ?? '',
        price: rate.price ?? 0,
        condition_type: rate.condition_type ?? 'none',
        min_value: rate.min_value != null ? Number(rate.min_value) : null,
        max_value: rate.max_value != null ? Number(rate.max_value) : null,
        applies_to_products: rate.applies_to_products ?? false,
        product_ids: rate.product_ids ?? [],
        applies_to_countries: rate.applies_to_countries ?? false,
        country_codes: rate.country_codes ?? [],
        applies_to_states: rate.applies_to_states ?? false,
        state_codes: rate.state_codes ?? [],
        applies_to_collections: rate.applies_to_collections ?? false,
        collection_ids: rate.collection_ids ?? [],
        is_active: rate.is_active ?? true,
    }));

    const { data, error } = await supabase
        .from('shipping_rates')
        .insert(ratesWithShop)
        .select();

    if (error) {
        console.error('[ShippingRates] Error bulk creating shipping rates:', error);
        throw error;
    }

    return data || [];
}

/**
 * Delete all shipping rates for a shop (useful when re-importing)
 */
export async function deleteAllShippingRates(shopDomain: string): Promise<void> {
    const { error } = await supabase
        .from('shipping_rates')
        .delete()
        .eq('shop_domain', shopDomain);

    if (error) {
        console.error('[ShippingRates] Error deleting all shipping rates:', error);
        throw error;
    }
}

// =============================================
// SHOPIFY SHIPPING PROFILES IMPORT
// =============================================

/**
 * Fetch shipping profiles from Shopify Admin API
 */
export async function fetchShopifyShippingProfiles(admin: any): Promise<any[]> {
    const query = `
        query {
            deliveryProfiles(first: 10) {
                edges {
                    node {
                        id
                        name
                        profileLocationGroups {
                            id
                            locationGroupZones(first: 10) {
                                edges {
                                    node {
                                        id
                                        name
                                        methodDefinitions(first: 10) {
                                            edges {
                                                node {
                                                    id
                                                    name
                                                    description
                                                    rateProvider {
                                                        ... on DeliveryRateDefinition {
                                                            id
                                                            price {
                                                                amount
                                                                currencyCode
                                                            }
                                                        }
                                                        ... on DeliveryParticipant {
                                                            id
                                                            fixedFee {
                                                                amount
                                                                currencyCode
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    `;

    try {
        const response = await admin.graphql(query);
        const result = await response.json();

        if (result.errors) {
            console.error('[ShippingRates] GraphQL errors:', result.errors);
            throw new Error('GraphQL query failed');
        }

        const profiles = result.data?.deliveryProfiles?.edges || [];
        const shippingMethods: any[] = [];

        // Extract all shipping methods from profiles
        profiles.forEach((profileEdge: any) => {
            const profile = profileEdge.node;
            const locationGroups = profile.profileLocationGroups || [];

            locationGroups.forEach((group: any) => {
                const zones = group.locationGroupZones?.edges || [];

                zones.forEach((zoneEdge: any) => {
                    const zone = zoneEdge.node;
                    const methods = zone.methodDefinitions?.edges || [];

                    methods.forEach((methodEdge: any) => {
                        const method = methodEdge.node;
                        const rateProvider = method.rateProvider;

                        // Get price from rate provider
                        let price = 0;
                        if (rateProvider) {
                            if (rateProvider.price) {
                                price = parseFloat(rateProvider.price.amount) || 0;
                            } else if (rateProvider.fixedFee) {
                                price = parseFloat(rateProvider.fixedFee.amount) || 0;
                            }
                        }

                        shippingMethods.push({
                            name: method.name,
                            description: method.description || `Imported from ${profile.name}`,
                            price: price,
                            profileName: profile.name,
                            zoneName: zone.name,
                        });
                    });
                });
            });
        });

        return shippingMethods;
    } catch (error) {
        console.error('[ShippingRates] Error fetching Shopify shipping profiles:', error);
        throw error;
    }
}

/**
 * Import shipping rates from Shopify
 */
export async function importShippingRatesFromShopify(
    shopDomain: string,
    admin: any,
    replaceExisting: boolean = false
): Promise<{ imported: number; rates: ShippingRate[] }> {
    // Fetch from Shopify
    const shopifyMethods = await fetchShopifyShippingProfiles(admin);

    if (shopifyMethods.length === 0) {
        return { imported: 0, rates: [] };
    }

    // Replace existing if requested
    if (replaceExisting) {
        await deleteAllShippingRates(shopDomain);
    }

    // Convert to ShippingRate format
    const ratesToImport: Omit<ShippingRate, 'id' | 'shop_domain' | 'created_at' | 'updated_at'>[] =
        shopifyMethods.map((method, index) => ({
            name: method.name,
            description: method.description,
            price: method.price,
            condition_type: 'none',
            applies_to_products: false,
            product_ids: [],
            applies_to_countries: false,
            country_codes: [],
            applies_to_states: false,
            state_codes: [],
            applies_to_collections: false,
            collection_ids: [],
            is_active: true,
        }));

    // Create in database
    const createdRates = await bulkCreateShippingRates(shopDomain, ratesToImport);

    return {
        imported: createdRates.length,
        rates: createdRates,
    };
}

// =============================================
// SHIPPING CALCULATION
// =============================================

/**
 * Order data for shipping calculation
 */
export interface OrderDataForShipping {
    subtotal: number;
    quantity: number;
    weight?: number;
    productIds: string[];
    countryCode?: string;
    stateCode?: string;
}

/**
 * Check if a shipping rate applies to the given order data
 */
export function doesRateApplyToOrder(
    rate: ShippingRate,
    orderData: OrderDataForShipping
): boolean {
    // Check if rate is active
    if (!rate.is_active) return false;

    // Check product restrictions
    if (rate.applies_to_products && rate.product_ids.length > 0) {
        const hasMatchingProduct = orderData.productIds.some(id =>
            rate.product_ids.includes(id)
        );
        if (!hasMatchingProduct) return false;
    }

    // Check country restrictions
    if (rate.applies_to_countries && rate.country_codes.length > 0) {
        if (!orderData.countryCode || !rate.country_codes.includes(orderData.countryCode)) {
            return false;
        }
    }

    // Check state restrictions
    if (rate.applies_to_states && rate.state_codes.length > 0) {
        if (!orderData.stateCode || !rate.state_codes.includes(orderData.stateCode)) {
            return false;
        }
    }

    // Check conditions
    switch (rate.condition_type) {
        case 'order_price':
            if (rate.min_value !== null && rate.min_value !== undefined) {
                if (orderData.subtotal < rate.min_value) return false;
            }
            if (rate.max_value !== null && rate.max_value !== undefined) {
                if (orderData.subtotal > rate.max_value) return false;
            }
            break;

        case 'order_quantity':
            if (rate.min_value !== null && rate.min_value !== undefined) {
                if (orderData.quantity < rate.min_value) return false;
            }
            if (rate.max_value !== null && rate.max_value !== undefined) {
                if (orderData.quantity > rate.max_value) return false;
            }
            break;

        case 'order_weight':
            if (rate.min_value !== null && rate.min_value !== undefined) {
                if ((orderData.weight || 0) < rate.min_value) return false;
            }
            if (rate.max_value !== null && rate.max_value !== undefined) {
                if ((orderData.weight || 0) > rate.max_value) return false;
            }
            break;

        case 'none':
        default:
            // No conditions to check
            break;
    }

    return true;
}

/**
 * Calculate shipping for an order
 * Returns the first applicable shipping rate, or null if none apply
 */
export function calculateShipping(
    rates: ShippingRate[],
    orderData: OrderDataForShipping
): { rate: ShippingRate | null; price: number } {
    // Find first applicable rate
    for (const rate of rates) {
        if (doesRateApplyToOrder(rate, orderData)) {
            return { rate, price: rate.price };
        }
    }

    // Return free shipping if no rates apply
    return { rate: null, price: 0 };
}

/**
 * Get all applicable shipping rates for an order (for showing options)
 */
export function getApplicableShippingRates(
    rates: ShippingRate[],
    orderData: OrderDataForShipping
): ShippingRate[] {
    return rates.filter(rate => doesRateApplyToOrder(rate, orderData));
}
