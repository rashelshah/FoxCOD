/**
 * Supabase Client Configuration
 * Server-side only - uses service role key for full access
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ORDER_STATUSES, type OrderStatus } from './constants';

// Re-export for other server modules
export { ORDER_STATUSES, type OrderStatus };

// Environment variables validation
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.warn(
        '⚠️ Supabase environment variables not set. COD features will be disabled.'
    );
}

// Create Supabase client with service role for backend operations
export const supabase: SupabaseClient = createClient(
    supabaseUrl || '',
    supabaseServiceKey || '',
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    }
);

// =============================================
// SHOP OPERATIONS
// =============================================

/**
 * Save or update shop data after installation
 */
export async function saveShop(shopDomain: string, accessToken: string, scope?: string) {
    const { data, error } = await supabase
        .from('shops')
        .upsert(
            {
                shop_domain: shopDomain,
                access_token: accessToken,
                scope: scope,
                installed_at: new Date().toISOString(),
                uninstalled_at: null,
            },
            { onConflict: 'shop_domain' }
        )
        .select()
        .single();

    if (error) {
        console.error('Error saving shop:', error);
        throw error;
    }

    return data;
}

/**
 * Get shop data by domain
 */
export async function getShop(shopDomain: string) {
    const { data, error } = await supabase
        .from('shops')
        .select('*')
        .eq('shop_domain', shopDomain)
        .single();

    if (error && error.code !== 'PGRST116') {
        console.error('Error getting shop:', error);
        throw error;
    }

    return data;
}

/**
 * Mark shop as uninstalled
 */
export async function markShopUninstalled(shopDomain: string) {
    const { error } = await supabase
        .from('shops')
        .update({ uninstalled_at: new Date().toISOString() })
        .eq('shop_domain', shopDomain);

    if (error) {
        console.error('Error marking shop uninstalled:', error);
        throw error;
    }
}

// =============================================
// FORM SETTINGS OPERATIONS
// =============================================

export interface FormSettings {
    shop_domain: string;
    enabled: boolean;
    button_text: string;
    primary_color: string;
    required_fields: string[];
    max_quantity: number;
    // Extended settings stored as JSON string in database
    button_style?: 'solid' | 'outline' | 'gradient';
    button_size?: 'small' | 'medium' | 'large';
    button_icon?: string;
    button_position?: 'below_atc' | 'replace_atc' | 'floating';
    form_title?: string;
    form_subtitle?: string;
    success_message?: string;
    submit_button_text?: string;
    show_product_image?: boolean;
    show_price?: boolean;
    show_quantity_selector?: boolean;
    show_email_field?: boolean;
    show_notes_field?: boolean;
    email_required?: boolean;
    notes_placeholder?: string;
    phone_placeholder?: string;
    address_placeholder?: string;
    name_placeholder?: string;
    modal_style?: 'modern' | 'minimal' | 'glassmorphism';
    animation_style?: 'fade' | 'slide' | 'scale';
    border_radius?: number;
    font_family?: string;
}

/**
 * Get form settings for a shop
 */
export async function getFormSettings(shopDomain: string): Promise<FormSettings | null> {
    const { data, error } = await supabase
        .from('form_settings')
        .select('*')
        .eq('shop_domain', shopDomain)
        .single();

    if (error && error.code !== 'PGRST116') {
        console.error('Error getting form settings:', error);
        throw error;
    }

    return data;
}

/**
 * Save or update form settings - persists ALL fields to Supabase
 */
export async function saveFormSettings(settings: FormSettings) {
    console.log('[Supabase] Saving form settings for:', settings.shop_domain);

    const { data, error } = await supabase
        .from('form_settings')
        .upsert(
            {
                shop_domain: settings.shop_domain,
                enabled: settings.enabled,
                button_text: settings.button_text,
                primary_color: settings.primary_color,
                required_fields: settings.required_fields,
                max_quantity: settings.max_quantity,
                button_style: settings.button_style || 'solid',
                button_size: settings.button_size || 'large',
                button_position: settings.button_position || 'below_atc',
                form_title: settings.form_title || '',
                form_subtitle: settings.form_subtitle || '',
                success_message: settings.success_message || '',
                submit_button_text: settings.submit_button_text || 'Place COD Order',
                show_product_image: settings.show_product_image ?? true,
                show_price: settings.show_price ?? true,
                show_quantity_selector: settings.show_quantity_selector ?? true,
                show_email_field: settings.show_email_field ?? false,
                show_notes_field: settings.show_notes_field ?? false,
                email_required: settings.email_required ?? false,
                name_placeholder: settings.name_placeholder || '',
                phone_placeholder: settings.phone_placeholder || '',
                address_placeholder: settings.address_placeholder || '',
                notes_placeholder: settings.notes_placeholder || '',
                modal_style: settings.modal_style || 'modern',
                animation_style: settings.animation_style || 'fade',
                border_radius: settings.border_radius ?? 12,
            },
            { onConflict: 'shop_domain' }
        )
        .select()
        .single();

    if (error) {
        console.error('[Supabase] Error saving form settings:', error);
        throw error;
    }

    console.log('[Supabase] Settings saved successfully');
    return data;
}

// =============================================
// ORDER LOG OPERATIONS
// =============================================

export interface OrderLogEntry {
    shop_domain: string;
    shopify_order_id?: string;
    shopify_order_name?: string;
    customer_name: string;
    customer_phone: string;
    customer_address: string;
    product_id: string;
    product_title?: string;
    variant_id: string;
    quantity: number;
    total_price: number;
    currency?: string;
    status?: string;
}

