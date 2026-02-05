/**
 * Form Builder Settings Page - Premium COD Form Customization
 * Route: /app/settings
 * EasySell-inspired design with comprehensive options
 */

import { useState, useCallback, memo } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useSubmit, useNavigation, Link } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
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
        { key: "fields", type: "single_line_text_field" },  // Storing JSON as string
        { key: "blocks", type: "single_line_text_field" },  // Storing JSON as string
        { key: "custom_fields", type: "single_line_text_field" },  // Storing JSON as string
        { key: "styles", type: "single_line_text_field" },  // Storing JSON as string
        { key: "button_styles_json", type: "single_line_text_field" },  // Storing JSON as string
        { key: "shipping_options", type: "single_line_text_field" },  // Storing JSON as string
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
 * Loader: Fetch current settings from Supabase
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { session } = await authenticate.admin(request);
    const shopDomain = session.shop;

    const settings = await getFormSettings(shopDomain);

    let appUrl = process.env.SHOPIFY_APP_URL || '';
    if (!appUrl) {
        const url = new URL(request.url);
        appUrl = url.origin;
    }

    return {
        shop: shopDomain,
        settings: settings ? { ...defaultSettings, ...settings } : { ...defaultSettings, shop_domain: shopDomain },
        appUrl: appUrl,
    };
};

/**
 * Action: Save settings to Supabase AND Shopify Metafields
 */
