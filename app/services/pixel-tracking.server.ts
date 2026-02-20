/**
 * Pixel Tracking Service — Supabase Backend Operations
 * CRUD operations + Shopify metafield sync
 */

import { supabase } from '../config/supabase.server';
import type { PixelTrackingSettings } from '../config/pixel-tracking.types';

// =============================================
// CRUD OPERATIONS
// =============================================

export async function getPixelSettings(shopDomain: string): Promise<PixelTrackingSettings[]> {
    const { data, error } = await supabase
        .from('pixel_tracking_settings')
        .select('*')
        .eq('shop_domain', shopDomain)
        .order('created_at', { ascending: true });
    if (error) { console.error('[Pixels] Fetch error:', error); throw error; }
    return data || [];
}

export async function savePixelSettings(settings: PixelTrackingSettings): Promise<{ id: string }> {
    const { id, created_at, updated_at, ...data } = settings;

    if (id) {
        const { data: result, error } = await supabase
            .from('pixel_tracking_settings')
            .update({ ...data, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select('id')
            .single();
        if (error) { console.error('[Pixels] Update error:', error); throw error; }
        return { id: result?.id || id };
    } else {
        const { data: result, error } = await supabase
            .from('pixel_tracking_settings')
            .insert({ ...data })
            .select('id')
            .single();
        if (error) { console.error('[Pixels] Insert error:', error); throw error; }
        return { id: result!.id };
    }
}

export async function deletePixelSettings(id: string, shopDomain: string): Promise<void> {
    const { error } = await supabase
        .from('pixel_tracking_settings')
        .delete()
        .eq('id', id)
        .eq('shop_domain', shopDomain);
    if (error) { console.error('[Pixels] Delete error:', error); throw error; }
}

// =============================================
// METAFIELD SYNC
// =============================================

async function ensurePixelMetafield(admin: any): Promise<void> {
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
                    name: "Pixel Tracking Settings JSON",
                    namespace: "fox_cod",
                    key: "pixel_tracking_settings_json",
                    type: "json",
                    ownerType: "SHOP",
                    access: { storefront: "PUBLIC_READ" }
                }
            }
        });
    } catch (e) {
        console.log('[Pixels] Metafield definition already exists');
    }
}

export async function syncPixelsToMetafield(admin: any, shopDomain: string): Promise<void> {
    await ensurePixelMetafield(admin);

    const { data: allPixels } = await supabase
        .from('pixel_tracking_settings')
        .select('*')
        .eq('shop_domain', shopDomain)
        .eq('enabled', true);

    const pixels = allPixels || [];

    // Build storefront-friendly map keyed by provider
    const storefrontData: Record<string, any> = {};
    for (const px of pixels) {
        // If multiple pixels of same provider, use array; otherwise single object
        const entry = {
            pixel_id: px.pixel_id,
            access_token: px.access_token || undefined,
            conversion_api_token: px.conversion_api_token || undefined,
            enabled: true,
            track_initiate_checkout: px.track_initiate_checkout,
            track_purchase: px.track_purchase,
            track_add_to_cart: px.track_add_to_cart,
            track_view_content: px.track_view_content,
            track_add_payment_info: px.track_add_payment_info,
        };
        storefrontData[px.provider] = entry;
    }

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
                key: "pixel_tracking_settings_json",
                value: JSON.stringify(storefrontData),
                type: "json"
            }]
        }
    });

    const result = await response.json();
    if (result.data?.metafieldsSet?.userErrors?.length > 0) {
        console.error('[Pixels] Metafield sync errors:', result.data.metafieldsSet.userErrors);
    }
    console.log('[Pixels] Synced', pixels.length, 'enabled pixels to metafield');
}
