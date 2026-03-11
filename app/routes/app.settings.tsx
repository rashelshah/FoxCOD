/**
 * Form Builder Settings Page - Premium COD Form Customization
 * Route: /app/settings
 * EasySell-inspired design with comprehensive options
 */

import { useState, useCallback, memo, useDeferredValue, useEffect, useRef, useMemo } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useSubmit, useNavigation, Link, useActionData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { RangeSlider, Button, InlineStack, Modal, Text, Icon, Select, TextField, ColorPicker } from "@shopify/polaris";
import { EditIcon, DeleteIcon, ViewIcon, HideIcon, StarFilledIcon } from "@shopify/polaris-icons";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { getFormSettings, saveFormSettings, type FormSettings } from "../config/supabase.server";
import {
    getShippingRates,
    createShippingRate,
    updateShippingRate,
    deleteShippingRate,
    importShippingRatesFromShopify,
    type ShippingRate,
} from "../services/shipping-rates.server";
import {
    type FormField,
    type ContentBlocks,
    type FormStyles,
    type ButtonStyles,
    type ShippingOptions,
    DEFAULT_FIELDS,

    DEFAULT_BLOCKS,
    DEFAULT_STYLES,
    DEFAULT_BUTTON_STYLES,
    DEFAULT_SHIPPING_OPTIONS,
} from "../config/form-builder.types";
import { ColorSelector, colorSelectorStyles } from "./ColorSelector";

// Default settings for new shops
const defaultSettings: Omit<FormSettings, "shop_domain"> = {
    enabled: false,
    button_text: "Buy with COD",
    primary_color: "#6366f1",
    required_fields: ["name", "phone", "address"],
    max_quantity: 10,
    button_style: "solid",
    button_size: "large",
    button_position: "below_atc",
    form_title: "Cash on Delivery Order",
    form_subtitle: "Fill in your details to place a COD order",
    success_message: "Your order has been placed! We will contact you shortly.",
    submit_button_text: "Place COD Order",
    show_product_image: true,
    show_price: true,
    show_quantity_selector: true,
    show_email_field: false,
    show_notes_field: false,
    email_required: false,
    name_placeholder: "Enter your full name",
    phone_placeholder: "Enter your phone number",
    address_placeholder: "Enter your delivery address",
    notes_placeholder: "Any special instructions?",
    modal_style: "modern",
    animation_style: "fade",
    border_radius: 12,
    // New advanced features
    form_type: "popup",
    fields: DEFAULT_FIELDS,

    blocks: DEFAULT_BLOCKS,
    custom_fields: [],
    styles: DEFAULT_STYLES,
    button_styles: DEFAULT_BUTTON_STYLES,
    shipping_options: DEFAULT_SHIPPING_OPTIONS,
    // Partial COD settings
    partial_cod_enabled: false,
    partial_cod_advance_amount: 100,
    partial_cod_commission: 0,
    // New Shipping Rates settings
    shipping_rates_enabled: false,
};

/**
 * Helper: Ensure metafield definitions exist with storefront access
 * This allows Liquid templates to read the metafield values
 */
async function ensureMetafieldDefinitions(admin: any) {
    const definitions = [
        { key: "enabled", type: "single_line_text_field" },
        { key: "button_text", type: "single_line_text_field" },
        { key: "primary_color", type: "single_line_text_field" },
        { key: "max_quantity", type: "single_line_text_field" },
        { key: "required_fields", type: "json" },
        { key: "app_url", type: "single_line_text_field" },
        { key: "form_title", type: "single_line_text_field" },
        { key: "submit_button_text", type: "single_line_text_field" },
        { key: "button_style", type: "single_line_text_field" },
        { key: "button_size", type: "single_line_text_field" },
        { key: "button_position", type: "single_line_text_field" },
        { key: "form_subtitle", type: "single_line_text_field" },
        { key: "success_message", type: "single_line_text_field" },
        { key: "show_product_image", type: "single_line_text_field" },
        { key: "show_price", type: "single_line_text_field" },
        { key: "show_quantity_selector", type: "single_line_text_field" },
        { key: "require_name", type: "single_line_text_field" },
        { key: "require_phone", type: "single_line_text_field" },
        { key: "require_address", type: "single_line_text_field" },
        { key: "show_email_field", type: "single_line_text_field" },
        { key: "show_notes_field", type: "single_line_text_field" },
        { key: "modal_style", type: "single_line_text_field" },
        { key: "animation_style", type: "single_line_text_field" },
        { key: "border_radius", type: "single_line_text_field" },
        { key: "form_type", type: "single_line_text_field" },
        { key: "fields", type: "json" },  // JSON type for complex data
        { key: "blocks", type: "json" },  // JSON type for complex data
        { key: "custom_fields", type: "json" },  // JSON type for complex data
        { key: "styles", type: "json" },  // JSON type for complex data
        { key: "button_styles_json", type: "json" },  // JSON type for complex data
        { key: "shipping_options", type: "json" },  // JSON type for complex data
        // Partial COD settings
        { key: "partial_cod_enabled", type: "single_line_text_field" },
        { key: "partial_cod_advance_amount", type: "single_line_text_field" },
        // Shipping rates settings - must have storefront access for Liquid templates
        { key: "shipping_rates_enabled", type: "single_line_text_field" },
        { key: "shipping_rates_json", type: "json" },
        // Upsells & Downsells
        { key: "upsells_downsells_json", type: "json" },
        // Pixel Tracking
        { key: "pixel_tracking_settings_json", type: "json" },
    ];

    console.log('[Settings] Ensuring metafield definitions (parallel)...');
    await Promise.allSettled(definitions.map((def) =>
        admin.graphql(`
            mutation CreateMetafieldDefinition($definition: MetafieldDefinitionInput!) {
                metafieldDefinitionCreate(definition: $definition) {
                    createdDefinition { id key }
                    userErrors { field message }
                }
            }
        `, {
            variables: {
                definition: {
                    name: def.key.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
                    namespace: "fox_cod",
                    key: def.key,
                    type: def.type,
                    ownerType: "SHOP",
                    access: { storefront: "PUBLIC_READ" }
                }
            }
        })
    ));
    console.log('[Settings] Metafield definitions ensured.');
}

/**
 * Helper: Sync shipping rates to Shopify metafields
 * Called after create/update/delete shipping rate operations
 */
async function syncShippingRatesToMetafields(shopDomain: string, admin: any) {
    try {
        // Fetch current shipping rates
        const { getShippingRates } = await import("../services/shipping-rates.server");
        const shippingRates = await getShippingRates(shopDomain);

        // Fetch current settings to get shipping_rates_enabled flag
        const { getFormSettings } = await import("../config/supabase.server");
        const settings = await getFormSettings(shopDomain);
        const shippingRatesEnabled = settings?.shipping_rates_enabled ?? false;

        // Get shop GID
        const shopRes = await admin.graphql(`query { shop { id } }`);
        const shopGid = (await shopRes.json()).data.shop.id;

        // Sync to metafields
        await admin.graphql(`
            mutation SetMetafields($metafields: [MetafieldsSetInput!]!) {
                metafieldsSet(metafields: $metafields) {
                    metafields { key }
                    userErrors { field message }
                }
            }
        `, {
            variables: {
                metafields: [
                    {
                        ownerId: shopGid,
                        namespace: "fox_cod",
                        key: "shipping_rates_enabled",
                        value: String(shippingRatesEnabled),
                        type: "single_line_text_field"
                    },
                    {
                        ownerId: shopGid,
                        namespace: "fox_cod",
                        key: "shipping_rates_json",
                        value: JSON.stringify(shippingRates || []),
                        type: "json"
                    },
                ]
            }
        });

        console.log('[Settings] Synced', shippingRates.length, 'shipping rates to metafields');
    } catch (error) {
        console.error('[Settings] Error syncing shipping rates to metafields:', error);
        // Don't throw - allow the operation to complete even if metafield sync fails
    }
}

/**
 * Loader: Fetch current settings from Supabase
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { session, admin } = await authenticate.admin(request);
    const shopDomain = session.shop;

    // Fetch products from Shopify for the product selector
    let products: any[] = [];
    try {
        const productsResponse = await admin.graphql(`
            query GetProducts($first: Int!) {
                products(first: $first) {
                    edges {
                        node {
                            id
                            title
                            handle
                            variants(first: 1) {
                                edges {
                                    node {
                                        id
                                        price
                                    }
                                }
                            }
                        }
                    }
                }
            }
        `, { variables: { first: 50 } });
        const productsData = await productsResponse.json();
        products = productsData.data?.products?.edges?.map((edge: any) => ({
            id: edge.node.id,
            title: edge.node.title,
            handle: edge.node.handle,
            variantId: edge.node.variants?.edges?.[0]?.node?.id,
        })) || [];
    } catch (e) {
        console.warn('[Settings] Could not fetch products:', e);
    }

    // Fetch collections from Shopify for the collection selector in shipping
    let collections: any[] = [];
    try {
        const collectionsResponse = await admin.graphql(`
            query GetCollections($first: Int!) {
                collections(first: $first) {
                    edges {
                        node {
                            id
                            title
                            handle
                            productsCount {
                                count
                            }
                        }
                    }
                }
            }
        `, { variables: { first: 100 } });
        const collectionsData = await collectionsResponse.json();
        collections = collectionsData.data?.collections?.edges?.map((edge: any) => ({
            id: edge.node.id,
            title: edge.node.title,
            handle: edge.node.handle,
            productsCount: edge.node.productsCount?.count || 0,
        })) || [];
    } catch (e) {
        console.warn('[Settings] Could not fetch collections:', e);
    }

    const [settings, shippingRates] = await Promise.all([
        getFormSettings(shopDomain),
        getShippingRates(shopDomain),
    ]);

    let appUrl = process.env.SHOPIFY_APP_URL || '';
    if (!appUrl) {
        const url = new URL(request.url);
        appUrl = url.origin;
    }

    // Query shop currency from Shopify Admin API
    let shopCurrency = 'USD';
    try {
        const currencyRes = await admin.graphql(`{ shop { currencyCode } }`);
        const currencyData = await currencyRes.json();
        shopCurrency = currencyData?.data?.shop?.currencyCode || 'USD';
    } catch (e) { console.log('Error fetching shop currency:', e); }

    const merged = settings
        ? {
            ...defaultSettings,
            ...settings,
            styles: { ...DEFAULT_STYLES, ...(settings.styles || {}) },
            button_styles: { ...DEFAULT_BUTTON_STYLES, ...(settings.button_styles || {}) },
        }
        : { ...defaultSettings, shop_domain: shopDomain };
    return { shop: shopDomain, settings: merged, shippingRates, appUrl, products, collections, shopCurrency };
};

/**
 * Action: Save settings to Supabase AND Shopify Metafields
 */
/**
 * Resolve collection IDs to product IDs via Shopify GraphQL
 */
async function resolveCollectionProductIds(admin: any, collectionIds: string[]): Promise<string[]> {
    const productIds: string[] = [];
    for (const collectionId of collectionIds) {
        try {
            const response = await admin.graphql(`
                query GetCollectionProducts($id: ID!) {
                    collection(id: $id) {
                        products(first: 250) {
                            edges {
                                node {
                                    id
                                }
                            }
                        }
                    }
                }
            `, { variables: { id: collectionId } });
            const result = await response.json();
            const products = result.data?.collection?.products?.edges || [];
            products.forEach((edge: any) => {
                if (edge.node?.id) productIds.push(edge.node.id);
            });
        } catch (e) {
            console.warn(`[Settings] Could not resolve products for collection ${collectionId}:`, e);
        }
    }
    return [...new Set(productIds)]; // Deduplicate
}

export const action = async ({ request }: ActionFunctionArgs) => {
    const { session, admin } = await authenticate.admin(request);
    const shopDomain = session.shop;

    const formData = await request.formData();
    const actionType = formData.get("action_type") as string;

    // Handle shipping rates specific actions
    if (actionType === "create_shipping_rate") {
        try {
            const rateData = JSON.parse(formData.get("rate_data") as string);
            // Resolve collections → product IDs if applying to collections
            if (rateData.applies_to_collections && rateData.collection_ids?.length > 0) {
                const collectionProductIds = await resolveCollectionProductIds(admin, rateData.collection_ids);
                // Merge collection product IDs with any individually selected product IDs, deduplicating
                const existingIds = rateData.product_ids || [];
                rateData.product_ids = [...new Set([...existingIds, ...collectionProductIds])];
                rateData.applies_to_products = true;
            }
            const newRate = await createShippingRate({
                ...rateData,
                shop_domain: shopDomain,
            });
            // Sync shipping rates to metafields immediately
            await syncShippingRatesToMetafields(shopDomain, admin);
            return { success: true, shippingRate: newRate };
        } catch (error: any) {
            console.error('[Settings] Error creating shipping rate:', error);
            return { success: false, error: error.message || 'Failed to create shipping rate' };
        }
    }

    if (actionType === "update_shipping_rate") {
        try {
            const rateId = formData.get("rate_id") as string;
            const rateData = JSON.parse(formData.get("rate_data") as string);
            // Resolve collections → product IDs if applying to collections
            if (rateData.applies_to_collections && rateData.collection_ids?.length > 0) {
                const collectionProductIds = await resolveCollectionProductIds(admin, rateData.collection_ids);
                const existingIds = rateData.product_ids || [];
                rateData.product_ids = [...new Set([...existingIds, ...collectionProductIds])];
                rateData.applies_to_products = true;
            }
            const updatedRate = await updateShippingRate(rateId, rateData);
            // Sync shipping rates to metafields immediately
            await syncShippingRatesToMetafields(shopDomain, admin);
            return { success: true, shippingRate: updatedRate };
        } catch (error: any) {
            console.error('[Settings] Error updating shipping rate:', error);
            return { success: false, error: error.message || 'Failed to update shipping rate' };
        }
    }

    if (actionType === "delete_shipping_rate") {
        try {
            const rateId = formData.get("rate_id") as string;
            await deleteShippingRate(rateId);
            // Sync shipping rates to metafields immediately
            await syncShippingRatesToMetafields(shopDomain, admin);
            return { success: true, deletedRateId: rateId };
        } catch (error: any) {
            console.error('[Settings] Error deleting shipping rate:', error);
            return { success: false, error: error.message || 'Failed to delete shipping rate' };
        }
    }

    if (actionType === "import_shopify_shipping") {
        try {
            const replaceExisting = formData.get("replace_existing") === "true";
            const result = await importShippingRatesFromShopify(shopDomain, admin, replaceExisting);
            // Sync shipping rates to metafields immediately
            await syncShippingRatesToMetafields(shopDomain, admin);
            return { success: true, imported: result.imported, shippingRates: result.rates };
        } catch (error: any) {
            console.error('[Settings] Error importing shipping rates:', error);
            return { success: false, error: error.message || 'Failed to import shipping rates' };
        }
    }

    // Parse all form data including new JSONB fields
    const settings: FormSettings = {
        shop_domain: shopDomain,
        enabled: formData.get("enabled") === "true",
        button_text: formData.get("button_text") as string || defaultSettings.button_text,
        primary_color: formData.get("primary_color") as string || defaultSettings.primary_color,
        required_fields: JSON.parse(formData.get("required_fields") as string || "[]"),
        max_quantity: parseInt(formData.get("max_quantity") as string) || defaultSettings.max_quantity,
        button_style: formData.get("button_style") as any || defaultSettings.button_style,
        button_size: formData.get("button_size") as any || defaultSettings.button_size,
        button_position: formData.get("button_position") as any || defaultSettings.button_position,
        form_title: formData.get("form_title") as string || defaultSettings.form_title,
        form_subtitle: formData.get("form_subtitle") as string || defaultSettings.form_subtitle,
        success_message: formData.get("success_message") as string || defaultSettings.success_message,
        submit_button_text: formData.get("submit_button_text") as string || defaultSettings.submit_button_text,
        show_product_image: formData.get("show_product_image") === "true",
        show_price: formData.get("show_price") === "true",
        show_quantity_selector: formData.get("show_quantity_selector") === "true",
        show_email_field: formData.get("show_email_field") === "true",
        show_notes_field: formData.get("show_notes_field") === "true",
        email_required: formData.get("email_required") === "true",
        name_placeholder: formData.get("name_placeholder") as string || defaultSettings.name_placeholder,
        phone_placeholder: formData.get("phone_placeholder") as string || defaultSettings.phone_placeholder,
        address_placeholder: formData.get("address_placeholder") as string || defaultSettings.address_placeholder,
        notes_placeholder: formData.get("notes_placeholder") as string || defaultSettings.notes_placeholder,
        modal_style: formData.get("modal_style") as any || defaultSettings.modal_style,
        animation_style: formData.get("animation_style") as any || defaultSettings.animation_style,
        border_radius: parseInt(formData.get("border_radius") as string) || defaultSettings.border_radius,
        // New JSONB fields for advanced features
        form_type: formData.get("form_type") as any || defaultSettings.form_type,
        fields: JSON.parse(formData.get("fields") as string || JSON.stringify(defaultSettings.fields)),
        blocks: JSON.parse(formData.get("blocks") as string || JSON.stringify(defaultSettings.blocks)),
        custom_fields: [],  // Legacy: custom fields are now part of fields array
        styles: JSON.parse(formData.get("styles") as string || JSON.stringify(defaultSettings.styles)),
        button_styles: JSON.parse(formData.get("button_styles") as string || JSON.stringify(defaultSettings.button_styles)),
        shipping_options: JSON.parse(formData.get("shipping_options") as string || JSON.stringify(defaultSettings.shipping_options)),
        // Partial COD settings
        partial_cod_enabled: formData.get("partial_cod_enabled") === "true",
        partial_cod_advance_amount: parseInt(formData.get("partial_cod_advance_amount") as string) || defaultSettings.partial_cod_advance_amount,
        partial_cod_commission: parseFloat(formData.get("partial_cod_commission") as string) || defaultSettings.partial_cod_commission,
        // Shipping rates enabled setting
        shipping_rates_enabled: formData.get("shipping_rates_enabled") === "true",
    };

    // Save to Supabase
    try {
        await saveFormSettings(settings);
    } catch (dbError: any) {
        console.error('[Settings] Database error:', dbError);
        // Check for missing column error
        if (dbError.message?.includes('shipping_rates_enabled')) {
            return { success: false, error: 'Database migration needed: Run migration_v9_add_shipping_rates_enabled.sql in Supabase' };
        }
        return { success: false, error: dbError.message || 'Failed to save to database' };
    }

    // Get shipping rates to sync to metafields
    let shippingRatesForMetafield: any[] = [];
    try {
        const { getShippingRates } = await import("../services/shipping-rates.server");
        shippingRatesForMetafield = await getShippingRates(shopDomain);
        console.log('[Settings] Fetched shipping rates for metafield sync:', shippingRatesForMetafield.length);
    } catch (e) {
        console.warn('[Settings] Could not fetch shipping rates for metafield sync:', e);
    }
    // This handles the dynamic ngrok URLs in development
    let appUrl = '';

    // Method 1: Check environment variable (for production)
    if (process.env.SHOPIFY_APP_URL) {
        appUrl = process.env.SHOPIFY_APP_URL;
    }

    // Method 2: Extract from request URL/headers (for development with ngrok)
    if (!appUrl) {
        const url = new URL(request.url);
        // The request URL itself contains the ngrok URL
        appUrl = url.origin;
    }

    // Method 3: Fallback to headers
    if (!appUrl || appUrl.includes('localhost')) {
        const forwardedHost = request.headers.get('x-forwarded-host');
        const forwardedProto = request.headers.get('x-forwarded-proto') || 'https';
        if (forwardedHost) {
            appUrl = `${forwardedProto}://${forwardedHost}`;
        }
    }

    console.log('[Settings] Detected App URL:', appUrl);

    // Sync to Shopify metafields - run definitions + shop query in parallel, then both batches in parallel
    try {
        const [_, shopRes] = await Promise.all([
            ensureMetafieldDefinitions(admin),
            admin.graphql(`query { shop { id } }`)
        ]);
        const shopGid = (await shopRes.json()).data.shop.id;

        console.log('[Settings] Saving metafields for shop:', shopGid);

        const batch1Promise = admin.graphql(`
            mutation SetMetafields($metafields: [MetafieldsSetInput!]!) {
                metafieldsSet(metafields: $metafields) {
                    metafields { key }
                    userErrors { field message }
                }
            }
        `, {
            variables: {
                metafields: [
                    { ownerId: shopGid, namespace: "fox_cod", key: "enabled", value: settings.enabled.toString(), type: "single_line_text_field" },
                    { ownerId: shopGid, namespace: "fox_cod", key: "button_text", value: settings.button_text, type: "single_line_text_field" },
                    { ownerId: shopGid, namespace: "fox_cod", key: "primary_color", value: settings.primary_color, type: "single_line_text_field" },
                    { ownerId: shopGid, namespace: "fox_cod", key: "max_quantity", value: settings.max_quantity.toString(), type: "single_line_text_field" },
                    { ownerId: shopGid, namespace: "fox_cod", key: "app_url", value: appUrl, type: "single_line_text_field" },
                    { ownerId: shopGid, namespace: "fox_cod", key: "form_title", value: settings.form_title || "", type: "single_line_text_field" },
                    { ownerId: shopGid, namespace: "fox_cod", key: "submit_button_text", value: settings.submit_button_text || "", type: "single_line_text_field" },
                    { ownerId: shopGid, namespace: "fox_cod", key: "button_style", value: settings.button_style || "solid", type: "single_line_text_field" },
                    { ownerId: shopGid, namespace: "fox_cod", key: "button_size", value: settings.button_size || "large", type: "single_line_text_field" },
                    { ownerId: shopGid, namespace: "fox_cod", key: "button_position", value: settings.button_position || "below_atc", type: "single_line_text_field" },
                    { ownerId: shopGid, namespace: "fox_cod", key: "form_subtitle", value: settings.form_subtitle || "", type: "single_line_text_field" },
                    { ownerId: shopGid, namespace: "fox_cod", key: "success_message", value: settings.success_message || "", type: "single_line_text_field" },
                    { ownerId: shopGid, namespace: "fox_cod", key: "show_product_image", value: String(settings.show_product_image), type: "single_line_text_field" },
                    { ownerId: shopGid, namespace: "fox_cod", key: "show_price", value: String(settings.show_price), type: "single_line_text_field" },
                    { ownerId: shopGid, namespace: "fox_cod", key: "show_quantity_selector", value: String(settings.show_quantity_selector), type: "single_line_text_field" },
                    { ownerId: shopGid, namespace: "fox_cod", key: "require_name", value: String(settings.required_fields.includes("name")), type: "single_line_text_field" },
                    { ownerId: shopGid, namespace: "fox_cod", key: "require_phone", value: String(settings.required_fields.includes("phone")), type: "single_line_text_field" },
                    { ownerId: shopGid, namespace: "fox_cod", key: "require_address", value: String(settings.required_fields.includes("address")), type: "single_line_text_field" },
                    { ownerId: shopGid, namespace: "fox_cod", key: "show_email_field", value: String(settings.show_email_field), type: "single_line_text_field" },
                    { ownerId: shopGid, namespace: "fox_cod", key: "show_notes_field", value: String(settings.show_notes_field), type: "single_line_text_field" },
                    { ownerId: shopGid, namespace: "fox_cod", key: "modal_style", value: settings.modal_style || "modern", type: "single_line_text_field" },
                    { ownerId: shopGid, namespace: "fox_cod", key: "animation_style", value: settings.animation_style || "fade", type: "single_line_text_field" },
                    { ownerId: shopGid, namespace: "fox_cod", key: "border_radius", value: (settings.border_radius ?? 12).toString(), type: "single_line_text_field" },
                    { ownerId: shopGid, namespace: "fox_cod", key: "form_type", value: settings.form_type || "popup", type: "single_line_text_field" },
                ]
            }
        });

        const batch2Promise = admin.graphql(`
            mutation SetMetafields($metafields: [MetafieldsSetInput!]!) {
                metafieldsSet(metafields: $metafields) {
                    metafields { key }
                    userErrors { field message }
                }
            }
        `, {
            variables: {
                metafields: [
                    { ownerId: shopGid, namespace: "fox_cod", key: "fields", value: JSON.stringify(settings.fields || DEFAULT_FIELDS), type: "json" },
                    { ownerId: shopGid, namespace: "fox_cod", key: "blocks", value: JSON.stringify(settings.blocks || DEFAULT_BLOCKS), type: "json" },
                    { ownerId: shopGid, namespace: "fox_cod", key: "custom_fields", value: JSON.stringify([]), type: "json" },  // Legacy: cleared
                    { ownerId: shopGid, namespace: "fox_cod", key: "styles", value: JSON.stringify(settings.styles || DEFAULT_STYLES), type: "json" },
                    { ownerId: shopGid, namespace: "fox_cod", key: "button_styles_json", value: JSON.stringify(settings.button_styles || DEFAULT_BUTTON_STYLES), type: "json" },
                    { ownerId: shopGid, namespace: "fox_cod", key: "shipping_options", value: JSON.stringify(settings.shipping_options || DEFAULT_SHIPPING_OPTIONS), type: "json" },
                    // Partial COD settings
                    { ownerId: shopGid, namespace: "fox_cod", key: "partial_cod_enabled", value: String(settings.partial_cod_enabled ?? false), type: "single_line_text_field" },
                    { ownerId: shopGid, namespace: "fox_cod", key: "partial_cod_advance_amount", value: String(settings.partial_cod_advance_amount ?? 100), type: "single_line_text_field" },
                    // Shipping rates - sync to metafields for storefront
                    { ownerId: shopGid, namespace: "fox_cod", key: "shipping_rates_enabled", value: String(settings.shipping_rates_enabled ?? false), type: "single_line_text_field" },
                    { ownerId: shopGid, namespace: "fox_cod", key: "shipping_rates_json", value: JSON.stringify(shippingRatesForMetafield || []), type: "json" },
                ]
            }
        });

        console.log('[Settings] Saving button_styles to metafield:', JSON.stringify(settings.button_styles || DEFAULT_BUTTON_STYLES, null, 2));

        const [batch1Res, batch2Res] = await Promise.all([batch1Promise, batch2Promise]);
        const batch1Json = await batch1Res.json();
        const batch2Json = await batch2Res.json();

        if (batch1Json.data?.metafieldsSet?.userErrors?.length > 0) {
            console.error('[Settings] Batch 1 errors:', batch1Json.data.metafieldsSet.userErrors);
        } else {
            console.log('[Settings] Batch 1 saved:',
                batch1Json.data?.metafieldsSet?.metafields?.length || 0, 'fields');
        }

        if (batch2Json.data?.metafieldsSet?.userErrors?.length > 0) {
            console.error('[Settings] Batch 2 errors:', batch2Json.data.metafieldsSet.userErrors);
        } else {
            console.log('[Settings] Batch 2 saved:',
                batch2Json.data?.metafieldsSet?.metafields?.length || 0, 'fields');
        }
    } catch (error) {
        console.error("Error saving metafields:", error);
    }

    return { success: true };
};