export const action = async ({ request }: ActionFunctionArgs) => {
    const { session, admin } = await authenticate.admin(request);
    const shopDomain = session.shop;

    const formData = await request.formData();

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
        custom_fields: JSON.parse(formData.get("custom_fields") as string || "[]"),
        styles: JSON.parse(formData.get("styles") as string || JSON.stringify(defaultSettings.styles)),
        button_styles: JSON.parse(formData.get("button_styles") as string || JSON.stringify(defaultSettings.button_styles)),
        shipping_options: JSON.parse(formData.get("shipping_options") as string || JSON.stringify(defaultSettings.shipping_options)),
    };

    // Save to Supabase
    await saveFormSettings(settings);

    // Get app URL for metafields - auto-detect from request
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
                    { ownerId: shopGid, namespace: "fox_cod", key: "custom_fields", value: JSON.stringify(settings.custom_fields || []), type: "json" },
                    { ownerId: shopGid, namespace: "fox_cod", key: "styles", value: JSON.stringify(settings.styles || DEFAULT_STYLES), type: "json" },
                    { ownerId: shopGid, namespace: "fox_cod", key: "button_styles_json", value: JSON.stringify(settings.button_styles || DEFAULT_BUTTON_STYLES), type: "json" },
                    { ownerId: shopGid, namespace: "fox_cod", key: "shipping_options", value: JSON.stringify(settings.shipping_options || DEFAULT_SHIPPING_OPTIONS), type: "json" },
                ]
            }
        });

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
    fields, formStyles, buttonStylesState, blocks, shippingOpts, activeTab
}: any) => {

    // Calculate button styles - use primaryColor as the main color
    const getButtonStyle = () => {
        const buttonColor = primaryColor; // Use primaryColor directly
        const base: any = {
            width: '100%',
            padding: buttonSize === 'small' ? '10px' : buttonSize === 'large' ? '16px' : '13px',
            borderRadius: (buttonStylesState?.borderRadius || borderRadius) + 'px',
            fontWeight: 600,
            fontSize: buttonSize === 'small' ? '13px' : buttonSize === 'large' ? '15px' : '14px',
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            color: 'white',
            background: buttonColor,
            boxShadow: buttonStylesState?.shadow ? '0 4px 6px rgba(0,0,0,0.1)' : 'none'
        };

        if (buttonStyle === 'outline') {
            base.background = 'none'; // Use 'none' instead of 'transparent'
            base.backgroundColor = 'transparent';
            base.border = `2px solid ${buttonColor}`;
            base.color = buttonColor;
            base.boxShadow = 'none';
        } else if (buttonStyle === 'gradient') {
            const darkColor = darkenColor(buttonColor, 25);
            base.background = `linear-gradient(135deg, ${buttonColor} 0%, ${darkColor} 100%)`;
            base.boxShadow = buttonStylesState?.shadow ? '0 6px 12px rgba(0,0,0,0.2)' : 'none';
        }
        return base;
    };

    // Get modal container styles based on modalStyle and formStyles
    const getModalStyle = () => {
        const base: any = {
            borderRadius: (formStyles?.borderRadius || borderRadius) + 'px',
            padding: '16px',
            marginTop: '12px',
            transition: 'all 0.3s ease',
            background: formStyles?.backgroundColor || '#f9fafb',
            boxShadow: formStyles?.shadow ? '0 10px 25px rgba(0,0,0,0.1)' : 'none'
        };

        if (modalStyle === 'glassmorphism') {
            base.background = 'rgba(255, 255, 255, 0.7)';
            base.backdropFilter = 'blur(10px)';
            base.border = '1px solid rgba(255,255,255,0.3)';
            base.boxShadow = formStyles?.shadow ? '0 8px 32px rgba(0,0,0,0.1)' : 'none';
        } else if (modalStyle === 'minimal') {
            base.background = formStyles?.backgroundColor || '#ffffff';
            base.border = '1px solid #e5e7eb';
            base.boxShadow = 'none';
        }
        return base;
    };

    // Get label styles
    const getLabelStyle = () => ({
        display: 'block',
        fontSize: '11px',
        fontWeight: 600,
        color: formStyles?.textColor || '#374151',
        marginBottom: '4px',
        textAlign: formStyles?.labelAlignment || 'left'
    });

    // Get input styles
    const getInputStyle = () => ({
        width: '100%',
        padding: '10px 12px',
        marginBottom: '8px',
        border: '1px solid #e5e7eb',
        borderRadius: (formStyles?.borderRadius || 8) + 'px',
        fontSize: '12px',
        boxSizing: 'border-box' as const,
        background: '#ffffff'
    });

    // Animation indicator
    const getAnimationLabel = () => {
        if (animationStyle === 'slide') return '↗ Slide';
        if (animationStyle === 'scale') return '⚡ Scale';
        return '✨ Fade';
    };

    // Field icons for live preview (matching cod-form.js)
    const FieldIcon = ({ fieldId }: { fieldId: string }) => {
        const iconStyle = { width: 14, height: 14, display: 'inline-block', verticalAlign: 'middle', marginRight: 6, color: '#6b7280' };
        const icons: Record<string, React.ReactNode> = {
            phone: <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>,
            name: <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>,
            email: <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>,
            address: <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>,
            notes: <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14,2 14,8 20,8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10,9 9,9 8,9" /></svg>,
            quantity: <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="9" y1="9" x2="15" y2="15" /><line x1="15" y1="9" x2="9" y2="15" /></svg>,
            zip: <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>,
            state: <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>,
            city: <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>,
            marketing: <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>,
        };
        return icons[fieldId] || icons.name;
    };

    // Get visible fields sorted by order
    const visibleFields = (fields || []).filter((f: FormField) => f.visible).sort((a: FormField, b: FormField) => a.order - b.order);

    // Sample price values for rate card
    const subtotal = 1999;
    const discount = 200;
    const shippingCost = shippingOpts?.enabled ? (shippingOpts.options?.find((o: any) => o.id === shippingOpts.defaultOption)?.price || 0) : 0;
    const total = subtotal - discount + shippingCost;

    return (
        <div className="preview-panel">
            <div className="preview-header">
                <h3>📱 Live Preview</h3>
                <span style={{ fontSize: '11px', color: '#6b7280', background: '#f3f4f6', padding: '4px 8px', borderRadius: '6px' }}>
                    {getAnimationLabel()} | {modalStyle.charAt(0).toUpperCase() + modalStyle.slice(1)}
                </span>
            </div>
            <div className="preview-content">
                <div className="preview-phone">
                    <div className="preview-phone-screen">
                        <div className="preview-product" style={activeTab === 'button' ? { padding: '24px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' } : undefined}>
                            {/* Only show image and price when NOT on button tab */}
                            {activeTab !== 'button' && showProductImage && (
                                <div className="preview-product-img">📦</div>
                            )}
                            {activeTab !== 'button' && (
                                <div className="preview-product-title">Sample Product</div>
                            )}
                            {activeTab !== 'button' && showPrice && (
                                <div className="preview-product-price">₹1,999</div>
                            )}
                            <button style={{ ...getButtonStyle(), ...(activeTab === 'button' ? { maxWidth: '200px', width: '100%' } : { width: '100%' }) }}>
                                {buttonText || 'Buy with COD'}
                            </button>
                            {/* Only show form when NOT on button tab */}
                            {activeTab !== 'button' && (
                                <div className="preview-modal" style={getModalStyle()}>
                                    <div className="preview-modal-title" style={{
                                        fontWeight: 600,
                                        marginBottom: '12px',
                                        color: formStyles?.textColor || '#111',
                                        textAlign: formStyles?.labelAlignment || 'left'
                                    }}>
                                        {formTitle || 'Cash on Delivery'}
                                    </div>

                                    {/* Dynamic Fields based on visibility */}
                                    {visibleFields.map((field: FormField) => (
                                        <div key={field.id} style={{ marginBottom: '8px' }}>
                                            <label style={{ ...getLabelStyle(), display: 'flex', alignItems: 'center', gap: 6 } as any}>
                                                <FieldIcon fieldId={field.id} />
                                                {field.label} {field.required && <span style={{ color: '#ef4444' }}>*</span>}
                                            </label>
                                            {field.type === 'textarea' ? (
                                                <textarea
                                                    style={{ ...getInputStyle(), height: '50px', resize: 'none' }}
                                                    placeholder={
                                                        field.id === 'address' ? (addressPlaceholder || 'Enter address') :
                                                            field.id === 'notes' ? (notesPlaceholder || 'Any notes...') :
                                                                `Enter ${field.label.toLowerCase()}`
                                                    }
                                                    disabled
                                                />
                                            ) : field.type === 'checkbox' ? (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                                    <input type="checkbox" disabled style={{ width: '16px', height: '16px' }} />
                                                    <span style={{ fontSize: '11px', color: '#6b7280' }}>{field.label}</span>
                                                </div>
                                            ) : (
                                                <input
                                                    type={field.type === 'tel' ? 'tel' : field.type === 'email' ? 'email' : field.type === 'number' ? 'number' : 'text'}
                                                    style={getInputStyle()}
                                                    placeholder={
                                                        field.id === 'name' ? (namePlaceholder || 'John Doe') :
                                                            field.id === 'phone' ? (phonePlaceholder || '+91 98765 43210') :
                                                                field.id === 'email' ? 'email@example.com' :
                                                                    `Enter ${field.label.toLowerCase()}`
                                                    }
                                                    disabled
                                                />
                                            )}
                                        </div>
                                    ))}

                                    {/* Rate Card - Order Summary */}
                                    {blocks?.order_summary && (
                                        <div style={{
                                            background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                                            borderRadius: '10px',
                                            padding: '12px',
                                            marginTop: '12px',
                                            marginBottom: '12px',
                                            border: '1px solid #e2e8f0'
                                        }}>
                                            <div style={{ fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                🧾 Order Summary
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#6b7280', marginBottom: '6px' }}>
                                                <span>Subtotal</span>
                                                <span>₹{subtotal.toLocaleString()}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#10b981', marginBottom: '6px' }}>
                                                <span>Discount</span>
                                                <span>-₹{discount.toLocaleString()}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#6b7280', marginBottom: '8px' }}>
                                                <span>Shipping</span>
                                                <span>{shippingCost === 0 ? 'FREE' : `₹${shippingCost}`}</span>
                                            </div>
                                            <div style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                fontSize: '13px',
                                                fontWeight: 700,
                                                color: '#111827',
                                                paddingTop: '8px',
                                                borderTop: '1px dashed #d1d5db'
                                            }}>
                                                <span>Total</span>
                                                <span style={{ color: primaryColor }}>₹{total.toLocaleString()}</span>
                                            </div>
                                        </div>
                                    )}

                                    {/* Shipping Options */}
                                    {blocks?.shipping_options && shippingOpts?.enabled && (
                                        <div style={{
                                            background: '#f8fafc',
                                            borderRadius: '8px',
                                            padding: '10px',
                                            marginBottom: '10px',
                                            border: '1px solid #e2e8f0'
                                        }}>
                                            <div style={{ fontSize: '11px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>
                                                🚚 Shipping
                                            </div>
                                            {shippingOpts.options?.slice(0, 2).map((opt: any) => (
                                                <div key={opt.id} style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    fontSize: '10px',
                                                    color: '#6b7280',
                                                    marginBottom: '4px'
                                                }}>
                                                    <input type="radio" name="shipping-preview" disabled checked={opt.id === shippingOpts.defaultOption} style={{ width: '12px', height: '12px' }} />
                                                    <span>{opt.label}</span>
                                                    <span style={{ marginLeft: 'auto', fontWeight: 600 }}>{opt.price === 0 ? 'Free' : `₹${opt.price}`}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Buyer Marketing Checkbox */}
                                    {blocks?.buyer_marketing && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', fontSize: '10px', color: '#6b7280' }}>
                                            <input type="checkbox" disabled style={{ width: '14px', height: '14px' }} />
                                            <span>Keep me updated with offers & news</span>
                                        </div>
                                    )}

                                    <button className="preview-submit" style={{
                                        background: buttonStyle === 'outline'
                                            ? 'transparent'
                                            : buttonStyle === 'gradient'
                                                ? `linear-gradient(135deg, ${primaryColor} 0%, ${darkenColor(primaryColor, 25)} 100%)`
                                                : primaryColor,
                                        border: buttonStyle === 'outline' ? `2px solid ${primaryColor}` : 'none',
                                        borderRadius: (buttonStylesState?.borderRadius || borderRadius) + 'px',
                                        color: buttonStyle === 'outline' ? primaryColor : '#ffffff',
                                        boxShadow: buttonStylesState?.shadow ? '0 4px 6px rgba(0,0,0,0.1)' : 'none'
                                    }}>
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

const SortableFieldItem = ({ field, onToggleVisibility, onToggleRequired, isCustom, onRemove }: SortableFieldItemProps) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id });

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
                <span className="field-type">{field.type}</span>
            </div>
            <div className="field-actions">
                <button
                    type="button"
                    className={`icon-btn visibility-btn ${field.visible ? 'active' : ''}`}
                    onClick={() => onToggleVisibility(field.id)}
                    title={field.visible ? 'Hide field' : 'Show field'}
                >
                    {field.visible ? '👁️' : '👁️‍🗨️'}
                </button>
                <button
                    type="button"
                    className={`icon-btn required-btn ${field.required ? 'active' : ''}`}
                    onClick={() => onToggleRequired(field.id)}
                    title={field.required ? 'Make optional' : 'Make required'}
                >
                    ✱
                </button>
                {isCustom && onRemove && (
                    <button
                        type="button"
                        className="icon-btn remove-btn"
                        onClick={() => onRemove(field.id)}
                        title="Remove field"
                    >
                        🗑️
                    </button>
                )}
            </div>
        </div>
    );
};

/**
 * Settings Page Component - Premium Form Builder
 */
export default function SettingsPage() {
    const { shop, settings } = useLoaderData<typeof loader>();
    const submit = useSubmit();
    const navigation = useNavigation();
    const shopify = useAppBridge();

    const isSubmitting = navigation.state === "submitting";
    const [activeTab, setActiveTab] = useState<'button' | 'form' | 'style'>('button');

    // Local state for all form fields
    const [enabled, setEnabled] = useState(settings.enabled);
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
    const [fields, setFields] = useState<FormField[]>(settings.fields || DEFAULT_FIELDS);
    const [blocks, setBlocks] = useState<ContentBlocks>(settings.blocks || DEFAULT_BLOCKS);
    const [customFields, setCustomFields] = useState<FormField[]>(settings.custom_fields || []);
    const [formStyles, setFormStyles] = useState<FormStyles>(settings.styles || DEFAULT_STYLES);
    const [buttonStylesState, setButtonStylesState] = useState<ButtonStyles>(settings.button_styles || DEFAULT_BUTTON_STYLES);
    const [shippingOpts, setShippingOpts] = useState<ShippingOptions>(settings.shipping_options || DEFAULT_SHIPPING_OPTIONS);
    const [showAddFieldModal, setShowAddFieldModal] = useState(false);
    const [newFieldType, setNewFieldType] = useState<'text' | 'number' | 'dropdown' | 'checkbox'>('text');
    const [newFieldLabel, setNewFieldLabel] = useState('');

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

    // Toggle field visibility
    const toggleFieldVisibility = useCallback((fieldId: string) => {
        setFields((prev) => prev.map((f) =>
            f.id === fieldId ? { ...f, visible: !f.visible } : f
        ));
    }, []);

    // Toggle field required
    const toggleFieldRequired = useCallback((fieldId: string) => {
        setFields((prev) => prev.map((f) =>
            f.id === fieldId ? { ...f, required: !f.required } : f
        ));
    }, []);

    // Add custom field
    const addCustomField = useCallback(() => {
        if (!newFieldLabel.trim()) return;
        const newField: FormField = {
            id: `custom_${Date.now()}`,
            label: newFieldLabel,
            type: newFieldType,
            visible: true,
            required: false,
            order: fields.length + customFields.length + 1,
        };
        setCustomFields((prev) => [...prev, newField]);
        setNewFieldLabel('');
        setShowAddFieldModal(false);
    }, [newFieldLabel, newFieldType, fields.length, customFields.length]);

    // Remove custom field
    const removeCustomField = useCallback((fieldId: string) => {
        setCustomFields((prev) => prev.filter((f) => f.id !== fieldId));
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
        formData.append("custom_fields", JSON.stringify(customFields));
        formData.append("styles", JSON.stringify(formStyles));
        formData.append("button_styles", JSON.stringify(buttonStylesState));
        formData.append("shipping_options", JSON.stringify(shippingOpts));

        submit(formData, { method: "post" });
        shopify.toast.show("Settings saved successfully!");
    }, [
        enabled, buttonText, primaryColor, requiredFields, maxQuantity,
        buttonStyle, buttonSize, buttonPosition, formTitle, formSubtitle,
        successMessage, submitButtonText, showProductImage, showPrice,
        showQuantitySelector, showEmailField, showNotesField, emailRequired,
        namePlaceholder, phonePlaceholder, addressPlaceholder, notesPlaceholder,
        modalStyle, animationStyle, borderRadius, formType, fields, blocks,
        customFields, formStyles, buttonStylesState, shippingOpts, submit, shopify
    ]);

    // Color presets
    const colorPresets = [
        "#6366f1", "#8b5cf6", "#ec4899", "#ef4444", "#f59e0b",
        "#10b981", "#06b6d4", "#3b82f6", "#000000"
    ];

    return (
        <>
            <style>{`
                /* Prevent horizontal scrolling globally */
                html, body { overflow-x: clip !important; max-width: 100vw !important; }
                
                .form-builder {
                    max-width: 1200px;
                    margin: 0 auto;
                    padding: 0; 
                    box-sizing: border-box; 
                    overflow-x: hidden;
                }
                .builder-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 24px;
                    padding-bottom: 24px;
                    border-bottom: 1px solid #e5e7eb;
                }
                .builder-header-left { display: flex; align-items: center; gap: 16px; }
                .back-btn { width: 44px; height: 44px; border-radius: 12px; border: 1px solid #e5e7eb; background: white; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 18px; text-decoration: none; color: #374151; transition: all 0.2s ease; }
                .save-btn { padding: 14px 28px; border-radius: 12px; font-weight: 600; font-size: 14px; border: none; cursor: pointer; transition: all 0.2s ease; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; }
                .builder-title h1 { font-size: 24px; font-weight: 700; color: #111827; margin: 0 0 4px 0; }
                .builder-title p { font-size: 14px; color: #6b7280; margin: 0; }
                .main-toggle { background: ${enabled ? 'rgba(16, 185, 129, 0.1)' : '#f9fafb'}; border: 2px solid ${enabled ? '#10b981' : '#e5e7eb'}; border-radius: 16px; padding: 20px 24px; margin-bottom: 24px; display: flex; align-items: center; justify-content: space-between; }
                .toggle-info h3 { font-size: 16px; font-weight: 600; color: #111827; margin: 0 0 4px 0; }
                .toggle-switch { width: 56px; height: 32px; background: ${enabled ? '#10b981' : '#d1d5db'}; border-radius: 16px; position: relative; cursor: pointer; transition: background 0.2s ease; }
                .toggle-switch::after { content: ''; position: absolute; width: 26px; height: 26px; background: white; border-radius: 50%; top: 3px; left: ${enabled ? '27px' : '3px'}; transition: left 0.2s ease; box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
                .tabs { display: flex; gap: 8px; margin-bottom: 24px; background: #f3f4f6; padding: 6px; border-radius: 12px; }
                .tab { flex: 1; padding: 14px 20px; border: none; background: transparent; border-radius: 8px; font-size: 14px; font-weight: 600; color: #6b7280; cursor: pointer; }
                .tab.active { background: white; color: #111827; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
                .builder-layout { display: grid; grid-template-columns: 1fr 380px; gap: 24px; align-items: start; min-height: 0; }
                .settings-card { background: white; border: 1px solid #e5e7eb; border-radius: 16px; padding: 24px; margin-bottom: 20px; }
                .card-title { font-size: 15px; font-weight: 600; color: #111827; margin: 0 0 16px 0; }
                .input-field { width: 100%; padding: 12px 16px; border: 1px solid #e5e7eb; border-radius: 10px; font-size: 14px; color: #111827; transition: all 0.2s ease; box-sizing: border-box; }
                .color-presets { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
                .color-preset { width: 32px; height: 32px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; transition: all 0.2s ease; }
                .color-preset:hover { transform: scale(1.1); }
                .color-preset.active { border: 2px solid #111827; box-shadow: none; }
                .custom-color { position: relative; width: 32px; height: 32px; }
                .custom-color input[type="color"] { 
                    width: 32px; 
                    height: 32px; 
                    border-radius: 50%; 
                    border: 2px dashed #d1d5db; 
                    cursor: pointer; 
                    padding: 0; 
                    background: conic-gradient(red, yellow, lime, aqua, blue, magenta, red);
                    -webkit-appearance: none;
                    appearance: none;
                    overflow: hidden;
                }
                .custom-color input[type="color"]::-webkit-color-swatch-wrapper { padding: 0; border-radius: 50%; }
                .custom-color input[type="color"]::-webkit-color-swatch { border: none; border-radius: 50%; }
                .custom-color input[type="color"]::-moz-color-swatch { border: none; border-radius: 50%; }
                .custom-color input[type="color"]:hover { transform: scale(1.1); border-color: #9ca3af; }
                .style-options { display: flex; gap: 10px; flex-wrap: wrap; }
                .style-option { padding: 10px 18px; border-radius: 10px; border: 2px solid #e5e7eb; background: white; font-size: 13px; font-weight: 600; color: #6b7280; cursor: pointer; }
                .style-option.active { border-color: #6366f1; background: rgba(99, 102, 241, 0.05); color: #6366f1; }
                .checkbox-option { display: flex; align-items: center; gap: 12px; padding: 12px 14px; background: #f9fafb; border-radius: 10px; cursor: pointer; }
                .checkbox-option.checked { background: rgba(99, 102, 241, 0.1); }
                .toggle-option { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; background: #f9fafb; border-radius: 10px; cursor: pointer; margin-bottom: 10px; }
                .mini-toggle { width: 44px; height: 24px; border-radius: 12px; position: relative; transition: background 0.2s ease; }
                .mini-toggle::after { content: ''; position: absolute; width: 18px; height: 18px; background: white; border-radius: 50%; top: 3px; transition: left 0.2s ease; box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
                .mini-toggle.on { background: #10b981; }
                .mini-toggle.on::after { left: 23px; }
                .mini-toggle.off { background: #d1d5db; }
                .mini-toggle.off::after { left: 3px; }
                .preview-panel { background: white; border: 1px solid #e5e7eb; border-radius: 16px; overflow: visible; position: sticky; top: 20px; align-self: flex-start; }
                .preview-header { background: #f9fafb; padding: 16px 20px; border-bottom: 1px solid #e5e7eb; }
                .preview-content { padding: 24px; }
                .preview-phone { background: #1f2937; border-radius: 32px; padding: 6px; max-width: 300px; margin: 0 auto; }
                .preview-phone-screen { background: white; border-radius: 24px; overflow-y: auto; min-height: 550px; max-height: 600px; }
                .preview-product { padding: 16px; }
                .preview-product-img { width: 100%; height: 100px; background: linear-gradient(135deg, #e5e7eb 0%, #d1d5db 100%); border-radius: 12px; margin-bottom: 12px; display: flex; align-items: center; justify-content: center; }
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
                .sortable-field-item:hover { border-color: #6366f1; box-shadow: 0 2px 8px rgba(99, 102, 241, 0.1); }
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
                .add-field-btn:hover { border-color: #6366f1; color: #6366f1; background: rgba(99, 102, 241, 0.05); }
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
                .modal-btn.confirm { background: #6366f1; color: white; }

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
                    .builder-header { padding: 20px; border-radius: 16px; flex-direction: column; gap: 16px; align-items: stretch; }
                    .builder-header-left { gap: 12px; }
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
                    .preview-phone-screen { border-radius: 18px; min-height: 320px; }
                }
                
                @media (max-width: 480px) {
                    .form-builder { padding: 0 12px; }
                    .builder-header { padding: 16px; }
                    .back-btn { width: 38px; height: 38px; font-size: 16px; }
                    .builder-title h1 { font-size: 18px; }
                    .builder-title p { font-size: 12px; }
                    .tabs { gap: 4px; }
                    .tab-btn { padding: 8px 12px; }
                    .toggle-switch { width: 48px; height: 26px; }
                }
            `}</style>

            <s-page heading="">
                <div className="form-builder">
                    {/* Header */}
                    <div className="builder-header">
                        <div className="builder-header-left">
                            <Link to="/app" className="back-btn">←</Link>
                            <div className="builder-title">
                                <h1>🎨 Form Builder</h1>
                                <p>Customize your COD checkout form</p>
                            </div>
                        </div>
                        <button
                            className="save-btn"
                            onClick={handleSave}
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? 'Saving...' : '💾 Save Changes'}
                        </button>
                    </div>

                    {/* Main Toggle */}
                    <div className="main-toggle">
                        <div className="toggle-info">
                            <h3>
                                {enabled ? '✅' : '⚪'} COD Form Status
                            </h3>
                            <p>{enabled ? 'Your COD form is live on product pages' : 'Enable to show COD form on your store'}</p>
                        </div>
                        <div
                            className="toggle-switch"
                            onClick={() => setEnabled(!enabled)}
                        />
                    </div>

                    {/* Tabs */}
                    <div className="tabs">
                        <button
                            className={`tab ${activeTab === 'button' ? 'active' : ''}`}
                            onClick={() => setActiveTab('button')}
                        >
                            🔘 Button
                        </button>
                        <button
                            className={`tab ${activeTab === 'form' ? 'active' : ''}`}
                            onClick={() => setActiveTab('form')}
                        >
                            📝 Form Fields
                        </button>
                        <button
                            className={`tab ${activeTab === 'style' ? 'active' : ''}`}
                            onClick={() => setActiveTab('style')}
                        >
                            ✨ Style
                        </button>
                    </div>

                    {/* Layout */}
                    <div className="builder-layout">
                        <div className="settings-area">
                            {/* Button Tab */}
                            {activeTab === 'button' && (
                                <>
                                    <div className="settings-card">
                                        <h3 className="card-title"><span>📝</span> Button Text</h3>
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
                                    </div>

                                    <div className="settings-card">
                                        <h3 className="card-title"><span>🎨</span> Button Color</h3>
                                        <div className="color-picker">
                                            <div className="color-presets">
                                                {colorPresets.map((color) => (
                                                    <div
                                                        key={color}
                                                        className={`color-preset ${primaryColor === color ? 'active' : ''}`}
                                                        style={{ background: color }}
                                                        onClick={() => setPrimaryColor(color)}
                                                    />
                                                ))}
                                                <div className="custom-color">
                                                    <input
                                                        type="color"
                                                        value={primaryColor}
                                                        onChange={(e) => setPrimaryColor(e.target.value)}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="settings-card">
                                        <h3 className="card-title"><span>🔲</span> Button Style</h3>
                                        <div className="style-options">
                                            {['solid', 'outline', 'gradient'].map((style) => (
                                                <button
                                                    key={style}
                                                    className={`style-option ${buttonStyle === style ? 'active' : ''}`}
                                                    onClick={() => setButtonStyle(style as any)}
                                                >
                                                    {style.charAt(0).toUpperCase() + style.slice(1)}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="settings-card">
                                        <h3 className="card-title"><span>📐</span> Button Size</h3>
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
                                </>
                            )}

                            {/* Form Tab */}
                            {activeTab === 'form' && (
                                <>
                                    {/* Form Type Selector */}
                                    <div className="settings-card">
                                        <h3 className="card-title"><span>📱</span> Form Type</h3>
                                        <div className="form-type-selector">
                                            <div
                                                className={`form-type-option ${formType === 'popup' ? 'active' : ''}`}
                                                onClick={() => setFormType('popup')}
                                            >
                                                <div className="form-type-icon">🪟</div>
                                                <div className="form-type-label">Popup Modal</div>
                                            </div>
                                            <div
                                                className={`form-type-option ${formType === 'embedded' ? 'active' : ''}`}
                                                onClick={() => setFormType('embedded')}
                                            >
                                                <div className="form-type-icon">📄</div>
                                                <div className="form-type-label">Embedded Form</div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Drag & Drop Fields */}
                                    <div className="settings-card">
                                        <h3 className="card-title"><span>📋</span> Form Fields</h3>
                                        <p style={{ color: '#6b7280', fontSize: '13px', marginBottom: '16px' }}>
                                            Drag to reorder • 👁️ visibility • ✱ required
                                        </p>
                                        <div className="sortable-fields-container">
                                            <DndContext
                                                sensors={sensors}
                                                collisionDetection={closestCenter}
                                                onDragEnd={handleDragEnd}
                                            >
                                                <SortableContext
                                                    items={fields.map(f => f.id)}
                                                    strategy={verticalListSortingStrategy}
                                                >
                                                    {fields.sort((a, b) => a.order - b.order).map((field) => (
                                                        <SortableFieldItem
                                                            key={field.id}
                                                            field={field}
                                                            onToggleVisibility={toggleFieldVisibility}
                                                            onToggleRequired={toggleFieldRequired}
                                                        />
                                                    ))}
                                                </SortableContext>
                                            </DndContext>

                                            {/* Custom Fields */}
                                            {customFields.map((field) => (
                                                <SortableFieldItem
                                                    key={field.id}
                                                    field={field}
                                                    onToggleVisibility={(id) => setCustomFields(prev => prev.map(f => f.id === id ? { ...f, visible: !f.visible } : f))}
                                                    onToggleRequired={(id) => setCustomFields(prev => prev.map(f => f.id === id ? { ...f, required: !f.required } : f))}
                                                    isCustom
                                                    onRemove={removeCustomField}
                                                />
                                            ))}

                                            <button
                                                type="button"
                                                className="add-field-btn"
                                                onClick={() => setShowAddFieldModal(true)}
                                            >
                                                + Add Custom Field
                                            </button>
                                        </div>
                                    </div>

                                    {/* Content Blocks */}
                                    <div className="settings-card">
                                        <h3 className="card-title"><span>🧩</span> Content Blocks</h3>
                                        <div className="toggle-options">
                                            <div className="toggle-option" onClick={() => setBlocks({ ...blocks, order_summary: !blocks.order_summary })}>
                                                <span className="toggle-option-label">Order Summary</span>
                                                <div className={`mini-toggle ${blocks.order_summary ? 'on' : 'off'}`} />
                                            </div>
                                            <div className="toggle-option" onClick={() => setBlocks({ ...blocks, shipping_options: !blocks.shipping_options })}>
                                                <span className="toggle-option-label">Shipping Options</span>
                                                <div className={`mini-toggle ${blocks.shipping_options ? 'on' : 'off'}`} />
                                            </div>
                                            <div className="toggle-option" onClick={() => setBlocks({ ...blocks, cart_quantity_offers: !blocks.cart_quantity_offers })}>
                                                <span className="toggle-option-label">Cart Content / Quantity Offers</span>
                                                <div className={`mini-toggle ${blocks.cart_quantity_offers ? 'on' : 'off'}`} />
                                            </div>
                                            <div className="toggle-option" onClick={() => setBlocks({ ...blocks, buyer_marketing: !blocks.buyer_marketing })}>
                                                <span className="toggle-option-label">Buyer Accepts Marketing</span>
                                                <div className={`mini-toggle ${blocks.buyer_marketing ? 'on' : 'off'}`} />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Shipping Options */}
                                    <div className="settings-card">
                                        <h3 className="card-title"><span>🚚</span> Shipping Options</h3>
                                        <div className="toggle-options">
                                            <div className="toggle-option" onClick={() => setShippingOpts({ ...shippingOpts, enabled: !shippingOpts.enabled })}>
                                                <span className="toggle-option-label">Enable Shipping Options</span>
                                                <div className={`mini-toggle ${shippingOpts.enabled ? 'on' : 'off'}`} />
                                            </div>
                                        </div>
                                        {shippingOpts.enabled && (
                                            <div className="input-group" style={{ marginTop: '16px' }}>
                                                <label className="input-label">Default Shipping Option</label>
                                                <select
                                                    className="input-field"
                                                    value={shippingOpts.defaultOption}
                                                    onChange={(e) => setShippingOpts({ ...shippingOpts, defaultOption: e.target.value })}
                                                >
                                                    {shippingOpts.options.map(opt => (
                                                        <option key={opt.id} value={opt.id}>{opt.label} - {opt.price === 0 ? 'Free' : `₹${opt.price}`}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}
                                    </div>

                                    {/* Order Settings */}
                                    <div className="settings-card">
                                        <h3 className="card-title"><span>📦</span> Order Settings</h3>
                                        <div className="input-group">
                                            <label className="input-label">Maximum Quantity per Order</label>
                                            <div className="range-group" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                                <input
                                                    type="range"
                                                    className="range-slider"
                                                    min="1"
                                                    max="50"
                                                    value={maxQuantity}
                                                    onChange={(e) => setMaxQuantity(parseInt(e.target.value))}
                                                    style={{ flex: 1 }}
                                                />
                                                <span className="range-value">{maxQuantity}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Form Content */}
                                    <div className="settings-card">
                                        <h3 className="card-title"><span>✍️</span> Form Content</h3>
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
                                    </div>

                                    {/* Add Field Modal */}
                                    {showAddFieldModal && (
                                        <div className="modal-overlay" onClick={() => setShowAddFieldModal(false)}>
                                            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                                                <div className="modal-header">
                                                    <h3>Add Custom Field</h3>
                                                </div>
                                                <div className="modal-body">
                                                    <div className="modal-field">
                                                        <label>Field Type</label>
                                                        <select
                                                            value={newFieldType}
                                                            onChange={(e) => setNewFieldType(e.target.value as any)}
                                                        >
                                                            <option value="text">Text</option>
                                                            <option value="number">Number</option>
                                                            <option value="dropdown">Dropdown</option>
                                                            <option value="checkbox">Checkbox</option>
                                                        </select>
                                                    </div>
                                                    <div className="modal-field">
                                                        <label>Field Label</label>
                                                        <input
                                                            type="text"
                                                            value={newFieldLabel}
                                                            onChange={(e) => setNewFieldLabel(e.target.value)}
                                                            placeholder="Enter field label"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="modal-actions">
                                                    <button className="modal-btn cancel" onClick={() => setShowAddFieldModal(false)}>Cancel</button>
                                                    <button className="modal-btn confirm" onClick={addCustomField}>Add Field</button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}

                            {/* Style Tab */}
                            {activeTab === 'style' && (
                                <>
                                    <div className="settings-card">
                                        <h3 className="card-title"><span>🎭</span> Modal Style</h3>
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

                                    <div className="settings-card">
                                        <h3 className="card-title"><span>🎬</span> Animation</h3>
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

                                    <div className="settings-card">
                                        <h3 className="card-title"><span>⭕</span> Border Radius</h3>
                                        <div className="range-group" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                            <input
                                                type="range"
                                                className="range-slider"
                                                min="0"
                                                max="24"
                                                value={borderRadius}
                                                onChange={(e) => setBorderRadius(parseInt(e.target.value))}
                                                style={{ flex: 1 }}
                                            />
                                            <span className="range-value">{borderRadius}px</span>
                                        </div>
                                    </div>

                                    <div className="settings-card">
                                        <h3 className="card-title"><span>📱</span> Display Options</h3>
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
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Preview Panel - Memoized */}
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
                            activeTab={activeTab}
                        />
                    </div>
                </div>
            </s-page>
        </>
    );
}
