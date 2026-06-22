/**
 * Partial Payment Settings — Server-side Service
 *
 * Handles Supabase CRUD for partial_payment_settings table and syncs
 * the merchant's configuration to a shop metafield (PUBLIC_READ) so
 * the storefront extension can read it without any App Proxy round-trip.
 *
 * Metafield location:
 *   namespace: "fox_cod"
 *   key:       "partial_payment_settings_json"
 *   type:      "json"
 *   ownerType: SHOP
 */

import { supabase } from '../config/supabase.server';
import {
  type PaymentOption,
  type ModalSettings,
  type ModuleFlags,
  type PartialPaymentSettings,
  DEFAULT_MODAL_SETTINGS,
  DEFAULT_MODULE_FLAGS,
  DEFAULT_PAYMENT_OPTIONS,
} from '../config/partial-payment.types';

// Re-export types so server-only callers can still import from one place
export type { PaymentOption, ModalSettings, ModuleFlags, PartialPaymentSettings };
export { DEFAULT_MODAL_SETTINGS, DEFAULT_MODULE_FLAGS, DEFAULT_PAYMENT_OPTIONS };

// ── CRUD ───────────────────────────────────────────────────────────────────

/**
 * Fetch partial payment settings for a shop.
 * Returns null if no row exists yet (first install).
 */
export async function getPartialPaymentSettings(
  shopDomain: string
): Promise<PartialPaymentSettings | null> {
  const { data, error } = await supabase
    .from('partial_payment_settings')
    .select('*')
    .eq('shop_domain', shopDomain)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('[PartialPayment] Error fetching settings:', error);
    throw error;
  }

  if (data && data.payment_method_descriptions) {
    if (data.payment_method_descriptions.subtitles) {
      const subs = data.payment_method_descriptions.subtitles;
      data.full_prepaid_subtitle = subs.full_prepaid_subtitle;
      data.partial_payment_subtitle = subs.partial_payment_subtitle;
      data.pure_cod_subtitle = subs.pure_cod_subtitle;
      data.show_full_prepaid_subtitle = subs.show_full_prepaid_subtitle;
      data.show_partial_payment_subtitle = subs.show_partial_payment_subtitle;
      data.show_pure_cod_subtitle = subs.show_pure_cod_subtitle;
    }
    if (data.payment_method_descriptions.partial_discounts) {
      const pdis = data.payment_method_descriptions.partial_discounts;
      data.partial_payment_discount_enabled = pdis.partial_payment_discount_enabled;
      data.partial_payment_discount_type = pdis.partial_payment_discount_type;
      data.partial_payment_discount_value = pdis.partial_payment_discount_value;
    }
  }

  return data as PartialPaymentSettings | null;
}

/**
 * Save (upsert) partial payment settings for a shop.
 * Returns the saved row.
 */
export async function savePartialPaymentSettings(
  settings: PartialPaymentSettings
): Promise<PartialPaymentSettings> {
  const { shop_domain, id, created_at, ...rest } = settings as any;

  // Bundle subtitle settings into the existing JSONB column to avoid DB schema migration
  const pm_desc = { ...(rest.payment_method_descriptions || {}) };
  pm_desc.subtitles = {
    full_prepaid_subtitle: rest.full_prepaid_subtitle,
    partial_payment_subtitle: rest.partial_payment_subtitle,
    pure_cod_subtitle: rest.pure_cod_subtitle,
    show_full_prepaid_subtitle: rest.show_full_prepaid_subtitle,
    show_partial_payment_subtitle: rest.show_partial_payment_subtitle,
    show_pure_cod_subtitle: rest.show_pure_cod_subtitle,
  };
  pm_desc.partial_discounts = {
    partial_payment_discount_enabled: rest.partial_payment_discount_enabled,
    partial_payment_discount_type: rest.partial_payment_discount_type,
    partial_payment_discount_value: rest.partial_payment_discount_value,
  };
  rest.payment_method_descriptions = pm_desc;

  // Remove top-level subtitle properties so Supabase Postgres doesn't error
  delete rest.full_prepaid_subtitle;
  delete rest.partial_payment_subtitle;
  delete rest.pure_cod_subtitle;
  delete rest.show_full_prepaid_subtitle;
  delete rest.show_partial_payment_subtitle;
  delete rest.show_pure_cod_subtitle;
  delete rest.partial_payment_discount_enabled;
  delete rest.partial_payment_discount_type;
  delete rest.partial_payment_discount_value;

  const { data, error } = await supabase
    .from('partial_payment_settings')
    .upsert(
      {
        shop_domain,
        ...rest,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'shop_domain' }
    )
    .select()
    .single();

  if (error) {
    console.error('[PartialPayment] Error saving settings:', error);
    throw error;
  }

  return data as PartialPaymentSettings;
}

