/**
 * Shared Customer Lookup Logic
 * Used by api.customer-by-phone and proxy route for autofill
 */

import { supabase } from "../config/supabase.server";

function normalizePhone(phone: string): string {
    // Strip all non-digit characters
    return phone.replace(/\D/g, '');
}

/**
 * Strict phone match: two phone numbers match if:
 * - Their normalized digits are exactly equal, OR
 * - One ends with the other's digits AND the shorter one is at least 10 digits
 *   (handles country code prefix like +91 vs local 10-digit number)
 *   BUT only if the shorter number has >= 10 digits to avoid false positives.
 */
function phonesMatch(a: string, b: string): boolean {
    const na = normalizePhone(a);
    const nb = normalizePhone(b);
    if (!na || !nb) return false;
    if (na === nb) return true;
    // Allow country-code prefix strip only when both are at least 10 digits
    if (na.length >= 10 && nb.length >= 10) {
        // The longer should end with the shorter (country code scenario)
        const longer = na.length > nb.length ? na : nb;
        const shorter = na.length <= nb.length ? na : nb;
        if (longer.endsWith(shorter) && shorter.length >= 10) return true;
    }
    return false;
}

function isValidPhone(phone: string): boolean {
    const normalized = normalizePhone(phone);
    return normalized.length >= 8 && normalized.length <= 15;
}

export interface CustomerLookupResult {
    found: boolean;
    name?: string;
    address?: string;
    state?: string;
    city?: string;
    zipcode?: string;
    email?: string;
    error?: string;
}

export async function lookupCustomerByPhone(phone: string, shop: string): Promise<CustomerLookupResult> {
    if (!phone || !shop) {
        return { found: false, error: "Phone and shop are required" };
    }
    if (!isValidPhone(phone)) {
        return { found: false, error: "Invalid phone number format" };
    }

    const normalizedInput = normalizePhone(phone);

    // --- Customers table ---
    // Fetch recent customers for this shop (limit reasonable for lookup)
    const { data: customerData, error: customerError } = await supabase
        .from('customers')
        .select('name, phone, address, state, city, zipcode, email')
        .eq('shop_domain', shop)
        .order('updated_at', { ascending: false })
        .limit(200);

    if (customerData && !customerError) {
        const matched = customerData.find(c => phonesMatch(c.phone || '', normalizedInput));
        if (matched) {
            return {
                found: true,
                name: matched.name,
                address: matched.address,
                state: matched.state || '',
                city: matched.city || '',
                zipcode: matched.zipcode || '',
                email: matched.email || '',
            };
        }
    }

    // --- Order logs fallback ---
    const { data: orderData, error: orderError } = await supabase
        .from('order_logs')
        .select('customer_name, customer_address, customer_phone, customer_email, city, state, pincode')
        .eq('shop_domain', shop)
        .order('created_at', { ascending: false })
        .limit(200);

    if (orderData && !orderError) {
        const match = orderData.find(o => phonesMatch(o.customer_phone || '', normalizedInput));
        if (match) {
            return {
                found: true,
                name: match.customer_name,
                address: match.customer_address,
                email: match.customer_email || '',
                state: match.state || '',
                city: match.city || '',
                zipcode: match.pincode || '',
            };
        }
    }

    return { found: false };
}
