export interface BrandingCheckoutRedirect {
    /** Whether custom branding is enabled on the redirect screen */
    enabled: boolean;
    /** Shopify CDN URL of the merchant logo */
    logo_url: string;
    /** Logo display size in px (40–120) */
    logo_size: number;
    /** Visual shape applied to the logo container */
    logo_shape: 'original' | 'rounded' | 'circle';
    /** Image zoom level (50-200, default 100) */
    logo_zoom: number;
    /** Whether to add a white background + shadow behind the logo */
    show_background: boolean;
    /** Which icon to show on the redirect screen */
    display_mode: 'lock_icon' | 'custom_logo';
}

/**
 * Top-level branding config.
 * Future keys: form_logo, header_colors, thank_you_screen, affiliate_portal, etc.
 */
export interface Branding {
    checkout_redirect: BrandingCheckoutRedirect;
}

export const DEFAULT_BRANDING: Branding = {
    checkout_redirect: {
        enabled: false,
        logo_url: '',
        logo_size: 72,
        logo_shape: 'original',
        logo_zoom: 100,
        show_background: false,
        display_mode: 'lock_icon',
    },
};