// ── Metafield Sync ─────────────────────────────────────────────────────────

/**
 * Sync partial payment settings to a PUBLIC_READ shop metafield.
 * Storefront reads: shop.metafields.fox_cod.partial_payment_settings_json
 *
 * Mirrors the pattern used by syncUpsellsToMetafield() in upsell-offers.server.ts.
 */
export async function syncPartialPaymentToMetafield(
  admin: any,
  shopDomain: string
): Promise<void> {
  // Ensure metafield definition exists (idempotent)
  try {
    await admin.graphql(
      `mutation CreateMetafieldDefinition($definition: MetafieldDefinitionInput!) {
        metafieldDefinitionCreate(definition: $definition) {
          createdDefinition { id key }
          userErrors { field message }
        }
      }`,
      {
        variables: {
          definition: {
            name: 'Partial Payment Settings JSON',
            namespace: 'fox_cod',
            key: 'partial_payment_settings_json',
            type: 'json',
            ownerType: 'SHOP',
            access: { storefront: 'PUBLIC_READ' },
          },
        },
      }
    );
  } catch (_e) {
    // Definition already exists — safe to ignore
  }

  // Load current settings from Supabase
  const settings = await getPartialPaymentSettings(shopDomain);

  // Build the storefront payload (only what the extension needs)
  const storefrontPayload = settings
    ? {
      enabled: settings.enabled,
      payment_options: settings.payment_options ?? [],
      cod_fee_enabled: settings.cod_fee_enabled,
      cod_fee_name: settings.cod_fee_name,
      cod_fee_type: settings.cod_fee_type,
      cod_fee_amount: settings.cod_fee_amount,
      minimum_order_total: settings.minimum_order_total,
      maximum_order_total: settings.maximum_order_total,
      allowed_product_ids: settings.allowed_product_ids ?? [],
      allowed_collection_ids: settings.allowed_collection_ids ?? [],
      allowed_countries: settings.allowed_countries ?? [],
      excluded_countries: settings.excluded_countries ?? [],
      modal_settings: settings.modal_settings ?? DEFAULT_MODAL_SETTINGS,
      module_flags: settings.module_flags ?? DEFAULT_MODULE_FLAGS,
      // Full Prepaid fields
      full_prepaid_enabled: settings.full_prepaid_enabled ?? false,
      full_prepaid_minimum_order_total: settings.full_prepaid_minimum_order_total ?? 0,
      full_prepaid_maximum_order_total: settings.full_prepaid_maximum_order_total ?? 0,
      full_prepaid_allowed_product_ids: settings.full_prepaid_allowed_product_ids ?? [],
      full_prepaid_allowed_collection_ids: settings.full_prepaid_allowed_collection_ids ?? [],
      // Prepaid Discount fields
      prepaid_discount_enabled: settings.prepaid_discount_enabled ?? false,
      prepaid_discount_type: settings.prepaid_discount_type ?? 'percentage',
      prepaid_discount_value: settings.prepaid_discount_value ?? 0,
      // Pure COD fields
      pure_cod_enabled: settings.pure_cod_enabled ?? false,
      pure_cod_fee_enabled: settings.pure_cod_fee_enabled ?? false,
      pure_cod_fee_name: settings.pure_cod_fee_name ?? 'COD Fee',
      pure_cod_fee_type: settings.pure_cod_fee_type ?? 'fixed',
      pure_cod_fee_amount: settings.pure_cod_fee_amount ?? 0,
      pure_cod_minimum_order_total: settings.pure_cod_minimum_order_total ?? 0,
      pure_cod_maximum_order_total: settings.pure_cod_maximum_order_total ?? 0,
      pure_cod_allowed_product_ids: settings.pure_cod_allowed_product_ids ?? [],
      pure_cod_allowed_collection_ids: settings.pure_cod_allowed_collection_ids ?? [],
      country_restrictions: settings.country_restrictions,
      payment_method_restrictions: settings.payment_method_restrictions,
      payment_method_tags: settings.payment_method_tags,
      payment_method_descriptions: settings.payment_method_descriptions,
      full_prepaid_subtitle: settings.full_prepaid_subtitle ?? 'Pay now & get fastest delivery',
      partial_payment_subtitle: settings.partial_payment_subtitle ?? 'Pay a small advance today',
      pure_cod_subtitle: settings.pure_cod_subtitle ?? 'Pay when you receive',
      show_full_prepaid_subtitle: settings.show_full_prepaid_subtitle ?? true,
      show_partial_payment_subtitle: settings.show_partial_payment_subtitle ?? true,
      show_pure_cod_subtitle: settings.show_pure_cod_subtitle ?? true,
      partial_payment_discount_enabled: settings.partial_payment_discount_enabled ?? false,
      partial_payment_discount_type: settings.partial_payment_discount_type ?? 'percentage',
      partial_payment_discount_value: settings.partial_payment_discount_value ?? 0,
    }
    : {
      enabled: true,
      payment_options: DEFAULT_PAYMENT_OPTIONS,
      full_prepaid_enabled: true,
      prepaid_discount_enabled: false,
      pure_cod_enabled: true,
      pure_cod_fee_enabled: false,
      full_prepaid_subtitle: 'Pay now & get fastest delivery',
      partial_payment_subtitle: 'Pay a small advance today',
      pure_cod_subtitle: 'Pay when you receive',
      show_full_prepaid_subtitle: true,
      show_partial_payment_subtitle: true,
      show_pure_cod_subtitle: true,
      payment_method_descriptions: {
        partial_payment: { enabled: true, text: 'Secure your order • Avoid fake cancellations' },
        full_prepaid: { enabled: true, text: 'Pay now, save more, receive sooner' },
        pure_cod: { enabled: true, text: 'Higher return risk • Slightly slower processing' }
      },
      partial_payment_discount_enabled: false,
      partial_payment_discount_type: 'percentage',
      partial_payment_discount_value: 0,
    };

  // Get shop GID
  const shopRes = await admin.graphql(`{ shop { id } }`);
  const shopData = await shopRes.json();
  const shopId = shopData?.data?.shop?.id;

  if (!shopId) {
    console.error('[PartialPayment] Could not get shop GID for metafield sync');
    return;
  }

  // Write metafield
  const setRes = await admin.graphql(
    `mutation SetMetafield($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id key value }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        metafields: [
          {
            ownerId: shopId,
            namespace: 'fox_cod',
            key: 'partial_payment_settings_json',
            value: JSON.stringify(storefrontPayload),
            type: 'json',
          },
        ],
      },
    }
  );

  const setData = await setRes.json();
  const errors = setData?.data?.metafieldsSet?.userErrors ?? [];
  if (errors.length > 0) {
    console.error('[PartialPayment] Metafield sync errors:', errors);
  } else {
    console.log('[PartialPayment] Metafield synced successfully for:', shopDomain);
  }
}

// ── Eligibility Engine ─────────────────────────────────────────────────────

/**
 * Unified server-side eligibility check for both Partial Payment and Full Prepaid.
 * Used by proxy routes that need to validate before checkout creation.
 *
 * The storefront JS performs the same check client-side using the
 * metafield payload, so this is a secondary server-side guard.
 *
 * @param settings - the loaded PartialPaymentSettings row
 * @param method   - 'partial_payment' | 'full_prepaid'
 * @param params   - orderTotal, productId, collectionIds, country
 */
export function isPaymentMethodEligible(
  settings: PartialPaymentSettings,
  method: 'partial_payment' | 'full_prepaid' | 'pure_cod',
  params: {
    orderTotal: number;
    productId?: string;
    collectionIds?: string[];
    country?: string;
  }
): { eligible: boolean; reason?: string } {
  // ── 1. enabled check ──
  const enabled = method === 'full_prepaid'
    ? settings.full_prepaid_enabled
    : method === 'pure_cod'
      ? settings.pure_cod_enabled
      : settings.enabled;
  if (!enabled) {
    return { eligible: false, reason: `${method.replace('_', ' ')} is disabled` };
  }

  const { orderTotal, productId, collectionIds = [], country } = params;

  // ── 2. Order total restrictions ──
  const min = method === 'full_prepaid'
    ? (settings.full_prepaid_minimum_order_total ?? 0)
    : method === 'pure_cod'
      ? (settings.pure_cod_minimum_order_total ?? 0)
      : (settings.minimum_order_total ?? 0);
  const max = method === 'full_prepaid'
    ? (settings.full_prepaid_maximum_order_total ?? 0)
    : method === 'pure_cod'
      ? (settings.pure_cod_maximum_order_total ?? 0)
      : (settings.maximum_order_total ?? 0);

  if (min > 0 && orderTotal < min) {
    return { eligible: false, reason: `Order total must be at least ${min}` };
  }
  if (max > 0 && orderTotal > max) {
    return { eligible: false, reason: `Order total exceeds maximum of ${max}` };
  }

  // ── 3. Country restrictions ──
  const isCountryAllowed = (method: string, country?: string) => {
    if (!country) return true; // Rule 4

    let allowed: string[] = [];
    let excluded: string[] = [];

    const restrictionKey = method === 'pure_cod' ? 'full_cod' : method;

    if (settings.country_restrictions) {
      const config = (settings.country_restrictions as any)[restrictionKey];
      if (config) {
        allowed = config.allowedCountries || [];
        excluded = config.excludedCountries || [];
      }
    } else if (method === 'partial_payment') {
      // Legacy fallback
      allowed = settings.allowed_countries || [];
      excluded = settings.excluded_countries || [];
    }

    if (excluded.length > 0 && excluded.includes(country)) return false; // Rule 1
    if (allowed.length > 0 && !allowed.includes(country)) return false; // Rule 2
    return true; // Rule 3
  };

  if (!isCountryAllowed(method, country)) {
    let methodLabel = 'This payment method is';
    if (method === 'partial_payment') methodLabel = 'Partial payments are';
    if (method === 'full_prepaid') methodLabel = 'Prepaid orders are';
    if (method === 'pure_cod') methodLabel = 'Cash on Delivery is';
    return { eligible: false, reason: `${methodLabel} not available in your country` };
  }

  // ── 4. Product / Collection restrictions ──
  const methodConfig = settings.payment_method_restrictions?.[method];

  // Fallback to legacy flat columns if JSONB is not populated
  const allowedProducts = methodConfig?.allowed_product_ids || (method === 'full_prepaid'
    ? (settings.full_prepaid_allowed_product_ids ?? [])
    : method === 'pure_cod'
      ? (settings.pure_cod_allowed_product_ids ?? [])
      : (settings.allowed_product_ids ?? []));

  const allowedCollections = methodConfig?.allowed_collection_ids || (method === 'full_prepaid'
    ? (settings.full_prepaid_allowed_collection_ids ?? [])
    : method === 'pure_cod'
      ? (settings.pure_cod_allowed_collection_ids ?? [])
      : (settings.allowed_collection_ids ?? []));

  const restrictedProducts = methodConfig?.restricted_product_ids || [];
  const restrictedCollections = methodConfig?.restricted_collection_ids || [];

  const numericProductId = productId ? String(productId).replace(/[^0-9]/g, '') : null;
  const numericCollectionIds = collectionIds.map(cid => String(cid).replace(/[^0-9]/g, ''));

  // Rule 1: Restricted items always win
  if (numericProductId && restrictedProducts.some(id => String(id).replace(/[^0-9]/g, '') === numericProductId)) {
    return { eligible: false, reason: `${method.replace('_', ' ')} is restricted for this product` };
  }

  if (numericCollectionIds.length > 0 && restrictedCollections.some(rid => numericCollectionIds.includes(String(rid).replace(/[^0-9]/g, '')))) {
    return { eligible: false, reason: `${method.replace('_', ' ')} is restricted for this collection` };
  }

  // Rule 2 & 3: Check allowed lists if they are populated
  const hasAllowedProductFilter = allowedProducts.length > 0;
  const hasAllowedCollectionFilter = allowedCollections.length > 0;

  if (hasAllowedProductFilter || hasAllowedCollectionFilter) {
    let productAllowed = false;

    if (hasAllowedProductFilter && numericProductId) {
      productAllowed = allowedProducts.some(id => String(id).replace(/[^0-9]/g, '') === numericProductId);
    }

    if (!productAllowed && hasAllowedCollectionFilter && numericCollectionIds.length > 0) {
      productAllowed = numericCollectionIds.some(cid =>
        allowedCollections.some(allowed => String(allowed).replace(/[^0-9]/g, '') === cid)
      );
    }

    if (!productAllowed) {
      return { eligible: false, reason: `${method.replace('_', ' ')} not available for this product` };
    }
  }

  return { eligible: true };
}

/**
 * @deprecated Use isPaymentMethodEligible({ method: 'partial_payment' }) instead.
 * Kept for backward compatibility with existing callers.
 */
export function isPartialPaymentEligibleServer(
  settings: PartialPaymentSettings,
  params: {
    orderTotal: number;
    productId?: string;
    collectionIds?: string[];
    country?: string;
  }
): { eligible: boolean; reason?: string } {
  return isPaymentMethodEligible(settings, 'partial_payment', params);
}

// ── Deposit Calculation ────────────────────────────────────────────────────

/**
 * Calculate the advance amount (deposit) based on a payment option and order total.
 * Also adds the COD fee if enabled.
 *
 * Returns: { depositAmount, codFeeAmount, payNow, remainingCod }
 */
export function calculateDepositAmounts(
  option: PaymentOption,
  orderTotal: number,
  settings: PartialPaymentSettings
): {
  depositAmount: number;
  codFeeAmount: number;
  payNow: number;
  remainingCod: number;
} {
  let depositAmount = 0;

  switch (option.type) {
    case 'percentage':
      depositAmount = (orderTotal * option.value) / 100;
      break;
    case 'fixed':
      depositAmount = Math.min(option.value, orderTotal);
      break;
    case 'remaining_percentage':
      // e.g. "Pay 30% of discounted total" — same as percentage but labeled differently
      depositAmount = (orderTotal * option.value) / 100;
      break;
    default:
      depositAmount = option.value;
  }

  // Round to 2 decimal places
  depositAmount = Math.round(depositAmount * 100) / 100;

  // COD fee
  let codFeeAmount = 0;
  if (settings.cod_fee_enabled && settings.cod_fee_amount > 0) {
    if (settings.cod_fee_type === 'percentage') {
      codFeeAmount = Math.round((depositAmount * settings.cod_fee_amount) / 100 * 100) / 100;
    } else {
      codFeeAmount = settings.cod_fee_amount;
    }
  }

  const payNow = Math.round((depositAmount + codFeeAmount) * 100) / 100;
  const remainingCod = Math.max(Math.round((orderTotal - depositAmount) * 100) / 100, 0);

  return { depositAmount, codFeeAmount, payNow, remainingCod };
}

// ── Prepaid Discount ───────────────────────────────────────────────────────

/**
 * Calculate the prepaid discount amount, assuming Full Prepaid is already eligible.
 * Called by checkout creation logic to determine final discount to apply.
 */
export function getPrepaidDiscount(
  settings: PartialPaymentSettings,
  cartTotal: number
): {
  eligible: boolean;
  discountType?: 'percentage' | 'fixed';
  discountValue?: number;
  discountAmount?: number;
  finalPrice?: number;
} {
  if (!settings.prepaid_discount_enabled) return { eligible: false };
  if (!settings.prepaid_discount_value || settings.prepaid_discount_value <= 0) return { eligible: false };

  let discountAmount =
    settings.prepaid_discount_type === 'percentage'
      ? (cartTotal * settings.prepaid_discount_value) / 100
      : settings.prepaid_discount_value;

  // Safety: never exceed cart total
  discountAmount = Math.min(Math.round(discountAmount * 100) / 100, cartTotal);

  return {
    eligible: true,
    discountType: settings.prepaid_discount_type,
    discountValue: settings.prepaid_discount_value,
    discountAmount,
    finalPrice: Math.round((cartTotal - discountAmount) * 100) / 100,
  };
}
