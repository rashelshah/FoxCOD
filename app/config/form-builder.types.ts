/**
 * Shared Form Builder Types and Defaults
 * Can be imported by both client and server code
 */

/**
 * Field configuration type for dynamic form fields
 */
export interface FormField {
    id: string;
    label: string;
    type: 'text' | 'tel' | 'email' | 'textarea' | 'number' | 'checkbox' | 'dropdown';
    visible: boolean;
    required: boolean;
    order: number;
    placeholder?: string;
    options?: string[]; // For dropdown type
    isCustom?: boolean; // True for seller-created custom fields
    iconType?: string; // Icon identifier for custom fields
}

export interface CouponConfig {
    code: string;
    type: 'percentage' | 'fixed';
    value: number;
    min_order_value?: number;
    max_discount?: number;
    usage_limit?: number;
    enabled: boolean;
}

/**
 * Content blocks configuration
 */
export interface ContentBlocks {
    order_summary: boolean;
    shipping_options: boolean;
    cart_quantity_offers: boolean;
    buyer_marketing: boolean;
}

/**
 * Form style configuration
 */
export interface FormStyles {
    textColor: string;
    textSize: number;       // px
    fontStyle: 'normal' | 'bold' | 'italic';
    borderColor: string;
    borderWidth: number;
    backgroundColor: string;
    background?: string;
    backgroundImage?: string;
    labelAlignment: 'left' | 'center' | 'right';
    iconColor: string;
    iconBackground: string;
    borderRadius: number;
    shadow: boolean;
    /**
     * Shadow intensity for inputs / form container.
     * 0 = no shadow, 100 = strong shadow.
     * Slider in settings writes this value while also toggling `shadow`.
     */
    shadowIntensity?: number;
    /**
     * Optional key for the active preset theme.
     * 'custom' or undefined means seller-defined styling.
     */
    themeKey?: string;
    fieldBackgroundColor: string;  // Separate from container background
    labelColor: string;            // Separate from textColor
    labelFontSize: number;         // Separate control for labels
    priceColor: string;            // Price display color (product price, total price, offer prices)
    fontFamily: 'Inter' | 'Poppins' | 'DM Sans' | 'Outfit' | 'Playfair Display' | 'Cormorant Garamond' | 'Abril Fatface' | 'Syne' | 'Space Grotesk';  // Font family for form title and description
    fullPrepaidEnabled?: boolean; // Added for static full prepaid button
}

/**
 * Button style configuration
 */
export interface ButtonStyles {
    // Basic styling
    textColor: string;
    textSize: number;       // px
    fontStyle: 'normal' | 'bold' | 'italic';
    backgroundColor: string;
    borderColor: string;
    borderWidth: number;
    borderRadius: number;
    shadow: boolean;
    animation: 'none' | 'fade' | 'slide' | 'pulse';

    // Animation Presets
    animationPreset: 'none' | 'shake' | 'pulse' | 'bounce' | 'glow' | 'gradient-flow' | 'shimmer';

    // Border Effects
    borderEffect: 'static' | 'glowing' | 'animated-gradient' | 'dashed-moving';
    borderIntensity: 'low' | 'medium' | 'high';

    // Hover & Click Effects
    hoverLift: boolean;
    hoverGlow: boolean;
    clickRipple: boolean;
    clickPress: boolean;

    // Button Icon
    iconType?: string;
    iconPosition?: 'left' | 'right';

    // Timing Controls
    animationTrigger: 'page-load' | 'form-filled' | 'inactivity';
    inactivityDelay: number;  // seconds
    stopAfterInteraction: boolean;
    animationSpeed: 'slow' | 'normal' | 'fast';

    // Device Control
    enableDesktop: boolean;
    enableMobile: boolean;
    showAddToCart: boolean;

    // Mobile Features
    stickyOnMobile: boolean;  // Sticky button on mobile scrolling
}

/**
 * Shipping option type
 */
export interface ShippingOption {
    id: string;
    label: string;
    price: number;
}

/**
 * Shipping options configuration
 */
export interface ShippingOptions {
    enabled: boolean;
    defaultOption: string;
    options: ShippingOption[];
}

/**
 * Default field configuration
 */
