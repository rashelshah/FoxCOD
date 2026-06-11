/**
 * Supabase Client Configuration
 * Server-side only - uses service role key for full access
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ORDER_STATUSES, type OrderStatus, type SyncStatus, RETRY_DELAYS_SEC } from './constants';

// Re-export for other server modules
export { ORDER_STATUSES, type OrderStatus, type SyncStatus, RETRY_DELAYS_SEC };

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

// Import types and defaults from shared file for local use
import {
    FormField,
    CouponConfig,
    ContentBlocks,
    FormStyles,
    ButtonStyles,
    ShippingOption,
    ShippingOptions,
    FormSubmitButtonStyles,
    DEFAULT_FIELDS,
    DEFAULT_BLOCKS,
    DEFAULT_STYLES,
    DEFAULT_BUTTON_STYLES,
    DEFAULT_SHIPPING_OPTIONS,
    DEFAULT_FORM_SUBMIT_BUTTON,
} from './form-builder.types';

// Re-export for other modules
export type { FormField, CouponConfig, ContentBlocks, FormStyles, ButtonStyles, ShippingOption, ShippingOptions, FormSubmitButtonStyles };
export { DEFAULT_FIELDS, DEFAULT_BLOCKS, DEFAULT_STYLES, DEFAULT_BUTTON_STYLES, DEFAULT_SHIPPING_OPTIONS, DEFAULT_FORM_SUBMIT_BUTTON };

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
    // New advanced features (JSONB columns)
    form_type?: 'popup' | 'embedded';
    fields?: FormField[];
    blocks?: ContentBlocks;
    custom_fields?: FormField[];
    styles?: FormStyles;
    button_styles?: ButtonStyles;
    shipping_options?: ShippingOptions;
    // Partial COD settings
    partial_cod_enabled?: boolean;
    partial_cod_advance_amount?: number;
    partial_cod_commission?: number;
    // Shipping rates settings
    shipping_rates_enabled?: boolean;
    enable_coupon_field?: boolean;
    coupon_field_position?: number;
    coupons?: CouponConfig[];
    // Form submit button style overrides
    form_submit_button?: FormSubmitButtonStyles;
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
 * Handles both legacy fields and new JSONB columns for advanced features
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
                // New JSONB columns for advanced features
                form_type: settings.form_type || 'popup',
                fields: settings.fields || DEFAULT_FIELDS,
                blocks: settings.blocks || DEFAULT_BLOCKS,
                custom_fields: settings.custom_fields || [],
                styles: settings.styles || DEFAULT_STYLES,
                button_styles: settings.button_styles || DEFAULT_BUTTON_STYLES,
                shipping_options: settings.shipping_options || DEFAULT_SHIPPING_OPTIONS,
                // Partial COD settings
                partial_cod_enabled: settings.partial_cod_enabled ?? false,
                partial_cod_advance_amount: settings.partial_cod_advance_amount ?? 100,
                partial_cod_commission: settings.partial_cod_commission ?? 0,
                // Shipping rates settings
                shipping_rates_enabled: settings.shipping_rates_enabled ?? false,
                enable_coupon_field: settings.enable_coupon_field ?? false,
                coupon_field_position: settings.coupon_field_position ?? 13,
                coupons: settings.coupons || [],
                // Form submit button style overrides
                form_submit_button: settings.form_submit_button || DEFAULT_FORM_SUBMIT_BUTTON,
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
    id?: number;
    shop_domain: string;
    product_id: string;
    product_title: string;
    variant_id?: string;
    variant_title?: string;
    quantity: number;
    price: string;
    customer_name: string;
    customer_phone: string;
    customer_address: string;
    customer_email?: string;
    notes?: string;
    city?: string;
    state?: string;
    pincode?: string;
    shipping_label?: string;
    shipping_price?: number;
    currency?: string;
    coupon_code?: string;
    discount_amount?: number;
    original_total?: number;
    final_total?: number;
    created_at?: string;
    // Partial COD tracking
    is_partial_cod?: boolean;
    advance_amount?: number;
    remaining_cod_amount?: number;
    // Full Prepaid tracking
    is_full_prepaid?: boolean;
    /** Canonical payment method: 'cod' | 'partial_cod' | 'full_prepaid' */
    payment_method?: 'cod' | 'partial_cod' | 'full_prepaid';
    // 2-phase sync: full request payload for retry after restart
    order_payload?: Record<string, any>;
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
 * Log a new COD order
 * Maps OrderLogEntry fields to order_logs schema (total_price, customer_notes)
 */
