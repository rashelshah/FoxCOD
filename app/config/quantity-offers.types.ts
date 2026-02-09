/**
 * Quantity Offers Types and Defaults
 * Stored in Supabase, synced to Shopify Metafields for storefront access
 */

/**
 * Single quantity offer configuration
 */
export interface QuantityOffer {
    id: string;
    quantity: number;
    price: number;
    discountPercent?: number;
    compareAtPrice?: number;
    label?: string;         // e.g., "Most Popular"
    saveText?: string;      // e.g., "Save 20%"
    title?: string;         // e.g., "1 Unit", "2 Units"
    discountType?: 'percentage' | 'fixed';  // Discount type
    tagBgColor?: string;    // Individual tag background color
    preselect?: boolean;    // Whether this offer is preselected
    order: number;
}

/**
 * Design settings for offers display
 */
export interface OfferDesignSettings {
    // Template
    template: 'classic' | 'modern' | 'vertical';

    // Selected offer styles
    selectedBgColor: string;
    selectedBorderColor: string;
    selectedBorderRadius: number;
    selectedTagBgColor: string;
    selectedTagTextColor: string;
    selectedTextColor: string;
    selectedTextSize: number;
    selectedFontStyle: 'normal' | 'bold' | 'italic';

    // Non-selected offer styles
    unselectedBgColor: string;
    unselectedBorderColor: string;
    unselectedTagBgColor: string;

    // Text customization
    titleTextSize: number;
    titleFontWeight: 400 | 500 | 600 | 700;
    priceTextSize: number;
    priceFontWeight: 400 | 500 | 600 | 700;
    currencySymbol: string;

    // Advanced options
    hideProductImage: boolean;
    hideComparePrice: boolean;
    disableVariantSelection: boolean;
    useCompareAsOldPrice: boolean;
    appendOfferToTitle: boolean;
    showMostPopularBadge: boolean;
    autoSelectBestValue: boolean;
}

/**
 * Complete quantity offer group configuration
 */
export interface QuantityOfferGroup {
    id: string;
    name: string;
    active: boolean;
    productIds: string[];
    offers: QuantityOffer[];
    design: OfferDesignSettings;
    placement: 'inside_form' | 'above_button';
    createdAt: string;
    updatedAt: string;
    selectedProducts?: any[];  // Temporarily holds selected products from ResourcePicker
}

/**
 * Default design settings
 */
export const DEFAULT_OFFER_DESIGN: OfferDesignSettings = {
    template: 'modern',

    // Selected styles
    selectedBgColor: '#eef2ff',
    selectedBorderColor: '#6366f1',
    selectedBorderRadius: 12,
    selectedTagBgColor: '#6366f1',
    selectedTagTextColor: '#ffffff',
    selectedTextColor: '#1f2937',
    selectedTextSize: 14,
    selectedFontStyle: 'normal',

    // Non-selected styles
    unselectedBgColor: '#ffffff',
    unselectedBorderColor: '#e5e7eb',
    unselectedTagBgColor: '#f3f4f6',

    // Text
    titleTextSize: 15,
    titleFontWeight: 600,
    priceTextSize: 16,
    priceFontWeight: 700,
    currencySymbol: '₹',

    // Advanced
    hideProductImage: false,
    hideComparePrice: false,
    disableVariantSelection: false,
    useCompareAsOldPrice: false,
    appendOfferToTitle: false,
    showMostPopularBadge: true,
    autoSelectBestValue: true,
};

/**
 * Default offers template
 */
export const DEFAULT_OFFERS: QuantityOffer[] = [
    { id: 'offer-1', quantity: 1, price: 0, label: '', order: 0 },
    { id: 'offer-2', quantity: 2, price: 0, discountPercent: 10, label: 'Save 10%', order: 1 },
    { id: 'offer-3', quantity: 3, price: 0, discountPercent: 20, label: 'Most Popular', order: 2 },
];

/**
 * Create new offer group with defaults
 */
export function createDefaultOfferGroup(): Omit<QuantityOfferGroup, 'id' | 'createdAt' | 'updatedAt'> {
    return {
        name: 'New Quantity Offer',
        active: false,
        productIds: [],
        offers: DEFAULT_OFFERS,
        design: DEFAULT_OFFER_DESIGN,
        placement: 'inside_form',
    };
}
