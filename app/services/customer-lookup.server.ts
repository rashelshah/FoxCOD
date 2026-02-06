/**
 * Shared Customer Lookup Logic
 * Used by api.customer-by-phone and proxy route for autofill
 */

import { supabase } from "../config/supabase.server";

function normalizePhone(phone: string): string {
    return phone.replace(/[\s\-\(\)\+]/g, '');
}

function isValidPhone(phone: string): boolean {
    const normalized = normalizePhone(phone);
    return normalized.length >= 8 && normalized.length <= 15 && /^\d+$/.test(normalized);
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

    // First, try customers table
    const { data: customerData, error: customerError } = await supabase
        .from('customers')
        .select('name, phone, address, state, city, zipcode, email')
        .eq('shop_domain', shop)
        .eq('phone', phone)
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

    if (customerData && !customerError) {
        return {
            found: true,
            name: customerData.name,
            address: customerData.address,
            state: customerData.state || '',
            city: customerData.city || '',
            zipcode: customerData.zipcode || '',
            email: customerData.email || '',
        };
    }

    // Fallback: order_logs
    const { data: orderData, error: orderError } = await supabase
        .from('order_logs')
        .select('customer_name, customer_address, customer_phone, customer_email, city, state, pincode')
        .eq('shop_domain', shop)
        .eq('customer_phone', phone)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    if (orderData && !orderError) {
        return {
            found: true,
            name: orderData.customer_name,
            address: orderData.customer_address,
            email: orderData.customer_email || '',
            state: orderData.state || '',
            city: orderData.city || '',
            zipcode: orderData.pincode || '',
        };
    }

    // Try normalized phone
    const normalizedPhone = normalizePhone(phone);

    const { data: normalizedCustomers } = await supabase
        .from('customers')
        .select('name, phone, address, state, city, zipcode, email')
        .eq('shop_domain', shop)
        .limit(50);

    if (normalizedCustomers) {
        const matched = normalizedCustomers.find(c => normalizePhone(c.phone) === normalizedPhone);
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

    const { data: normalizedOrders } = await supabase
        .from('order_logs')
        .select('customer_name, customer_address, customer_phone, customer_email, city, state, pincode')
        .eq('shop_domain', shop)
        .order('created_at', { ascending: false })
        .limit(50);

    if (normalizedOrders) {
        const match = normalizedOrders.find(o => normalizePhone(o.customer_phone) === normalizedPhone);
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
