/**
 * Form Builder Settings Page - Premium COD Form Customization
 * Route: /app/settings
 * EasySell-inspired design with comprehensive options
 */

import { useState, useCallback } from "react";
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

    // Get app URL for metafields
    let appUrl = process.env.SHOPIFY_APP_URL || '';
    if (!appUrl) {
        const origin = request.headers.get('origin');
        const host = request.headers.get('host');
        const protocol = request.headers.get('x-forwarded-proto') || 'https';
        if (origin) {
            appUrl = origin;
        } else if (host) {
            appUrl = `${protocol}://${host}`;
        }
    }

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
                ]
            }
        });
    } catch (error) {
        console.error("Error saving metafields:", error);
    }

    return { success: true };
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

                /* Header */
                .builder-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 24px;
                    padding-bottom: 24px;
                    border-bottom: 1px solid #e5e7eb;
                }

                .builder-header-left {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                }

                .back-btn {
                    width: 44px;
                    height: 44px;
                    border-radius: 12px;
                    border: 1px solid #e5e7eb;
                    background: white;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 18px;
                    text-decoration: none;
                    color: #374151;
                    transition: all 0.2s ease;
                }

                .back-btn:hover {
                    background: #f9fafb;
                    border-color: #d1d5db;
                }

                .builder-title h1 {
                    font-size: 24px;
                    font-weight: 700;
                    color: #111827;
                    margin: 0 0 4px 0;
                }

                .builder-title p {
                    font-size: 14px;
                    color: #6b7280;
                    margin: 0;
                }

                .save-btn {
                    padding: 14px 28px;
                    border-radius: 12px;
                    font-weight: 600;
                    font-size: 14px;
                    border: none;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
                    color: white;
                }

                .save-btn:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 8px 20px rgba(99, 102, 241, 0.4);
                }

                .save-btn:disabled {
                    opacity: 0.7;
                    cursor: not-allowed;
                    transform: none;
                }

                /* Main Toggle */
                .main-toggle {
                    background: ${enabled ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(5, 150, 105, 0.05))' : '#f9fafb'};
                    border: 2px solid ${enabled ? '#10b981' : '#e5e7eb'};
                    border-radius: 16px;
                    padding: 20px 24px;
                    margin-bottom: 24px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                }

                .toggle-info h3 {
                    font-size: 16px;
                    font-weight: 600;
                    color: #111827;
                    margin: 0 0 4px 0;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .toggle-info p {
                    font-size: 13px;
                    color: #6b7280;
                    margin: 0;
                }

                .toggle-switch {
                    width: 56px;
                    height: 32px;
                    background: ${enabled ? '#10b981' : '#d1d5db'};
                    border-radius: 16px;
                    position: relative;
                    cursor: pointer;
                    transition: background 0.2s ease;
                }

                .toggle-switch::after {
                    content: '';
                    position: absolute;
                    width: 26px;
                    height: 26px;
                    background: white;
                    border-radius: 50%;
                    top: 3px;
                    left: ${enabled ? '27px' : '3px'};
                    transition: left 0.2s ease;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                }

                /* Tabs */
                .tabs {
                    display: flex;
                    gap: 8px;
                    margin-bottom: 24px;
                    background: #f3f4f6;
                    padding: 6px;
                    border-radius: 12px;
                }

                .tab {
                    flex: 1;
                    padding: 14px 20px;
                    border: none;
                    background: transparent;
                    border-radius: 8px;
                    font-size: 14px;
                    font-weight: 600;
                    color: #6b7280;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                }

                .tab:hover {
                    color: #374151;
                }

                .tab.active {
                    background: white;
                    color: #111827;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
                }

                /* Layout */
                .builder-layout {
                    display: grid;
                    grid-template-columns: 1fr 360px;
                    gap: 24px;
                }

                @media (max-width: 900px) {
                    .builder-layout {
                        grid-template-columns: 1fr;
                    }
                }

                /* Settings Card */
                .settings-card {
                    background: white;
                    border: 1px solid #e5e7eb;
                    border-radius: 16px;
                    padding: 24px;
                    margin-bottom: 20px;
                }

                .card-title {
                    font-size: 15px;
                    font-weight: 600;
                    color: #111827;
                    margin: 0 0 16px 0;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }

                .card-title span {
                    font-size: 16px;
                }

                /* Input Group */
                .input-group {
                    margin-bottom: 20px;
                }

                .input-group:last-child {
                    margin-bottom: 0;
                }

                .input-label {
                    display: block;
                    font-size: 13px;
                    font-weight: 600;
                    color: #374151;
                    margin-bottom: 8px;
                }

                .input-field {
                    width: 100%;
                    padding: 12px 16px;
                    border: 1px solid #e5e7eb;
                    border-radius: 10px;
                    font-size: 14px;
                    color: #111827;
                    transition: all 0.2s ease;
                    box-sizing: border-box;
                }

                .input-field:focus {
                    outline: none;
                    border-color: #6366f1;
                    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
                }

                .input-field::placeholder {
                    color: #9ca3af;
                }

                textarea.input-field {
                    resize: vertical;
                    min-height: 80px;
                }

                /* Color Picker */
                .color-picker {
                    display: flex;
                    gap: 12px;
                    align-items: center;
                }

                .color-presets {
                    display: flex;
                    gap: 8px;
                    flex-wrap: wrap;
                }

                .color-preset {
                    width: 32px;
                    height: 32px;
                    border-radius: 8px;
                    border: 2px solid transparent;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }

                .color-preset:hover {
                    transform: scale(1.1);
                }

                .color-preset.active {
                    border-color: #111827;
                    box-shadow: 0 0 0 2px white, 0 0 0 4px #111827;
                }

                .custom-color {
                    width: 32px;
                    height: 32px;
                    border-radius: 8px;
                    border: 1px dashed #d1d5db;
                    cursor: pointer;
                    overflow: hidden;
                    position: relative;
                }

                .custom-color input {
                    position: absolute;
                    width: 100%;
                    height: 100%;
                    opacity: 0;
                    cursor: pointer;
                }

                /* Style Options */
                .style-options {
                    display: flex;
                    gap: 10px;
                    flex-wrap: wrap;
                }

                .style-option {
                    padding: 10px 18px;
                    border-radius: 10px;
                    border: 2px solid #e5e7eb;
                    background: white;
                    font-size: 13px;
                    font-weight: 600;
                    color: #6b7280;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }

                .style-option:hover {
                    border-color: #d1d5db;
                }

                .style-option.active {
                    border-color: #6366f1;
                    background: rgba(99, 102, 241, 0.05);
                    color: #6366f1;
                }

                /* Toggle Options */
                .toggle-options {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }

                .toggle-option {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 14px 16px;
                    background: #f9fafb;
                    border-radius: 10px;
                    cursor: pointer;
                    transition: background 0.2s ease;
                }

                .toggle-option:hover {
                    background: #f3f4f6;
                }

                .toggle-option-label {
                    font-size: 14px;
                    font-weight: 500;
                    color: #374151;
                }

                .mini-toggle {
                    width: 44px;
                    height: 24px;
                    border-radius: 12px;
                    position: relative;
                    transition: background 0.2s ease;
                }

                .mini-toggle::after {
                    content: '';
                    position: absolute;
                    width: 18px;
                    height: 18px;
                    background: white;
                    border-radius: 50%;
                    top: 3px;
                    transition: left 0.2s ease;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.2);
                }

                .mini-toggle.on {
                    background: #10b981;
                }

                .mini-toggle.on::after {
                    left: 23px;
                }

                .mini-toggle.off {
                    background: #d1d5db;
                }

                .mini-toggle.off::after {
                    left: 3px;
                }

                /* Checkbox Options */
                .checkbox-options {
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }

                .checkbox-option {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 12px 14px;
                    background: #f9fafb;
                    border-radius: 10px;
                    cursor: pointer;
                    transition: background 0.2s ease;
                }

                .checkbox-option:hover {
                    background: #f3f4f6;
                }

                .checkbox-option.checked {
                    background: rgba(99, 102, 241, 0.1);
                }

                .checkbox-box {
                    width: 22px;
                    height: 22px;
                    border: 2px solid #d1d5db;
                    border-radius: 6px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                    transition: all 0.2s ease;
                }

                .checkbox-option.checked .checkbox-box {
                    background: #6366f1;
                    border-color: #6366f1;
                    color: white;
                }

                .checkbox-label {
                    font-size: 14px;
                    font-weight: 500;
                    color: #374151;
                }

                /* Range Slider */
                .range-group {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                }

                .range-slider {
                    flex: 1;
                    -webkit-appearance: none;
                    height: 8px;
                    background: #e5e7eb;
                    border-radius: 4px;
                    outline: none;
                }

                .range-slider::-webkit-slider-thumb {
                    -webkit-appearance: none;
                    width: 20px;
                    height: 20px;
                    background: #6366f1;
                    border-radius: 50%;
                    cursor: pointer;
                }

                .range-value {
                    min-width: 48px;
                    text-align: center;
                    font-size: 14px;
                    font-weight: 600;
                    color: #374151;
                }

                /* Preview Panel */
                .preview-panel {
                    background: white;
                    border: 1px solid #e5e7eb;
                    border-radius: 16px;
                    overflow: hidden;
                    position: sticky;
                    top: 20px;
                }

                .preview-header {
                    background: #f9fafb;
                    padding: 16px 20px;
                    border-bottom: 1px solid #e5e7eb;
                }

                .preview-header h3 {
                    font-size: 14px;
                    font-weight: 600;
                    color: #111827;
                    margin: 0;
                }

                .preview-content {
                    padding: 24px;
                }

                .preview-phone {
                    background: #1f2937;
                    border-radius: 32px;
                    padding: 12px;
                    max-width: 280px;
                    margin: 0 auto;
                }

                .preview-phone-screen {
                    background: white;
                    border-radius: 24px;
                    overflow: hidden;
                }

                .preview-product {
                    padding: 16px;
                }

                .preview-product-img {
                    width: 100%;
                    height: 100px;
                    background: linear-gradient(135deg, #e5e7eb 0%, #d1d5db 100%);
                    border-radius: ${borderRadius}px;
                    margin-bottom: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #9ca3af;
                    font-size: 24px;
                }

                .preview-product-title {
                    font-size: 14px;
                    font-weight: 600;
                    color: #111827;
                    margin-bottom: 4px;
                }

                .preview-product-price {
                    font-size: 16px;
                    font-weight: 700;
                    color: #111827;
                    margin-bottom: 12px;
                }

                .preview-btn {
                    width: 100%;
                    padding: ${buttonSize === 'small' ? '10px' : buttonSize === 'large' ? '16px' : '13px'} 16px;
                    border-radius: ${borderRadius}px;
                    font-weight: 600;
                    font-size: ${buttonSize === 'small' ? '13px' : buttonSize === 'large' ? '15px' : '14px'};
                    border: 2px solid ${primaryColor};
                    cursor: pointer;
                    transition: all 0.2s ease;
                    background: ${buttonStyle === 'outline' ? 'transparent' : buttonStyle === 'gradient' ? `linear-gradient(135deg, ${primaryColor}, ${primaryColor}dd)` : primaryColor};
                    color: ${buttonStyle === 'outline' ? primaryColor : 'white'};
                }

                .preview-modal {
                    background: #f9fafb;
                    border-radius: ${borderRadius}px;
                    padding: 16px;
                    margin-top: 12px;
                }

                .preview-modal-title {
                    font-size: 14px;
                    font-weight: 600;
                    color: #111827;
                    margin-bottom: 8px;
                    text-align: center;
                }

                .preview-input {
                    width: 100%;
                    padding: 10px 12px;
                    border: 1px solid #e5e7eb;
                    border-radius: 8px;
                    font-size: 12px;
                    color: #6b7280;
                    margin-bottom: 8px;
                    box-sizing: border-box;
                }

                .preview-submit {
                    width: 100%;
                    padding: 12px;
                    border-radius: 8px;
                    font-weight: 600;
                    font-size: 13px;
                    border: none;
                    background: ${primaryColor};
                    color: white;
                    margin-top: 4px;
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
                                            <div className="range-group">
                                                <input
                                                    type="range"
                                                    className="range-slider"
                                                    min="1"
                                                    max="50"
                                                    value={maxQuantity}
                                                    onChange={(e) => setMaxQuantity(parseInt(e.target.value))}
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
                                        <div className="range-group">
                                            <input
                                                type="range"
                                                className="range-slider"
                                                min="0"
                                                max="24"
                                                value={borderRadius}
                                                onChange={(e) => setBorderRadius(parseInt(e.target.value))}
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

                        {/* Preview Panel */}
                        <div className="preview-panel">
                            <div className="preview-header">
                                <h3>📱 Live Preview</h3>
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
                                            <button className="preview-btn">
                                                {buttonText || 'Buy with COD'}
                                            </button>
                                            <div className="preview-modal">
                                                <div className="preview-modal-title">{formTitle || 'Cash on Delivery'}</div>
                                                {requiredFields.includes('name') && (
                                                    <input className="preview-input" placeholder={namePlaceholder || 'Full Name'} disabled />
                                                )}
                                                {requiredFields.includes('phone') && (
                                                    <input className="preview-input" placeholder={phonePlaceholder || 'Phone Number'} disabled />
                                                )}
                                                {requiredFields.includes('address') && (
                                                    <input className="preview-input" placeholder={addressPlaceholder || 'Delivery Address'} disabled />
                                                )}
                                                {showEmailField && (
                                                    <input className="preview-input" placeholder="Email (optional)" disabled />
                                                )}
                                                {showNotesField && (
                                                    <input className="preview-input" placeholder={notesPlaceholder || 'Notes'} disabled />
                                                )}
                                                <button className="preview-submit">
                                                    {submitButtonText || 'Place Order'}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </s-page>
        </>
    );
}