export const DEFAULT_FIELDS: FormField[] = [
    { id: 'name', label: 'Full Name', type: 'text', visible: true, required: true, order: 1 },
    { id: 'phone', label: 'Phone Number', type: 'tel', visible: true, required: true, order: 2 },
    { id: 'address', label: 'Address', type: 'text', visible: true, required: true, order: 3 },
    { id: 'zip', label: 'ZIP Code', type: 'text', visible: false, required: false, order: 4 },
    { id: 'state', label: 'State', type: 'text', visible: false, required: false, order: 5 },
    { id: 'city', label: 'City', type: 'text', visible: false, required: false, order: 6 },
    { id: 'email', label: 'Email', type: 'email', visible: false, required: false, order: 7 },
    { id: 'notes', label: 'Notes', type: 'textarea', visible: false, required: false, order: 8 },
    { id: 'marketing', label: 'Buyer accepts marketing', type: 'checkbox', visible: false, required: false, order: 9 },
    { id: 'shipping', label: 'Shipping', type: 'text', visible: true, required: false, order: 10 },
    { id: 'order_summary', label: 'Order Summary', type: 'text', visible: true, required: false, order: 11 },
    { id: 'payment_mode', label: 'Payment Mode', type: 'text', visible: true, required: false, order: 12 },
    { id: 'coupon', label: 'Coupon Code', type: 'text', visible: false, required: false, order: 13 },
];

/**
 * Default content blocks
 */
export const DEFAULT_BLOCKS: ContentBlocks = {
    order_summary: true,
    shipping_options: false,
    cart_quantity_offers: false,
    buyer_marketing: false,
};

/**
 * Default form styles
 */
export const DEFAULT_STYLES: FormStyles = {
    textColor: '#333333',
    textSize: 14,
    fontStyle: 'normal',
    borderColor: '#333333',
    borderWidth: 1,
    background: '#ffffff',
    backgroundColor: '#ffffff',
    labelAlignment: 'left',
    iconColor: '#333333',
    iconBackground: '#ffffff',
    borderRadius: 9,
    shadow: true,
    shadowIntensity: 35,
    themeKey: 'default',
    fieldBackgroundColor: '#FFFFFF',
    labelColor: '#333333',
    labelFontSize: 14,
    priceColor: '#333333',
    fontFamily: 'Inter',
};

/**
 * Default button styles
 */
export const DEFAULT_BUTTON_STYLES: ButtonStyles = {
    // Basic styling
    textColor: '#ffffff',
    textSize: 15,
    fontStyle: 'bold',
    backgroundColor: '#000000',
    borderColor: '#000000',
    borderWidth: 0,
    borderRadius: 12,
    shadow: true,
    animation: 'none',

    // Animation Presets
    animationPreset: 'none',

    // Border Effects
    borderEffect: 'static',
    borderIntensity: 'medium',

    // Hover & Click Effects
    hoverLift: false,
    hoverGlow: false,
    clickRipple: false,
    clickPress: false,

    // Button Icon
    iconType: 'none',
    iconPosition: 'left',

    // Timing Controls
    animationTrigger: 'page-load',
    inactivityDelay: 3,
    stopAfterInteraction: true,
    animationSpeed: 'normal',

    // Device Control
    enableDesktop: true,
    enableMobile: true,
    showAddToCart: false,

    // Mobile Features
    stickyOnMobile: false,
};

/**
 * Default shipping options
 */
export const DEFAULT_SHIPPING_OPTIONS: ShippingOptions = {
    enabled: false,
    defaultOption: 'free_shipping',
    options: [
        { id: 'free_shipping', label: 'Free Shipping', price: 0 },
        { id: 'standard', label: 'Standard Shipping', price: 50 },
        { id: 'express', label: 'Express Shipping', price: 100 },
    ],
};

/**
 * Form submit button style overrides
 * When useProductButtonStyle is true, the submit button inherits
 * the product page button styles. When false, custom values are used.
 */
export interface FormSubmitButtonStyles {
    useProductButtonStyle: boolean;
    buttonStyle?: string;
    buttonSize?: string;
    backgroundColor?: string;
    textColor?: string;
    textSize?: number;
    fontStyle?: string;
    fontWeight?: string;
    borderColor?: string;
    borderWidth?: number;
    borderRadius?: number;
    shadow?: boolean;
    shadowIntensity?: number;
}

/**
 * Default form submit button styles
 */
export const DEFAULT_FORM_SUBMIT_BUTTON: FormSubmitButtonStyles = {
    useProductButtonStyle: true,
    buttonStyle: 'solid',
    buttonSize: 'medium',
    backgroundColor: '#6366f1',
    textColor: '#ffffff',
    textSize: 15,
    fontStyle: 'bold',
    fontWeight: 'bold',
    borderColor: '#6366f1',
    borderWidth: 0,
    borderRadius: 12,
    shadow: true,
    shadowIntensity: 35,
};
