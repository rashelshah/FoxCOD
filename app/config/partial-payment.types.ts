/**
 * Partial Payment Settings — Shared Types & Defaults
 *
 * This file is safe to import from both server and client (route) code.
 * It contains only plain types and constant values — NO server-only imports.
 *
 * Server-only logic (Supabase, metafield sync) lives in:
 *   app/services/partial-payment-settings.server.ts
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface PaymentOption {
  id: string;
  label: string;
  /** 'percentage' | 'fixed' | 'remaining_percentage' */
  type: 'percentage' | 'fixed' | 'remaining_percentage';
  value: number;
}

export interface ModalSettings {
  left_bg_color: string;
  left_gradient_start: string;
  left_gradient_end: string;
  left_text_color: string;
  right_bg_color: string;
  right_border_color: string;
  button_color: string;
  button_text_color: string;
  title: string;
  subtitle: string;
  security_text: string;
  footer_text: string;
  show_security_icons: boolean;
}

export interface ModuleFlags {
  apply_coupons_to_partial: boolean;
  apply_bundle_discounts_to_partial: boolean;
  apply_upsells_to_partial: boolean;
}

export interface PartialPaymentSettings {
  id?: number;
  shop_domain: string;
  enabled: boolean;
  payment_options: PaymentOption[];
  cod_fee_enabled: boolean;
  cod_fee_name: string;
  cod_fee_type: 'fixed' | 'percentage';
  cod_fee_amount: number;
  minimum_order_total: number;
  maximum_order_total: number;
  allowed_product_ids: string[];
  allowed_collection_ids: string[];
  allowed_countries: string[];
  excluded_countries: string[];
  modal_settings: ModalSettings;
  module_flags: ModuleFlags;
  // Full Prepaid settings
  full_prepaid_enabled: boolean;
  full_prepaid_minimum_order_total: number;
  full_prepaid_maximum_order_total: number;
  full_prepaid_allowed_product_ids: string[];
  full_prepaid_allowed_collection_ids: string[];
  // Prepaid Discount (inherits Full Prepaid eligibility)
  prepaid_discount_enabled: boolean;
  prepaid_discount_type: 'percentage' | 'fixed';
  prepaid_discount_value: number;
  created_at?: string;
  updated_at?: string;
}

// ── Defaults ───────────────────────────────────────────────────────────────

export const DEFAULT_MODAL_SETTINGS: ModalSettings = {
  left_bg_color: '#1a1a2e',
  left_gradient_start: '#16213e',
  left_gradient_end: '#0f3460',
  left_text_color: '#ffffff',
  right_bg_color: '#ffffff',
  right_border_color: '#e5e7eb',
  button_color: '#1f2937',
  button_text_color: '#ffffff',
  title: 'Choose Your Payment Option',
  subtitle: 'Pay a small amount now and the rest on delivery',
  security_text: 'Secure Payments · Verified Seller · Assured Delivery',
  footer_text: 'Remaining amount collected on delivery',
  show_security_icons: true,
};

export const DEFAULT_MODULE_FLAGS: ModuleFlags = {
  apply_coupons_to_partial: true,
  apply_bundle_discounts_to_partial: true,
  apply_upsells_to_partial: true,
};

export const DEFAULT_PAYMENT_OPTIONS: PaymentOption[] = [
  { id: 'opt_10pct', label: 'Pay 10% Now', type: 'percentage', value: 10 },
];
