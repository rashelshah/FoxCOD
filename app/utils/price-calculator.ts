/**
 * Price Calculator Utility
 * 
 * Shared utility for calculating bundle offer prices.
 * Used by Form Builder, Bundle Offers, and Storefront to ensure
 * consistent pricing calculations across the app.
 */

export interface PriceCalculation {
    /** Original price before discount */
    original: number;
    /** Final price after discount */
    discounted: number;
    /** Amount saved */
    savings: number;
    /** Discount percentage applied */
    discountPercent: number;
}

/**
 * Calculate bundle offer price
 * @param basePrice - Base price per unit
 * @param quantity - Number of units in bundle
 * @param discountPercent - Percentage discount (0-100), optional
 * @param discountFixed - Fixed amount discount, optional
 * @returns Price calculation breakdown
 */
export function calculateBundlePrice(
    basePrice: number,
    quantity: number,
    discountPercent?: number,
    discountFixed?: number
): PriceCalculation {
    const original = basePrice * quantity;

    let discounted = original;
    let savings = 0;
    let effectiveDiscountPercent = 0;

    // Apply percentage discount
    if (discountPercent && discountPercent > 0) {
        savings = original * (discountPercent / 100);
        discounted = original - savings;
        effectiveDiscountPercent = discountPercent;
    }

    // Apply fixed discount (overrides percentage if both provided)
    if (discountFixed && discountFixed > 0) {
        savings = Math.min(discountFixed, original); // Can't discount more than original
        discounted = original - savings;
        effectiveDiscountPercent = (savings / original) * 100;
    }

    return {
        original: Math.round(original * 100) / 100, // Round to 2 decimals
        discounted: Math.round(discounted * 100) / 100,
        savings: Math.round(savings * 100) / 100,
        discountPercent: Math.round(effectiveDiscountPercent * 100) / 100
    };
}

/**
 * Format price for display
 * @param price - Price to format
 * @param currencySymbol - Currency symbol (default: ₹)
 * @returns Formatted price string
 */
export function formatPrice(price: number, currencySymbol: string = '₹'): string {
    return `${currencySymbol}${price.toLocaleString('en-IN', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    })}`;
}

/**
 * Calculate price per unit for a bundle
 * @param totalPrice - Total bundle price
 * @param quantity - Number of units in bundle
 * @returns Price per unit
 */
export function calculatePricePerUnit(totalPrice: number, quantity: number): number {
    if (quantity === 0) return 0;
    return Math.round((totalPrice / quantity) * 100) / 100;
}

/**
 * Parse offer configuration and calculate prices
 * Designed to work with bundle offer objects
 */
export interface BundleOffer {
    quantity: number;
    discountPercent?: number;
    discountFixed?: number;
    price?: number; // Pre-calculated price (for backward compatibility)
}

export function calculateOfferPrices(
    basePrice: number,
    offers: BundleOffer[]
): Array<BundleOffer & PriceCalculation> {
    return offers.map(offer => {
        const calc = calculateBundlePrice(
            basePrice,
            offer.quantity,
            offer.discountPercent,
            offer.discountFixed
        );

        return {
            ...offer,
            ...calc
        };
    });
}
