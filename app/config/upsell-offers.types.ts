/**
 * Upsell & Downsell Campaigns — Types and Defaults
 * Each campaign has multiple offers (up to 5), shown sequentially
 * Matching EasySell's feature set exactly
 */

export type UpsellType = 'tick_upsell' | 'click_upsell' | 'downsell';
export type UpsellMode = 'post_purchase' | 'pre_purchase';
export type DiscountType = 'percentage' | 'fixed';
export type ShowConditionType = 'always' | 'specific_products' | 'order_value';

/**
 * Single offer within a campaign
 */
export interface CampaignOffer {
    id: string;
    upsell_product_id: string;
    upsell_variant_id: string;
    upsell_product_title: string;
    upsell_product_image: string;
    discount_type: DiscountType;
    discount_value: number;
    original_price: number;
    offer_price: number;
    show_quantity_picker: boolean;
    enable_variant_selection: boolean;
    expanded: boolean; // UI state for collapsible
    _selectedProduct?: any;
}

/**
 * Button design settings (accept/reject)
 */
export interface ButtonDesign {
    text: string;
    bgColor: string;
    textColor: string;
    textSize: number;
    bold: boolean;
    italic: boolean;
    borderColor: string;
    borderWidth: number;
    borderRadius: number;
    borderStyle: string; // 'none' | 'solid' | 'dashed' | 'dashed_animation'
    shadow: boolean;
    animation: string; // 'none', 'pulse', 'bounce', 'shake'
}

/**
 * Countdown timer settings
 */
export interface TimerSettings {
    enabled: boolean;
    minutes: number;
    bgColor: string;
    textColor: string;
    text: string;
}

/**
 * Discount tag settings
 */
export interface DiscountTagDesign {
    text: string; // supports {discount} template
    bgColor: string;
    textColor: string;
    textSize: number;
    borderRadius: number;
}

/**
 * Full campaign design settings
 */
export interface CampaignDesign {
    // Header
    headerText: string;
    headerTextSize: number;
    headerTextColor: string;
    headerBold: boolean;
    subheaderText: string;

    // Product title
    productTitleSize: number;
    productTitleColor: string;

    // Image / Video
    customMediaUrl: string;

    // Timer
    timer: TimerSettings;

    // Discount tag
    discountTag: DiscountTagDesign;

    // Accept button
    acceptButton: ButtonDesign;

    // Reject button
    rejectButton: ButtonDesign;

    // Background
    bgColor: string;
}

/**
 * Main upsell/downsell campaign
 */
export interface UpsellCampaign {
    id?: string;
    shop_domain?: string;
    type: UpsellType;
    campaign_name: string;
    active: boolean;
    upsell_mode: UpsellMode;

    // Trigger rules
    show_condition_type: ShowConditionType;
    trigger_product_ids: string[];
    min_order_value: number;
    max_order_value: number;

    // Offers (up to 5)
    offers: CampaignOffer[];

    // Design
    design: CampaignDesign;

    // Linked downsell
    linked_downsell_id?: string;

    // For tick upsells
    display_location: string;
    checkbox_default_checked: boolean;

    priority: number;
    created_at?: string;
    updated_at?: string;

    // Client-only
    _triggerProducts?: any[];
}

// =============================================
// DEFAULTS
// =============================================

export const DEFAULT_BUTTON_ACCEPT: ButtonDesign = {
    text: 'Yes, add to my order',
    bgColor: '#000000',
    textColor: '#ffffff',
    textSize: 16,
    bold: true,
    italic: false,
    borderColor: '#000000',
    borderWidth: 0,
    borderRadius: 8,
    borderStyle: 'dashed',
    shadow: false,
    animation: 'none',
};

export const DEFAULT_BUTTON_REJECT: ButtonDesign = {
    text: 'No thanks',
    bgColor: '#ffffff',
    textColor: '#000000',
    textSize: 16,
    bold: false,
    italic: false,
    borderColor: '#000000',
    borderWidth: 1,
    borderRadius: 8,
    borderStyle: 'solid',
    shadow: false,
    animation: 'none',
};

export const DEFAULT_TIMER: TimerSettings = {
    enabled: true,
    minutes: 10,
    bgColor: '#fdf6f6',
    textColor: '#ef4444',
    text: 'Hurry! sale ends in\n{time}',
};

export const DEFAULT_DISCOUNT_TAG: DiscountTagDesign = {
    text: '- {discount}',
    bgColor: 'linear-gradient(90deg, #ec4899, #8b5cf6)',
    textColor: '#ffffff',
    textSize: 14,
    borderRadius: 20,
};

export const DEFAULT_CAMPAIGN_DESIGN: CampaignDesign = {
    headerText: "You've unlocked a special deal",
    headerTextSize: 20,
    headerTextColor: '#000000',
    headerBold: true,
    subheaderText: 'Only for a limited time!',
    productTitleSize: 12,
    productTitleColor: '#000000',
    customMediaUrl: '',
    timer: { ...DEFAULT_TIMER },
    discountTag: { ...DEFAULT_DISCOUNT_TAG },
    acceptButton: { ...DEFAULT_BUTTON_ACCEPT },
    rejectButton: { ...DEFAULT_BUTTON_REJECT },
    bgColor: '#ffffff',
};

export function createDefaultOffer(index: number): CampaignOffer {
    return {
        id: `offer-${Date.now()}-${index}`,
        upsell_product_id: '',
        upsell_variant_id: '',
        upsell_product_title: '',
        upsell_product_image: '',
        discount_type: 'percentage',
        discount_value: 10,
        original_price: 0,
        offer_price: 0,
        show_quantity_picker: false,
        enable_variant_selection: false,
        expanded: true,
    };
}

export function createDefaultCampaign(type: UpsellType): Omit<UpsellCampaign, 'id' | 'shop_domain' | 'created_at' | 'updated_at'> {
    return {
        type,
        campaign_name: type === 'tick_upsell' ? 'New Tick Upsell' : type === 'click_upsell' ? 'New Upsell' : 'New Downsell',
        active: true,
        upsell_mode: 'post_purchase',
        show_condition_type: 'always',
        trigger_product_ids: [],
        min_order_value: 0,
        max_order_value: 0,
        offers: [createDefaultOffer(1)],
        design: { ...DEFAULT_CAMPAIGN_DESIGN, timer: { ...DEFAULT_TIMER }, discountTag: { ...DEFAULT_DISCOUNT_TAG }, acceptButton: { ...DEFAULT_BUTTON_ACCEPT }, rejectButton: { ...DEFAULT_BUTTON_REJECT } },
        display_location: type === 'tick_upsell' ? 'in_form' : 'post_purchase',
        checkbox_default_checked: false,
        priority: 0,
    };
}