export async function logOrder(order: OrderLogEntry) {
    const totalPrice = order.price ? parseFloat(String(order.price)) : 0;
    const insertPayload: Record<string, unknown> = {
        shop_domain: order.shop_domain,
        customer_name: order.customer_name,
        customer_phone: order.customer_phone,
        customer_address: order.customer_address,
        customer_email: order.customer_email ?? null,
        customer_notes: order.notes ?? null,
        product_id: order.product_id,
        product_title: order.product_title,
        variant_id: order.variant_id ?? null,
        quantity: order.quantity,
        total_price: totalPrice,
        status: 'pending',
        sync_status: 'pending_sync',
        sync_attempts: 0,
    };
    if (order.city != null) insertPayload.city = order.city;
    if (order.state != null) insertPayload.state = order.state;
    if (order.pincode != null) insertPayload.pincode = order.pincode;
    if (order.shipping_label != null) insertPayload.shipping_label = order.shipping_label;
    if (order.shipping_price != null) insertPayload.shipping_price = order.shipping_price;
    if (order.currency != null) insertPayload.currency = order.currency;
    if (order.coupon_code != null) insertPayload.coupon_code = order.coupon_code;
    if (order.discount_amount != null) insertPayload.discount_amount = order.discount_amount;
    if (order.original_total != null) insertPayload.original_total = order.original_total;
    if (order.final_total != null) insertPayload.final_total = order.final_total;
    if (order.order_payload != null) insertPayload.order_payload = order.order_payload;
    if (order.is_partial_cod != null) insertPayload.is_partial_cod = order.is_partial_cod;
    if (order.advance_amount != null) insertPayload.advance_amount = order.advance_amount;
    if (order.remaining_cod_amount != null) insertPayload.remaining_cod_amount = order.remaining_cod_amount;
    if (order.is_full_prepaid != null) insertPayload.is_full_prepaid = order.is_full_prepaid;
    // payment_method: always set — defaults to 'cod' if not provided
    insertPayload.payment_method = order.payment_method ?? 'cod';

    const { data, error } = await supabase
        .from('order_logs')
        .insert(insertPayload)
        .select()
        .single();

    if (error) {
        console.error('Error logging order:', error);
        throw error;
    }

    // Generate order name for display (COD-XXX format)
    const orderName = data ? `COD-${String(data.id).slice(-8).toUpperCase()}` : 'COD-PENDING';
    return { ...data, shopify_order_name: orderName };
}

/**
 * Log a new COD order with Shopify IDs already known (post-Shopify-success).
 * Saves the order as already-synced in a single DB call — no separate update needed.
 */