// Order status types are imported from ./constants

/**
 * Get the next order number for a shop (for generating order names)
 */
async function getNextOrderNumber(shopDomain: string): Promise<number> {
    // Get the count of existing orders for this shop
    const { count, error } = await supabase
        .from('order_logs')
        .select('*', { count: 'exact', head: true })
        .eq('shop_domain', shopDomain);

    if (error) {
        console.error('Error getting order count:', error);
        // Default to 1001 if there's an error
        return 1001;
    }

    // Start from 1001 and increment
    return 1001 + (count || 0);
}

/**
 * Log a new COD order with auto-generated order name
 */
export async function logOrder(order: OrderLogEntry) {
    // Generate a sequential order name if not provided
    let orderName = order.shopify_order_name;
    if (!orderName) {
        const orderNumber = await getNextOrderNumber(order.shop_domain);
        orderName = `COD-${orderNumber}`;
    }

    const { data, error } = await supabase
        .from('order_logs')
        .insert({
            ...order,
            shopify_order_name: orderName,
            created_at: new Date().toISOString(),
        })
        .select()
        .single();

    if (error) {
        console.error('Error logging order:', error);
        throw error;
    }

    return data;
}

/**
 * Update order status after Shopify order creation
 */
export async function updateOrderStatus(
    orderId: string,
    shopifyOrderId: string,
    shopifyOrderName: string,
    status: string
) {
    const { error } = await supabase
        .from('order_logs')
        .update({
            shopify_order_id: shopifyOrderId,
            shopify_order_name: shopifyOrderName,
            status: status,
        })
        .eq('id', orderId);

    if (error) {
        console.error('Error updating order status:', error);
        throw error;
    }
}

/**
 * Update just the order status (for seller dashboard)
 */
export async function updateOrderStatusSimple(orderId: string, status: OrderStatus) {
    console.log(`[Supabase] Updating order ${orderId} to status: ${status}`);

    const { data, error } = await supabase
        .from('order_logs')
        .update({ status: status })
        .eq('id', orderId)
        .select()
        .single();

    if (error) {
        console.error('[Supabase] Error updating order status:', error);
        throw error;
    }

    console.log(`[Supabase] Successfully updated order:`, data);
    return data;
}

/**
 * Get all orders for a shop with optional filtering
 */
export async function getOrders(
    shopDomain: string,
    options?: { status?: OrderStatus; limit?: number; offset?: number }
) {
    let query = supabase
        .from('order_logs')
        .select('*', { count: 'exact' })
        .eq('shop_domain', shopDomain)
        .order('created_at', { ascending: false });

    if (options?.status) {
        query = query.eq('status', options.status);
    }

    if (options?.limit) {
        query = query.limit(options.limit);
    }

    if (options?.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
    }

    const { data, error, count } = await query;

    if (error) {
        console.error('Error getting orders:', error);
        throw error;
    }

    return { orders: data || [], totalCount: count || 0 };
}

/**
 * Get order statistics for a shop
 */
export async function getOrderStats(shopDomain: string) {
    // Get current date boundaries
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Get total orders
    const { count: totalOrders } = await supabase
        .from('order_logs')
        .select('*', { count: 'exact', head: true })
        .eq('shop_domain', shopDomain);

    // Get pending orders
    const { count: pendingOrders } = await supabase
        .from('order_logs')
        .select('*', { count: 'exact', head: true })
        .eq('shop_domain', shopDomain)
        .eq('status', 'pending');

    // Get today's orders
    const { count: todayOrders } = await supabase
        .from('order_logs')
        .select('*', { count: 'exact', head: true })
        .eq('shop_domain', shopDomain)
        .gte('created_at', todayStart);

    // Get this week's orders
    const { count: weekOrders } = await supabase
        .from('order_logs')
        .select('*', { count: 'exact', head: true })
        .eq('shop_domain', shopDomain)
        .gte('created_at', weekStart);

    // Get total revenue (from confirmed/delivered orders)
    const { data: revenueData } = await supabase
        .from('order_logs')
        .select('total_price')
        .eq('shop_domain', shopDomain)
        .not('status', 'in', '(cancelled,returned)');

    const totalRevenue = revenueData?.reduce((sum, order) => sum + (order.total_price || 0), 0) || 0;

    // Get today's revenue
    const { data: todayRevenueData } = await supabase
        .from('order_logs')
        .select('total_price')
        .eq('shop_domain', shopDomain)
        .gte('created_at', todayStart)
        .not('status', 'in', '(cancelled,returned)');

    const todayRevenue = todayRevenueData?.reduce((sum, order) => sum + (order.total_price || 0), 0) || 0;

    // Get recent orders
    const { data: recentOrders } = await supabase
        .from('order_logs')
        .select('*')
        .eq('shop_domain', shopDomain)
        .order('created_at', { ascending: false })
        .limit(10);

    // Get orders by status for analytics
    const { data: statusData } = await supabase
        .from('order_logs')
        .select('status')
        .eq('shop_domain', shopDomain);

    const ordersByStatus: Record<string, number> = {};
    statusData?.forEach(order => {
        const status = order.status || 'pending';
        ordersByStatus[status] = (ordersByStatus[status] || 0) + 1;
    });

    return {
        totalOrders: totalOrders || 0,
        pendingOrders: pendingOrders || 0,
        todayOrders: todayOrders || 0,
        weekOrders: weekOrders || 0,
        totalRevenue,
        todayRevenue,
        recentOrders: recentOrders || [],
        ordersByStatus,
    };
}
