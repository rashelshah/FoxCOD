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
    backgroundColor: string;
    labelAlignment: 'left' | 'center' | 'right';
    iconColor: string;
    iconBackground: string;
    borderRadius: number;
    shadow: boolean;
}

/**
 * Button style configuration
 */
export interface ButtonStyles {
    textColor: string;
    backgroundColor: string;
    borderColor: string;
    borderWidth: number;
    borderRadius: number;
    shadow: boolean;
    animation: 'none' | 'fade' | 'slide' | 'pulse';
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
    { id: 'address', label: 'Address', type: 'textarea', visible: true, required: true, order: 3 },
    { id: 'zip', label: 'ZIP Code', type: 'text', visible: false, required: false, order: 4 },
    { id: 'state', label: 'State', type: 'text', visible: false, required: false, order: 5 },
    { id: 'city', label: 'City', type: 'text', visible: false, required: false, order: 6 },
    { id: 'email', label: 'Email', type: 'email', visible: false, required: false, order: 7 },
    { id: 'notes', label: 'Notes', type: 'textarea', visible: false, required: false, order: 8 },
    { id: 'quantity', label: 'Quantity', type: 'number', visible: true, required: false, order: 9 },
    { id: 'marketing', label: 'Buyer accepts marketing', type: 'checkbox', visible: false, required: false, order: 10 },
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
    backgroundColor: '#ffffff',
    labelAlignment: 'left',
    iconColor: '#6366f1',
    iconBackground: '#f3f4f6',
    borderRadius: 12,
    shadow: true,
};

/**
 * Default button styles
 */
export const DEFAULT_BUTTON_STYLES: ButtonStyles = {
    textColor: '#ffffff',
    backgroundColor: '#6366f1',
    borderColor: '#6366f1',
    borderWidth: 0,
    borderRadius: 12,
    shadow: true,
    animation: 'none',
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