export async function logOrderWithShopifyIds(
    order: OrderLogEntry,
    shopifyOrderId: string,
    shopifyOrderName: string
) {
    const totalPrice = order.price ? parseFloat(String(order.price)) : 0;
    const insertPayload: Record<string, unknown> = {
        shop_domain: order.shop_domain,
        customer_name: order.customer_name,
        customer_phone: order.customer_phone,
        customer_address: order.customer_address,
        customer_email: order.customer_email ?? null,
        customer_notes: order.notes ?? null,
        product_id: order.product_id,
        product_title: order.product_title,
        variant_id: order.variant_id ?? null,
        quantity: order.quantity,
        total_price: totalPrice,
        status: 'pending',
        // Already synced — no need for a follow-up update
        sync_status: 'synced',
        sync_attempts: 0,
        shopify_order_id: shopifyOrderId,
        shopify_order_name: shopifyOrderName,
        last_synced_at: new Date().toISOString(),
    };
    if (order.city != null) insertPayload.city = order.city;
    if (order.state != null) insertPayload.state = order.state;
    if (order.pincode != null) insertPayload.pincode = order.pincode;
    if (order.shipping_label != null) insertPayload.shipping_label = order.shipping_label;
    if (order.shipping_price != null) insertPayload.shipping_price = order.shipping_price;
    if (order.currency != null) insertPayload.currency = order.currency;
    if (order.coupon_code != null) insertPayload.coupon_code = order.coupon_code;
    if (order.discount_amount != null) insertPayload.discount_amount = order.discount_amount;
    if (order.original_total != null) insertPayload.original_total = order.original_total;
    if (order.final_total != null) insertPayload.final_total = order.final_total;
    if (order.order_payload != null) insertPayload.order_payload = order.order_payload;
    if (order.is_partial_cod != null) insertPayload.is_partial_cod = order.is_partial_cod;
    if (order.advance_amount != null) insertPayload.advance_amount = order.advance_amount;
    if (order.remaining_cod_amount != null) insertPayload.remaining_cod_amount = order.remaining_cod_amount;
    if (order.is_full_prepaid != null) insertPayload.is_full_prepaid = order.is_full_prepaid;
    // payment_method: always set — defaults to 'cod' if not provided
    insertPayload.payment_method = order.payment_method ?? 'cod';

    const { data, error } = await supabase
        .from('order_logs')
        .insert(insertPayload)
        .select()
        .single();

    if (error) {
        console.error('Error logging order with Shopify IDs:', error);
        throw error;
    }

    return { ...data, shopify_order_name: shopifyOrderName };
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

// =============================================
// SHOPIFY SYNC OPERATIONS (2-Phase System)
// =============================================

/**
 * Atomic lock: attempts to claim an order for syncing.
 * Returns true if lock acquired, false if already syncing/synced.
 */
export async function acquireSyncLock(orderId: string): Promise<boolean> {
    const { data, error } = await supabase
        .from('order_logs')
        .update({ sync_status: 'syncing' })
        .eq('id', orderId)
        .in('sync_status', ['pending_sync', 'failed_sync'])
        .select('id')
        .maybeSingle();

    if (error) {
        console.error('[Sync] Error acquiring lock:', error);
        return false;
    }
    // If data is returned, the update matched a row → lock acquired
    return data !== null;
}

/**
 * Get a single order log by its ID (used by background sync to reload from DB)
 */
export async function getOrderById(orderId: string) {
    const { data, error } = await supabase
        .from('order_logs')
        .select('*')
        .eq('id', orderId)
        .single();

    if (error) {
        console.error('[Supabase] Error fetching order by id:', error);
        return null;
    }
    return data;
}

/**
 * Mark order as currently syncing (used before Shopify API call)
 */
export async function markSyncSyncing(orderId: string) {
    const { error } = await supabase
        .from('order_logs')
        .update({ sync_status: 'syncing' })
        .eq('id', orderId);

    if (error) {
        console.error('[Sync] Error marking syncing:', error);
    }
}

/**
 * Mark order as successfully synced to Shopify
 */
export async function markSynced(
    orderId: string,
    shopifyOrderId: string,
    shopifyOrderName: string
) {
    const { error } = await supabase
        .from('order_logs')
        .update({
            sync_status: 'synced',
            shopify_order_id: shopifyOrderId,
            shopify_order_name: shopifyOrderName,
            last_synced_at: new Date().toISOString(),
            sync_error: null,
        })
        .eq('id', orderId);

    if (error) {
        console.error('[Sync] Error marking synced:', error);
        throw error;
    }
}

/**
 * Mark order sync as failed, increment attempts, compute next_retry_at
 */
export async function markSyncFailed(orderId: string, errorMsg: string, currentAttempt: number) {
    const delayIndex = Math.min(currentAttempt, RETRY_DELAYS_SEC.length - 1);
    const delaySec = RETRY_DELAYS_SEC[delayIndex];
    const nextRetry = new Date(Date.now() + delaySec * 1000).toISOString();

    const { error } = await supabase
        .from('order_logs')
        .update({
            sync_status: 'failed_sync',
            sync_error: errorMsg.substring(0, 500),
            sync_attempts: currentAttempt + 1,
            next_retry_at: nextRetry,
        })
        .eq('id', orderId);

    if (error) {
        console.error('[Sync] Error marking failed:', error);
    }
}

/**
 * Get orders that are eligible for retry
 */
export async function getRetryableOrders(shopDomain: string) {
    const { data, error } = await supabase
        .from('order_logs')
        .select('*')
        .eq('shop_domain', shopDomain)
        .in('sync_status', ['pending_sync', 'failed_sync'])
        .lt('sync_attempts', 5)
        .or(`next_retry_at.is.null,next_retry_at.lte.${new Date().toISOString()}`)
        .order('created_at', { ascending: true })
        .limit(50);

    if (error) {
        console.error('[Sync] Error fetching retryable orders:', error);
        return [];
    }
    return data || [];
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

// =============================================
// INTEGRATION SETTINGS OPERATIONS
// =============================================

import type { IntegrationSettings } from './integrations.types';
export type { IntegrationSettings };

/**
 * Get integration settings for a specific integration and shop
 */
export async function getIntegrationSettings(
    shopDomain: string,
    integrationId: string
): Promise<IntegrationSettings | null> {
    const { data, error } = await supabase
        .from('integration_settings')
        .select('*')
        .eq('shop_domain', shopDomain)
        .eq('integration_id', integrationId)
        .single();

    if (error && error.code !== 'PGRST116') {
        console.error('Error getting integration settings:', error);
        throw error;
    }

    return data;
}

/**
 * Get all integration settings for a shop
 */
export async function getAllIntegrationSettings(
    shopDomain: string
): Promise<IntegrationSettings[]> {
    const { data, error } = await supabase
        .from('integration_settings')
        .select('*')
        .eq('shop_domain', shopDomain);

    if (error) {
        console.error('Error getting all integration settings:', error);
        throw error;
    }

    return data || [];
}

/**
 * Save or update integration settings
 */
export async function saveIntegrationSettings(settings: IntegrationSettings) {
    console.log('[Supabase] Saving integration settings:', settings.integration_id);

    const { data, error } = await supabase
        .from('integration_settings')
        .upsert(
            {
                shop_domain: settings.shop_domain,
                integration_id: settings.integration_id,
                enabled: settings.enabled,
                connected: settings.connected,
                connected_email: settings.connected_email || null,
                config: settings.config || {},
                connected_at: settings.connected ? new Date().toISOString() : null,
            },
            { onConflict: 'shop_domain,integration_id' }
        )
        .select()
        .single();

    if (error) {
        console.error('[Supabase] Error saving integration settings:', error);
        throw error;
    }

    console.log('[Supabase] Integration settings saved successfully');
    return data;
}

/**
 * Disconnect an integration (clear tokens and mark as disconnected)
 */
export async function disconnectIntegration(
    shopDomain: string,
    integrationId: string
) {
    const { error } = await supabase
        .from('integration_settings')
        .update({
            connected: false,
            enabled: false,
            connected_email: null,
            access_token: null,
            refresh_token: null,
            token_expires_at: null,
            connected_at: null,
        })
        .eq('shop_domain', shopDomain)
        .eq('integration_id', integrationId);

    if (error) {
        console.error('[Supabase] Error disconnecting integration:', error);
        throw error;
    }

    console.log('[Supabase] Integration disconnected:', integrationId);
}

/**
 * Get comprehensive analytics stats directly from Supabase
 */
export async function getAnalyticsStats(shopDomain: string, createdAtMin?: string) {
    let query = supabase
        .from('order_logs')
        .select('*')
        .eq('shop_domain', shopDomain);

    if (createdAtMin) {
        query = query.gte('created_at', createdAtMin);
    }

    const { data: orders, error } = await query;

    if (error) {
        console.error('Error fetching analytics orders from Supabase:', error);
        throw error;
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    let totalRevenue = 0;
    let todayOrders = 0;
    let todayRevenue = 0;
    let weekOrders = 0;
    let pendingOrders = 0;
    let fulfilledOrders = 0;
    let cancelledOrders = 0;
    let refundedOrders = 0;
    let partiallyRefundedOrders = 0;
    let paidOrders = 0;
    let pendingRevenue = 0;
    let partialOrdersCount = 0;
    let advanceCollected = 0;
    let remainingCodValue = 0;
    let fullPrepaidOrdersCount = 0;
    let fullPrepaidRevenue = 0;
    let pureCodOrdersCount = 0;
    let pureCodFeeRevenue = 0;
    let partialCodFeeRevenue = 0;
    let prepaidDiscountsTotal = 0;
    let prepaidDiscountOrdersCount = 0;

    for (const order of (orders || [])) {
        const createdAt = new Date(order.created_at);
        const price = order.total_price || 0;
        const isCancelled = order.status === 'cancelled' || order.shopify_cancelled_at !== null;
        const finStatus = (order.shopify_financial_status || '').toLowerCase();
        const fulfillStatus = (order.shopify_fulfillment_status || '').toLowerCase();

        // Revenue: exclude cancelled and fully refunded
        if (!isCancelled && finStatus !== "refunded") {
            totalRevenue += price;
        }

        // Time-based counts
        if (createdAt >= todayStart) {
            todayOrders++;
            if (!isCancelled && finStatus !== "refunded") {
                todayRevenue += price;
            }
        }
        if (createdAt >= weekStart) {
            weekOrders++;
        }

        // Status breakdowns
        if (isCancelled) {
            cancelledOrders++;
        } else if (finStatus === "refunded") {
            refundedOrders++;
        } else if (finStatus === "partially_refunded") {
            partiallyRefundedOrders++;
        } else if (finStatus === "pending") {
            pendingOrders++;
            pendingRevenue += price;
        } else if (finStatus === "paid" || finStatus === "authorized") {
            paidOrders++;
        }

        // Fulfillment
        if (!isCancelled && fulfillStatus === "fulfilled") {
            fulfilledOrders++;
        }

        // Partial COD calculations
        if (order.payment_method === 'partial_cod') {
            partialOrdersCount++;
            advanceCollected += (order.advance_amount || 0);
            remainingCodValue += (order.remaining_cod_amount || 0);
            
            const payload = order.order_payload || {};
            if (payload.codFeeAmount) {
                partialCodFeeRevenue += parseFloat(payload.codFeeAmount);
            }
        }
        
        // Pure COD calculations
        if (order.payment_method === 'cod') {
            pureCodOrdersCount++;
            const payload = order.order_payload || {};
            if (!isCancelled && finStatus !== "refunded" && payload.pureCodFeeAmount) {
                pureCodFeeRevenue += parseFloat(payload.pureCodFeeAmount);
            }
        }

        // Full Prepaid calculations
        if (order.payment_method === 'full_prepaid') {
            fullPrepaidOrdersCount++;
            if (!isCancelled && finStatus !== "refunded") {
                fullPrepaidRevenue += price;
            }
            
            const payload = order.order_payload || {};
            if (payload.prepaid_discount_amount && parseFloat(payload.prepaid_discount_amount) > 0) {
                prepaidDiscountOrdersCount++;
                prepaidDiscountsTotal += parseFloat(payload.prepaid_discount_amount);
            }
        }
    }

    const totalOrders = (orders || []).length;
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    const prepaidAvgDiscount = prepaidDiscountOrdersCount > 0 ? prepaidDiscountsTotal / prepaidDiscountOrdersCount : 0;

    return {
        totalOrders,
        totalRevenue,
        avgOrderValue,
        todayOrders,
        weekOrders,
        pendingOrders,
        fulfilledOrders,
        cancelledOrders,
        refundedOrders,
        partiallyRefundedOrders,
        paidOrders,
        todayRevenue,
        pendingRevenue,
        partialOrdersCount,
        advanceCollected,
        remainingCodValue,
        fullPrepaidOrdersCount,
        fullPrepaidRevenue,
        pureCodOrdersCount,
        pureCodFeeRevenue,
        partialCodFeeRevenue,
        prepaidDiscountOrdersCount,
        prepaidDiscountsTotal,
        prepaidAvgDiscount,
    };
}
