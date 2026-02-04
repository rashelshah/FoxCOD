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
import { getFormSettings, saveFormSettings, type FormSettings } from "../config/supabase.server";

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
};

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

    // Parse all form data
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

    // Sync to Shopify metafields
    try {
        const shopQuery = await admin.graphql(`query { shop { id } }`);
        const shopData = await shopQuery.json();
        const shopGid = shopData.data.shop.id;

        await admin.graphql(`
            mutation SetMetafields($metafields: [MetafieldsSetInput!]!) {
                metafieldsSet(metafields: $metafields) {
                    metafields { key value }
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
                    { ownerId: shopGid, namespace: "fox_cod", key: "required_fields", value: JSON.stringify(settings.required_fields), type: "json" },
                    { ownerId: shopGid, namespace: "fox_cod", key: "app_url", value: appUrl, type: "single_line_text_field" },
                    { ownerId: shopGid, namespace: "fox_cod", key: "form_title", value: settings.form_title || "", type: "single_line_text_field" },
                    { ownerId: shopGid, namespace: "fox_cod", key: "submit_button_text", value: settings.submit_button_text || "", type: "single_line_text_field" },
                    // Extended settings
                    { ownerId: shopGid, namespace: "fox_cod", key: "button_style", value: settings.button_style || "solid", type: "single_line_text_field" },
                    { ownerId: shopGid, namespace: "fox_cod", key: "button_size", value: settings.button_size || "large", type: "single_line_text_field" },
                    { ownerId: shopGid, namespace: "fox_cod", key: "button_position", value: settings.button_position || "below_atc", type: "single_line_text_field" },
                    { ownerId: shopGid, namespace: "fox_cod", key: "form_subtitle", value: settings.form_subtitle || "", type: "single_line_text_field" },
                    { ownerId: shopGid, namespace: "fox_cod", key: "success_message", value: settings.success_message || "", type: "single_line_text_field" },
                    { ownerId: shopGid, namespace: "fox_cod", key: "show_product_image", value: String(settings.show_product_image), type: "single_line_text_field" },
                    { ownerId: shopGid, namespace: "fox_cod", key: "show_price", value: String(settings.show_price), type: "single_line_text_field" },
                    { ownerId: shopGid, namespace: "fox_cod", key: "show_quantity_selector", value: String(settings.show_quantity_selector), type: "single_line_text_field" },
                    // Individual requirements for Liquid
                    { ownerId: shopGid, namespace: "fox_cod", key: "require_name", value: String(settings.required_fields.includes("name")), type: "single_line_text_field" },
                    { ownerId: shopGid, namespace: "fox_cod", key: "require_phone", value: String(settings.required_fields.includes("phone")), type: "single_line_text_field" },
                    { ownerId: shopGid, namespace: "fox_cod", key: "require_address", value: String(settings.required_fields.includes("address")), type: "single_line_text_field" },

                    { ownerId: shopGid, namespace: "fox_cod", key: "show_email_field", value: String(settings.show_email_field), type: "single_line_text_field" },
                    { ownerId: shopGid, namespace: "fox_cod", key: "show_notes_field", value: String(settings.show_notes_field), type: "single_line_text_field" },
                    { ownerId: shopGid, namespace: "fox_cod", key: "modal_style", value: settings.modal_style || 'modern', type: "single_line_text_field" },
                    { ownerId: shopGid, namespace: "fox_cod", key: "animation_style", value: settings.animation_style || 'fade', type: "single_line_text_field" },
                    { ownerId: shopGid, namespace: "fox_cod", key: "border_radius", value: (settings.border_radius ?? 12).toString(), type: "single_line_text_field" },
                ]
            }
        });
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
    requiredFields, namePlaceholder, phonePlaceholder, addressPlaceholder,
    showEmailField, showNotesField, notesPlaceholder, submitButtonText,
    primaryColor, buttonStyle, buttonSize, borderRadius, modalStyle, animationStyle
}: any) => {

    // Calculate button styles
    const getButtonStyle = () => {
        const base: any = {
            width: '100%',
            padding: buttonSize === 'small' ? '10px' : buttonSize === 'large' ? '16px' : '13px',
            borderRadius: borderRadius + 'px',
            fontWeight: 600,
            fontSize: buttonSize === 'small' ? '13px' : buttonSize === 'large' ? '15px' : '14px',
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            color: 'white',
            background: primaryColor,
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
        };

        if (buttonStyle === 'outline') {
            base.background = 'transparent';
            base.border = `2px solid ${primaryColor}`;
            base.color = primaryColor;
            base.boxShadow = 'none';
        } else if (buttonStyle === 'gradient') {
            // More visible gradient - primary to darker shade
            const darkColor = darkenColor(primaryColor, 25);
            base.background = `linear-gradient(135deg, ${primaryColor} 0%, ${darkColor} 100%)`;
            base.boxShadow = '0 6px 12px rgba(0,0,0,0.2)';
        }
        return base;
    };

    // Get modal container styles based on modalStyle setting
    const getModalStyle = () => {
        const base: any = {
            borderRadius: borderRadius + 'px',
            padding: '16px',
            marginTop: '12px',
            transition: 'all 0.3s ease'
        };

        if (modalStyle === 'glassmorphism') {
            base.background = 'rgba(255, 255, 255, 0.7)';
            base.backdropFilter = 'blur(10px)';
            base.border = '1px solid rgba(255,255,255,0.3)';
            base.boxShadow = '0 8px 32px rgba(0,0,0,0.1)';
        } else if (modalStyle === 'minimal') {
            base.background = '#ffffff';
            base.border = '1px solid #e5e7eb';
            base.boxShadow = 'none';
        } else {
            // modern (default)
            base.background = '#f9fafb';
            base.boxShadow = '0 10px 25px rgba(0,0,0,0.1)';
            base.border = 'none';
        }
        return base;
    };

    // Animation indicator
    const getAnimationLabel = () => {
        if (animationStyle === 'slide') return '↗ Slide';
        if (animationStyle === 'scale') return '⚡ Scale';
        return '✨ Fade';
    };

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
                        <div className="preview-product">
                            {showProductImage && (
                                <div className="preview-product-img">📦</div>
                            )}
                            <div className="preview-product-title">Sample Product</div>
                            {showPrice && (
                                <div className="preview-product-price">₹1,999</div>
                            )}
                            <button style={getButtonStyle()}>
                                {buttonText || 'Buy with COD'}
                            </button>
                            <div className="preview-modal" style={getModalStyle()}>
                                <div className="preview-modal-title" style={{ fontWeight: 600, marginBottom: '12px', color: '#111' }}>
                                    {formTitle || 'Cash on Delivery'}
                                </div>
                                {requiredFields.includes('name') && <input className="preview-input" placeholder={namePlaceholder || 'Full Name'} disabled />}
                                {requiredFields.includes('phone') && <input className="preview-input" placeholder={phonePlaceholder || 'Phone Number'} disabled />}
                                {requiredFields.includes('address') && <input className="preview-input" placeholder={addressPlaceholder || 'Delivery Address'} disabled />}
                                {showEmailField && <input className="preview-input" placeholder="Email (optional)" disabled />}
                                {showNotesField && <input className="preview-input" placeholder={notesPlaceholder || 'Notes'} disabled />}
                                <button className="preview-submit" style={{
                                    background: buttonStyle === 'gradient'
                                        ? `linear-gradient(135deg, ${primaryColor} 0%, ${darkenColor(primaryColor, 25)} 100%)`
                                        : primaryColor,
                                    borderRadius: borderRadius + 'px'
                                }}>
                                    {submitButtonText || 'Place Order'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
});

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

        submit(formData, { method: "post" });
        shopify.toast.show("Settings saved successfully!");
    }, [
        enabled, buttonText, primaryColor, requiredFields, maxQuantity,
        buttonStyle, buttonSize, buttonPosition, formTitle, formSubtitle,
        successMessage, submitButtonText, showProductImage, showPrice,
        showQuantitySelector, showEmailField, showNotesField, emailRequired,
        namePlaceholder, phonePlaceholder, addressPlaceholder, notesPlaceholder,
        modalStyle, animationStyle, borderRadius, submit, shopify
    ]);

    // Color presets
    const colorPresets = [
        "#6366f1", "#8b5cf6", "#ec4899", "#ef4444", "#f59e0b",
        "#10b981", "#06b6d4", "#3b82f6", "#000000"
    ];

    return (
        <>
            <style>{`
                .form-builder {
                    max-width: 1200px;
                    margin: 0 auto;
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
                .builder-layout { display: grid; grid-template-columns: 1fr 360px; gap: 24px; }
                .settings-card { background: white; border: 1px solid #e5e7eb; border-radius: 16px; padding: 24px; margin-bottom: 20px; }
                .card-title { font-size: 15px; font-weight: 600; color: #111827; margin: 0 0 16px 0; }
                .input-field { width: 100%; padding: 12px 16px; border: 1px solid #e5e7eb; border-radius: 10px; font-size: 14px; color: #111827; transition: all 0.2s ease; box-sizing: border-box; }
                .color-presets { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
                .color-preset { width: 32px; height: 32px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; transition: all 0.2s ease; }
                .color-preset:hover { transform: scale(1.1); }
                .color-preset.active { border-color: #111827; box-shadow: 0 0 0 2px white, 0 0 0 4px #111827; }
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
                .preview-panel { background: white; border: 1px solid #e5e7eb; border-radius: 16px; overflow: hidden; position: sticky; top: 20px; }
                .preview-header { background: #f9fafb; padding: 16px 20px; border-bottom: 1px solid #e5e7eb; }
                .preview-content { padding: 24px; }
                .preview-phone { background: #1f2937; border-radius: 32px; padding: 12px; max-width: 280px; margin: 0 auto; }
                .preview-phone-screen { background: white; border-radius: 24px; overflow: hidden; min-height: 400px; }
                .preview-product { padding: 16px; }
                .preview-product-img { width: 100%; height: 100px; background: linear-gradient(135deg, #e5e7eb 0%, #d1d5db 100%); border-radius: 12px; margin-bottom: 12px; display: flex; align-items: center; justify-content: center; }
                .preview-modal { padding: 16px; margin-top: 12px; border-radius: 12px; background: #f9fafb; }
                .preview-input { width: 100%; padding: 10px 12px; margin-bottom: 8px; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 12px; box-sizing: border-box; }
                .preview-submit { width: 100%; padding: 12px; border: none; color: white; border-radius: 8px; font-weight: 600; font-size: 13px; margin-top: 4px; }
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
                                    <div className="settings-card">
                                        <h3 className="card-title"><span>📋</span> Required Fields</h3>
                                        <div className="checkbox-options">
                                            {[
                                                { id: 'name', label: 'Full Name' },
                                                { id: 'phone', label: 'Phone Number' },
                                                { id: 'address', label: 'Delivery Address' },
                                            ].map((field) => (
                                                <div
                                                    key={field.id}
                                                    className={`checkbox-option ${requiredFields.includes(field.id) ? 'checked' : ''}`}
                                                    onClick={() => toggleField(field.id)}
                                                >
                                                    <div className="checkbox-box">
                                                        {requiredFields.includes(field.id) && '✓'}
                                                    </div>
                                                    <span className="checkbox-label">{field.label}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="settings-card">
                                        <h3 className="card-title"><span>➕</span> Optional Fields</h3>
                                        <div className="toggle-options">
                                            <div className="toggle-option" onClick={() => setShowEmailField(!showEmailField)}>
                                                <span className="toggle-option-label">Show Email Field</span>
                                                <div className={`mini-toggle ${showEmailField ? 'on' : 'off'}`} />
                                            </div>
                                            <div className="toggle-option" onClick={() => setShowNotesField(!showNotesField)}>
                                                <span className="toggle-option-label">Show Notes/Comments Field</span>
                                                <div className={`mini-toggle ${showNotesField ? 'on' : 'off'}`} />
                                            </div>
                                            <div className="toggle-option" onClick={() => setShowQuantitySelector(!showQuantitySelector)}>
                                                <span className="toggle-option-label">Show Quantity Selector</span>
                                                <div className={`mini-toggle ${showQuantitySelector ? 'on' : 'off'}`} />
                                            </div>
                                        </div>
                                    </div>

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
                            requiredFields={requiredFields}
                            namePlaceholder={namePlaceholder}
                            phonePlaceholder={phonePlaceholder}
                            addressPlaceholder={addressPlaceholder}
                            showEmailField={showEmailField}
                            showNotesField={showNotesField}
                            notesPlaceholder={notesPlaceholder}
                            submitButtonText={submitButtonText}
                            primaryColor={primaryColor}
                            buttonStyle={buttonStyle}
                            buttonSize={buttonSize}
                            borderRadius={borderRadius}
                            modalStyle={modalStyle}
                            animationStyle={animationStyle}
                        />
                    </div>
                </div>
            </s-page>
        </>
    );
}
