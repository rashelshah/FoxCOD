/**
 * Upsell & Downsell Campaigns Service — Supabase Backend Operations
 * CRUD operations + Shopify metafield sync
 */

import { supabase } from '../config/supabase.server';
import type { UpsellCampaign, UpsellType } from '../config/upsell-offers.types';

// =============================================
// CRUD OPERATIONS
// =============================================

export async function getUpsellCampaigns(shopDomain: string): Promise<UpsellCampaign[]> {
    const { data, error } = await supabase
        .from('upsell_offers')
        .select('*')
        .eq('shop_domain', shopDomain)
        .order('priority', { ascending: true });
    if (error) { console.error('[Upsells] Fetch error:', error); throw error; }
    return data || [];
}

export async function getUpsellCampaignsByType(shopDomain: string, type: UpsellType): Promise<UpsellCampaign[]> {
    const { data, error } = await supabase
        .from('upsell_offers')
        .select('*')
        .eq('shop_domain', shopDomain)
        .eq('type', type)
        .order('priority', { ascending: true });
    if (error) { console.error('[Upsells] Fetch by type error:', error); throw error; }
    return data || [];
}

export async function saveCampaign(campaign: any, shopDomain: string): Promise<{ id: string }> {
    const { id, _triggerProducts, created_at, updated_at, ...data } = campaign;

    // Strip _selectedProduct from each offer
    if (data.offers) {
        data.offers = data.offers.map((o: any) => {
            const { _selectedProduct, expanded, ...rest } = o;
            return rest;
        });
    }

    if (id) {
        const { data: result, error } = await supabase
            .from('upsell_offers')
            .update({ ...data, updated_at: new Date().toISOString() })
            .eq('id', id)
            .eq('shop_domain', shopDomain)
            .select('id')
            .single();
        if (error) { console.error('[Upsells] Update error:', error); throw error; }
        return { id: result?.id || id };
    } else {
        const { data: result, error } = await supabase
            .from('upsell_offers')
            .insert({ ...data, shop_domain: shopDomain })
            .select('id')
            .single();
        if (error) { console.error('[Upsells] Insert error:', error); throw error; }
        return { id: result!.id };
    }
}

export async function deleteCampaign(id: string, shopDomain: string): Promise<void> {
    const { error } = await supabase.from('upsell_offers').delete().eq('id', id).eq('shop_domain', shopDomain);
    if (error) { console.error('[Upsells] Delete error:', error); throw error; }
}

export async function toggleCampaignActive(id: string, active: boolean, shopDomain: string): Promise<void> {
    const { error } = await supabase.from('upsell_offers').update({ active, updated_at: new Date().toISOString() }).eq('id', id).eq('shop_domain', shopDomain);
    if (error) { console.error('[Upsells] Toggle error:', error); throw error; }
}

// =============================================
// METAFIELD SYNC
// =============================================

async function ensureUpsellMetafield(admin: any): Promise<void> {
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
                    name: "Upsells & Downsells JSON",
                    namespace: "fox_cod",
                    key: "upsells_downsells_json",
                    type: "json",
                    ownerType: "SHOP",
                    access: { storefront: "PUBLIC_READ" }
                }
            }
        });
    } catch (e) {
        console.log('[Upsells] Metafield definition exists');
    }
}

export async function syncUpsellsToMetafield(admin: any, shopDomain: string): Promise<void> {
    await ensureUpsellMetafield(admin);

    const { data: allOffers } = await supabase
        .from('upsell_offers')
        .select('*')
        .eq('shop_domain', shopDomain)
        .eq('active', true)
        .order('priority', { ascending: true });

    const offers = allOffers || [];
    const storefrontData = {
        tick_upsells: offers.filter(o => o.type === 'tick_upsell'),
        click_upsells: offers.filter(o => o.type === 'click_upsell'),
        downsells: offers.filter(o => o.type === 'downsell'),
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
                key: "upsells_downsells_json",
                value: JSON.stringify(storefrontData),
                type: "json"
            }]
        }
    });

    const result = await response.json();
    if (result.data?.metafieldsSet?.userErrors?.length > 0) {
        console.error('[Upsells] Metafield sync errors:', result.data.metafieldsSet.userErrors);
    }
    console.log('[Upsells] Synced:', { tick: storefrontData.tick_upsells.length, click: storefrontData.click_upsells.length, downsell: storefrontData.downsells.length });
}