// Helper to darken a hex color for gradient
const darkenColor = (hex: string, percent: number) => {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.max(0, (num >> 16) - Math.round(255 * percent / 100));
    const g = Math.max(0, ((num >> 8) & 0x00FF) - Math.round(255 * percent / 100));
    const b = Math.max(0, (num & 0x0000FF) - Math.round(255 * percent / 100));
    return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`;
};

// Memoized Preview Component
const PreviewDisplay = memo(({
    showProductImage, showPrice, buttonText, formTitle,
    namePlaceholder, phonePlaceholder, addressPlaceholder,
    notesPlaceholder, submitButtonText,
    primaryColor, buttonStyle, buttonSize, borderRadius, modalStyle, animationStyle,
    fields, formStyles, buttonStylesState, blocks, shippingOpts, shippingRates, shippingRatesEnabled, activeTab,
    fmtCurrency, currencySymbol
}: any) => {

    // Calculate button styles - sync with storefront
    const getButtonStyle = () => {
        const btn = buttonStylesState || {};
        const buttonColor = primaryColor;
        const borderCol = btn.borderColor || buttonColor;
        const borderW = btn.borderWidth ?? 0;
        // Use targeted transition when transform-based animation is active
        const hasTransformAnim = btn.animationPreset && btn.animationPreset !== 'none' && btn.animationPreset !== 'glow' && btn.animationPreset !== 'gradient-flow';
        const base: any = {
            width: '100%',
            padding: buttonSize === 'small' ? '10px' : buttonSize === 'large' ? '16px' : '13px',
            borderRadius: (btn.borderRadius ?? borderRadius) + 'px',
            fontWeight: btn.fontStyle === 'bold' ? 700 : 400,
            fontStyle: btn.fontStyle === 'italic' ? 'italic' : 'normal',
            fontSize: (btn.textSize ?? 15) + 'px',
            border: borderW ? `${borderW}px solid ${borderCol}` : 'none',
            cursor: 'pointer',
            transition: hasTransformAnim ? 'opacity 0.2s ease, background-color 0.2s ease' : 'all 0.2s ease',
            color: btn.textColor || '#ffffff',
            background: buttonColor, // Prefer global color over potentially stale local style
            boxShadow: btn.shadow ? '0 4px 6px rgba(0,0,0,0.1)' : 'none'
        };

        if (buttonStyle === 'outline') {
            base.background = 'transparent';
            base.backgroundColor = 'transparent';
            // Use buttonColor (selected global color) for outline border unless strictly overridden by a specific check interaction
            // Assuming user wants outline to match the "Button Color" picker they just used
            base.border = borderW > 0 ? `${borderW}px solid ${buttonColor}` : 'none';
            // If text color is white (default) or not set, use primary color for outline
            // Otherwise respect the custom text color
            const isWhite = (btn.textColor || '#ffffff').toLowerCase() === '#ffffff';
            base.color = isWhite ? buttonColor : btn.textColor;
            base.boxShadow = 'none';
        } else if (buttonStyle === 'gradient') {
            const darkColor = darkenColor(buttonColor, 25);
            base.background = `linear-gradient(135deg, ${buttonColor} 0%, ${darkColor} 100%)`;
            base.boxShadow = btn.shadow ? '0 6px 12px rgba(0,0,0,0.2)' : 'none';
        }
        return base;
    };

    // Generate animation CSS classes based on button settings
    const getButtonAnimationClasses = () => {
        const btn = buttonStylesState || {};
        const classes: string[] = [];

        // Animation preset
        if (btn.animationPreset && btn.animationPreset !== 'none') {
            classes.push(`btn-anim-${btn.animationPreset}`);
            // Speed modifier
            if (btn.animationSpeed === 'slow') classes.push('speed-slow');
            if (btn.animationSpeed === 'fast') classes.push('speed-fast');
        }

        // Border effects
        if (btn.borderEffect && btn.borderEffect !== 'static') {
            classes.push(`btn-border-${btn.borderEffect}`);
            // Intensity modifier
            if (btn.borderIntensity === 'low') classes.push('intensity-low');
            if (btn.borderIntensity === 'high') classes.push('intensity-high');
        }

        // Hover effects
        if (btn.hoverLift) classes.push('btn-hover-lift');

        // Click effects
        if (btn.clickRipple) classes.push('btn-click-ripple');
        if (btn.clickPress) classes.push('btn-click-press');

        return classes.join(' ');
    };

    // Generate inline animation style for the preview button
    // (CSS classes may not penetrate Shopify admin Shadow DOM, so we use inline styles)
    const getButtonAnimationStyle = (): React.CSSProperties => {
        const btn = buttonStylesState || {};
        const style: any = {};

        if (btn.animationPreset && btn.animationPreset !== 'none') {
            const preset = btn.animationPreset;
            const speed = btn.animationSpeed || 'normal';

            if (preset === 'shake') {
                const dur = speed === 'slow' ? '0.8s' : speed === 'fast' ? '0.3s' : '0.5s';
                style.animation = `btn-shake ${dur} ease-in-out infinite`;
            } else if (preset === 'pulse') {
                const dur = speed === 'slow' ? '2.5s' : speed === 'fast' ? '0.8s' : '1.5s';
                style.animation = `btn-pulse ${dur} ease-in-out infinite`;
            } else if (preset === 'bounce') {
                const dur = speed === 'slow' ? '1.5s' : speed === 'fast' ? '0.5s' : '1s';
                style.animation = `btn-bounce ${dur} ease-in-out infinite`;
            } else if (preset === 'glow') {
                const dur = speed === 'slow' ? '3s' : speed === 'fast' ? '1s' : '2s';
                style.animation = `btn-glow ${dur} ease-in-out infinite`;
            } else if (preset === 'gradient-flow') {
                const dur = speed === 'slow' ? '5s' : speed === 'fast' ? '1.5s' : '3s';
                style.backgroundSize = '200% 200%';
                style.animation = `btn-gradient-flow ${dur} ease infinite`;
            } else if (preset === 'shimmer') {
                style.position = 'relative';
                style.overflow = 'hidden';
            }
        }

        // Dashed-moving border needs no border inline
        if (btn.borderEffect === 'dashed-moving') {
            style.border = 'none';
            style.position = 'relative';
            style.overflow = 'visible';
        }

        return style;
    };

    // Generate inline keyframe CSS injected next to the preview button
    const getPreviewKeyframesCSS = () => {
        return `
            @keyframes btn-shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-3px); } 75% { transform: translateX(3px); } }
            @keyframes btn-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
            @keyframes btn-bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
            @keyframes btn-glow { 0%, 100% { box-shadow: 0 0 5px rgba(99,102,241,0.4); } 50% { box-shadow: 0 0 20px rgba(99,102,241,0.8), 0 0 30px rgba(99,102,241,0.4); } }
            @keyframes btn-gradient-flow { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
            @keyframes border-dash { 0% { stroke-dashoffset: 0; } 100% { stroke-dashoffset: -20; } }
            @keyframes btn-shimmer { 0% { left: -100%; } 100% { left: 100%; } }
        `;
    };

    // Get modal container styles based on modalStyle and formStyles
    const getModalStyle = () => {
        console.log('[Modal] Background color from formStyles:', formStyles?.backgroundColor);
        const userBgColor = formStyles?.backgroundColor || '#ffffff';

        // Shadow intensity slider (0–100) mapped to a softer modal shadow
        const rawIntensity = formStyles?.shadowIntensity;
        const sliderValue = typeof rawIntensity === 'number'
            ? rawIntensity
            : (formStyles?.shadow ? 35 : 0);
        const clamped = Math.max(0, Math.min(100, sliderValue));
        const shadowOpacity = clamped === 0 ? 0 : 0.10 + (clamped / 100) * 0.25; // 0.10 – 0.35

        const base: any = {
            borderRadius: (formStyles?.borderRadius || borderRadius) + 'px',
            padding: '16px',
            marginTop: '12px',
            transition: 'all 0.3s ease',
            background: userBgColor,
            boxShadow: clamped > 0 ? `0 10px 25px rgba(0,0,0,${shadowOpacity.toFixed(2)})` : 'none'
        };

        if (modalStyle === 'glassmorphism') {
            // Use user's color with transparency for glassmorphism effect
            base.background = userBgColor; // Now respects user color
            base.backdropFilter = 'blur(10px)';
            base.border = '1px solid rgba(255,255,255,0.3)';
            base.boxShadow = clamped > 0 ? `0 8px 32px rgba(0,0,0,${shadowOpacity.toFixed(2)})` : 'none';
        } else if (modalStyle === 'minimal') {
            base.background = userBgColor;
            base.border = '1px solid #e5e7eb';
            base.boxShadow = 'none';
        }
        return base;
    };

    // Get label styles - sync with storefront
    const getLabelStyle = () => ({
        display: 'block',
        fontSize: (formStyles?.labelFontSize ?? formStyles?.textSize ?? 14) + 'px',
        fontWeight: formStyles?.fontStyle === 'bold' ? 700 : 600,
        fontStyle: formStyles?.fontStyle === 'italic' ? 'italic' : 'normal',
        color: formStyles?.labelColor || formStyles?.textColor || '#374151',
        marginBottom: '2px',
        fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        textAlign: (formStyles?.labelAlignment || 'left') as any
    });

    // Get input styles - sync with storefront
    const getInputStyle = () => {
        // Shadow intensity slider (0–100) mapped to a soft box-shadow
        const rawIntensity = formStyles?.shadowIntensity;
        const sliderValue = typeof rawIntensity === 'number'
            ? rawIntensity
            : (formStyles?.shadow ? 35 : 0);
        const clamped = Math.max(0, Math.min(100, sliderValue));
        const shadowOpacity = clamped === 0 ? 0 : 0.05 + (clamped / 100) * 0.25; // 0.05 – 0.30 range

        const styles = {
            width: '100%',
            padding: '10px 12px',
            marginBottom: '6px',
            border: `${formStyles?.borderWidth ?? 1}px solid ${formStyles?.borderColor || '#e5e7eb'}`,
            borderRadius: (formStyles?.borderRadius ?? 8) + 'px',
            fontSize: (formStyles?.textSize ?? 14) + 'px',
            fontWeight: 400,
            fontStyle: 'normal' as const,
            fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            color: formStyles?.textColor || '#111827',
            boxSizing: 'border-box' as const,
            // backgroundColor removed - set explicitly in preview divs to avoid React reconciliation conflicts
            boxShadow: clamped > 0 ? `0 1px 2px rgba(0,0,0,${shadowOpacity.toFixed(2)})` : 'none'
        };
        console.log('[Preview] getInputStyle - fieldBackgroundColor value:', formStyles?.fieldBackgroundColor);
        return styles;
    };

    // Animation indicator
    const getAnimationLabel = () => {
        if (animationStyle === 'slide') return '↗ Slide';
        if (animationStyle === 'scale') return 'Scale';
        return 'Fade';
    };

    // Field icons - exact match to storefront (cod-form.js) - iconColor, iconBackground
    const FieldIconSvg = ({ fieldId, isTextarea }: { fieldId: string; isTextarea?: boolean }) => {
        const s: React.CSSProperties = {
            width: 18, height: 18, position: 'absolute', left: 12,
            top: isTextarea ? 12 : '50%',
            transform: isTextarea ? 'none' : 'translateY(-50%)',
            color: formStyles?.iconColor || '#6b7280',
            backgroundColor: formStyles?.iconBackground || 'transparent',
            borderRadius: 4,
            padding: 2,
            pointerEvents: 'none',
            opacity: 1,
            mixBlendMode: 'normal' as const
        };
        const svgs: Record<string, React.ReactNode> = {
            phone: <svg style={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>,
            name: <svg style={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>,
            email: <svg style={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>,
            address: <svg style={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>,
            notes: <svg style={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14,2 14,8 20,8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10,9 9,9 8,9" /></svg>,
            quantity: <svg style={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="9" y1="9" x2="15" y2="15" /><line x1="15" y1="9" x2="9" y2="15" /></svg>,
            zip: <svg style={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>,
            state: <svg style={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>,
            city: <svg style={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>,
            marketing: <svg style={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>,
        };
        return svgs[fieldId] || svgs.name;
    };

    // Get visible fields sorted by order — exclude quantity (handled by +/- buttons)
    const visibleFields = (fields || []).filter((f: FormField) => f.visible && f.id !== 'quantity').sort((a: FormField, b: FormField) => a.order - b.order);

    // Sample price values for rate card
    const subtotal = 1999;
    const discount = 200;

    // Calculate shipping cost using new shipping rates system
    let shippingCost = 0;
    if (shippingRatesEnabled && shippingRates?.length > 0) {
        // Find first applicable rate (simplified for preview)
        const applicableRate = shippingRates.find((rate: any) => rate.is_active);
        shippingCost = applicableRate?.price || 0;
    } else if (shippingOpts?.enabled) {
        // Fallback to old shipping options
        shippingCost = shippingOpts.options?.find((o: any) => o.id === shippingOpts.defaultOption)?.price || 0;
    }

    const total = subtotal - discount + shippingCost;

    // Use formStyles directly for immediate feedback
    // const deferredFormStyles = useDeferredValue(formStyles);

    return (
        <div className="preview-panel">
            <div className="preview-header">
                <h3>Live Preview</h3>
                <span style={{ fontSize: '11px', color: '#6b7280', background: '#f3f4f6', padding: '4px 8px', borderRadius: '6px' }}>
                    {getAnimationLabel()} | {modalStyle.charAt(0).toUpperCase() + modalStyle.slice(1)}
                </span>
            </div>
            <div className="preview-content">
                <div className="preview-phone">
                    <div className={`preview-phone-screen ${activeTab === 'button' ? 'preview-compact' : ''}`}>
                        <div className="preview-product" style={activeTab === 'button' ? { padding: '24px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' } : {
                            padding: '16px',
                            background: formStyles?.backgroundColor || '#ffffff',
                            borderRadius: (formStyles?.borderRadius || borderRadius) + 'px',
                            ...(modalStyle === 'glassmorphism' ? { backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.3)', boxShadow: formStyles?.shadow ? '0 8px 32px rgba(0,0,0,0.1)' : 'none' } : modalStyle === 'minimal' ? { border: '1px solid #e5e7eb', boxShadow: 'none' } : { boxShadow: formStyles?.shadow ? '0 10px 25px rgba(0,0,0,0.1)' : 'none' }),
                        }}>
                            {/* Product Info - horizontal layout matching storefront */}
                            {activeTab !== 'button' && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingBottom: '12px', borderBottom: '1px solid rgba(0,0,0,0.08)', marginBottom: '8px' }}>
                                    {showProductImage && (
                                        <img
                                            src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRfEiGMrC1y0OMGHknT1nakNKz7HWAgTAl3LQ&s?w=200&h=200&fit=crop&crop=center"
                                            alt="Sample Product"
                                            style={{ width: '65px', height: '65px', objectFit: 'cover', borderRadius: '6px', flexShrink: 0 }}
                                        />
                                    )}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div className="preview-product-title">Sample Product</div>
                                        {showPrice && (
                                            <div className="preview-product-price">{fmtCurrency(1999)}</div>
                                        )}
                                    </div>
                                    <div style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid #d1d5db', borderRadius: '999px', overflow: 'hidden', background: '#fff', flexShrink: 0, marginLeft: 'auto' }}>
                                        <div style={{ width: '34px', height: '32px', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 500, color: '#6b7280', cursor: 'default' }}>−</div>
                                        <div style={{ width: '36px', height: '32px', borderLeft: '1px solid #e5e7eb', borderRight: '1px solid #e5e7eb', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 600, color: '#1f2937', fontFamily: "'Inter', sans-serif" }}>1</div>
                                        <div style={{ width: '34px', height: '32px', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 500, color: '#6b7280', cursor: 'default' }}>+</div>
                                    </div>
                                </div>
                            )}
                            {/* Only show Order button in Button tab */}
                            {activeTab === 'button' && (
                                <>
                                    <style dangerouslySetInnerHTML={{ __html: getPreviewKeyframesCSS() }} />
                                    <button
                                        className={getButtonAnimationClasses()}
                                        style={{ ...getButtonStyle(), ...getButtonAnimationStyle(), maxWidth: '200px', width: '100%', position: 'relative', '--btn-border-color': buttonStylesState?.borderColor || primaryColor || '#6366f1' } as any}
                                    >
                                        {buttonStylesState?.borderEffect === 'dashed-moving' && (
                                            <svg className="marching-ants-svg" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1 }}>
                                                <rect x="1" y="1" style={{ width: 'calc(100% - 2px)', height: 'calc(100% - 2px)', fill: 'none', stroke: buttonStylesState?.borderColor || primaryColor || '#6366f1', strokeWidth: 2, strokeDasharray: '8 4', animation: 'border-dash 0.6s linear infinite' }} rx={buttonStylesState?.borderRadius ?? 12} ry={buttonStylesState?.borderRadius ?? 12} />
                                            </svg>
                                        )}
                                        {buttonText || 'Buy with COD'}
                                    </button>
                                </>
                            )}
                            {/* Only show form when NOT on button tab */}
                            {activeTab !== 'button' && (
                                <div className="preview-modal" style={{ ...getModalStyle(), marginTop: '0', background: 'transparent', boxShadow: 'none', border: 'none', backdropFilter: 'none', padding: '0 0 16px 0' }}>
                                    <div className="preview-modal-title" style={{
                                        fontWeight: 600,
                                        marginBottom: '12px',
                                        color: formStyles?.textColor || '#111',
                                        textAlign: formStyles?.labelAlignment || 'left'
                                    }}>
                                        {formTitle || 'Cash on Delivery'}
                                    </div>

                                    {/* Dynamic Fields based on visibility and drag-drop order */}
                                    {visibleFields.map((field: FormField) => {
                                        // Shipping section field
                                        if (field.id === 'shipping') {
                                            const hasNewRates = shippingRatesEnabled && shippingRates?.length > 0;
                                            const hasOldRates = shippingOpts?.enabled && (!shippingRatesEnabled || !shippingRates?.length);
                                            if (!hasNewRates && !hasOldRates) return null;
                                            return (
                                                <div key={field.id} style={{ marginBottom: '12px', marginTop: '12px' }}>
                                                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></svg>
                                                        Shipping Method
                                                    </div>
                                                    {hasNewRates ? (
                                                        shippingRates.filter((r: any) => r.is_active).slice(0, 3).map((rate: any, idx: number) => (
                                                            <div key={rate.id} style={{
                                                                display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px',
                                                                border: idx === 0 ? `2px solid ${primaryColor}` : '2px solid #e5e7eb',
                                                                borderRadius: '10px', background: idx === 0 ? 'rgba(99,102,241,0.04)' : '#fff',
                                                                marginBottom: '6px', cursor: 'default'
                                                            }}>
                                                                <input type="radio" name="shipping-preview" disabled checked={idx === 0} style={{ width: '14px', height: '14px', accentColor: primaryColor, flexShrink: 0 }} />
                                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                                    <div style={{ fontWeight: 600, fontSize: '12px', color: '#1f2937', marginBottom: '1px' }}>{rate.name}</div>
                                                                    {rate.description && (
                                                                        <div style={{ fontSize: '10px', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                                                                            {rate.description}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <div style={{ flexShrink: 0 }}>
                                                                    {rate.price === 0 ? (
                                                                        <span style={{ background: '#10b981', color: 'white', padding: '3px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 600 }}>FREE</span>
                                                                    ) : (
                                                                        <span style={{ fontWeight: 700, fontSize: '12px', color: '#1f2937' }}>{fmtCurrency(rate.price)}</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ))
                                                    ) : (
                                                        shippingOpts.options?.slice(0, 2).map((opt: any) => (
                                                            <div key={opt.id} style={{
                                                                display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px',
                                                                border: opt.id === shippingOpts.defaultOption ? `2px solid ${primaryColor}` : '2px solid #e5e7eb',
                                                                borderRadius: '10px', background: opt.id === shippingOpts.defaultOption ? 'rgba(99,102,241,0.04)' : '#fff',
                                                                marginBottom: '6px', cursor: 'default'
                                                            }}>
                                                                <input type="radio" name="shipping-preview" disabled checked={opt.id === shippingOpts.defaultOption} style={{ width: '14px', height: '14px', accentColor: primaryColor, flexShrink: 0 }} />
                                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                                    <div style={{ fontWeight: 600, fontSize: '12px', color: '#1f2937' }}>{opt.label}</div>
                                                                </div>
                                                                <div style={{ flexShrink: 0 }}>
                                                                    {opt.price === 0 ? (
                                                                        <span style={{ background: '#10b981', color: 'white', padding: '3px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 600 }}>Free</span>
                                                                    ) : (
                                                                        <span style={{ fontWeight: 700, fontSize: '12px', color: '#1f2937' }}>{fmtCurrency(opt.price)}</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            );
                                        }

                                        // Order Summary section field (preview)
                                        if (field.id === 'order_summary') {
                                            const fsAny: any = formStyles || {};
                                            const themeKey = fsAny.themeKey || 'custom';
                                            const isPresetTheme = themeKey && themeKey !== 'custom';
                                            const primaryTheme = primaryColor || '#111827';

                                            const customGreyBg = '#f3f4f6';
                                            const customBorder = '1px solid #e5e7eb';
                                            const presetBg = (() => {
                                                if (themeKey === 'default' || themeKey === 'professional') return 'rgb(243, 244, 246)';
                                                const hex = primaryTheme.replace('#', '');
                                                if (hex.length !== 6) return 'rgba(17,24,39,0.12)';
                                                const r = parseInt(hex.substring(0, 2), 16);
                                                const g = parseInt(hex.substring(2, 4), 16);
                                                const b = parseInt(hex.substring(4, 6), 16);
                                                return `rgba(${r},${g},${b},0.16)`;
                                            })();

                                            const cardStyle: React.CSSProperties = {
                                                background: isPresetTheme ? presetBg : customGreyBg,
                                                borderRadius: 10,
                                                padding: 12,
                                                marginTop: 4,
                                                marginBottom: 12,
                                                border: isPresetTheme ? (themeKey === 'default' ? customBorder : 'none') : customBorder,
                                            };

                                            return (
                                                <div key={field.id} style={cardStyle}>
                                                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        Order Summary
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#6b7280', marginBottom: '6px' }}>
                                                        <span>Subtotal</span><span>{fmtCurrency(subtotal)}</span>
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#10b981', marginBottom: '6px' }}>
                                                        <span>Discount</span><span>-{fmtCurrency(discount)}</span>
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#6b7280', marginBottom: '8px' }}>
                                                        <span>Shipping</span><span>{shippingCost === 0 ? 'FREE' : fmtCurrency(shippingCost)}</span>
                                                    </div>
                                                    <div style={{
                                                        display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 700,
                                                        color: '#111827', paddingTop: '8px', borderTop: '1px dashed #d1d5db'
                                                    }}>
                                                        <span>Total</span><span style={{ color: primaryColor }}>{fmtCurrency(total)}</span>
                                                    </div>
                                                </div>
                                            );
                                        }

                                        // Payment Mode section field
                                        if (field.id === 'payment_mode') {
                                            return (
                                                <div key={field.id} style={{
                                                    marginBottom: '12px', padding: '14px',
                                                    background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(139, 92, 246, 0.05) 100%)',
                                                    borderRadius: '10px',
                                                    border: '1px solid rgba(99, 102, 241, 0.2)',
                                                }}>
                                                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#1f2937', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>
                                                        Payment Method
                                                    </div>
                                                    {/* Full COD option */}
                                                    <label style={{
                                                        display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '10px',
                                                        background: '#fff', borderRadius: '8px', border: '2px solid #e5e7eb',
                                                        marginBottom: '6px', cursor: 'default', fontSize: '11px',
                                                    }}>
                                                        <input type="radio" name="preview-payment" disabled style={{ width: '12px', height: '12px', marginTop: '1px', accentColor: primaryColor }} />
                                                        <div style={{ flex: 1 }}>
                                                            <div style={{ fontWeight: 600, color: '#1f2937' }}>Full COD</div>
                                                            <div style={{ color: '#6b7280', fontSize: '10px', marginTop: '1px' }}>Pay on delivery</div>
                                                        </div>
                                                    </label>
                                                    {/* Partial COD option */}
                                                    <label style={{
                                                        display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '10px',
                                                        background: '#fff', borderRadius: '8px', border: '2px solid #e5e7eb',
                                                        cursor: 'default', fontSize: '11px',
                                                    }}>
                                                        <input type="radio" name="preview-payment" disabled style={{ width: '12px', height: '12px', marginTop: '1px', accentColor: primaryColor }} />
                                                        <div style={{ flex: 1 }}>
                                                            <div style={{ fontWeight: 600, color: '#1f2937' }}>Partial COD</div>
                                                            <div style={{ color: '#6b7280', fontSize: '10px', marginTop: '1px' }}>Pay advance, rest on delivery</div>
                                                        </div>
                                                    </label>
                                                </div>
                                            );
                                        }
                                        if (field.id === 'marketing') {
                                            return (
                                                <div key={field.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', fontSize: '10px', color: '#6b7280' }}>
                                                    <input type="checkbox" disabled style={{ width: '14px', height: '14px' }} />
                                                    <span>Keep me updated with offers & news</span>
                                                </div>
                                            );
                                        }

                                        // Regular form fields
                                        return (
                                            <div key={field.id} style={{ marginBottom: '8px' }}>
                                                <label style={getLabelStyle() as any}>
                                                    {field.label} {field.required && <span style={{ color: '#ef4444' }}>*</span>}
                                                </label>
                                                {field.type === 'textarea' ? (
                                                    <div style={{ position: 'relative' }}>
                                                        <FieldIconSvg fieldId={field.id} isTextarea />
                                                        <textarea
                                                            disabled
                                                            placeholder={field.id === 'address' ? (addressPlaceholder || 'Enter address') :
                                                                field.id === 'notes' ? (notesPlaceholder || 'Any notes...') :
                                                                    `Enter ${field.label.toLowerCase()}`}
                                                            style={{
                                                                ...getInputStyle(),
                                                                height: '50px',
                                                                paddingLeft: 40,
                                                                resize: 'none',
                                                                backgroundColor: formStyles?.fieldBackgroundColor || '#ffffff',
                                                                cursor: 'not-allowed',
                                                                opacity: 1
                                                            } as any}
                                                        />
                                                    </div>
                                                ) : field.type === 'checkbox' ? (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                                        <input type="checkbox" disabled style={{ width: '16px', height: '16px' }} />
                                                        <span style={{ fontSize: '11px', color: '#6b7280' }}>{field.label}</span>
                                                    </div>
                                                ) : (
                                                    <div style={{ position: 'relative' }}>
                                                        <FieldIconSvg fieldId={field.id} />
                                                        <input
                                                            type={field.type === 'tel' ? 'tel' : field.type === 'email' ? 'email' : 'text'}
                                                            disabled
                                                            placeholder={field.id === 'name' ? (namePlaceholder || 'John Doe') :
                                                                field.id === 'phone' ? (phonePlaceholder || '+91 98765 43210') :
                                                                    field.id === 'email' ? 'email@example.com' :
                                                                        `Enter ${field.label.toLowerCase()}`}
                                                            style={{
                                                                ...getInputStyle(),
                                                                paddingLeft: 40,
                                                                height: '42px',
                                                                backgroundColor: formStyles?.fieldBackgroundColor || '#ffffff',
                                                                cursor: 'not-allowed',
                                                                opacity: 1
                                                            } as any}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}

                                    <button className="preview-submit" style={getButtonStyle()}>
                                        {submitButtonText || 'Place Order'}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div >
    );
});

// Sortable Field Item Component for drag and drop
interface SortableFieldItemProps {
    field: FormField;
    onToggleVisibility: (id: string) => void;
    onToggleRequired: (id: string) => void;
    isCustom?: boolean;
    onRemove?: (id: string) => void;
}

// Section fields that should not have a "required" toggle
const SECTION_FIELD_IDS = ['shipping', 'order_summary', 'payment_mode'];

const SortableFieldItem = ({ field, onToggleVisibility, onToggleRequired, isCustom, onRemove }: SortableFieldItemProps) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id });
    const isSectionField = SECTION_FIELD_IDS.includes(field.id);

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div ref={setNodeRef} style={style} className="sortable-field-item">
            <div className="field-drag-handle" {...attributes} {...listeners}>
                <span>⋮⋮</span>
            </div>
            <div className="field-info">
                <span className="field-label">{field.label}</span>
                <span className="field-type">{isSectionField ? 'section' : field.type}</span>
            </div>
            <div className="field-actions" style={{ minWidth: '72px', justifyContent: 'flex-end' }}>
                <Button
                    icon={field.visible ? ViewIcon : HideIcon}
                    variant="tertiary"
                    accessibilityLabel={field.visible ? 'Hide field' : 'Show field'}
                    onClick={() => onToggleVisibility(field.id)}
                />
                {!isSectionField ? (
                    <Button
                        icon={StarFilledIcon}
                        variant="tertiary"
                        tone={field.required ? 'critical' : undefined}
                        accessibilityLabel={field.required ? 'Make optional' : 'Make required'}
                        onClick={() => onToggleRequired(field.id)}
                    />
                ) : (
                    <div style={{ width: '32px' }} />
                )}
                {isCustom && onRemove && (
                    <Button icon={DeleteIcon} variant="plain" tone="critical" accessibilityLabel="Remove field" onClick={() => onRemove(field.id)} />
                )}
            </div>
        </div>
    );
};

/**
 * Shipping Rate Modal Component
 */
interface ShippingRateModalProps {
    rate: ShippingRate | null;
    products: any[];
    collections: any[];
    currencySymbol: string;
    onClose: () => void;
    onSave: (rateData: Omit<ShippingRate, 'id' | 'shop_domain' | 'created_at' | 'updated_at'>) => void;
}

// Common countries with their codes
const COUNTRIES = [
    { code: 'IN', name: 'India' },
    { code: 'US', name: 'United States' },
    { code: 'CA', name: 'Canada' },
    { code: 'GB', name: 'United Kingdom' },
    { code: 'AU', name: 'Australia' },
    { code: 'DE', name: 'Germany' },
    { code: 'FR', name: 'France' },
    { code: 'IT', name: 'Italy' },
    { code: 'ES', name: 'Spain' },
    { code: 'NL', name: 'Netherlands' },
    { code: 'AE', name: 'United Arab Emirates' },
    { code: 'SG', name: 'Singapore' },
    { code: 'JP', name: 'Japan' },
    { code: 'KR', name: 'South Korea' },
    { code: 'BR', name: 'Brazil' },
    { code: 'MX', name: 'Mexico' },
];

// Indian states with codes
const INDIAN_STATES = [
    { code: 'AP', name: 'Andhra Pradesh' },
    { code: 'AR', name: 'Arunachal Pradesh' },
    { code: 'AS', name: 'Assam' },
    { code: 'BR', name: 'Bihar' },
    { code: 'CG', name: 'Chhattisgarh' },
    { code: 'GA', name: 'Goa' },
    { code: 'GJ', name: 'Gujarat' },
    { code: 'HR', name: 'Haryana' },
    { code: 'HP', name: 'Himachal Pradesh' },
    { code: 'JH', name: 'Jharkhand' },
    { code: 'KA', name: 'Karnataka' },
    { code: 'KL', name: 'Kerala' },
    { code: 'MP', name: 'Madhya Pradesh' },
    { code: 'MH', name: 'Maharashtra' },
    { code: 'MN', name: 'Manipur' },
    { code: 'ML', name: 'Meghalaya' },
    { code: 'MZ', name: 'Mizoram' },
    { code: 'NL', name: 'Nagaland' },
    { code: 'OD', name: 'Odisha' },
    { code: 'PB', name: 'Punjab' },
    { code: 'RJ', name: 'Rajasthan' },
    { code: 'SK', name: 'Sikkim' },
    { code: 'TN', name: 'Tamil Nadu' },
    { code: 'TG', name: 'Telangana' },
    { code: 'TR', name: 'Tripura' },
    { code: 'UP', name: 'Uttar Pradesh' },
    { code: 'UK', name: 'Uttarakhand' },
    { code: 'WB', name: 'West Bengal' },
    { code: 'DL', name: 'Delhi' },
    { code: 'JK', name: 'Jammu & Kashmir' },
    { code: 'LA', name: 'Ladakh' },
    { code: 'PY', name: 'Puducherry' },
    { code: 'CH', name: 'Chandigarh' },
];

const ShippingRateModal = ({ rate, products, collections, currencySymbol, onClose, onSave }: ShippingRateModalProps) => {
    const [name, setName] = useState(rate?.name || '');
    const [description, setDescription] = useState(rate?.description || '');
    const [price, setPrice] = useState(rate?.price ?? 0);
    const [conditionType, setConditionType] = useState<ShippingRate['condition_type']>(rate?.condition_type || 'none');
    const [minValue, setMinValue] = useState(rate?.min_value ?? '');
    const [maxValue, setMaxValue] = useState(rate?.max_value ?? '');
    const [appliesToProducts, setAppliesToProducts] = useState(rate?.applies_to_products || false);
    const [appliesToCountries, setAppliesToCountries] = useState(rate?.applies_to_countries || false);
    const [appliesToStates, setAppliesToStates] = useState(rate?.applies_to_states || false);
    const [appliesToCollections, setAppliesToCollections] = useState(rate?.applies_to_collections || false);
    const [isActive, setIsActive] = useState(rate?.is_active ?? true);

    // State for selected products, countries, states, and collections
    const [selectedProductIds, setSelectedProductIds] = useState<string[]>(rate?.product_ids || []);
    const [selectedCountryCodes, setSelectedCountryCodes] = useState<string[]>(rate?.country_codes || []);
    const [selectedStateCodes, setSelectedStateCodes] = useState<string[]>(rate?.state_codes || []);
    const [selectedCollectionIds, setSelectedCollectionIds] = useState<string[]>(rate?.collection_ids || []);
    const [productSearch, setProductSearch] = useState('');
    const [collectionSearch, setCollectionSearch] = useState('');

    const handleSave = () => {
        if (!name.trim()) return;
        onSave({
            name: name.trim(),
            description: description.trim(),
            price: Number(price) || 0,
            condition_type: conditionType,
            min_value: (minValue === '' || minValue === null || minValue === undefined) ? null as any : Number(minValue),
            max_value: (maxValue === '' || maxValue === null || maxValue === undefined) ? null as any : Number(maxValue),
            applies_to_products: appliesToProducts,
            product_ids: appliesToProducts ? selectedProductIds : [],
            applies_to_countries: appliesToCountries,
            country_codes: appliesToCountries ? selectedCountryCodes : [],
            applies_to_states: appliesToStates,
            state_codes: appliesToStates ? selectedStateCodes : [],
            applies_to_collections: appliesToCollections,
            collection_ids: appliesToCollections ? selectedCollectionIds : [],
            is_active: isActive,
        });
    };

    const toggleProduct = (productId: string) => {
        setSelectedProductIds(prev =>
            prev.includes(productId)
                ? prev.filter(id => id !== productId)
                : [...prev, productId]
        );
    };

    const toggleCountry = (countryCode: string) => {
        setSelectedCountryCodes(prev =>
            prev.includes(countryCode)
                ? prev.filter(code => code !== countryCode)
                : [...prev, countryCode]
        );
    };

    const toggleState = (stateCode: string) => {
        setSelectedStateCodes(prev =>
            prev.includes(stateCode)
                ? prev.filter(code => code !== stateCode)
                : [...prev, stateCode]
        );
    };

    const toggleCollection = (collectionId: string) => {
        setSelectedCollectionIds(prev =>
            prev.includes(collectionId)
                ? prev.filter(id => id !== collectionId)
                : [...prev, collectionId]
        );
    };

    const filteredCollections = collections.filter(c =>
        c.title.toLowerCase().includes(collectionSearch.toLowerCase())
    );

    const filteredProducts = products.filter(p =>
        p.title.toLowerCase().includes(productSearch.toLowerCase())
    );
    const [showConditions, setShowConditions] = useState(conditionType !== 'none');
    const [excludeProducts, setExcludeProducts] = useState(false);
    const [countrySearch, setCountrySearch] = useState('');
    const [stateSearch, setStateSearch] = useState('');

    const filteredCountries = COUNTRIES.filter(c =>
        c.name.toLowerCase().includes(countrySearch.toLowerCase())
    );
    const filteredStates = INDIAN_STATES.filter(s =>
        s.name.toLowerCase().includes(stateSearch.toLowerCase())
    );

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="sr-modal" onClick={(e) => e.stopPropagation()}>
                {/* Unique Header - dark with accent */}
                <div className="sr-modal-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div className="sr-header-icon">
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M16.5 7H3.5L2 9.5V11h1v5.5h14V11h1V9.5L16.5 7z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M7 11v5.5M13 11v5.5M2 9.5h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                        </div>
                        <div>
                            <h3 style={{ margin: 0 }}>{rate ? 'Edit Shipping Rate' : 'New Shipping Rate'}</h3>
                            <span style={{ fontSize: '12px', opacity: 0.7 }}>Configure pricing, conditions and restrictions</span>
                        </div>
                    </div>
                    <button className="sr-close-btn" onClick={onClose}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                </div>

                <div className="sr-modal-body">
                    {/* Section: Basic Info */}
                    <div className="sr-section">
                        <div className="sr-section-title">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                            Rate Details
                        </div>
                        <div className="sr-row">
                            <div className="sr-field" style={{ flex: 1 }}>
                                <label className="sr-label">Name <span style={{ color: '#ef4444' }}>*</span></label>
                                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Standard Shipping" className="sr-input" />
                            </div>
                            <div className="sr-field" style={{ flex: 1 }}>
                                <label className="sr-label">Description</label>
                                <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g., Delivers in 2-3 days" className="sr-input" />
                            </div>
                        </div>
                        <div className="sr-field">
                            <label className="sr-label">Price</label>
                            <div className="sr-price-row">
                                <div className="sr-price-input-wrap">
                                    <span className="sr-currency">{currencySymbol}</span>
                                    <input type="number" value={price} onChange={(e) => setPrice(Number(e.target.value))} min="0" placeholder="0" className="sr-input sr-price-input" />
                                </div>
                                <button type="button" className={`sr-free-btn ${price === 0 ? 'active' : ''}`} onClick={() => setPrice(0)}>Free shipping</button>
                            </div>
                        </div>
                    </div>

                    {/* Section: Conditions */}
                    <div className="sr-section">
                        <div className="sr-section-title">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                            Conditions
                        </div>
                        {!showConditions ? (
                            <button className="sr-add-conditions-btn" onClick={() => { setShowConditions(true); if (conditionType === 'none') setConditionType('order_price'); }}>
                                + Add conditions to this rate
                            </button>
                        ) : (
                            <div className="sr-conditions-panel">
                                <div className="sr-conditions-header">
                                    <label className="sr-label" style={{ marginBottom: 0 }}>Based on</label>
                                    <button className="sr-remove-link" onClick={() => { setShowConditions(false); setConditionType('none'); setMinValue(''); setMaxValue(''); }}>✕ Remove</button>
                                </div>
                                <select value={conditionType === 'none' ? 'order_price' : conditionType} onChange={(e) => setConditionType(e.target.value as any)} className="sr-select" style={{ marginBottom: '12px' }}>
                                    <option value="order_price">Order price ({currencySymbol})</option>
                                    <option value="order_quantity">Order quantity (items)</option>
                                    <option value="order_weight">Order weight (kg)</option>
                                </select>
                                <div className="sr-row">
                                    <div className="sr-field" style={{ flex: 1, marginBottom: 0 }}>
                                        <label className="sr-label">Min value</label>
                                        <input type="number" value={minValue} onChange={(e) => setMinValue(e.target.value)} placeholder="0" className="sr-input" />
                                    </div>
                                    <div className="sr-field" style={{ flex: 1, marginBottom: 0 }}>
                                        <label className="sr-label">Max value</label>
                                        <input type="number" value={maxValue} onChange={(e) => setMaxValue(e.target.value)} placeholder="No limit" className="sr-input" />
                                    </div>
                                </div>
                                <span className="sr-hint" style={{ marginTop: '6px', display: 'block' }}>Set max to 0 for no upper limit.</span>
                            </div>
                        )}
                    </div>

                    {/* Section: Restrictions */}
                    <div className="sr-section">
                        <div className="sr-section-title">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                            Restrictions
                        </div>

                        {/* Countries */}
                        <div className="sr-restriction-item">
                            <label className="sr-checkbox-row">
                                <input type="checkbox" checked={appliesToCountries} onChange={(e) => setAppliesToCountries(e.target.checked)} />
                                <span>Limit to specific countries</span>
                            </label>
                            {appliesToCountries && (
                                <div className="sr-restriction-content">
                                    <div className="sr-search-wrap">
                                        <svg className="sr-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                                        <input type="text" value={countrySearch} onChange={(e) => setCountrySearch(e.target.value)} placeholder="Search countries..." className="sr-input sr-search-input" />
                                    </div>
                                    <div className="sr-tag-list">
                                        {COUNTRIES.filter(c => !countrySearch || c.name.toLowerCase().includes(countrySearch.toLowerCase())).map(c => (
                                            <label key={c.code} className={`sr-tag-chip ${selectedCountryCodes.includes(c.code) ? 'selected' : ''}`}>
                                                <input type="checkbox" checked={selectedCountryCodes.includes(c.code)} onChange={() => toggleCountry(c.code)} style={{ display: 'none' }} />
                                                <span>{c.name}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* States */}
                        <div className="sr-restriction-item">
                            <label className="sr-checkbox-row">
                                <input type="checkbox" checked={appliesToStates} onChange={(e) => setAppliesToStates(e.target.checked)} />
                                <span>Limit to specific states / provinces</span>
                            </label>
                            {appliesToStates && (
                                <div className="sr-restriction-content">
                                    <div className="sr-search-wrap">
                                        <svg className="sr-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                                        <input type="text" value={stateSearch} onChange={(e) => setStateSearch(e.target.value)} placeholder="Search states..." className="sr-input sr-search-input" />
                                    </div>
                                    <div className="sr-tag-list">
                                        {INDIAN_STATES.filter(s => !stateSearch || s.name.toLowerCase().includes(stateSearch.toLowerCase())).map(s => (
                                            <label key={s.code} className={`sr-tag-chip ${selectedStateCodes.includes(s.code) ? 'selected' : ''}`}>
                                                <input type="checkbox" checked={selectedStateCodes.includes(s.code)} onChange={() => toggleState(s.code)} style={{ display: 'none' }} />
                                                <span>{s.name}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Products */}
                        <div className="sr-restriction-item">
                            <label className="sr-checkbox-row">
                                <input type="checkbox" checked={appliesToProducts} onChange={(e) => setAppliesToProducts(e.target.checked)} />
                                <span>Limit to specific products</span>
                            </label>
                            {appliesToProducts && (
                                <div className="sr-restriction-content">
                                    <input type="text" value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="Search products..." className="sr-input" style={{ marginBottom: '8px' }} />
                                    <div className="sr-tag-list">
                                        {filteredProducts.map(product => (
                                            <label key={product.id} className={`sr-tag-chip ${selectedProductIds.includes(product.id) ? 'selected' : ''}`}>
                                                <input type="checkbox" checked={selectedProductIds.includes(product.id)} onChange={() => toggleProduct(product.id)} style={{ display: 'none' }} />
                                                <span>{product.title}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Collections/Categories */}
                        <div className="sr-restriction-item">
                            <label className="sr-checkbox-row">
                                <input type="checkbox" checked={appliesToCollections} onChange={(e) => setAppliesToCollections(e.target.checked)} />
                                <span>Limit to specific collections / categories</span>
                            </label>
                            {appliesToCollections && (
                                <div className="sr-restriction-content">
                                    <div className="sr-search-wrap">
                                        <svg className="sr-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                                        <input type="text" value={collectionSearch} onChange={(e) => setCollectionSearch(e.target.value)} placeholder="Search collections..." className="sr-input sr-search-input" />
                                    </div>
                                    <div className="sr-tag-list">
                                        {filteredCollections.map(collection => (
                                            <label key={collection.id} className={`sr-tag-chip ${selectedCollectionIds.includes(collection.id) ? 'selected' : ''}`}>
                                                <input type="checkbox" checked={selectedCollectionIds.includes(collection.id)} onChange={() => toggleCollection(collection.id)} style={{ display: 'none' }} />
                                                <span>{collection.title} ({collection.productsCount})</span>
                                            </label>
                                        ))}
                                    </div>
                                    <span className="sr-hint" style={{ marginTop: '6px', display: 'block' }}>Products in selected collections will be automatically included for this rate.</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer with status toggle */}
                <div className="sr-modal-footer">
                    <div className="sr-footer-left">
                        <label className="sr-status-toggle" onClick={() => setIsActive(!isActive)}>
                            <div className={`mini-toggle ${isActive ? 'on' : 'off'}`} />
                            <span style={{ fontSize: '13px', color: isActive ? '#10b981' : '#9ca3af', fontWeight: 500 }}>{isActive ? 'Active' : 'Inactive'}</span>
                        </label>
                    </div>
                    <div className="sr-footer-right" style={{ display: 'flex', gap: '8px' }}>
                        <Button onClick={onClose}>Cancel</Button>
                        <Button variant="primary" onClick={handleSave} disabled={!name.trim()}>{rate ? 'Save Changes' : 'Create Rate'}</Button>
                    </div>
                </div>
            </div>
        </div >
    );

};
/**
 * Import Shipping Modal Component
 */
interface ImportShippingModalProps {
    onClose: () => void;
    onImport: (replaceExisting: boolean) => void;
}

const ImportShippingModal = ({ onClose, onImport }: ImportShippingModalProps) => {
    const [replaceExisting, setReplaceExisting] = useState(false);

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Import from Shopify</h3>
                </div>
                <div className="modal-body">
                    <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '16px' }}>
                        Import shipping rates from your Shopify store's delivery profiles.
                    </p>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '12px', background: '#f9fafb', borderRadius: '8px' }}>
                        <input
                            type="checkbox"
                            checked={replaceExisting}
                            onChange={(e) => setReplaceExisting(e.target.checked)}
                        />
                        <span style={{ fontSize: '14px', color: '#374151' }}>
                            Replace all existing rates (otherwise, imported rates will be added)
                        </span>
                    </label>
                </div>
                <div className="modal-actions">
                    <button className="modal-btn cancel" onClick={onClose}>Cancel</button>
                    <button className="modal-btn confirm" onClick={() => onImport(replaceExisting)}>
                        Import Rates
                    </button>
                </div>
            </div>
        </div>
    );
};

/** Collapsible accordion section for settings tabs */
const AccordionSection = ({ id, tab, title, helperText, expandedSection, toggleSection, children }: {
    id: string; tab: string; title: string; helperText?: string;
    expandedSection: Record<string, string>;
    toggleSection: (tab: string, id: string) => void;
    children: React.ReactNode;
}) => {
    const isOpen = expandedSection[tab] === id;
    return (
        <div className={`accordion-section ${isOpen ? 'open' : ''}`}>
            <button type="button" className="accordion-header" onClick={() => toggleSection(tab, id)}>
                <span className="accordion-title">{title}</span>
                <span className={`accordion-chevron ${isOpen ? 'rotated' : ''}`}>▶</span>
            </button>
            {helperText && !isOpen && <p className="accordion-helper-collapsed">{helperText}</p>}
            <div className={`accordion-body ${isOpen ? 'expanded' : 'collapsed'}`}>
                {isOpen && <div className="accordion-content">{children}</div>}
            </div>
        </div>
    );
};

/**
 * Settings Page Component - Premium Form Builder
 */
export default function SettingsPage() {
    const { shop, settings, shippingRates: initialShippingRates, products, collections, shopCurrency } = useLoaderData<typeof loader>();

    // Dynamic currency formatter
    const fmtCurrency = useCallback((amount: number) => {
        try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: shopCurrency || 'USD', minimumFractionDigits: 0 }).format(amount); }
        catch { return `${shopCurrency} ${amount}`; }
    }, [shopCurrency]);
    const currencySymbol = useMemo(() => {
        try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: shopCurrency || 'USD' }).formatToParts(0).find(p => p.type === 'currency')?.value || '$'; }
        catch { return '$'; }
    }, [shopCurrency]);
    const actionData = useActionData<typeof action>();
    const submit = useSubmit();
    const navigation = useNavigation();
    const shopify = useAppBridge();

    const isSubmitting = navigation.state === "submitting";
    const [activeTab, setActiveTab] = useState<'button' | 'form' | 'style' | 'shipping'>('button');

    // Accordion state: track which section is expanded per tab (only one at a time)
    const [expandedSection, setExpandedSection] = useState<Record<string, string>>({
        button: 'button-basics',
        form: 'field-management',
        style: 'form-animation',
    });
    const toggleSection = useCallback((tab: string, sectionId: string) => {
        setExpandedSection(prev => {
            const next = prev[tab] === sectionId ? '' : sectionId;
            if (prev[tab] === next) return prev;
            return { ...prev, [tab]: next };
        });
    }, []);

    // Local state for all form fields
    // Defensive: ensure enabled is always a boolean (not an object from DB)
    const [enabled, setEnabled] = useState(!!settings.enabled);
    const [buttonText, setButtonText] = useState(settings.button_text);
    const [primaryColor, setPrimaryColor] = useState(settings.primary_color);
    const [requiredFields, setRequiredFields] = useState<string[]>(settings.required_fields);
    const [maxQuantity, setMaxQuantity] = useState(settings.max_quantity);
    const [buttonStyle, setButtonStyle] = useState(settings.button_style || 'solid');
    const [buttonSize, setButtonSize] = useState(settings.button_size || 'large');
    const [buttonPosition, setButtonPosition] = useState(settings.button_position || 'below_atc');
    const [formTitle, setFormTitle] = useState(settings.form_title || '');
    const [formSubtitle, setFormSubtitle] = useState(settings.form_subtitle || '');
    const [successMessage, setSuccessMessage] = useState(settings.success_message || '');
    const [submitButtonText, setSubmitButtonText] = useState(settings.submit_button_text || 'Place COD Order');
    const [showProductImage, setShowProductImage] = useState(settings.show_product_image ?? true);
    const [showPrice, setShowPrice] = useState(settings.show_price ?? true);
    const [showQuantitySelector, setShowQuantitySelector] = useState(settings.show_quantity_selector ?? true);
    const [showEmailField, setShowEmailField] = useState(settings.show_email_field ?? false);
    const [showNotesField, setShowNotesField] = useState(settings.show_notes_field ?? false);
    const [emailRequired, setEmailRequired] = useState(settings.email_required ?? false);
    const [namePlaceholder, setNamePlaceholder] = useState(settings.name_placeholder || '');
    const [phonePlaceholder, setPhonePlaceholder] = useState(settings.phone_placeholder || '');
    const [addressPlaceholder, setAddressPlaceholder] = useState(settings.address_placeholder || '');
    const [notesPlaceholder, setNotesPlaceholder] = useState(settings.notes_placeholder || '');
    const [modalStyle, setModalStyle] = useState(settings.modal_style || 'modern');
    const [animationStyle, setAnimationStyle] = useState(settings.animation_style || 'fade');
    const [borderRadius, setBorderRadius] = useState(settings.border_radius || 12);

    // New advanced feature state
    const [formType, setFormType] = useState<'popup' | 'embedded'>(settings.form_type || 'popup');
    // Merge saved fields with DEFAULT_FIELDS so newly added fields (e.g. shipping, order_summary) are always present
    // Also absorb any legacy custom_fields into the main fields array
    const mergeFieldsWithDefaults = (savedFields: FormField[] | undefined, legacyCustomFields?: FormField[]): FormField[] => {
        const base = (!savedFields || savedFields.length === 0) ? [...DEFAULT_FIELDS] : [...savedFields];
        // Add missing default fields
        const existingIds = new Set(base.map(f => f.id));
        const missingFields = DEFAULT_FIELDS.filter(df => !existingIds.has(df.id));
        let maxOrder = Math.max(...base.map(f => f.order), 0);
        const result = [
            ...base,
            ...missingFields.map((f, i) => ({ ...f, order: maxOrder + i + 1 })),
        ];
        // Absorb legacy custom_fields (if any) that aren't already in the array
        if (legacyCustomFields && legacyCustomFields.length > 0) {
            const existingIdsAfter = new Set(result.map(f => f.id));
            maxOrder = Math.max(...result.map(f => f.order), 0);
            legacyCustomFields.forEach((cf, i) => {
                if (!existingIdsAfter.has(cf.id)) {
                    result.push({ ...cf, isCustom: true, order: maxOrder + i + 1 });
                }
            });
        }
        return result;
    };
    const [fields, setFields] = useState<FormField[]>(mergeFieldsWithDefaults(settings.fields, settings.custom_fields));
    const [blocks, setBlocks] = useState<ContentBlocks>(settings.blocks || DEFAULT_BLOCKS);
    const [formStyles, setFormStyles] = useState<FormStyles>(settings.styles || DEFAULT_STYLES);
    const [selectedPreset, setSelectedPreset] = useState('custom');
    const [buttonStylesState, setButtonStylesState] = useState<ButtonStyles>(settings.button_styles || DEFAULT_BUTTON_STYLES);
    const [shippingOpts, setShippingOpts] = useState<ShippingOptions>(settings.shipping_options || DEFAULT_SHIPPING_OPTIONS);
    const [showAddFieldModal, setShowAddFieldModal] = useState(false);
    const [newFieldType, setNewFieldType] = useState<'text' | 'number' | 'dropdown' | 'checkbox'>('text');
    const [newFieldLabel, setNewFieldLabel] = useState('');
    const [newFieldPlaceholder, setNewFieldPlaceholder] = useState('');
    const [newFieldOptions, setNewFieldOptions] = useState('');

    // Partial COD settings
    const [partialCodEnabled, setPartialCodEnabled] = useState(settings.partial_cod_enabled ?? false);
    const [partialCodAdvanceAmount, setPartialCodAdvanceAmount] = useState(settings.partial_cod_advance_amount ?? 100);
    const [partialCodCommission, setPartialCodCommission] = useState(settings.partial_cod_commission ?? 0);

    // Shipping Rates state
    const [shippingRates, setShippingRates] = useState<ShippingRate[]>(initialShippingRates || []);
    const [shippingRatesEnabled, setShippingRatesEnabled] = useState(settings.shipping_rates_enabled ?? false);
    // Queue for pending shipping rate operations (processed on save bar click)
    const [pendingShippingOps, setPendingShippingOps] = useState<Array<{ type: 'create' | 'update' | 'delete', rateData?: any, rateId?: string }>>([]);
    const [showShippingRateModal, setShowShippingRateModal] = useState(false);
    const [editingRate, setEditingRate] = useState<ShippingRate | null>(null);
    const [isImportingShipping, setIsImportingShipping] = useState(false);
    const [rateToDelete, setRateToDelete] = useState<ShippingRate | null>(null);

    // Client-side mounted state for save bar (prevents hydration mismatch)
    const [isMounted, setIsMounted] = useState(false);
    useEffect(() => {
        setIsMounted(true);
    }, []);

    // Custom hex color input state
    const [customHexInput, setCustomHexInput] = useState(settings.primary_color || '#6366f1');
    const [hexError, setHexError] = useState('');
    const [isCustomColorActive, setIsCustomColorActive] = useState(
        !['#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6', '#000000'].includes(settings.primary_color)
    );
    const [showCustomPickerPopover, setShowCustomPickerPopover] = useState(false);

    // Track saved settings as STATE (not ref) so changes trigger re-render
    const [savedSettingsString, setSavedSettingsString] = useState<string>(() => JSON.stringify(settings));

    // Track the last processed actionData to prevent duplicate processing
    const lastProcessedActionRef = useRef<any>(null);
    // Track save errors for display
    const [saveError, setSaveError] = useState<string | null>(null);

    // Compute current settings state for comparison
    const hasUnsavedChanges = useMemo(() => {
        const current = {
            enabled, button_text: buttonText, primary_color: primaryColor, required_fields: requiredFields,
            max_quantity: maxQuantity, button_style: buttonStyle, button_size: buttonSize, button_position: buttonPosition,
            form_title: formTitle, form_subtitle: formSubtitle, success_message: successMessage, submit_button_text: submitButtonText,
            show_product_image: showProductImage, show_price: showPrice, show_quantity_selector: showQuantitySelector,
            show_email_field: showEmailField, show_notes_field: showNotesField, email_required: emailRequired,
            name_placeholder: namePlaceholder, phone_placeholder: phonePlaceholder, address_placeholder: addressPlaceholder,
            notes_placeholder: notesPlaceholder, modal_style: modalStyle, animation_style: animationStyle, border_radius: borderRadius,
            form_type: formType, fields, blocks, custom_fields: [], styles: formStyles, button_styles: { ...buttonStylesState, backgroundColor: primaryColor },
            shipping_options: shippingOpts, partial_cod_enabled: partialCodEnabled, partial_cod_advance_amount: partialCodAdvanceAmount,
            partial_cod_commission: partialCodCommission, shipping_rates_enabled: shippingRatesEnabled
        };
        const settingsChanged = JSON.stringify(current) !== savedSettingsString;
        return settingsChanged || pendingShippingOps.length > 0;
    }, [
        enabled, buttonText, primaryColor, requiredFields, maxQuantity, buttonStyle, buttonSize, buttonPosition,
        formTitle, formSubtitle, successMessage, submitButtonText, showProductImage, showPrice, showQuantitySelector,
        showEmailField, showNotesField, emailRequired, namePlaceholder, phonePlaceholder, addressPlaceholder,
        notesPlaceholder, modalStyle, animationStyle, borderRadius, formType, fields, blocks,
        formStyles, buttonStylesState, shippingOpts, partialCodEnabled, partialCodAdvanceAmount, partialCodCommission,
        shippingRatesEnabled, savedSettingsString, pendingShippingOps
    ]);

    // Discard handler - reset all fields to saved values
    const handleDiscard = useCallback(() => {
        const orig = JSON.parse(savedSettingsString);
        setEnabled(!!orig.enabled);
        setButtonText(orig.button_text);
        setPrimaryColor(orig.primary_color);
        setRequiredFields(orig.required_fields);
        setMaxQuantity(orig.max_quantity);
        setButtonStyle(orig.button_style || 'solid');
        setButtonSize(orig.button_size || 'large');
        setButtonPosition(orig.button_position || 'below_atc');
        setFormTitle(orig.form_title || '');
        setFormSubtitle(orig.form_subtitle || '');
        setSuccessMessage(orig.success_message || '');
        setSubmitButtonText(orig.submit_button_text || 'Place COD Order');
        setShowProductImage(orig.show_product_image ?? true);
        setShowPrice(orig.show_price ?? true);
        setShowQuantitySelector(orig.show_quantity_selector ?? true);
        setShowEmailField(orig.show_email_field ?? false);
        setShowNotesField(orig.show_notes_field ?? false);
        setEmailRequired(orig.email_required ?? false);
        setNamePlaceholder(orig.name_placeholder || '');
        setPhonePlaceholder(orig.phone_placeholder || '');
        setAddressPlaceholder(orig.address_placeholder || '');
        setNotesPlaceholder(orig.notes_placeholder || '');
        setModalStyle(orig.modal_style || 'modern');
        setAnimationStyle(orig.animation_style || 'fade');
        setBorderRadius(orig.border_radius || 12);
        setFormType(orig.form_type || 'popup');
        setFields(mergeFieldsWithDefaults(orig.fields, orig.custom_fields));
        setBlocks(orig.blocks || DEFAULT_BLOCKS);
        setFormStyles(orig.styles || DEFAULT_STYLES);
        setButtonStylesState(orig.button_styles || DEFAULT_BUTTON_STYLES);
        setShippingOpts(orig.shipping_options || DEFAULT_SHIPPING_OPTIONS);
        setPartialCodEnabled(orig.partial_cod_enabled ?? false);
        setPartialCodAdvanceAmount(orig.partial_cod_advance_amount ?? 100);
        setPartialCodCommission(orig.partial_cod_commission ?? 0);
        setShippingRatesEnabled(orig.shipping_rates_enabled ?? false);
        // Reset pending shipping operations and restore original rates
        setPendingShippingOps([]);
        setShippingRates(initialShippingRates || []);
        // Explicitly hide save bar immediately
        try { shopify.saveBar.hide('form-builder-save-bar'); } catch (e) { }
    }, [savedSettingsString, initialShippingRates, shopify]);

    // Handle successful save - only process each actionData once
    useEffect(() => {
        if (actionData && actionData !== lastProcessedActionRef.current) {
            lastProcessedActionRef.current = actionData;

            if (actionData.success) {
                const currentSettings = {
                    enabled, button_text: buttonText, primary_color: primaryColor, required_fields: requiredFields,
                    max_quantity: maxQuantity, button_style: buttonStyle, button_size: buttonSize, button_position: buttonPosition,
                    form_title: formTitle, form_subtitle: formSubtitle, success_message: successMessage, submit_button_text: submitButtonText,
                    show_product_image: showProductImage, show_price: showPrice, show_quantity_selector: showQuantitySelector,
                    show_email_field: showEmailField, show_notes_field: showNotesField, email_required: emailRequired,
                    name_placeholder: namePlaceholder, phone_placeholder: phonePlaceholder, address_placeholder: addressPlaceholder,
                    notes_placeholder: notesPlaceholder, modal_style: modalStyle, animation_style: animationStyle, border_radius: borderRadius,
                    form_type: formType, fields, blocks, custom_fields: [], styles: formStyles, button_styles: { ...buttonStylesState, backgroundColor: primaryColor },
                    shipping_options: shippingOpts, partial_cod_enabled: partialCodEnabled, partial_cod_advance_amount: partialCodAdvanceAmount,
                    partial_cod_commission: partialCodCommission, shipping_rates_enabled: shippingRatesEnabled
                };
                setSavedSettingsString(JSON.stringify(currentSettings));
                setSaveError(null); // Clear any previous errors
                shopify.toast.show('Settings saved!', { duration: 3000 });
            } else if (actionData.error) {
                // Handle error case - actionData.error might be an object or string
                const errorMsg = typeof actionData.error === 'string'
                    ? actionData.error
                    : 'Failed to save settings. Please try again.';
                setSaveError(errorMsg);
                shopify.toast.show('Error saving settings', { duration: 3000, isError: true });
            }
        }
    }, [actionData, enabled, buttonText, primaryColor, requiredFields, maxQuantity, buttonStyle, buttonSize, buttonPosition,
        formTitle, formSubtitle, successMessage, submitButtonText, showProductImage, showPrice, showQuantitySelector,
        showEmailField, showNotesField, emailRequired, namePlaceholder, phonePlaceholder, addressPlaceholder,
        notesPlaceholder, modalStyle, animationStyle, borderRadius, formType, fields, blocks,
        formStyles, buttonStylesState, shippingOpts, partialCodEnabled, partialCodAdvanceAmount, partialCodCommission, shippingRatesEnabled, shopify]);

    // Hex validation helpers
    const isValidHex = (hex: string): boolean => {
        return /^#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})$/.test(hex);
    };

    const normalizeHex = (hex: string): string => {
        // Convert #RGB to #RRGGBB
        if (/^#[A-Fa-f0-9]{3}$/.test(hex)) {
            return '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
        }
        return hex.toLowerCase();
    };

    // DnD sensors for drag and drop
    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    // Handle drag end for field reordering
    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            setFields((items) => {
                const oldIndex = items.findIndex((i) => i.id === active.id);
                const newIndex = items.findIndex((i) => i.id === over.id);
                const reordered = arrayMove(items, oldIndex, newIndex);
                // Update order property
                return reordered.map((item, idx) => ({ ...item, order: idx + 1 }));
            });
        }
    }, []);

    // Toggle field visibility (and sync blocks state for shipping/order_summary)
    const toggleFieldVisibility = useCallback((fieldId: string) => {
        setFields((prev) => {
            const updated = prev.map((f) =>
                f.id === fieldId ? { ...f, visible: !f.visible } : f
            );
            // Sync blocks state for section fields
            const field = updated.find(f => f.id === fieldId);
            if (field) {
                if (fieldId === 'shipping') {
                    setBlocks(b => ({ ...b, shipping_options: field.visible }));
                } else if (fieldId === 'order_summary') {
                    setBlocks(b => ({ ...b, order_summary: field.visible }));
                }
            }
            return updated;
        });
    }, []);

    // Toggle field required
    const toggleFieldRequired = useCallback((fieldId: string) => {
        setFields((prev) => prev.map((f) =>
            f.id === fieldId ? { ...f, required: !f.required } : f
        ));
    }, []);

    // Add custom field — adds directly into `fields` array
    const addCustomField = useCallback(() => {
        if (!newFieldLabel.trim()) return;
        const maxOrder = Math.max(...fields.map(f => f.order), 0);
        const newField: FormField = {
            id: `custom_${Date.now()}`,
            label: newFieldLabel,
            type: newFieldType,
            visible: true,
            required: false,
            order: maxOrder + 1,
            isCustom: true,
            placeholder: newFieldPlaceholder || undefined,
            options: newFieldType === 'dropdown' && newFieldOptions.trim() ? newFieldOptions.split(',').map(o => o.trim()).filter(Boolean) : undefined,
        };
        setFields((prev) => [...prev, newField]);
        setNewFieldLabel('');
        setNewFieldPlaceholder('');
        setNewFieldOptions('');
        setShowAddFieldModal(false);
    }, [newFieldLabel, newFieldType, newFieldPlaceholder, newFieldOptions, fields]);

    // Remove custom field — only works on custom fields
    const removeCustomField = useCallback((fieldId: string) => {
        setFields((prev) => prev.filter((f) => f.id !== fieldId));
    }, []);

    // Toggle field
    const toggleField = useCallback((field: string) => {
        setRequiredFields((prev) =>
            prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field]
        );
    }, []);

    // Handle save
    const handleSave = useCallback(() => {
        const formData = new FormData();
        formData.append("enabled", enabled.toString());
        formData.append("button_text", buttonText);
        formData.append("primary_color", primaryColor);
        formData.append("required_fields", JSON.stringify(requiredFields));
        formData.append("max_quantity", maxQuantity.toString());
        formData.append("button_style", buttonStyle);
        formData.append("button_size", buttonSize);
        formData.append("button_position", buttonPosition);
        formData.append("form_title", formTitle);
        formData.append("form_subtitle", formSubtitle);
        formData.append("success_message", successMessage);
        formData.append("submit_button_text", submitButtonText);
        formData.append("show_product_image", showProductImage.toString());
        formData.append("show_price", showPrice.toString());
        formData.append("show_quantity_selector", showQuantitySelector.toString());
        formData.append("show_email_field", showEmailField.toString());
        formData.append("show_notes_field", showNotesField.toString());
        formData.append("email_required", emailRequired.toString());
        formData.append("name_placeholder", namePlaceholder);
        formData.append("phone_placeholder", phonePlaceholder);
        formData.append("address_placeholder", addressPlaceholder);
        formData.append("notes_placeholder", notesPlaceholder);
        formData.append("modal_style", modalStyle);
        formData.append("animation_style", animationStyle);
        formData.append("border_radius", borderRadius.toString());
        // New JSONB fields
        formData.append("form_type", formType);
        formData.append("fields", JSON.stringify(fields));
        formData.append("blocks", JSON.stringify(blocks));
        formData.append("custom_fields", JSON.stringify([]));  // Legacy: cleared
        formData.append("styles", JSON.stringify(formStyles));
        formData.append("button_styles", JSON.stringify({ ...buttonStylesState, backgroundColor: primaryColor }));
        formData.append("shipping_options", JSON.stringify(shippingOpts));
        // Partial COD settings
        formData.append("partial_cod_enabled", partialCodEnabled.toString());
        formData.append("partial_cod_advance_amount", partialCodAdvanceAmount.toString());
        formData.append("partial_cod_commission", partialCodCommission.toString());
        // Shipping rates enabled setting
        formData.append("shipping_rates_enabled", shippingRatesEnabled.toString());

        submit(formData, { method: "post" });

        // Process pending shipping rate operations
        if (pendingShippingOps.length > 0) {
            for (const op of pendingShippingOps) {
                const opFormData = new FormData();
                if (op.type === 'create') {
                    opFormData.append("action_type", "create_shipping_rate");
                    opFormData.append("rate_data", JSON.stringify(op.rateData));
                } else if (op.type === 'update') {
                    opFormData.append("action_type", "update_shipping_rate");
                    opFormData.append("rate_id", op.rateId!);
                    opFormData.append("rate_data", JSON.stringify(op.rateData));
                } else if (op.type === 'delete') {
                    opFormData.append("action_type", "delete_shipping_rate");
                    opFormData.append("rate_id", op.rateId!);
                }
                submit(opFormData, { method: "post" });
            }
            setPendingShippingOps([]);
        }
        // Note: savedSettingsString is updated in useEffect after action success
    }, [
        enabled, buttonText, primaryColor, requiredFields, maxQuantity,
        buttonStyle, buttonSize, buttonPosition, formTitle, formSubtitle,
        successMessage, submitButtonText, showProductImage, showPrice,
        showQuantitySelector, showEmailField, showNotesField, emailRequired,
        namePlaceholder, phonePlaceholder, addressPlaceholder, notesPlaceholder,
        modalStyle, animationStyle, borderRadius, formType, fields, blocks,
        formStyles, buttonStylesState, shippingOpts,
        partialCodEnabled, partialCodAdvanceAmount, partialCodCommission,
        shippingRatesEnabled, submit, shopify, pendingShippingOps
    ]);

    // Show/hide native Shopify save bar based on unsaved changes
    useEffect(() => {
        // Only control save bar after client-side mount when element exists
        if (!isMounted) return;

        const saveBarId = 'form-builder-save-bar';

        // Longer delay to ensure ui-save-bar web component is fully registered in DOM
        // and App Bridge has initialized
        const timeout = setTimeout(() => {
            try {
                // Check if element exists in DOM before trying to control it
                const element = document.getElementById(saveBarId);
                if (!element) {
                    console.warn('[Form Builder] Save bar element not found in DOM');
                    return;
                }

                if (hasUnsavedChanges) {
                    shopify.saveBar.show(saveBarId);
                } else {
                    shopify.saveBar.hide(saveBarId);
                }
            } catch (e) {
                console.warn('[Form Builder] SaveBar control failed:', e);
            }
        }, 500);

        return () => {
            clearTimeout(timeout);
            try {
                shopify.saveBar.hide(saveBarId);
            } catch (e) {
                // Ignore cleanup errors
            }
        };
    }, [hasUnsavedChanges, isMounted, shopify]);

    // Color presets
    const colorPresets = [
        "#6366f1", "#8b5cf6", "#ec4899", "#ef4444", "#f59e0b",
        "#10b981", "#06b6d4", "#3b82f6", "#000000"
    ];

    return (
        <>
            {/* All styles - render client-only to prevent hydration mismatch */}
            {isMounted && (
                <style dangerouslySetInnerHTML={{
                    __html: `
                /* Prevent horizontal scrolling globally */
                html, body { overflow-x: clip !important; max-width: 100vw !important; }
                
                /* Override Polaris accent color to black for form builder */
                .form-builder select:focus,
                .form-builder input[type="text"]:focus,
                .form-builder input[type="number"]:focus,
                .form-builder textarea:focus {
                    outline-color: #000 !important;
                    border-color: #000 !important;
                    box-shadow: 0 0 0 1px #000 !important;
                }
                .form-builder select {
                    accent-color: #000;
                }
                .form-builder input[type="range"] {
                    accent-color: #000 !important;
                }
                .form-builder .Polaris-RangeSlider-SingleThumb__Input::-webkit-slider-thumb {
                    background: #000 !important;
                    border-color: #000 !important;
                }
                .form-builder .Polaris-RangeSlider-SingleThumb__Input::-moz-range-thumb {
                    background: #000 !important;
                    border-color: #000 !important;
                }
                .form-builder {
                    --p-color-bg-fill-brand: #000 !important;
                    --p-color-bg-fill-brand-hover: #333 !important;
                    --p-color-bg-fill-brand-selected: #000 !important;
                    --p-color-bg-surface-brand-selected: #000 !important;
                    padding: 0; 
                    box-sizing: border-box; 
                }
                
                .page-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-top: 16px;
                    margin-bottom: 24px;
                    padding-bottom: 24px;
                    border-bottom: 1px solid #e5e7eb;
                }
                .page-header-left {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                }
                .back-btn {
                    width: 40px;
                    height: 40px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border: 1px solid #e5e7eb;
                    border-radius: 10px;
                    background: white;
                    text-decoration: none;
                    color: #374151;
                    transition: all 0.2s ease;
                }
                .back-btn:hover { background: #f9fafb; }
                .page-title h1 {
                    font-size: 24px;
                    font-weight: 700;
                    color: #111827;
                    margin: 0 0 4px 0;
                }
                .page-title p {
                    font-size: 14px;
                    color: #6b7280;
                    margin: 0;
                }
                .save-btn { padding: 14px 28px; border-radius: 12px; font-weight: 600; font-size: 14px; border: none; cursor: pointer; transition: all 0.2s ease; background: #1f2937; color: white; }
                .style-options { display: flex; gap: 12px; flex-wrap: wrap; }
                .style-option { padding: 12px 20px; border-radius: 12px; border: 1px solid #e5e7eb; background: white; font-size: 14px; font-weight: 600; color: #6b7280; cursor: pointer; transition: all 0.2s ease; flex: 1; text-align: center; }
                .style-option:hover { border-color: #999; color: #111; background: #f5f5f5; }
                .style-option.active { border-color: #000; background: #f0f0f0; color: #000; box-shadow: 0 0 0 1px #000; }
                .checkbox-option { display: flex; align-items: center; gap: 12px; padding: 12px 14px; background: #f9fafb; border-radius: 10px; cursor: pointer; }
                .checkbox-option.checked { background: rgba(0, 0, 0, 0.06); }
                .toggle-option { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; background: #f9fafb; border-radius: 10px; cursor: pointer; margin-bottom: 10px; }
                .mini-toggle { width: 44px; height: 24px; border-radius: 12px; position: relative; transition: background 0.2s cubic-bezier(0.25, 0.1, 0.25, 1); cursor: pointer; }
                .mini-toggle::after { content: ''; position: absolute; width: 20px; height: 20px; background: white; border-radius: 50%; top: 2px; transition: left 0.2s cubic-bezier(0.25, 0.1, 0.25, 1); box-shadow: 0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06); }
                .mini-toggle.on { background: var(--p-color-bg-fill-inverse, #1a1a1a); }
                .mini-toggle.on::after { left: 22px; }
                .mini-toggle.off { background: var(--p-color-bg-surface-secondary-active, #dfe3e8); }
                .mini-toggle.off::after { left: 2px; }
                .input-field { width: 100%; padding: 16px; border: 1px solid #e5e7eb; border-radius: 12px; font-size: 15px; color: #111827; transition: all 0.2s ease; box-sizing: border-box; background: #f9fafb; font-weight: 500; }
                .input-field:focus { border-color: #6366f1; background: white; outline: none; box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1); }
                .color-presets { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-top: 12px; }
                .color-preset { width: 36px; height: 36px; border-radius: 50%; border: 2px solid white; cursor: pointer; transition: all 0.2s ease; box-shadow: 0 0 0 1px #e5e7eb; }
                .color-preset:hover { transform: scale(1.15); box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
                .color-preset.active { border: 2px solid white; box-shadow: 0 0 0 2px #111827; transform: scale(1.1); }
                .custom-color { position: relative; width: 36px; height: 36px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 0 1px #e5e7eb; cursor: pointer; transition: all 0.2s ease; background: conic-gradient(from 0deg, red, yellow, lime, aqua, blue, magenta, red); }
                .custom-color:hover { transform: scale(1.1); box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
                .custom-color input[type="color"] { 
                    position: absolute;
                    width: 100%; 
                    height: 100%; 
                    opacity: 0;
                    cursor: pointer;
                    top: 0; left: 0;
                    border-radius: 50%;
                }
                
                /* Checkmark for selected color preset */
                .color-preset { position: relative; }
                .color-preset .check-icon {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    color: white;
                    font-size: 16px;
                    font-weight: bold;
                    text-shadow: 0 1px 2px rgba(0,0,0,0.4);
                    pointer-events: none;
                }
                
                /* OR divider between presets and custom input */
                .color-divider {
                    display: flex;
                    align-items: center;
                    margin: 16px 0;
                    color: #9ca3af;
                    font-size: 12px;
                    text-transform: uppercase;
                    font-weight: 500;
                }
                .color-divider::before,
                .color-divider::after {
                    content: none;
                    flex: 1;
                    height: 1px;
                    background: #e5e7eb;
                }
                .color-divider span {
                    padding: 0 12px;
                }
                
                /* Custom color picker row */
                .custom-color-row {
                    display: flex;
                    align-items: flex-start;
                    gap: 12px;
                }
                .color-picker-wrapper input[type="color"] {
                    width: 44px;
                    height: 44px;
                    border-radius: 10px;
                    border: 2px solid #e5e7eb;
                    cursor: pointer;
                    padding: 0;
                    background: none;
                }
                .color-picker-wrapper input[type="color"]::-webkit-color-swatch-wrapper {
                    padding: 0;
                }
                .color-picker-wrapper input[type="color"]::-webkit-color-swatch {
                    border-radius: 8px;
                    border: none;
                }
                .hex-input-wrapper {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }
                .hex-input {
                    width: 100%;
                    padding: 12px;
                    border: 1px solid #e5e7eb;
                    border-radius: 10px;
                    font-size: 14px;
                    font-family: 'SF Mono', Monaco, monospace;
                    text-transform: uppercase;
                    box-sizing: border-box;
                }
                .hex-input:focus { border-color: #6366f1; outline: none; box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1); }
                .hex-input.error { border-color: #ef4444; background: #fef2f2; }
                .hex-error { color: #ef4444; font-size: 11px; margin-top: 2px; }
                
                /* ColorSelector component styles */
                ${colorSelectorStyles}
                
                /* Range Slider Styling */
                input[type=range] {
                    -webkit-appearance: none;
                    width: 100%;
                    background: transparent;
                    height: 6px;
                    border-radius: 3px;
                    cursor: pointer;
                    margin: 0;
                }
                input[type=range]:focus { outline: none; }
                input[type=range]::-webkit-slider-runnable-track {
                    width: 100%;
                    height: 6px;
                    border-radius: 3px;
                    border: none;
                }
                input[type=range]::-webkit-slider-thumb {
                    height: 20px;
                    width: 20px;
                    border-radius: 50%;
                    background: #6366f1;
                    border: 2px solid white;
                    box-shadow: 0 2px 6px rgba(0,0,0,0.15), 0 0 0 1px rgba(99, 102, 241, 0.2);
                    -webkit-appearance: none;
                    margin-top: -7px;
                    transition: transform 0.1s ease, box-shadow 0.1s ease;
                }
                input[type=range]:focus::-webkit-slider-thumb {
                    box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.2);
                }
                input[type=range]::-webkit-slider-thumb:hover {
                    transform: scale(1.1);
                }
                .builder-title p { font-size: 14px; color: #6b7280; margin: 0; }
                .main-toggle { border-radius: 16px; padding: 20px 24px; margin-bottom: 24px; display: flex; align-items: center; justify-content: space-between; transition: all 0.2s ease; }
                .main-toggle.enabled { background: rgba(16, 185, 129, 0.1); border: 2px solid #10b981; }
                .main-toggle.disabled { background: #f9fafb; border: 2px solid #e5e7eb; }
                .toggle-info h3 { font-size: 16px; font-weight: 600; color: #111827; margin: 0 0 4px 0; }
                .toggle-switch { width: 56px; height: 32px; border-radius: 16px; position: relative; cursor: pointer; transition: background 0.2s cubic-bezier(0.25, 0.1, 0.25, 1); }
                .toggle-switch.enabled { background: var(--p-color-bg-fill-inverse, #1a1a1a); }
                .toggle-switch.disabled { background: var(--p-color-bg-surface-secondary-active, #dfe3e8); }
                .toggle-switch::after { content: ''; position: absolute; width: 28px; height: 28px; background: white; border-radius: 50%; top: 2px; transition: left 0.2s cubic-bezier(0.25, 0.1, 0.25, 1); box-shadow: 0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06); }
                .toggle-switch.enabled::after { left: 26px; }
                .toggle-switch.disabled::after { left: 2px; }
                .tabs { display: flex; gap: 8px; margin-bottom: 24px; background: #f3f4f6; padding: 6px; border-radius: 12px; }
                .tab { flex: 1; padding: 14px 20px; border: none; background: transparent; border-radius: 8px; font-size: 14px; font-weight: 600; color: #6b7280; cursor: pointer; }
                .tab.active { background: white; color: #111827; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
                .builder-page {
                    display: grid;
                    grid-template-columns: 1fr 420px;
                    gap: 24px;
                    height: calc(100vh - 64px);
                    max-width: 1200px;
                    margin: 0 auto;
                }
                .builder-left {
                    overflow-y: auto;
                    padding-right: 4px;
                    padding-bottom: 40px;
                }
                .builder-right {
                    position: sticky;
                    top: 64px;
                    height: fit-content;
                }
                .card-title { font-size: 17px; font-weight: 700; color: #111827; margin: 0 0 16px 0; letter-spacing: -0.01em; }
                .input-label { font-size: 14px; font-weight: 600; color: #374151; display: block; margin-bottom: 8px; }
                .settings-card { background: white; border: 1px solid #e5e7eb; border-radius: 16px; padding: 24px; margin-bottom: 20px; }

                /* Accordion Section Styles */
                .accordion-section {
                    background: white;
                    border: 1px solid #e5e7eb;
                    border-radius: 16px;
                    margin-bottom: 16px;
                    overflow: hidden;
                    transition: box-shadow 0.2s ease;
                }
                .accordion-section.open {
                    box-shadow: 0 2px 8px rgba(0,0,0,0.06);
                    border-color: #d1d5db;
                }
                .accordion-header {
                    width: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 18px 24px;
                    background: transparent;
                    border: none;
                    cursor: pointer;
                    font-size: 15px;
                    font-weight: 700;
                    color: #111827;
                    letter-spacing: -0.01em;
                    transition: background 0.15s ease;
                }
                .accordion-header:hover {
                    background: #f9fafb;
                }
                .accordion-title {
                    font-size: 15px;
                    font-weight: 700;
                    color: #111827;
                }
                .accordion-chevron {
                    font-size: 11px;
                    color: #9ca3af;
                    transition: transform 0.25s ease;
                    display: inline-block;
                }
                .accordion-chevron.rotated {
                    transform: rotate(90deg);
                }
                .accordion-body.collapsed {
                    max-height: 0;
                    overflow: hidden;
                }
                .accordion-body.expanded {
                    max-height: none;
                }
                .accordion-content {
                    padding: 0 24px 24px 24px;
                }
                .accordion-helper-collapsed {
                    font-size: 12px;
                    color: #9ca3af;
                    margin: -8px 24px 12px 24px;
                    line-height: 1.4;
                }
                .setting-helper {
                    font-size: 12px;
                    color: #9ca3af;
                    margin: 4px 0 0 0;
                    line-height: 1.4;
                }
                .preview-panel { background: white; border: 1px solid #e5e7eb; border-radius: 16px; width: 100%; box-shadow: 0 10px 40px rgba(0,0,0,0.1); padding-bottom: 20px; }
                .preview-header { background: #f9fafb; padding: 16px 20px; border-bottom: 1px solid #e5e7eb; }
                .preview-content { padding: 24px; }
                .preview-phone { background: #1f2937; border-radius: 32px; padding: 6px; max-width: 300px; margin: 0 auto; }
                .preview-phone-screen { background: white; border-radius: 24px; overflow-y: auto; height: 500px; }
                .preview-phone-screen.preview-compact { min-height: auto; max-height: none; padding: 20px 16px; }
                .preview-product { padding: 16px; }
                .preview-product-img { width: 80px; height: 80px; border-radius: 6px; flex-shrink: 0; object-fit: cover; }
                .preview-modal { padding: 16px; margin-top: 12px; border-radius: 12px; background: #f9fafb; }
                .preview-input { width: 100%; padding: 10px 12px; margin-bottom: 8px; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 12px; box-sizing: border-box; }
                .preview-submit { width: 100%; padding: 12px; border: none; color: white; border-radius: 8px; font-weight: 600; font-size: 13px; margin-top: 4px; }
                
                /* Sortable Fields Styles */
                .sortable-fields-container { margin-top: 16px; }
                .sortable-field-item {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 12px 16px;
                    background: white;
                    border: 1px solid #e5e7eb;
                    border-radius: 10px;
                    margin-bottom: 8px;
                    transition: all 0.2s ease;
                }
                .sortable-field-item:hover { border-color: #202223; box-shadow: 0 2px 8px rgba(21, 21, 28, 0.1); }
                .field-drag-handle {
                    cursor: grab;
                    color: #9ca3af;
                    font-size: 16px;
                    padding: 4px;
                    user-select: none;
                }
                .field-drag-handle:active { cursor: grabbing; }
                .field-info { flex: 1; display: flex; flex-direction: column; gap: 2px; }
                .field-label { font-weight: 600; color: #1f2937; font-size: 14px; }
                .field-type { font-size: 11px; color: #9ca3af; text-transform: uppercase; }
                .field-actions { display: flex; gap: 8px; }
                .icon-btn {
                    width: 32px;
                    height: 32px;
                    border-radius: 8px;
                    border: 1px solid #e5e7eb;
                    background: #f9fafb;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 14px;
                    transition: all 0.2s ease;
                }
                .icon-btn:hover { background: #f3f4f6; border-color: #d1d5db; }
                .icon-btn.active { background: rgba(99, 102, 241, 0.1); border-color: #6366f1; }
                .visibility-btn.active { color: #10b981; }
                .required-btn.active { color: #ef4444; }
                .remove-btn:hover { background: #fef2f2; border-color: #ef4444; color: #ef4444; }

                /* Form Type Selector */
                .form-type-selector { display: flex; gap: 12px; margin-bottom: 20px; }
                .form-type-option {
                    flex: 1;
                    padding: 16px;
                    border: 2px solid #e5e7eb;
                    border-radius: 12px;
                    background: white;
                    cursor: pointer;
                    text-align: center;
                    transition: all 0.2s ease;
                }
                .form-type-option:hover { border-color: #c7d2fe; }
                .form-type-option.active { border-color: #6366f1; background: rgba(99, 102, 241, 0.05); }
                .form-type-icon { font-size: 24px; margin-bottom: 8px; }
                .form-type-label { font-weight: 600; color: #1f2937; }

                /* Add Field Button & Modal */
                .add-field-btn {
                    width: 100%;
                    padding: 14px;
                    border: 2px dashed #d1d5db;
                    border-radius: 10px;
                    background: transparent;
                    color: #6b7280;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    margin-top: 12px;
                }
                .add-field-btn:hover { border-color: #202223; color: #202223; background: rgba(32, 32, 43, 0.05); }
                .modal-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.5);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 1000;
                }
                .modal-content {
                    background: white;
                    border-radius: 16px;
                    padding: 24px;
                    width: 90%;
                    max-width: 400px;
                    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
                }
                .modal-header { margin-bottom: 20px; }
                .modal-header h3 { margin: 0; color: #1f2937; }
                .modal-body { display: flex; flex-direction: column; gap: 16px; }
                .modal-field { display: flex; flex-direction: column; gap: 6px; }
                .modal-field label { font-weight: 600; color: #374151; font-size: 13px; }
                .modal-field input, .modal-field select {
                    padding: 12px;
                    border: 1px solid #e5e7eb;
                    border-radius: 8px;
                    font-size: 14px;
                }
                .modal-actions { display: flex; gap: 12px; margin-top: 8px; }
                .modal-btn {
                    flex: 1;
                    padding: 12px;
                    border-radius: 8px;
                    font-weight: 600;
                    cursor: pointer;
                    border: none;
                }
                .modal-btn.cancel { background: #f3f4f6; color: #6b7280; }
                .modal-btn.confirm { background: #1f2937; color: white; }

                /* ==================== SHIPPING RATE MODAL (sr-*) ==================== */
                .sr-modal {
                    background: white;
                    border-radius: 16px;
                    width: 95%;
                    max-width: 680px;
                    max-height: 90vh;
                    display: flex;
                    flex-direction: column;
                    box-shadow: 0 25px 80px rgba(0, 0, 0, 0.3);
                    overflow: hidden;
                }
                .sr-modal-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 18px 24px;
                    background: #1f2937;
                    color: white;
                }
                .sr-modal-header h3 {
                    margin: 0;
                    font-size: 16px;
                    font-weight: 600;
                    color: white;
                }
                .sr-header-icon {
                    width: 36px;
                    height: 36px;
                    border-radius: 10px;
                    background: rgba(255,255,255,0.15);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 18px;
                    flex-shrink: 0;
                }
                .sr-close-btn {
                    width: 32px;
                    height: 32px;
                    border-radius: 8px;
                    border: none;
                    background: rgba(255,255,255,0.12);
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: rgba(255,255,255,0.7);
                    transition: all 0.15s ease;
                }
                .sr-close-btn:hover { background: rgba(255,255,255,0.2); color: white; }
                .sr-modal-body {
                    padding: 20px 24px;
                    overflow-y: auto;
                    flex: 1;
                }
                .sr-modal-body::-webkit-scrollbar { width: 5px; }
                .sr-modal-body::-webkit-scrollbar-track { background: transparent; }
                .sr-modal-body::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 3px; }
                .sr-section {
                    background: #f9fafb;
                    border: 1px solid #e5e7eb;
                    border-radius: 12px;
                    padding: 16px 18px;
                    margin-bottom: 14px;
                }
                .sr-section-title {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 13px;
                    font-weight: 600;
                    color: #6b7280;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    margin-bottom: 14px;
                    padding-bottom: 10px;
                    border-bottom: 1px solid #e5e7eb;
                }
                .sr-modal-footer {
                    padding: 14px 24px;
                    border-top: 1px solid #e5e7eb;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    background: #fafafa;
                }
                .sr-footer-left {
                    display: flex;
                    align-items: center;
                }
                .sr-footer-right {
                    display: flex;
                    gap: 10px;
                }
                .sr-status-toggle {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    cursor: pointer;
                }
                .sr-row {
                    display: flex;
                    gap: 14px;
                    margin-bottom: 12px;
                }
                .sr-field {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                    margin-bottom: 12px;
                }
                .sr-label {
                    font-size: 13px;
                    font-weight: 500;
                    color: #374151;
                    margin-bottom: 2px;
                }
                .sr-hint {
                    font-size: 12px;
                    color: #9ca3af;
                }
                .sr-input {
                    padding: 9px 12px;
                    border: 1px solid #d1d5db;
                    border-radius: 8px;
                    font-size: 14px;
                    color: #1f2937;
                    outline: none;
                    transition: border-color 0.15s ease, box-shadow 0.15s ease;
                    background: white;
                    width: 100%;
                    box-sizing: border-box;
                }
                .sr-input:focus {
                    border-color: #1f2937;
                    box-shadow: 0 0 0 2px rgba(31, 41, 55, 0.08);
                }
                .sr-input::placeholder { color: #d1d5db; }
                .sr-select {
                    padding: 9px 12px;
                    border: 1px solid #d1d5db;
                    border-radius: 8px;
                    font-size: 14px;
                    color: #1f2937;
                    outline: none;
                    background: white;
                    width: 100%;
                    box-sizing: border-box;
                    cursor: pointer;
                    appearance: none;
                    background-image: url("data:image/svg+xml,%3Csvg width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
                    background-repeat: no-repeat;
                    background-position: right 12px center;
                    padding-right: 32px;
                }
                .sr-select:focus {
                    border-color: #1f2937;
                    box-shadow: 0 0 0 2px rgba(31, 41, 55, 0.08);
                }
                .sr-price-row {
                    display: flex;
                    align-items: stretch;
                    gap: 0;
                    border: 1px solid #d1d5db;
                    border-radius: 8px;
                    overflow: hidden;
                    background: white;
                }
                .sr-price-input-wrap {
                    display: flex;
                    align-items: center;
                    flex: 1;
                }
                .sr-currency {
                    padding: 0 8px 0 12px;
                    font-size: 14px;
                    color: #6b7280;
                    font-weight: 500;
                }
                .sr-price-input {
                    border: none !important;
                    border-radius: 0 !important;
                    box-shadow: none !important;
                }
                .sr-price-input:focus { box-shadow: none !important; }
                .sr-free-btn {
                    padding: 0 16px;
                    border: none;
                    border-left: 1px solid #d1d5db;
                    background: #f3f4f6;
                    color: #6b7280;
                    font-size: 13px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.15s ease;
                    white-space: nowrap;
                }
                .sr-free-btn:hover { background: #e5e7eb; }
                .sr-free-btn.active { background: #10b981; color: white; }
                .sr-add-conditions-btn {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 10px 14px;
                    border: 1px dashed #d1d5db;
                    border-radius: 8px;
                    background: white;
                    color: #6b7280;
                    font-size: 13px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.15s ease;
                    width: 100%;
                    justify-content: center;
                }
                .sr-add-conditions-btn:hover { border-color: #1f2937; color: #1f2937; background: #f9fafb; }
                .sr-conditions-panel {
                    background: white;
                    border: 1px solid #e5e7eb;
                    border-radius: 10px;
                    padding: 14px;
                }
                .sr-conditions-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 10px;
                }
                .sr-remove-link {
                    border: none;
                    background: none;
                    color: #ef4444;
                    font-size: 13px;
                    font-weight: 500;
                    cursor: pointer;
                    padding: 0;
                }
                .sr-remove-link:hover { text-decoration: underline; }
                .sr-restriction-item {
                    margin-bottom: 8px;
                }
                .sr-checkbox-row {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    font-size: 14px;
                    color: #374151;
                    cursor: pointer;
                    padding: 6px 0;
                }
                .sr-checkbox-row input[type=checkbox] {
                    width: 16px;
                    height: 16px;
                    accent-color: #1f2937;
                    cursor: pointer;
                    flex-shrink: 0;
                }
                .sr-restriction-content {
                    margin-left: 26px;
                    margin-top: 6px;
                    margin-bottom: 6px;
                }
                .sr-search-wrap {
                    position: relative;
                    margin-bottom: 6px;
                }
                .sr-search-icon {
                    position: absolute;
                    left: 10px;
                    top: 50%;
                    transform: translateY(-50%);
                    pointer-events: none;
                }
                .sr-search-input {
                    padding-left: 32px !important;
                }
                .sr-tag-list {
                    max-height: 140px;
                    overflow-y: auto;
                    display: flex;
                    flex-wrap: wrap;
                    gap: 6px;
                    padding: 4px 0;
                }
                .sr-tag-list::-webkit-scrollbar { width: 4px; }
                .sr-tag-list::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 2px; }
                .sr-tag-chip {
                    display: inline-flex;
                    align-items: center;
                    padding: 5px 12px;
                    border-radius: 20px;
                    border: 1px solid #e5e7eb;
                    background: white;
                    font-size: 12px;
                    color: #6b7280;
                    cursor: pointer;
                    transition: all 0.15s ease;
                    user-select: none;
                }
                .sr-tag-chip:hover { border-color: #9ca3af; }
                .sr-tag-chip.selected {
                    background: #1f2937;
                    color: white;
                    border-color: #1f2937;
                }
                .sr-btn-cancel {
                    padding: 8px 18px;
                    border-radius: 8px;
                    font-weight: 500;
                    font-size: 14px;
                    cursor: pointer;
                    border: 1px solid #d1d5db;
                    background: white;
                    color: #374151;
                    transition: all 0.15s ease;
                }
                .sr-btn-cancel:hover { background: #f3f4f6; }
                .sr-btn-done {
                    padding: 8px 24px;
                    border-radius: 8px;
                    font-weight: 600;
                    font-size: 14px;
                    cursor: pointer;
                    border: none;
                    background: #1f2937;
                    color: white;
                    transition: all 0.15s ease;
                }
                .sr-btn-done:hover { background: #111827; }
                .sr-btn-done:disabled { opacity: 0.4; cursor: not-allowed; }

                /* ==================== SHIPPING TAB TABLE STYLES ==================== */
                .shipping-table-wrapper {
                    border: 1px solid #e5e7eb;
                    border-radius: 12px;
                    overflow: hidden;
                }
                .shipping-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 13px;
                }
                .shipping-table thead th {
                    background: #f8fafc;
                    padding: 10px 14px;
                    text-align: left;
                    font-weight: 600;
                    font-size: 11px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    color: #6b7280;
                    border-bottom: 1px solid #e5e7eb;
                }
                .shipping-table tbody td {
                    padding: 12px 14px;
                    border-bottom: 1px solid #f3f4f6;
                    vertical-align: middle;
                }
                .shipping-table tbody tr:last-child td { border-bottom: none; }
                .shipping-table tbody tr:hover { background: #fafafa; }
                .shipping-price-badge {
                    font-weight: 700;
                    font-size: 13px;
                    color: #1f2937;
                }
                .shipping-price-badge.free {
                    color: #10b981;
                    background: rgba(16, 185, 129, 0.1);
                    padding: 2px 8px;
                    border-radius: 6px;
                    font-size: 11px;
                }
                .shipping-condition-badge {
                    font-size: 11px;
                    color: #1f2937;
                    background: #f3f4f6;
                    padding: 3px 8px;
                    border-radius: 6px;
                    white-space: nowrap;
                }
                .shipping-status-dot {
                    font-size: 11px;
                    font-weight: 600;
                    padding: 3px 8px;
                    border-radius: 6px;
                }
                .shipping-status-dot.active { color: #10b981; background: rgba(16, 185, 129, 0.1); }
                .shipping-status-dot.inactive { color: #9ca3af; background: #f3f4f6; }

                /* Content Blocks */
                .content-blocks { margin-top: 20px; }
                .section-title { font-weight: 600; color: #374151; margin-bottom: 12px; font-size: 14px; }
                
                /* ==================== RESPONSIVE DESIGN ==================== */
                
                @media (max-width: 1024px) {
                    .builder-layout { flex-direction: column; gap: 24px; }
                    .settings-panel { width: 100%; flex: none; }
                    .preview-panel { position: relative; top: 0; width: 100%; order: -1; }
                    .preview-phone { max-width: 320px; }
                }
                
                @media (max-width: 768px) {
                    .form-builder { padding: 0 16px; }
                    .page-header { padding: 20px; border-radius: 16px; flex-direction: column; gap: 16px; align-items: stretch; }
                    .page-header-left { gap: 12px; }
                    .builder-title h1 { font-size: 20px; }
                    .save-btn { width: 100%; justify-content: center; }
                    .main-toggle { padding: 16px; flex-direction: column; gap: 16px; text-align: center; }
                    .tabs { gap: 6px; overflow-x: auto; flex-wrap: nowrap; padding-bottom: 8px; }
                    .tab-btn { padding: 10px 16px; font-size: 12px; white-space: nowrap; flex-shrink: 0; }
                    .settings-card { padding: 16px; }
                    .style-options { gap: 8px; }
                    .style-option { padding: 8px 14px; font-size: 12px; }
                    .color-presets { gap: 6px; }
                    .color-preset { width: 28px; height: 28px; }
                    .custom-color, .custom-color input[type="color"] { width: 28px; height: 28px; }
                    .preview-phone { padding: 8px; border-radius: 24px; }
                
                @media (max-width: 480px) {
                    .form-builder { padding: 0 12px; }
                    .page-header { padding: 16px; }
                    .preview-panel { padding: 16px; }
                    .builder-title h1 { font-size: 18px; }
                    .builder-title p { font-size: 12px; }
                    .tabs { gap: 4px; }
                    .tab-btn { padding: 8px 12px; }
                    .toggle-switch { width: 48px; height: 26px; }
                }
                
                /* =========================
                   BUTTON ANIMATION PRESETS
                   ========================= */
                
                /* Subtle Shake */
                @keyframes btn-shake {
                    0%, 100% { transform: translateX(0); }
                    25% { transform: translateX(-3px); }
                    75% { transform: translateX(3px); }
                }
                .btn-anim-shake { animation: btn-shake 0.5s ease-in-out infinite; }
                .btn-anim-shake.speed-slow { animation-duration: 0.8s; }
                .btn-anim-shake.speed-fast { animation-duration: 0.3s; }
                
                /* Pulse */
                @keyframes btn-pulse {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.05); }
                }
                .btn-anim-pulse { animation: btn-pulse 1.5s ease-in-out infinite; }
                .btn-anim-pulse.speed-slow { animation-duration: 2.5s; }
                .btn-anim-pulse.speed-fast { animation-duration: 0.8s; }
                
                /* Bounce */
                @keyframes btn-bounce {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-6px); }
                }
                .btn-anim-bounce { animation: btn-bounce 1s ease-in-out infinite; }
                .btn-anim-bounce.speed-slow { animation-duration: 1.5s; }
                .btn-anim-bounce.speed-fast { animation-duration: 0.5s; }
                
                /* Glow */
                @keyframes btn-glow {
                    0%, 100% { box-shadow: 0 0 5px rgba(99, 102, 241, 0.4); }
                    50% { box-shadow: 0 0 20px rgba(99, 102, 241, 0.8), 0 0 30px rgba(99, 102, 241, 0.4); }
                }
                .btn-anim-glow { animation: btn-glow 2s ease-in-out infinite; }
                .btn-anim-glow.speed-slow { animation-duration: 3s; }
                .btn-anim-glow.speed-fast { animation-duration: 1s; }
                
                /* Gradient Flow */
                @keyframes btn-gradient-flow {
                    0% { background-position: 0% 50%; }
                    50% { background-position: 100% 50%; }
                    100% { background-position: 0% 50%; }
                }
                .btn-anim-gradient-flow {
                    background-size: 200% 200% !important;
                    animation: btn-gradient-flow 3s ease infinite;
                }
                .btn-anim-gradient-flow.speed-slow { animation-duration: 5s; }
                .btn-anim-gradient-flow.speed-fast { animation-duration: 1.5s; }
                
                /* Shimmer */
                @keyframes btn-shimmer {
                    0% { left: -100%; }
                    100% { left: 100%; }
                }
                .btn-anim-shimmer {
                    position: relative;
                    overflow: hidden;
                }
                .btn-anim-shimmer::after {
                    position: absolute;
                    top: 0;
                    left: -100%;
                    width: 50%;
                    height: 100%;
                    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent);
                    animation: btn-shimmer 2s ease-in-out infinite;
                }
                .btn-anim-shimmer.speed-slow::after { animation-duration: 3s; }
                .btn-anim-shimmer.speed-fast::after { animation-duration: 1s; }
                
                /* =========================
                   BORDER EFFECT ANIMATIONS
                   ========================= */
                
                /* Glowing Border */
                @keyframes border-glow {
                    0%, 100% { box-shadow: 0 0 3px var(--btn-border-color, #6366f1); }
                    50% { box-shadow: 0 0 12px var(--btn-border-color, #6366f1), 0 0 20px var(--btn-border-color, #6366f1); }
                }
                .btn-border-glowing { animation: border-glow 2s ease-in-out infinite; }
                .btn-border-glowing.intensity-low { animation-duration: 3s; }
                .btn-border-glowing.intensity-high { animation-duration: 1s; }
                
                /* Animated Gradient Border */
                @keyframes border-gradient {
                    0% { border-color: #6366f1; }
                    33% { border-color: #ec4899; }
                    66% { border-color: #10b981; }
                    100% { border-color: #6366f1; }
                }
                .btn-border-animated-gradient { animation: border-gradient 3s linear infinite; }
                
                /* Dashed Moving Border (Marching Ants) */
                @keyframes border-dash {
                    0% { stroke-dashoffset: 0; }
                    100% { stroke-dashoffset: -20; }
                }
                .btn-border-dashed-moving {
                    border: none !important;
                    position: relative;
                    overflow: visible;
                }
                .btn-border-dashed-moving .marching-ants-svg {
                    position: absolute;
                    inset: 0;
                    width: 100%;
                    height: 100%;
                    pointer-events: none;
                    z-index: 1;
                }
                .btn-border-dashed-moving .marching-ants-svg rect {
                    fill: none;
                    stroke: var(--btn-border-color, #6366f1);
                    stroke-width: 2;
                    stroke-dasharray: 8 4;
                    animation: border-dash 0.6s linear infinite;
                }
                .btn-border-dashed-moving.intensity-low .marching-ants-svg rect {
                    animation-duration: 1s;
                }
                .btn-border-dashed-moving.intensity-high .marching-ants-svg rect {
                    animation-duration: 0.3s;
                }
                
                /* =========================
                   HOVER & CLICK EFFECTS
                   ========================= */
                .btn-hover-lift:hover {
                    transform: translateY(-3px);
                    box-shadow: 0 8px 20px rgba(0,0,0,0.15);
                }

                .btn-click-press:active {
                    transform: scale(0.96);
                }
                
                /* Ripple Effect */
                .btn-click-ripple {
                    position: relative;
                    overflow: hidden;
                }
                .btn-click-ripple::before {
                    content: '';
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    width: 0;
                    height: 0;
                    background: rgba(255, 255, 255, 0.3);
                    border-radius: 50%;
                    transform: translate(-50%, -50%);
                    transition: width 0.4s ease, height 0.4s ease;
                }
                .btn-click-ripple:active::before {
                    width: 200px;
                    height: 200px;
                }
                
                /* =========================
                   REDUCED MOTION SUPPORT
                   ========================= */
                @media (prefers-reduced-motion: reduce) {
                    .btn-anim-shake,
                    .btn-anim-pulse,
                    .btn-anim-bounce,
                    .btn-anim-glow,
                    .btn-anim-gradient-flow,
                    .btn-anim-shimmer,
                    .btn-anim-shimmer::after,
                    .btn-border-glowing,
                    .btn-border-animated-gradient {
                        animation: none !important;
                    }
                }
            `}} />
            )}

            <s-page heading="">
                {/* Native Shopify Save Bar - only render client-side to prevent hydration mismatch */}
                {isMounted && (
                    <ui-save-bar id="form-builder-save-bar">
                        <button variant="primary" onClick={handleSave} disabled={isSubmitting}>
                            {isSubmitting ? 'Saving...' : 'Save'}
                        </button>
                        <button onClick={handleDiscard} disabled={isSubmitting}>
                            Discard
                        </button>
                    </ui-save-bar>
                )}
                <div className="form-builder">
                    {/* Header */}
                    <div className="page-header">
                        <div className="page-header-left">
                            <Link to="/app" className="back-btn">←</Link>
                            <div className="page-title">
                                <h1>Form Builder</h1>
                                <p>Customize your COD checkout form</p>
                            </div>
                        </div>
                        {/* Error message display */}
                        {saveError && (
                            <div style={{
                                background: '#fef2f2',
                                border: '1px solid #ef4444',
                                borderRadius: '8px',
                                padding: '12px 16px',
                                fontSize: '13px',
                                color: '#dc2626',
                                maxWidth: '300px'
                            }}>
                                ⚠️ {saveError}
                            </div>
                        )}
                    </div>

                    {/* Main Toggle */}
                    <div className={`main-toggle ${enabled ? 'enabled' : 'disabled'}`}>
                        <div className="toggle-info">
                            <h3>
                                <span>{enabled ? '' : ''}</span> COD Form Status
                            </h3>
                            <p>{enabled ? 'Your COD form is live on product pages' : 'Enable to show COD form on your store'}</p>
                        </div>
                        <div
                            className={`toggle-switch ${enabled ? 'enabled' : 'disabled'}`}
                            onClick={() => setEnabled(!enabled)}
                        />
                    </div>

                    {/* Tabs */}
                    <div className="tabs">
                        <button
                            className={`tab ${activeTab === 'button' ? 'active' : ''}`}
                            onClick={() => setActiveTab('button')}
                        >
                            Button
                        </button>
                        <button
                            className={`tab ${activeTab === 'form' ? 'active' : ''}`}
                            onClick={() => setActiveTab('form')}
                        >
                            Form Fields
                        </button>
                        <button
                            className={`tab ${activeTab === 'style' ? 'active' : ''}`}
                            onClick={() => setActiveTab('style')}
                        >
                            Style
                        </button>
                        <button
                            className={`tab ${activeTab === 'shipping' ? 'active' : ''}`}
                            onClick={() => setActiveTab('shipping')}
                        >
                            Shipping
                        </button>
                    </div>

                    {/* Layout */}
                    <div className="builder-page" style={activeTab === 'shipping' ? { gridTemplateColumns: '1fr', maxWidth: '900px' } : undefined}>
                        <div className="builder-left">
                            {/* Button Tab */}
                            {activeTab === 'button' && (
                                <>
                                    {/* Button Basics (Default Open) */}
                                    <AccordionSection id="button-basics" tab="button" title="Button Basics" helperText="This is the label that will be displayed on the button" expandedSection={expandedSection} toggleSection={toggleSection}>
                                        <div className="input-group">
                                            <label className="input-label">Button Label</label>
                                            <input
                                                type="text"
                                                className="input-field"
                                                value={buttonText}
                                                onChange={(e) => setButtonText(e.target.value)}
                                                placeholder="e.g., Buy with COD"
                                            />
                                        </div>
                                        <div className="input-group" style={{ marginTop: 16 }}>
                                            <label className="input-label">Button Style</label>
                                            <div className="style-options">
                                                {['solid', 'outline', 'gradient'].map((style) => (
                                                    <button
                                                        key={style}
                                                        className={`style-option ${buttonStyle === style ? 'active' : ''}`}
                                                        onClick={() => {
                                                            setButtonStyle(style as any);
                                                            if (style === 'outline') {
                                                                setButtonStylesState(s => ({ ...s, borderWidth: 2 }));
                                                            } else {
                                                                setButtonStylesState(s => ({ ...s, borderWidth: 0 }));
                                                            }
                                                        }}
                                                    >
                                                        {style.charAt(0).toUpperCase() + style.slice(1)}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="input-group" style={{ marginTop: 16 }}>
                                            <label className="input-label">Button Size</label>
                                            <div className="style-options">
                                                {['small', 'medium', 'large'].map((size) => (
                                                    <button
                                                        key={size}
                                                        className={`style-option ${buttonSize === size ? 'active' : ''}`}
                                                        onClick={() => setButtonSize(size as any)}
                                                    >
                                                        {size.charAt(0).toUpperCase() + size.slice(1)}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </AccordionSection>

                                    {/* Button Colors */}
                                    <AccordionSection id="button-colors" tab="button" title="Button Colors" helperText="Changes the color of the COD button on the product page." expandedSection={expandedSection} toggleSection={toggleSection}>
                                        <div className="color-picker" style={{ position: 'relative' }}>
                                            {/* Preset color palette with checkmark indicator */}
                                            <div className="color-presets">
                                                {colorPresets.map((color) => (
                                                    <div
                                                        key={color}
                                                        className={`color-preset ${primaryColor === color && !isCustomColorActive ? 'active' : ''}`}
                                                        style={{ background: color }}
                                                        onClick={() => {
                                                            setPrimaryColor(color);
                                                            setIsCustomColorActive(false);
                                                            setCustomHexInput(color);
                                                            setHexError('');
                                                        }}
                                                    >
                                                        {primaryColor === color && !isCustomColorActive && (
                                                            <span className="check-icon">✓</span>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Divider */}
                                            <div className="color-divider">
                                                <span>or choose custom</span>
                                            </div>

                                            {/* Custom Color Row: Swatch + Hex Input */}
                                            <div className="custom-color-row">
                                                <div className="color-picker-wrapper">
                                                    <div
                                                        className="polaris-color-swatch"
                                                        style={{
                                                            backgroundColor: primaryColor,
                                                            width: 48,
                                                            height: 48,
                                                            borderRadius: 10,
                                                            border: '2px solid #e5e7eb',
                                                            cursor: 'pointer',
                                                            flexShrink: 0,
                                                        }}
                                                        onClick={() => setShowCustomPickerPopover((v: boolean) => !v)}
                                                        title="Click to pick a color"
                                                    />
                                                </div>
                                                <div className="hex-input-wrapper">
                                                    <input
                                                        type="text"
                                                        className={`hex-input ${hexError ? 'error' : ''}`}
                                                        value={customHexInput}
                                                        placeholder="#FF5733"
                                                        maxLength={7}
                                                        onChange={(e) => {
                                                            let val = e.target.value;
                                                            // Auto-add # if user types without it
                                                            if (val && !val.startsWith('#')) {
                                                                val = '#' + val;
                                                            }
                                                            setCustomHexInput(val);
                                                            if (isValidHex(val)) {
                                                                const normalized = normalizeHex(val);
                                                                setPrimaryColor(normalized);
                                                                setIsCustomColorActive(true);
                                                                setHexError('');
                                                            } else if (val.length > 1) {
                                                                setHexError('Invalid hex (use #RGB or #RRGGBB)');
                                                            } else {
                                                                setHexError('');
                                                            }
                                                        }}
                                                    />
                                                    {hexError && <span className="hex-error">{hexError}</span>}
                                                </div>
                                            </div>
                                            {showCustomPickerPopover && (
                                                <div className="polaris-picker-popover" style={{ marginTop: 8, position: 'absolute', left: 0, right: 0, zIndex: 9999 }}>
                                                    <ColorPicker
                                                        onChange={(color: any) => {
                                                            // Convert HSB to hex
                                                            const { hue, saturation, brightness } = color;
                                                            const c = brightness * saturation;
                                                            const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
                                                            const m = brightness - c;
                                                            let r = 0, g = 0, b = 0;
                                                            if (hue < 60) { r = c; g = x; }
                                                            else if (hue < 120) { r = x; g = c; }
                                                            else if (hue < 180) { g = c; b = x; }
                                                            else if (hue < 240) { g = x; b = c; }
                                                            else if (hue < 300) { r = x; b = c; }
                                                            else { r = c; b = x; }
                                                            const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
                                                            const hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
                                                            setPrimaryColor(hex);
                                                            setCustomHexInput(hex.toUpperCase());
                                                            setIsCustomColorActive(true);
                                                            setHexError('');
                                                        }}
                                                        color={(() => {
                                                            // Convert current hex to HSB for ColorPicker
                                                            let h = primaryColor.replace('#', '');
                                                            if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
                                                            const rv = parseInt(h.substring(0, 2), 16) / 255;
                                                            const gv = parseInt(h.substring(2, 4), 16) / 255;
                                                            const bv = parseInt(h.substring(4, 6), 16) / 255;
                                                            const max = Math.max(rv, gv, bv), min = Math.min(rv, gv, bv), d = max - min;
                                                            let hue = 0;
                                                            if (d !== 0) {
                                                                if (max === rv) hue = ((gv - bv) / d + (gv < bv ? 6 : 0)) * 60;
                                                                else if (max === gv) hue = ((bv - rv) / d + 2) * 60;
                                                                else hue = ((rv - gv) / d + 4) * 60;
                                                            }
                                                            return { hue, saturation: max === 0 ? 0 : d / max, brightness: max };
                                                        })()}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </AccordionSection>

                                    {/* Button Typography */}
                                    <AccordionSection id="button-typography" tab="button" title="Button Typography" helperText="Changes the typography of the button" expandedSection={expandedSection} toggleSection={toggleSection}>
                                        <div className="input-group">
                                            <ColorSelector
                                                label="Text Color"
                                                value={buttonStylesState?.textColor || '#ffffff'}
                                                onChange={(c) => setButtonStylesState(s => ({ ...s, textColor: c }))}
                                            />
                                        </div>
                                        <div className="input-group" style={{ marginTop: 12 }}>
                                            <label className="input-label">Text Size (px)</label>
                                            <div style={{ padding: '0 8px', width: '100%' }}>
                                                <RangeSlider
                                                    labelHidden
                                                    label="Text Size"
                                                    min={12}
                                                    max={24}
                                                    value={buttonStylesState?.textSize ?? 15}
                                                    onChange={(val) => setButtonStylesState(s => ({ ...s, textSize: Number(val) }))}
                                                    output
                                                />
                                            </div>
                                        </div>
                                        <div className="input-group" style={{ marginTop: 12 }}>
                                            <label className="input-label">Font Style</label>
                                            <div className="style-options">
                                                {(['normal', 'bold', 'italic'] as const).map((fs) => (
                                                    <button key={fs} type="button" className={`style-option ${(buttonStylesState?.fontStyle || 'bold') === fs ? 'active' : ''}`} onClick={() => setButtonStylesState(s => ({ ...s, fontStyle: fs }))} style={{ fontStyle: fs === 'italic' ? 'italic' : undefined, fontWeight: fs === 'bold' ? 700 : undefined }}>
                                                        {fs.charAt(0).toUpperCase() + fs.slice(1)}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </AccordionSection>

                                    {/* Button Shape & Border */}
                                    <AccordionSection id="button-shape-border" tab="button" title="Button Shape & Border" helperText="Changes the shape and border of the button" expandedSection={expandedSection} toggleSection={toggleSection}>
                                        <div className="input-group">
                                            <ColorSelector
                                                label="Border Color"
                                                value={buttonStylesState?.borderColor || primaryColor}
                                                onChange={(c) => setButtonStylesState(s => ({ ...s, borderColor: c }))}
                                            />
                                        </div>
                                        <div className="input-group" style={{ marginTop: 12 }}>
                                            <label className="input-label">Border Width (px)</label>
                                            <div style={{ padding: '0 8px', width: '100%' }}>
                                                <RangeSlider
                                                    labelHidden
                                                    label="Border Width"
                                                    min={0}
                                                    max={4}
                                                    value={buttonStylesState?.borderWidth ?? 0}
                                                    onChange={(val) => setButtonStylesState(s => ({ ...s, borderWidth: Number(val) }))}
                                                    output
                                                />
                                            </div>
                                        </div>
                                        <div className="input-group" style={{ marginTop: 12 }}>
                                            <label className="input-label">Rounded Corners (px)</label>
                                            <div style={{ padding: '0 8px', width: '100%' }}>
                                                <RangeSlider
                                                    labelHidden
                                                    label="Rounded Corners"
                                                    min={0}
                                                    max={24}
                                                    value={buttonStylesState?.borderRadius ?? 12}
                                                    onChange={(val) => setButtonStylesState(s => ({ ...s, borderRadius: Number(val) }))}
                                                    output
                                                />
                                            </div>
                                        </div>
                                        <div className="toggle-option" style={{ marginTop: 12 }} onClick={() => setButtonStylesState(s => ({ ...s, shadow: !s.shadow }))}>
                                            <span className="toggle-option-label">Shadow</span>
                                            <div className={`mini-toggle ${buttonStylesState?.shadow ? 'on' : 'off'}`} />
                                        </div>
                                    </AccordionSection>

                                    {/* Button Animations */}
                                    <AccordionSection id="button-animations" tab="button" title="Button Animations" helperText="Changes the animation of the button" expandedSection={expandedSection} toggleSection={toggleSection}>
                                        <div className="input-group">
                                            <label className="input-label">Animation Presets</label>
                                            <select
                                                className="input-field"
                                                value={buttonStylesState?.animationPreset || 'none'}
                                                onChange={(e) => setButtonStylesState(s => ({ ...s, animationPreset: e.target.value as any }))}
                                                style={{ cursor: 'pointer' }}
                                            >
                                                <option value="none">None (Static)</option>
                                                <option value="shake">Subtle Shake</option>
                                                <option value="pulse">Pulse</option>
                                                <option value="bounce">Bounce</option>
                                            </select>
                                        </div>
                                        <div className="input-group" style={{ marginTop: 12 }}>
                                            <label className="input-label">Animation Speed</label>
                                            <div className="style-options">
                                                {(['slow', 'normal', 'fast'] as const).map((speed) => (
                                                    <button key={speed} type="button" className={`style-option ${(buttonStylesState?.animationSpeed || 'normal') === speed ? 'active' : ''}`} onClick={() => setButtonStylesState(s => ({ ...s, animationSpeed: speed }))}>
                                                        {speed.charAt(0).toUpperCase() + speed.slice(1)}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="input-group" style={{ marginTop: 16 }}>
                                            <label className="input-label">Start Animation</label>
                                            <select
                                                className="input-field"
                                                value={buttonStylesState?.animationTrigger || 'page-load'}
                                                onChange={(e) => setButtonStylesState(s => ({ ...s, animationTrigger: e.target.value as any }))}
                                                style={{ cursor: 'pointer' }}
                                            >
                                                <option value="page-load">On Page Load</option>
                                                <option value="form-filled">After Form is Filled</option>
                                                <option value="inactivity">After Inactivity</option>
                                            </select>
                                        </div>
                                        {buttonStylesState?.animationTrigger === 'inactivity' && (
                                            <div className="input-group" style={{ marginTop: 12 }}>
                                                <label className="input-label">Inactivity Delay (seconds)</label>
                                                <div style={{ padding: '0 8px', width: '100%' }}>
                                                    <RangeSlider
                                                        labelHidden
                                                        label="Inactivity Delay"
                                                        min={1}
                                                        max={10}
                                                        value={buttonStylesState?.inactivityDelay ?? 3}
                                                        onChange={(val) => setButtonStylesState(s => ({ ...s, inactivityDelay: Number(val) }))}
                                                        output
                                                    />
                                                </div>
                                            </div>
                                        )}
                                        <div className="toggle-option" style={{ marginTop: 12 }} onClick={() => setButtonStylesState(s => ({ ...s, stopAfterInteraction: !s.stopAfterInteraction }))}>
                                            <span className="toggle-option-label">Stop Animation After First Interaction</span>
                                            <div className={`mini-toggle ${buttonStylesState?.stopAfterInteraction ? 'on' : 'off'}`} />
                                        </div>
                                        <div style={{ marginTop: 16, borderTop: '1px solid #f3f4f6', paddingTop: 16 }}>
                                            <label className="input-label">Border Animation</label>
                                            <div className="style-options" style={{ flexWrap: 'wrap' }}>
                                                {([
                                                    { value: 'static', label: 'Static' },
                                                    { value: 'dashed-moving', label: 'Dashed' }
                                                ] as const).map((effect) => (
                                                    <button key={effect.value} type="button" className={`style-option ${(buttonStylesState?.borderEffect || 'static') === effect.value ? 'active' : ''}`} onClick={() => setButtonStylesState(s => ({ ...s, borderEffect: effect.value }))}>
                                                        {effect.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="input-group" style={{ marginTop: 12 }}>
                                            <label className="input-label">Border Intensity</label>
                                            <div className="style-options">
                                                {(['low', 'medium', 'high'] as const).map((intensity) => (
                                                    <button key={intensity} type="button" className={`style-option ${(buttonStylesState?.borderIntensity || 'medium') === intensity ? 'active' : ''}`} onClick={() => setButtonStylesState(s => ({ ...s, borderIntensity: intensity }))}>
                                                        {intensity.charAt(0).toUpperCase() + intensity.slice(1)}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </AccordionSection>

                                    {/* Hover & Click Effects */}
                                    <AccordionSection id="hover-click-effects" tab="button" title="Hover & Click Effects" helperText="Changes the hover and click effects of the button" expandedSection={expandedSection} toggleSection={toggleSection}>
                                        <div className="toggle-option" onClick={() => setButtonStylesState(s => ({ ...s, hoverLift: !s.hoverLift }))}>
                                            <span className="toggle-option-label">Hover Lift + Shadow</span>
                                            <div className={`mini-toggle ${buttonStylesState?.hoverLift ? 'on' : 'off'}`} />
                                        </div>
                                        <div className="toggle-option" style={{ marginTop: 10 }} onClick={() => setButtonStylesState(s => ({ ...s, clickRipple: !s.clickRipple }))}>
                                            <span className="toggle-option-label">Ripple Effect on Click</span>
                                            <div className={`mini-toggle ${buttonStylesState?.clickRipple ? 'on' : 'off'}`} />
                                        </div>
                                        <div className="toggle-option" style={{ marginTop: 10 }} onClick={() => setButtonStylesState(s => ({ ...s, clickPress: !s.clickPress }))}>
                                            <span className="toggle-option-label">Press-down on Click</span>
                                            <div className={`mini-toggle ${buttonStylesState?.clickPress ? 'on' : 'off'}`} />
                                        </div>
                                    </AccordionSection>

                                    {/* Device Behavior */}
                                    <AccordionSection id="device-behavior" tab="button" title="Device Behavior" helperText="Changes the device behavior of the button" expandedSection={expandedSection} toggleSection={toggleSection}>
                                        <div className="toggle-option" onClick={() => setButtonStylesState(s => ({ ...s, enableDesktop: !s.enableDesktop }))}>
                                            <span className="toggle-option-label">Enable Animations on Desktop</span>
                                            <div className={`mini-toggle ${buttonStylesState?.enableDesktop !== false ? 'on' : 'off'}`} />
                                        </div>
                                        <div className="toggle-option" style={{ marginTop: 10 }} onClick={() => setButtonStylesState(s => ({ ...s, enableMobile: !s.enableMobile }))}>
                                            <span className="toggle-option-label">Enable Animations on Mobile</span>
                                            <div className={`mini-toggle ${buttonStylesState?.enableMobile !== false ? 'on' : 'off'}`} />
                                        </div>
                                        <div className="toggle-option" style={{ marginTop: 10 }} onClick={() => setButtonStylesState(s => ({ ...s, stickyOnMobile: !s.stickyOnMobile }))}>
                                            <span className="toggle-option-label">Sticky Button on Mobile (below fold)</span>
                                            <div className={`mini-toggle ${buttonStylesState?.stickyOnMobile ? 'on' : 'off'}`} />
                                        </div>
                                    </AccordionSection>

                                    {/* Restore to Default — always visible */}
                                    <div className="settings-card">
                                        <button
                                            type="button"
                                            onClick={() => setButtonStylesState({ ...DEFAULT_BUTTON_STYLES })}
                                            style={{ width: '100%', padding: '12px 16px', fontSize: 13, fontWeight: 600, color: '#202223', background: '#F6F6F7', border: '2px solid #202223', borderRadius: 10, cursor: 'pointer' }}
                                        >
                                            Restore All to Default
                                        </button>
                                    </div>
                                </>
                            )}

                            {/* Form Tab */}
                            {activeTab === 'form' && (
                                <>
                                    {/* Field Management (Default Open) */}
                                    <AccordionSection id="field-management" tab="form" title="Field Management" helperText="Changes the field management of the form on Product page" expandedSection={expandedSection} toggleSection={toggleSection}>
                                        <p style={{ color: '#6b7280', fontSize: '13px', marginBottom: '16px' }}>
                                            Drag to reorder • 👁️ visibility • ★ required
                                        </p>
                                        <div className="sortable-fields-container">
                                            <DndContext
                                                sensors={sensors}
                                                collisionDetection={closestCenter}
                                                onDragEnd={handleDragEnd}
                                            >
                                                <SortableContext
                                                    items={fields.filter(f => f.id !== 'quantity').map(f => f.id)}
                                                    strategy={verticalListSortingStrategy}
                                                >
                                                    {fields.filter(f => f.id !== 'quantity').sort((a, b) => a.order - b.order).map((field) => (
                                                        <SortableFieldItem
                                                            key={field.id}
                                                            field={field}
                                                            onToggleVisibility={toggleFieldVisibility}
                                                            onToggleRequired={toggleFieldRequired}
                                                            isCustom={field.isCustom}
                                                            onRemove={field.isCustom ? removeCustomField : undefined}
                                                        />
                                                    ))}
                                                </SortableContext>
                                            </DndContext>

                                            <button
                                                type="button"
                                                className="add-field-btn"
                                                onClick={() => setShowAddFieldModal(true)}
                                            >
                                                + Add Custom Field
                                            </button>
                                        </div>
                                    </AccordionSection>

                                    {/* Field Styling */}
                                    <AccordionSection id="field-styling" tab="form" title="Field Styling" helperText="Changes the styling of the form fields" expandedSection={expandedSection} toggleSection={toggleSection}>
                                        {/* ── Style Preset Selector ── */}
                                        <div className="input-group">
                                            <label className="input-label">Style Preset</label>
                                            <select
                                                style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 10, fontSize: 14, fontFamily: "'Inter', sans-serif", color: '#374151', background: '#fff', cursor: 'pointer' }}
                                                value={selectedPreset}
                                                onChange={(e) => {
                                                    const key = e.target.value;
                                                    setSelectedPreset(key);
                                                    const presetMap: Record<string, any> = {
                                                        default: { styles: { themeKey: 'default', textColor: '#333333', textSize: 14, fontStyle: 'normal' as const, borderColor: '#d1d5db', borderWidth: 1, backgroundColor: '#ffffff', labelAlignment: 'left' as const, iconColor: '#6b7280', iconBackground: '#f3f4f6', borderRadius: 12, shadow: true, fieldBackgroundColor: '#ffffff', labelColor: '#111827', labelFontSize: 14 }, buttonColor: '#000000' },
                                                        modern_slate: { styles: { themeKey: 'modern_slate', textColor: '#1e293b', textSize: 14, fontStyle: 'normal' as const, borderColor: '#f97316', borderWidth: 2, backgroundColor: '#fff7ed', labelAlignment: 'left' as const, iconColor: '#ea580c', iconBackground: '#fed7aa', borderRadius: 16, shadow: true, fieldBackgroundColor: '#fff7ed', labelColor: '#9a3412', labelFontSize: 14 }, buttonColor: '#ea580c' },
                                                        dark_mode: { styles: { themeKey: 'dark_mode', textColor: '#e2e8f0', textSize: 14, fontStyle: 'normal' as const, borderColor: '#334155', borderWidth: 1, backgroundColor: '#1e293b', labelAlignment: 'left' as const, iconColor: '#94a3b8', iconBackground: '#1e293b', borderRadius: 12, shadow: true, fieldBackgroundColor: '#0f172a', labelColor: '#f1f5f9', labelFontSize: 14 }, buttonColor: '#6366f1' },
                                                        eastern_gold: { styles: { themeKey: 'eastern_gold', textColor: '#78350f', textSize: 14, fontStyle: 'normal' as const, borderColor: '#d4a574', borderWidth: 1, backgroundColor: '#fffbeb', labelAlignment: 'left' as const, iconColor: '#b45309', iconBackground: '#fef3c7', borderRadius: 10, shadow: true, fieldBackgroundColor: '#fef9c3', labelColor: '#713f12', labelFontSize: 14 }, buttonColor: '#b45309' },
                                                        arctic_blue: { styles: { themeKey: 'arctic_blue', textColor: '#164e63', textSize: 14, fontStyle: 'normal' as const, borderColor: '#67e8f9', borderWidth: 1, backgroundColor: '#ecfeff', labelAlignment: 'left' as const, iconColor: '#0891b2', iconBackground: '#cffafe', borderRadius: 12, shadow: true, fieldBackgroundColor: '#ecfeff', labelColor: '#155e75', labelFontSize: 14 }, buttonColor: '#0891b2' },
                                                        rose_garden: { styles: { themeKey: 'rose_garden', textColor: '#9f1239', textSize: 14, fontStyle: 'normal' as const, borderColor: '#fda4af', borderWidth: 1, backgroundColor: '#fff1f2', labelAlignment: 'left' as const, iconColor: '#e11d48', iconBackground: '#ffe4e6', borderRadius: 14, shadow: true, fieldBackgroundColor: '#fff1f2', labelColor: '#881337', labelFontSize: 14 }, buttonColor: '#e11d48' },
                                                        midnight_purple: { styles: { themeKey: 'midnight_purple', textColor: '#c4b5fd', textSize: 14, fontStyle: 'normal' as const, borderColor: '#4c1d95', borderWidth: 1, backgroundColor: '#1e1b4b', labelAlignment: 'left' as const, iconColor: '#a78bfa', iconBackground: '#312e81', borderRadius: 12, shadow: true, fieldBackgroundColor: '#312e81', labelColor: '#ddd6fe', labelFontSize: 14 }, buttonColor: '#7c3aed' },
                                                        forest_green: { styles: { themeKey: 'forest_green', textColor: '#14532d', textSize: 14, fontStyle: 'normal' as const, borderColor: '#86efac', borderWidth: 1, backgroundColor: '#f0fdf4', labelAlignment: 'left' as const, iconColor: '#16a34a', iconBackground: '#dcfce7', borderRadius: 10, shadow: true, fieldBackgroundColor: '#f0fdf4', labelColor: '#15803d', labelFontSize: 14 }, buttonColor: '#16a34a' },
                                                        professional: { styles: { themeKey: 'professional', textColor: '#1f2937', textSize: 14, fontStyle: 'normal' as const, borderColor: '#9ca3af', borderWidth: 1, backgroundColor: '#f9fafb', labelAlignment: 'left' as const, iconColor: '#4b5563', iconBackground: '#e5e7eb', borderRadius: 6, shadow: false, fieldBackgroundColor: '#ffffff', labelColor: '#111827', labelFontSize: 13 }, buttonColor: '#374151' },
                                                        minimal_white: { styles: { themeKey: 'minimal_white', textColor: '#374151', textSize: 14, fontStyle: 'normal' as const, borderColor: '#e5e7eb', borderWidth: 1, backgroundColor: '#ffffff', labelAlignment: 'left' as const, iconColor: '#9ca3af', iconBackground: 'transparent', borderRadius: 8, shadow: false, fieldBackgroundColor: '#ffffff', labelColor: '#6b7280', labelFontSize: 13 }, buttonColor: '#111827' },
                                                        luxury_gold: { styles: { themeKey: 'luxury_gold', textColor: '#fbbf24', textSize: 14, fontStyle: 'normal' as const, borderColor: '#d97706', borderWidth: 1, backgroundColor: '#18181b', labelAlignment: 'left' as const, iconColor: '#f59e0b', iconBackground: '#27272a', borderRadius: 10, shadow: true, fieldBackgroundColor: '#27272a', labelColor: '#fcd34d', labelFontSize: 14 }, buttonColor: '#d97706' },
                                                        ocean_breeze: { styles: { themeKey: 'ocean_breeze', textColor: '#0f766e', textSize: 14, fontStyle: 'normal' as const, borderColor: '#5eead4', borderWidth: 1, backgroundColor: '#f0fdfa', labelAlignment: 'left' as const, iconColor: '#14b8a6', iconBackground: '#ccfbf1', borderRadius: 14, shadow: true, fieldBackgroundColor: '#f0fdfa', labelColor: '#115e59', labelFontSize: 14 }, buttonColor: '#14b8a6' },
                                                    };
                                                    if (key !== 'custom' && presetMap[key]) {
                                                        setFormStyles(presetMap[key].styles);
                                                        setPrimaryColor(presetMap[key].buttonColor);
                                                    } else if (key === 'custom') {
                                                        setFormStyles(s => ({ ...s, themeKey: 'custom' }));
                                                    }
                                                }}
                                            >
                                                <option value="custom">Select a preset</option>
                                                <option value="default">Default</option>
                                                <option value="modern_slate">Modern Coral</option>
                                                <option value="dark_mode">Dark Mode</option>
                                                <option value="eastern_gold">Eastern Gold</option>
                                                <option value="arctic_blue">Arctic Blue</option>
                                                <option value="rose_garden">Rose Garden</option>
                                                <option value="midnight_purple">Midnight Purple</option>
                                                <option value="forest_green">Forest Green</option>
                                                <option value="professional">Professional</option>
                                                <option value="minimal_white">Minimal White</option>
                                                <option value="luxury_gold">Luxury Gold</option>
                                                <option value="ocean_breeze">Ocean Breeze</option>
                                            </select>
                                            <p style={{ fontSize: 12, color: '#9ca3af', margin: '6px 0 0' }}>Apply a curated color theme, then fine-tune below.</p>
                                        </div>

                                        {/* ── Advanced Style Controls ── */}
                                        <div className="input-group" style={{ marginTop: 16 }}>
                                            <ColorSelector
                                                label="Text Color"
                                                value={formStyles?.textColor || '#333333'}
                                                onChange={(c) => setFormStyles(s => ({ ...s, textColor: c }))}
                                            />
                                        </div>
                                        <div className="input-group" style={{ marginTop: 12 }}>
                                            <label className="input-label">Text Size (px)</label>
                                            <div style={{ padding: '0 8px', width: '100%' }}>
                                                <RangeSlider
                                                    labelHidden
                                                    label="Text Size"
                                                    min={11}
                                                    max={20}
                                                    value={formStyles?.textSize ?? 14}
                                                    onChange={(val) => setFormStyles(s => ({ ...s, textSize: Number(val) }))}
                                                    output
                                                />
                                            </div>
                                        </div>
                                        <div className="input-group" style={{ marginTop: 12 }}>
                                            <label className="input-label">Font Style</label>
                                            <div className="style-options">
                                                {(['normal', 'bold', 'italic'] as const).map((fs) => (
                                                    <button key={fs} type="button" className={`style-option ${(formStyles?.fontStyle || 'normal') === fs ? 'active' : ''}`} onClick={() => setFormStyles(s => ({ ...s, fontStyle: fs }))} style={{ fontStyle: fs === 'italic' ? 'italic' : undefined, fontWeight: fs === 'bold' ? 700 : undefined }}>
                                                        {fs.charAt(0).toUpperCase() + fs.slice(1)}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="input-group" style={{ marginTop: 12 }}>
                                            <ColorSelector
                                                label="Border Color"
                                                value={formStyles?.borderColor || '#d1d5db'}
                                                onChange={(c) => setFormStyles(s => ({ ...s, borderColor: c }))}
                                            />
                                        </div>
                                        <div className="input-group" style={{ marginTop: 12 }}>
                                            <label className="input-label">Border Width (px)</label>
                                            <div style={{ padding: '0 8px', width: '100%' }}>
                                                <RangeSlider
                                                    labelHidden
                                                    label="Border Width"
                                                    min={0}
                                                    max={3}
                                                    value={formStyles?.borderWidth ?? 1}
                                                    onChange={(val) => setFormStyles(s => ({ ...s, borderWidth: Number(val) }))}
                                                    output
                                                />
                                            </div>
                                        </div>
                                        <div className="input-group" style={{ marginTop: 12 }}>
                                            <label className="input-label">Rounded Corners (px)</label>
                                            <div style={{ padding: '0 8px', width: '100%' }}>
                                                <RangeSlider
                                                    labelHidden
                                                    label="Rounded Corners"
                                                    min={0}
                                                    max={20}
                                                    value={formStyles?.borderRadius ?? 12}
                                                    onChange={(val) => setFormStyles(s => ({ ...s, borderRadius: Number(val) }))}
                                                    output
                                                />
                                            </div>
                                        </div>
                                        <div className="input-group" style={{ marginTop: 12 }}>
                                            <label className="input-label">Shadow Intensity</label>
                                            <div style={{ padding: '0 8px', width: '100%' }}>
                                                <RangeSlider
                                                    labelHidden
                                                    label="Shadow Intensity"
                                                    min={0}
                                                    max={100}
                                                    value={
                                                        typeof formStyles?.shadowIntensity === 'number'
                                                            ? formStyles.shadowIntensity
                                                            : (formStyles?.shadow ? 35 : 0)
                                                    }
                                                    onChange={(val) => {
                                                        const num = Number(val);
                                                        setFormStyles(s => ({
                                                            ...s,
                                                            shadowIntensity: num,
                                                            shadow: num > 0
                                                        }));
                                                    }}
                                                    output
                                                />
                                            </div>
                                        </div>
                                        <div className="input-group" style={{ marginTop: 12 }}>
                                            <ColorSelector
                                                label="Background Color"
                                                value={formStyles?.backgroundColor || '#ffffff'}
                                                onChange={(c) => setFormStyles(s => ({ ...s, backgroundColor: c }))}
                                            />
                                        </div>
                                        <div className="input-group" style={{ marginTop: 12 }}>
                                            <label className="input-label">Labels Alignment</label>
                                            <div className="style-options">
                                                {(['left', 'center', 'right'] as const).map((a) => (
                                                    <button key={a} type="button" className={`style-option ${(formStyles?.labelAlignment || 'left') === a ? 'active' : ''}`} onClick={() => setFormStyles(s => ({ ...s, labelAlignment: a }))}>
                                                        {a.charAt(0).toUpperCase() + a.slice(1)}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="input-group" style={{ marginTop: 12 }}>
                                            <ColorSelector
                                                label="Icon Color"
                                                value={formStyles?.iconColor || '#6b7280'}
                                                onChange={(c) => setFormStyles(s => ({ ...s, iconColor: c }))}
                                            />
                                        </div>
                                        <div className="input-group" style={{ marginTop: 12 }}>
                                            <ColorSelector
                                                label="Icon Background"
                                                value={formStyles?.iconBackground || '#f3f4f6'}
                                                onChange={(c) => setFormStyles(s => ({ ...s, iconBackground: c }))}
                                            />
                                        </div>
                                        <div className="input-group" style={{ marginTop: 12 }}>
                                            <ColorSelector
                                                label="Field Background Color"
                                                value={formStyles?.fieldBackgroundColor || '#ffffff'}
                                                onChange={(c) => {
                                                    console.log('[ColorSelector] New value:', c);
                                                    setFormStyles(s => {
                                                        const newStyles = { ...s, fieldBackgroundColor: c };
                                                        console.log('[ColorSelector] Updated formStyles:', newStyles);
                                                        return newStyles;
                                                    });
                                                }}
                                            />
                                            <p className="setting-helper">Controls the background color of input fields.</p>
                                        </div>
                                        <div className="input-group" style={{ marginTop: 12 }}>
                                            <ColorSelector
                                                label="Label Color"
                                                value={formStyles?.labelColor || '#111827'}
                                                onChange={(c) => setFormStyles(s => ({ ...s, labelColor: c }))}
                                            />
                                        </div>
                                        <div className="input-group" style={{ marginTop: 12 }}>
                                            <label className="input-label">Label Font Size (px)</label>
                                            <div style={{ padding: '0 8px', width: '100%' }}>
                                                <RangeSlider
                                                    labelHidden
                                                    label="Label Font Size"
                                                    min={11}
                                                    max={20}
                                                    value={formStyles?.labelFontSize ?? 14}
                                                    onChange={(val) => setFormStyles(s => ({ ...s, labelFontSize: Number(val) }))}
                                                    output
                                                />
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setFormStyles({ ...DEFAULT_STYLES })}
                                            style={{ marginTop: 16, padding: '10px 16px', fontSize: 13, fontWeight: 600, color: '#202223', background: '#F6F6F7', border: '2px solid #202223', borderRadius: 10, cursor: 'pointer' }}
                                        >
                                            Restore to Default
                                        </button>
                                    </AccordionSection>

                                    {/* Partial Cash on Delivery */}
                                    <AccordionSection id="partial-cod" tab="form" title="Partial Cash on Delivery" helperText="Enables the partial cash on delivery settings" expandedSection={expandedSection} toggleSection={toggleSection}>
                                        <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '16px' }}>
                                            Allow customers to pay a portion of the order online and the rest on delivery.
                                        </p>
                                        <div className="toggle-option" onClick={() => setPartialCodEnabled(!partialCodEnabled)}>
                                            <span className="toggle-option-label">Enable Partial COD</span>
                                            <div className={`mini-toggle ${partialCodEnabled ? 'on' : 'off'}`} />
                                        </div>
                                        {partialCodEnabled && (
                                            <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                                <div className="input-group">
                                                    <label className="input-label">Advance Amount ({currencySymbol})</label>
                                                    <input
                                                        type="number"
                                                        className="text-input"
                                                        value={partialCodAdvanceAmount}
                                                        onChange={(e) => setPartialCodAdvanceAmount(parseInt(e.target.value) || 0)}
                                                        min="1"
                                                        placeholder="Enter advance amount"
                                                        style={{ padding: '12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}
                                                    />
                                                    <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '6px' }}>
                                                        This amount will be collected online via Shopify checkout.
                                                    </p>
                                                </div>
                                                <div className="input-group">
                                                    <label className="input-label">Commission per Order ({currencySymbol})</label>
                                                    <input
                                                        type="number"
                                                        className="text-input"
                                                        value={partialCodCommission}
                                                        onChange={(e) => setPartialCodCommission(parseFloat(e.target.value) || 0)}
                                                        min="0"
                                                        step="0.01"
                                                        placeholder="Enter commission amount"
                                                        style={{ padding: '12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}
                                                    />
                                                    <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '6px' }}>
                                                        Commission charged per partial COD order (for billing).
                                                    </p>
                                                </div>
                                                <div style={{ padding: '12px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                                                    <p style={{ fontSize: '13px', color: '#1d4ed8', margin: 0 }}>
                                                        <strong>ⓘ How it works:</strong> When enabled, customers will see an option to pay {fmtCurrency(partialCodAdvanceAmount)} online now, with the remaining balance due on delivery.
                                                    </p>
                                                </div>
                                            </div>
                                        )}
                                    </AccordionSection>

                                    {/* Form Content */}
                                    <AccordionSection id="form-content" tab="form" title="Form Content" helperText="Changes the form content on Product page" expandedSection={expandedSection} toggleSection={toggleSection}>
                                        <div className="input-group">
                                            <label className="input-label">Form Title</label>
                                            <input
                                                type="text"
                                                className="input-field"
                                                value={formTitle}
                                                onChange={(e) => setFormTitle(e.target.value)}
                                                placeholder="Cash on Delivery Order"
                                            />
                                        </div>
                                        <div className="input-group">
                                            <label className="input-label">Submit Button Text</label>
                                            <input
                                                type="text"
                                                className="input-field"
                                                value={submitButtonText}
                                                onChange={(e) => setSubmitButtonText(e.target.value)}
                                                placeholder="Place COD Order"
                                            />
                                        </div>
                                        <div className="input-group">
                                            <label className="input-label">Success Message</label>
                                            <textarea
                                                className="input-field"
                                                value={successMessage}
                                                onChange={(e) => setSuccessMessage(e.target.value)}
                                                placeholder="Your order has been placed! We'll contact you shortly."
                                            />
                                        </div>
                                    </AccordionSection>

                                    {/* Add Field Modal — Polaris UI */}
                                    <Modal
                                        open={showAddFieldModal}
                                        onClose={() => { setShowAddFieldModal(false); setNewFieldLabel(''); setNewFieldPlaceholder(''); setNewFieldOptions(''); }}
                                        title="Add Custom Field"
                                        primaryAction={{
                                            content: 'Add Field',
                                            onAction: addCustomField,
                                            disabled: !newFieldLabel.trim(),
                                        }}
                                        secondaryActions={[{
                                            content: 'Cancel',
                                            onAction: () => { setShowAddFieldModal(false); setNewFieldLabel(''); setNewFieldPlaceholder(''); setNewFieldOptions(''); },
                                        }]}
                                    >
                                        <Modal.Section>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                                <Select
                                                    label="Field Type"
                                                    options={[
                                                        { label: 'Text', value: 'text' },
                                                        { label: 'Number', value: 'number' },
                                                        { label: 'Dropdown', value: 'dropdown' },
                                                        { label: 'Checkbox', value: 'checkbox' },
                                                    ]}
                                                    value={newFieldType}
                                                    onChange={(v) => setNewFieldType(v as any)}
                                                />
                                                <TextField
                                                    label="Field Label"
                                                    value={newFieldLabel}
                                                    onChange={setNewFieldLabel}
                                                    placeholder="e.g. Company Name"
                                                    autoComplete="off"
                                                />
                                                {newFieldType !== 'checkbox' && (
                                                    <TextField
                                                        label="Placeholder Text"
                                                        value={newFieldPlaceholder}
                                                        onChange={setNewFieldPlaceholder}
                                                        placeholder="e.g. Enter your company name"
                                                        autoComplete="off"
                                                        helpText="Optional. Shown as hint text inside the field."
                                                    />
                                                )}
                                                {newFieldType === 'dropdown' && (
                                                    <TextField
                                                        label="Dropdown Options"
                                                        value={newFieldOptions}
                                                        onChange={setNewFieldOptions}
                                                        placeholder="Option 1, Option 2, Option 3"
                                                        autoComplete="off"
                                                        helpText="Comma-separated list of options."
                                                        multiline={2}
                                                    />
                                                )}
                                            </div>
                                        </Modal.Section>
                                    </Modal>
                                </>
                            )}

                            {/* Shipping Tab */}
                            {
                                activeTab === 'shipping' && (
                                    <>
                                        {/* Shipping Rates Enable Toggle */}
                                        <div className="settings-card">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                                                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#1f2937', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M17 10a7 7 0 11-14 0 7 7 0 0114 0z" stroke="#fff" strokeWidth="1.5" /><path d="M10 7v6M7 10h6" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" /></svg>
                                                </div>
                                                <div>
                                                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#1f2937' }}>Shipping Rates</h3>
                                                    <p style={{ margin: 0, fontSize: '12px', color: '#9ca3af' }}>Configure rates with conditions and restrictions</p>
                                                </div>
                                            </div>
                                            <div className="toggle-option" onClick={() => setShippingRatesEnabled(!shippingRatesEnabled)}>
                                                <span className="toggle-option-label">Enable Shipping Rates</span>
                                                <div className={`mini-toggle ${shippingRatesEnabled ? 'on' : 'off'}`} />
                                            </div>
                                        </div>

                                        {shippingRatesEnabled && (
                                            <>
                                                {/* Action Buttons */}
                                                <div className="settings-card">
                                                    <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
                                                        <InlineStack gap="300">
                                                            <Button
                                                                onClick={() => setIsImportingShipping(true)}
                                                                disabled={isImportingShipping}
                                                                loading={isImportingShipping}
                                                            >
                                                                Import from Shopify
                                                            </Button>
                                                            <Button
                                                                variant="primary"
                                                                onClick={() => { setEditingRate(null); setShowShippingRateModal(true); }}
                                                            >
                                                                + Add Rate
                                                            </Button>
                                                        </InlineStack>
                                                    </div>

                                                    {/* Shipping Rates Table */}
                                                    {shippingRates.length === 0 ? (
                                                        <div style={{ textAlign: 'center', padding: '40px 20px', background: '#f9fafb', borderRadius: '12px', border: '1px dashed #d1d5db' }}>
                                                            <div style={{ fontSize: '14px', marginBottom: '12px', color: '#9ca3af' }}>No rates</div>
                                                            <p style={{ fontSize: '14px', color: '#6b7280', margin: '0 0 4px 0' }}>No shipping rates yet</p>
                                                            <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0 }}>Add rates manually or import from Shopify</p>
                                                        </div>
                                                    ) : (
                                                        <div className="shipping-table-wrapper">
                                                            <table className="shipping-table">
                                                                <thead>
                                                                    <tr>
                                                                        <th>Rate Name</th>
                                                                        <th>Price</th>
                                                                        <th>Condition</th>
                                                                        <th>Status</th>
                                                                        <th style={{ width: '80px', textAlign: 'center' }}>Actions</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {shippingRates.map((rate) => (
                                                                        <tr key={rate.id} style={{ opacity: rate.is_active ? 1 : 0.6 }}>
                                                                            <td>
                                                                                <div style={{ fontWeight: 600, fontSize: '13px', color: '#1f2937' }}>{rate.name}</div>
                                                                                {rate.description && <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>{rate.description}</div>}
                                                                            </td>
                                                                            <td>
                                                                                <span className={`shipping-price-badge ${rate.price === 0 ? 'free' : ''}`}>
                                                                                    {rate.price === 0 ? 'FREE' : fmtCurrency(rate.price)}
                                                                                </span>
                                                                            </td>
                                                                            <td>
                                                                                {rate.condition_type === 'none' ? (
                                                                                    <span style={{ fontSize: '12px', color: '#9ca3af' }}>—</span>
                                                                                ) : (
                                                                                    <span className="shipping-condition-badge">
                                                                                        {rate.condition_type === 'order_price' ? 'Price' : rate.condition_type === 'order_quantity' ? 'Qty' : 'Weight'}
                                                                                        {rate.min_value != null && ` ≥ ${rate.min_value}`}
                                                                                        {rate.max_value != null && ` ≤ ${rate.max_value}`}
                                                                                    </span>
                                                                                )}
                                                                            </td>
                                                                            <td>
                                                                                <span className={`shipping-status-dot ${rate.is_active ? 'active' : 'inactive'}`}>
                                                                                    {rate.is_active ? 'Active' : 'Inactive'}
                                                                                </span>
                                                                            </td>
                                                                            <td>
                                                                                <InlineStack gap="100">
                                                                                    <Button
                                                                                        icon={EditIcon}
                                                                                        variant="tertiary"
                                                                                        accessibilityLabel="Edit rate"
                                                                                        onClick={() => { setEditingRate(rate); setShowShippingRateModal(true); }}
                                                                                    />
                                                                                    <Button
                                                                                        icon={DeleteIcon}
                                                                                        variant="tertiary"
                                                                                        tone="critical"
                                                                                        accessibilityLabel="Delete rate"
                                                                                        onClick={() => setRateToDelete(rate)}
                                                                                    />
                                                                                </InlineStack>
                                                                            </td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Info Card */}
                                                <div className="settings-card" style={{ background: 'rgba(59, 130, 246, 0.05)', borderColor: 'rgba(59, 130, 246, 0.2)' }}>
                                                    <div style={{ display: 'flex', gap: '12px' }}>
                                                        <div style={{ fontSize: '24px' }}><svg width="24" height="24" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="8" r="5" stroke="#3b82f6" strokeWidth="1.5" fill="none" /><path d="M8 13v2a2 2 0 004 0v-2M10 3V1" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" /></svg></div>
                                                        <div>
                                                            <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#1e40af', margin: '0 0 4px 0' }}>How Shipping Rates Work</h4>
                                                            <p style={{ fontSize: '13px', color: '#3b82f6', margin: 0, lineHeight: '1.5' }}>
                                                                The first applicable shipping rate will be automatically selected based on order conditions.
                                                                Set conditions like minimum order value or restrict to specific products/countries.
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </>
                                )
                            }


                            {/* Style Tab */}
                            {activeTab === 'style' && (
                                <>
                                    {/* Form Animation (Default Open) */}
                                    <AccordionSection id="form-animation" tab="style" title="Form Animation" expandedSection={expandedSection} toggleSection={toggleSection}>
                                        <p className="setting-helper" style={{ marginBottom: 12 }}>Choose the modal style and entry animation for the COD form.</p>
                                        <div className="input-group">
                                            <label className="input-label">Modal Style</label>
                                            <div className="style-options">
                                                {['modern', 'minimal', 'glassmorphism'].map((style) => (
                                                    <button
                                                        key={style}
                                                        className={`style-option ${modalStyle === style ? 'active' : ''}`}
                                                        onClick={() => setModalStyle(style as any)}
                                                    >
                                                        {style.charAt(0).toUpperCase() + style.slice(1)}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="input-group" style={{ marginTop: 16 }}>
                                            <label className="input-label">Animation</label>
                                            <div className="style-options">
                                                {['fade', 'slide', 'scale'].map((style) => (
                                                    <button
                                                        key={style}
                                                        className={`style-option ${animationStyle === style ? 'active' : ''}`}
                                                        onClick={() => setAnimationStyle(style as any)}
                                                    >
                                                        {style.charAt(0).toUpperCase() + style.slice(1)}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </AccordionSection>

                                    {/* Form Shape */}
                                    <AccordionSection id="form-shape" tab="style" title="Form Shape" expandedSection={expandedSection} toggleSection={toggleSection}>
                                        <div className="input-group">
                                            <label className="input-label">Border Radius (px)</label>
                                            <div style={{ padding: '0 8px', width: '100%' }}>
                                                <RangeSlider
                                                    labelHidden
                                                    label="Border Radius"
                                                    min={0}
                                                    max={24}
                                                    value={borderRadius}
                                                    onChange={(val) => setBorderRadius(Number(val))}
                                                    output
                                                />
                                            </div>
                                            <p className="setting-helper">Controls the roundness of the modal corners.</p>
                                        </div>
                                    </AccordionSection>

                                    {/* Modal Display Options */}
                                    <AccordionSection id="modal-display" tab="style" title="Modal Display Options" expandedSection={expandedSection} toggleSection={toggleSection}>
                                        <div className="toggle-options">
                                            <div className="toggle-option" onClick={() => setShowProductImage(!showProductImage)}>
                                                <span className="toggle-option-label">Show Product Image in Modal</span>
                                                <div className={`mini-toggle ${showProductImage ? 'on' : 'off'}`} />
                                            </div>
                                            <div className="toggle-option" onClick={() => setShowPrice(!showPrice)}>
                                                <span className="toggle-option-label">Show Price in Modal</span>
                                                <div className={`mini-toggle ${showPrice ? 'on' : 'off'}`} />
                                            </div>
                                        </div>
                                    </AccordionSection>

                                    {/* Restore to Default */}
                                    <div style={{ padding: '12px 16px' }}>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setModalStyle('modern');
                                                setAnimationStyle('fade');
                                                setBorderRadius(12);
                                                setShowProductImage(true);
                                                setShowPrice(true);
                                            }}
                                            style={{ padding: '10px 16px', fontSize: 13, fontWeight: 600, color: '#202223', background: '#F6F6F7', border: '2px solid #202223', borderRadius: 10, cursor: 'pointer' }}
                                        >
                                            Restore All to Default
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Preview Panel - Hidden on Shipping tab */}
                        <div className="builder-right" style={activeTab === 'shipping' ? { display: 'none' } : undefined}>
                            <PreviewDisplay
                                showProductImage={showProductImage}
                                showPrice={showPrice}
                                buttonText={buttonText}
                                formTitle={formTitle}
                                namePlaceholder={namePlaceholder}
                                phonePlaceholder={phonePlaceholder}
                                addressPlaceholder={addressPlaceholder}
                                notesPlaceholder={notesPlaceholder}
                                submitButtonText={submitButtonText}
                                primaryColor={primaryColor}
                                buttonStyle={buttonStyle}
                                buttonSize={buttonSize}
                                borderRadius={borderRadius}
                                modalStyle={modalStyle}
                                animationStyle={animationStyle}
                                fields={fields}
                                formStyles={formStyles}
                                buttonStylesState={buttonStylesState}
                                blocks={blocks}
                                shippingOpts={shippingOpts}
                                shippingRates={shippingRates}
                                shippingRatesEnabled={shippingRatesEnabled}
                                activeTab={activeTab}
                                fmtCurrency={fmtCurrency}
                                currencySymbol={currencySymbol}
                            />
                        </div>

                    </div>
                </div>

                {/* Shipping Rate Delete Confirmation Modal */}
                <Modal
                    open={!!rateToDelete}
                    onClose={() => setRateToDelete(null)}
                    title={`Delete "${rateToDelete?.name || 'Untitled'}"`}
                    primaryAction={{
                        content: 'Delete',
                        destructive: true,
                        onAction: () => {
                            if (rateToDelete) {
                                setPendingShippingOps(prev => [...prev, { type: 'delete', rateId: rateToDelete.id! }]);
                                setShippingRates(prev => prev.filter(r => r.id !== rateToDelete.id));
                            }
                            setRateToDelete(null);
                        },
                    }}
                    secondaryActions={[{
                        content: 'Cancel',
                        onAction: () => setRateToDelete(null),
                    }]}
                >
                    <Modal.Section>
                        <Text as="p">Are you sure you want to delete this shipping rate? This cannot be undone.</Text>
                    </Modal.Section>
                </Modal>

                {/* Shipping Rate Modal */}
                {showShippingRateModal && (
                    <ShippingRateModal
                        rate={editingRate}
                        products={products}
                        collections={collections}
                        currencySymbol={currencySymbol}
                        onClose={() => {
                            setShowShippingRateModal(false);
                            setEditingRate(null);
                        }}
                        onSave={(rateData) => {
                            // Queue operation for save bar (don't submit immediately)
                            if (editingRate?.id) {
                                setPendingShippingOps(prev => [...prev, { type: 'update', rateId: editingRate.id, rateData }]);
                                // Optimistically update UI
                                setShippingRates(prev => prev.map(r => r.id === editingRate.id ? { ...r, ...rateData, id: r.id } : r));
                            } else {
                                const tempId = `temp_${Date.now()}`;
                                setPendingShippingOps(prev => [...prev, { type: 'create', rateData, rateId: tempId }]);
                                // Optimistically update UI
                                const newRate: ShippingRate = {
                                    ...rateData,
                                    id: tempId,
                                    shop_domain: shop,
                                    created_at: new Date().toISOString(),
                                    updated_at: new Date().toISOString(),
                                };
                                setShippingRates(prev => [newRate, ...prev]);
                            }
                            setShowShippingRateModal(false);
                            setEditingRate(null);
                        }}
                    />
                )}

                {/* Import from Shopify Modal */}
                {isImportingShipping && (
                    <ImportShippingModal
                        onClose={() => setIsImportingShipping(false)}
                        onImport={async (replaceExisting) => {
                            const formData = new FormData();
                            formData.append("action_type", "import_shopify_shipping");
                            formData.append("replace_existing", replaceExisting.toString());
                            submit(formData, { method: "post" });
                            setIsImportingShipping(false);
                        }}
                    />
                )}
            </s-page>
        </>
    );
}
