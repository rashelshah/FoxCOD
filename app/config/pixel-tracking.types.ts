/**
 * Pixel Tracking Types
 * Defines providers, settings interface, and provider metadata
 */

export type PixelProvider =
    | "facebook"
    | "tiktok"
    | "google"
    | "snap"
    | "pinterest"
    | "taboola"
    | "kwai";

export interface PixelTrackingSettings {
    id?: string;
    shop_domain: string;
    provider: PixelProvider;
    label?: string;

    pixel_id?: string;
    access_token?: string;
    conversion_api_token?: string;

    track_initiate_checkout: boolean;
    track_purchase: boolean;
    track_add_to_cart: boolean;
    track_view_content: boolean;
    track_add_payment_info: boolean;

    enabled: boolean;

    created_at?: string;
    updated_at?: string;
}

export interface PixelProviderMeta {
    key: PixelProvider;
    label: string;
    icon: string;
    idLabel: string;
    hasConversionApi: boolean;
    events: string[];
}

export const PIXEL_PROVIDERS: PixelProviderMeta[] = [
    {
        key: "facebook",
        label: "Facebook Pixel",
        icon: "📘",
        idLabel: "Pixel ID",
        hasConversionApi: true,
        events: ["InitiateCheckout", "Purchase", "AddToCart", "ViewContent", "AddPaymentInfo"],
    },
    {
        key: "tiktok",
        label: "TikTok Pixel",
        icon: "🎵",
        idLabel: "Pixel ID",
        hasConversionApi: false,
        events: ["InitiateCheckout", "CompletePayment"],
    },
    {
        key: "google",
        label: "Google Tag (gtag)",
        icon: "🔍",
        idLabel: "Tag ID",
        hasConversionApi: false,
        events: ["begin_checkout", "purchase"],
    },
    {
        key: "snap",
        label: "Snap Pixel",
        icon: "👻",
        idLabel: "Pixel ID",
        hasConversionApi: false,
        events: ["START_CHECKOUT", "PURCHASE"],
    },
    {
        key: "pinterest",
        label: "Pinterest Tag",
        icon: "📌",
        idLabel: "Tag ID",
        hasConversionApi: false,
        events: ["Checkout"],
    },
    {
        key: "taboola",
        label: "Taboola Pixel",
        icon: "📰",
        idLabel: "Pixel ID",
        hasConversionApi: false,
        events: ["start_checkout", "make_purchase"],
    },
    {
        key: "kwai",
        label: "Kwai Pixel",
        icon: "🎬",
        idLabel: "Pixel ID",
        hasConversionApi: false,
        events: ["contentView", "initiatedCheckout", "purchase"],
    },
];

export const DEFAULT_PIXEL_SETTINGS: Omit<PixelTrackingSettings, 'shop_domain' | 'provider'> = {
    pixel_id: '',
    access_token: '',
    conversion_api_token: '',
    track_initiate_checkout: true,
    track_purchase: true,
    track_add_to_cart: false,
    track_view_content: false,
    track_add_payment_info: false,
    enabled: true,
};
