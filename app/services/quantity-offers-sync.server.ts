/**
 * Bundle (quantity) offers — Shopify metafield sync and cross-feature theme
 * application. Shared between app.quantity-offers.tsx (the Bundle Offers
 * admin page) and app.settings.tsx ("Match Store Theme" on the COD Form
 * Settings page), so both write to the storefront metafield the same way.
 */
import { supabase } from "../config/supabase.server";
import { deriveOfferDesignColors, type ThemeProfile } from "../utils/themeExtraction";

export async function ensureQuantityOffersMetafield(admin: any) {
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
                    name: "Bundle Offers JSON",
                    namespace: "fox_cod",
                    key: "quantity_offers_json",
                    type: "json",
                    ownerType: "SHOP",
                    access: { storefront: "PUBLIC_READ" }
                }
            }
        });
    } catch (e) {
        console.log('[Bundle Offers] Metafield definition exists');
    }
}

export async function syncOffersToMetafield(admin: any, offerGroups: any[]) {
    await ensureQuantityOffersMetafield(admin);

    const shopResponse = await admin.graphql(`{ shop { id } }`);
    const shopData = await shopResponse.json();
    const shopId = shopData.data.shop.id;

    console.log('[Bundle Offers] Syncing offers to metafield:', offerGroups.length, 'groups');

    const storefrontData = offerGroups
        .filter(group => group.active === true)
        .map(group => ({
            id: group.id,
            name: group.name,
            active: group.active,
            product_ids: group.product_ids,
            productIds: group.product_ids,
            offers: (group.offers || []).map((offer: any) => ({
                ...offer,
                tagBgColor: offer.tagBgColor || null,
                label: offer.label || null,
            })),
            design: {
                template: group.design?.template || 'modern',
                selectedBgColor: group.design?.selectedBgColor || '#fff0ea',
                selectedBorderColor: group.design?.selectedBorderColor || '#dc2626',
                selectedTagBgColor: group.design?.selectedTagBgColor || '#ef4444',
                selectedTagTextColor: group.design?.selectedTagTextColor || '#ffffff',
                unselectedBgColor: group.design?.unselectedBgColor || '#ffffff',
                unselectedBorderColor: group.design?.unselectedBorderColor || '#e5e7eb',
                selectedBorderRadius: group.design?.selectedBorderRadius || 10,
                currencySymbol: group.design?.currencySymbol || '$',
                showMostPopularBadge: group.design?.showMostPopularBadge !== false,
                autoSelectBestValue: group.design?.autoSelectBestValue || false,
                selectedTextColor: group.design?.selectedTextColor || '#1f2937'
            },
            placement: group.placement || 'at_top'
        }));

    console.log('[Bundle Offers] Filtered to', storefrontData.length, 'active groups for storefront');

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
                key: "quantity_offers_json",
                value: JSON.stringify(storefrontData),
                type: "json"
            }]
        }
    });

    const result = await response.json();
    console.log('[Bundle Offers] Metafield sync result:', JSON.stringify(result, null, 2));

    if (result.data?.metafieldsSet?.userErrors?.length > 0) {
        console.error('[Bundle Offers] Metafield sync errors:', result.data.metafieldsSet.userErrors);
    }
}

/**
 * "Match Store Theme" cross-feature effect: overwrite the design colors
 * (and border radius) of every existing bundle offer group for this shop
 * with theme-derived values, then re-sync the storefront metafield so the
 * change is live immediately — same as the merchant editing each group by
 * hand and saving. Non-fatal by design; callers should catch and log.
 */
export async function applyThemeToOfferGroups(admin: any, shopDomain: string, profile: ThemeProfile): Promise<number> {
    const themeColors = deriveOfferDesignColors(profile);
    if (!themeColors) return 0;

    const { data: groups, error } = await supabase
        .from("quantity_offer_groups")
        .select("*")
        .eq("shop_domain", shopDomain);

    if (error) {
        console.error('[Bundle Offers] Failed to fetch offer groups for theme apply:', error);
        return 0;
    }
    if (!groups || groups.length === 0) return 0;

    let updated = 0;
    for (const group of groups) {
        const mergedDesign = { ...(group.design || {}), ...themeColors };
        const { error: updateError } = await supabase
            .from("quantity_offer_groups")
            .update({ design: mergedDesign, updated_at: new Date().toISOString() })
            .eq("id", group.id)
            .eq("shop_domain", shopDomain);
        if (updateError) {
            console.error(`[Bundle Offers] Failed to apply theme to offer group ${group.id}:`, updateError);
            continue;
        }
        updated++;
    }

    if (updated > 0) {
        const { data: activeGroups, error: fetchError } = await supabase
            .from("quantity_offer_groups")
            .select("*")
            .eq("shop_domain", shopDomain)
            .eq("active", true);
        if (fetchError) {
            console.error('[Bundle Offers] Failed to refetch offer groups for metafield resync:', fetchError);
        } else {
            await syncOffersToMetafield(admin, activeGroups || []);
        }
    }

    return updated;
}
