/**
 * Partial Payments Page
 * Route: /app/partial-payments
 *
 * 4 Polaris Cards:
 *   1. General Settings
 *   2. Payment Options
 *   3. Restrictions
 *   4. Appearance & Modal Customization
 */
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { LoaderFunctionArgs, ActionFunctionArgs } from 'react-router';
import { useLoaderData, useSubmit, useNavigation, useActionData, Link } from 'react-router';
import { useAppBridge } from '@shopify/app-bridge-react';
import { authenticate } from '../shopify.server';
import {
  getPartialPaymentSettings,
  savePartialPaymentSettings,
  syncPartialPaymentToMetafield,
} from '../services/partial-payment-settings.server';
import {
  DEFAULT_MODAL_SETTINGS,
  DEFAULT_MODULE_FLAGS,
  DEFAULT_PAYMENT_OPTIONS,
  type PartialPaymentSettings,
  type PaymentOption,
  type ModalSettings,
  type ModuleFlags,
} from '../config/partial-payment.types';
import {
  Page,
  Layout,
  Card,
  Button,
  Badge,
  Text,
  InlineStack,
  BlockStack,
  Box,
  Divider,
  TextField,
  Select,
  Banner,
  InlineGrid,
  Tag,
  ColorPicker,
} from '@shopify/polaris';
import { DeleteIcon, PlusIcon } from '@shopify/polaris-icons';

// ── Loader ─────────────────────────────────────────────────────────────────

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shopDomain = session.shop;

  let settings = await getPartialPaymentSettings(shopDomain);

  // First-visit defaults
  if (!settings) {
    settings = {
      shop_domain: shopDomain,
      enabled: false,
      payment_options: DEFAULT_PAYMENT_OPTIONS,
      cod_fee_enabled: false,
      cod_fee_name: 'COD Fee',
      cod_fee_type: 'fixed',
      cod_fee_amount: 0,
      minimum_order_total: 0,
      maximum_order_total: 0,
      allowed_product_ids: [],
      allowed_collection_ids: [],
      allowed_countries: [],
      excluded_countries: [],
      modal_settings: DEFAULT_MODAL_SETTINGS,
      module_flags: DEFAULT_MODULE_FLAGS,
      full_prepaid_enabled: false,
      full_prepaid_minimum_order_total: 0,
      full_prepaid_maximum_order_total: 0,
      full_prepaid_allowed_product_ids: [],
      full_prepaid_allowed_collection_ids: [],
      prepaid_discount_enabled: false,
      prepaid_discount_type: 'percentage',
      prepaid_discount_value: 0,
    };
  }

  // Shop currency
  let shopCurrency = 'INR';
  try {
    const res = await admin.graphql(`{ shop { currencyCode } }`);
    const d = await res.json();
    shopCurrency = d?.data?.shop?.currencyCode || 'INR';
  } catch (_e) { /* ignore */ }

  return { settings, shopDomain, shopCurrency };
};

// ── Action ─────────────────────────────────────────────────────────────────

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const formData = await request.formData();

  try {
    const raw = formData.get('settingsData') as string;
    const incoming = JSON.parse(raw) as PartialPaymentSettings;

    // Validate payment options
    for (const opt of incoming.payment_options || []) {
      if (!opt.label || opt.label.trim() === '') {
        return { success: false, error: 'All payment options must have a label.' };
      }
      if (opt.value <= 0) {
        return { success: false, error: 'Payment option values must be greater than 0.' };
      }
      if ((opt.type === 'percentage' || opt.type === 'remaining_percentage') && opt.value > 100) {
        return { success: false, error: 'Percentage values cannot exceed 100.' };
      }
    }

    // Validate COD fee
    if (incoming.cod_fee_enabled && incoming.cod_fee_amount < 0) {
      return { success: false, error: 'COD fee amount must be 0 or greater.' };
    }

    // Validate Prepaid Discount
    if (incoming.prepaid_discount_enabled) {
      const v = incoming.prepaid_discount_value;
      if (incoming.prepaid_discount_type === 'percentage') {
        if (v < 0.01 || v > 100)
          return { success: false, error: 'Percentage discount must be between 0.01% and 100%.' };
      } else {
        if (v < 0.01)
          return { success: false, error: 'Fixed discount must be at least 0.01.' };
      }
    }

    const toSave: PartialPaymentSettings = {
      ...incoming,
      shop_domain: shopDomain,
      modal_settings: incoming.modal_settings || DEFAULT_MODAL_SETTINGS,
      module_flags: incoming.module_flags || DEFAULT_MODULE_FLAGS,
    };

    await savePartialPaymentSettings(toSave);
    await syncPartialPaymentToMetafield(admin, shopDomain);

    return { success: true };
  } catch (e: any) {
    console.error('[PartialPayments] Action error:', e);
    return { success: false, error: e.message || 'Failed to save settings.' };
  }
};

// ── CSS ────────────────────────────────────────────────────────────────────

const S = `
/* ── Layout ── */
.pp-page { max-width: 1000px; margin: 0 auto; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
.pp-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 28px; }
.pp-header-left { display: flex; align-items: center; gap: 16px; }
.pp-back-btn { width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; border: 1px solid #e5e7eb; border-radius: 10px; background: white; text-decoration: none; color: #374151; transition: all 0.2s ease; font-size: 18px; }
.pp-back-btn:hover { background: #f9fafb; }
.pp-title h1 { font-size: 24px; font-weight: 700; color: #111827; margin: 0 0 2px; }
.pp-title p { font-size: 14px; color: #6b7280; margin: 0; }

/* ── Tabs ── */
.tabs { display: flex; gap: 8px; margin-bottom: 24px; background: #f3f4f6; padding: 6px; border-radius: 12px; }
.tab { flex: 1; padding: 14px 20px; border: none; background: transparent; border-radius: 8px; font-size: 14px; font-weight: 600; color: #6b7280; cursor: pointer; transition: all 0.2s ease; }
.tab:hover { color: #111827; }
.tab.active { background: white; color: #111827; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }

/* ── Toggle ── */
.pp-toggle-track { width: 44px; height: 24px; border-radius: 12px; background: #dfe3e8; cursor: pointer; position: relative; transition: .2s cubic-bezier(.25,.1,.25,1); flex-shrink: 0; }
.pp-toggle-track.on { background: #1a1a1a; }
.pp-toggle-thumb { width: 20px; height: 20px; border-radius: 50%; background: #fff; position: absolute; top: 2px; left: 2px; transition: .2s cubic-bezier(.25,.1,.25,1); box-shadow: 0 1px 3px rgba(0,0,0,.15); }
.pp-toggle-track.on .pp-toggle-thumb { left: 22px; }

/* ── Section rows ── */
.pp-row { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; background: #f9fafb; border-radius: 10px; margin-bottom: 8px; }
.pp-row:last-child { margin-bottom: 0; }
.pp-row-label { font-size: 14px; font-weight: 500; color: #374151; }
.pp-row-sub { font-size: 12px; color: #9ca3af; margin-top: 2px; }

/* ── Payment Options Box ── */
.pp-option-box {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.pp-option-box-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.pp-option-box-title {
  display: flex;
  align-items: center;
  gap: 10px;
}
.pp-option-number-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #4f46e5;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
}
.pp-option-title-text {
  font-size: 14px;
  font-weight: 500;
  color: #6b7280;
}
.pp-option-title-text strong {
  font-weight: 700;
  color: #111827;
}
.pp-option-box-body {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 12px;
}
@media (max-width: 600px) {
  .pp-option-box-body {
    grid-template-columns: 1fr;
  }
}

.pp-option-box input, .pp-option-box select,
.pp-cod-fee-body input, .pp-cod-fee-body select {
  background: #ffffff !important;
}

/* ── Input Suffix ── */
.pp-input-suffix-wrap {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
}
.pp-input-suffix-wrap input {
  padding-right: 32px !important;
}
.pp-input-suffix {
  position: absolute;
  right: 12px;
  color: #6b7280;
  font-size: 13px;
  pointer-events: none;
}

/* ── COD Fee Box ── */
.pp-cod-fee-box {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
}
.pp-cod-fee-card {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  transition: border-radius 0.2s ease;
}
.pp-cod-fee-card.expanded {
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
}
.pp-cod-fee-left {
  display: flex;
  align-items: center;
  gap: 16px;
}
.pp-cod-fee-icon-wrap {
  color: #4b5563;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.pp-cod-fee-details {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.pp-cod-fee-title {
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
}
.pp-cod-fee-sub {
  font-size: 13px;
  color: #6b7280;
}
.pp-cod-fee-body {
  border: 1px solid #e5e7eb;
  border-top: none;
  background: #f9fafb;
  border-bottom-left-radius: 12px;
  border-bottom-right-radius: 12px;
  padding: 16px;
  padding-top: 4px;
  margin-top: -1px;
}

/* ── Calculation preview ── */
.pp-calc-preview { background: linear-gradient(135deg, #f0f7ff 0%, #e8f4ff 100%); border: 1px solid #bfdbfe; border-radius: 10px; padding: 14px 16px; margin-top: 10px; font-size: 13px; }
.pp-calc-row { display: flex; justify-content: space-between; padding: 4px 0; color: #374151; }
.pp-calc-row.total { font-weight: 700; border-top: 1px solid #bfdbfe; margin-top: 6px; padding-top: 8px; color: #1e40af; font-size: 14px; }
.pp-calc-row.remaining { color: #6b7280; font-size: 12px; }

/* ── Product/collection chips ── */
.pp-chip-list { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.pp-chip { display: flex; align-items: center; gap: 6px; background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 20px; padding: 5px 12px; font-size: 13px; font-weight: 500; color: #374151; }
.pp-chip-x { background: none; border: none; cursor: pointer; color: #9ca3af; font-size: 14px; padding: 0; line-height: 1; }
.pp-chip-x:hover { color: #ef4444; }
.pp-pick-btn { background: #1f2937; color: #fff; border: none; border-radius: 8px; padding: 8px 16px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all .15s ease; }
.pp-pick-btn:hover { background: #111827; }

/* ── Country input ── */
.pp-country-input-wrap { display: flex; gap: 8px; align-items: flex-end; margin-top: 8px; }
.pp-country-input-wrap input { flex: 1; padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 13px; color: #111827; background: #f9fafb; }
.pp-country-input-wrap input:focus { border-color: #1f2937; background: #fff; outline: none; }

/* ── Color swatches ── */
.pp-color-row { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.pp-color-label { font-size: 13px; font-weight: 500; color: #374151; min-width: 140px; }
.pp-color-picker-wrap { flex: 1; display: flex; align-items: center; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 4px; gap: 8px; }
.pp-color-swatch-btn { width: 32px; height: 32px; border: 1px solid rgba(0,0,0,0.1); border-radius: 6px; cursor: pointer; flex-shrink: 0; }
.pp-color-text { flex: 1; padding: 6px 8px; border: none; background: transparent; font-size: 13px; color: #111827; font-family: monospace; }
.pp-color-text:focus { outline: none; }

/* ── Modal Preview ── */
.pp-modal-preview-wrap { margin-top: 20px; }
.pp-modal-preview-label { font-size: 12px; font-weight: 600; color: #9ca3af; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 12px; }
.pp-modal-preview { border-radius: 16px; overflow: hidden; box-shadow: 0 8px 32px rgba(0,0,0,.12); display: grid; grid-template-columns: 1.2fr 1fr; max-width: 480px; margin: 0 auto; }
.pp-modal-left { padding: 24px 20px; display: flex; flex-direction: column; gap: 8px; }
.pp-modal-left h3 { margin: 0; font-size: 16px; font-weight: 700; }
.pp-modal-left p { margin: 0; font-size: 12px; opacity: .85; line-height: 1.4; }
.pp-modal-badges { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
.pp-modal-badge { font-size: 11px; background: rgba(255,255,255,.15); border-radius: 6px; padding: 4px 8px; display: flex; align-items: center; gap: 4px; }
.pp-modal-right { padding: 20px 16px; display: flex; flex-direction: column; gap: 10px; }
.pp-modal-opt { padding: 10px 12px; border: 1px solid; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
.pp-modal-opt.selected { border-width: 2px; }
.pp-modal-btn { padding: 12px; border: none; border-radius: 8px; font-size: 14px; font-weight: 700; cursor: pointer; text-align: center; margin-top: 4px; }
.pp-modal-footer { font-size: 11px; text-align: center; opacity: .6; margin-top: 4px; }

/* ── Compact text field look ── */
.pp-fg { margin-bottom: 0; }
.pp-fg label { display: block; font-size: 12px; font-weight: 600; color: #6b7280; margin-bottom: 4px; text-transform: uppercase; letter-spacing: .3px; }
.pp-fg input, .pp-fg select { width: 100%; padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 13px; color: #111827; background: #f9fafb; box-sizing: border-box; transition: all .15s ease; }
.pp-fg input:focus, .pp-fg select:focus { border-color: #1f2937; background: #fff; outline: none; box-shadow: 0 0 0 3px rgba(31,41,55,.06); }

/* ── Divider ── */
.pp-divider { border: none; border-top: 1px solid #f3f4f6; margin: 20px 0; }

/* ── Modal Preview Card ── */
.pp-preview-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.pp-preview-toggle-btn {
  background: none;
  border: none;
  color: #006e52;
  font-weight: 500;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
}
.pp-preview-toggle-btn:hover {
  text-decoration: underline;
}
.pp-preview-viewport {
  background: #f3f4f6;
  border-radius: 12px;
  padding: 40px 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 380px;
}
.pp-preview-modal-box {
  width: 100%;
  max-width: 840px;
  background: #ffffff;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 20px 40px rgba(0,0,0,0.1);
  display: grid;
  grid-template-columns: 340px 1fr;
  box-sizing: border-box;
  position: relative;
}
@media (max-width: 850px) {
  .pp-preview-modal-box {
    grid-template-columns: 1fr;
  }
  .pp-preview-left-panel {
    display: none;
  }
}

/* Left Panel */
.pp-preview-left-panel {
  padding: 32px;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}
.pp-preview-shop-pill {
  align-self: flex-start;
  background: #ffffff;
  color: #1f2937;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 11px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  margin-bottom: 32px;
}
.pp-preview-order-summary-box {
  background: rgba(255, 255, 255, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  padding: 20px;
  backdrop-filter: blur(8px);
}
.pp-preview-summary-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.5px;
  margin-bottom: 16px;
  opacity: 0.8;
  text-transform: uppercase;
}
.pp-preview-product-row {
  display: flex;
  align-items: center;
  gap: 16px;
}
.pp-preview-product-img {
  width: 56px;
  height: 56px;
  background: #ffffff;
  border-radius: 8px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.pp-preview-product-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.pp-preview-product-name {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.2;
}
.pp-preview-product-sub {
  font-size: 10px;
  opacity: 0.7;
  text-transform: uppercase;
  font-weight: 600;
  letter-spacing: 0.5px;
}
.pp-preview-product-price {
  font-size: 16px;
  font-weight: 700;
}
.pp-preview-product-qty {
  font-size: 11px;
  opacity: 0.8;
  margin-top: 4px;
}
.pp-preview-card-deco {
  position: relative;
  margin-top: auto;
  height: 140px;
}

/* Right Panel */
.pp-preview-right-panel {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  justify-content: space-between;
  box-sizing: border-box;
  position: relative;
}
.pp-preview-close-btn {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid #e5e7eb;
  background: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #6b7280;
}
.pp-preview-right-title {
  font-size: 24px;
  font-weight: 700;
  color: #111827;
  margin: 0 0 8px 0;
  text-align: center;
}
.pp-preview-options-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex-grow: 1;
}
.pp-preview-opt-card {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 16px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  cursor: pointer;
  transition: all 0.2s ease;
  background: #ffffff;
}
.pp-preview-opt-card.selected {
  border-width: 2px;
  background: #f8fafc;
}
.pp-preview-opt-left {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}
.pp-preview-opt-icon-wrap {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #4f46e5;
  flex-shrink: 0;
  margin-top: 2px;
}
.pp-preview-opt-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.pp-preview-opt-label {
  font-size: 15px;
  font-weight: 600;
  color: #1f2937;
}
.pp-preview-opt-sub {
  font-size: 12px;
  color: #6b7280;
  line-height: 1.4;
}
.pp-preview-opt-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  flex-shrink: 0;
  margin-left: 16px;
}
.pp-preview-opt-price {
  font-size: 16px;
  font-weight: 700;
  color: #1f2937;
}
.pp-preview-opt-taxes {
  font-size: 10px;
  color: #9ca3af;
}
.pp-preview-opt-tick {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 8px;
}

/* Button & Trust Badges */
.pp-preview-checkout-btn {
  width: 100%;
  padding: 16px;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  text-align: center;
  transition: opacity 0.2s ease;
  box-sizing: border-box;
  margin-top: 12px;
}
.pp-preview-trust-badges {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-top: 12px;
}
.pp-preview-trust-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: #6b7280;
  font-weight: 500;
  text-align: center;
}
.pp-preview-trust-icon {
  color: #9ca3af;
  display: flex;
  align-items: center;
}

/* Footer info */
.pp-preview-divider {
  border: none;
  border-top: 1px solid #f3f4f6;
  margin: 16px 0 12px;
}
.pp-preview-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 10px;
  color: #9ca3af;
}
`;

const GRADIENT_PRESETS = [
  { name: 'Midnight Blue (Default)', bg: '#1a1a2e', start: '#16213e', end: '#0f3460', text: '#ffffff' },
  { name: 'Carbon Charcoal', bg: '#111827', start: '#1f2937', end: '#111827', text: '#ffffff' },
  { name: 'Royal Amethyst', bg: '#3b0764', start: '#6b21a8', end: '#a855f7', text: '#ffffff' },
  { name: 'Sunset Glow', bg: '#2c0a0a', start: '#f97316', end: '#ec4899', text: '#ffffff' },
  { name: 'Emerald Forest', bg: '#064e3b', start: '#065f46', end: '#047857', text: '#ffffff' },
  { name: 'Ocean Breeze', bg: '#0c4a6e', start: '#0284c7', end: '#06b6d4', text: '#ffffff' },
  { name: 'Rose Petal', bg: '#4c0519', start: '#be123c', end: '#fb7185', text: '#ffffff' },
  { name: 'Minimal Light', bg: '#f9fafb', start: '#f3f4f6', end: '#e5e7eb', text: '#1f2937' },
];

const COUNTRY_OPTIONS = [
  { label: 'Select a country...', value: '' },
  { label: 'Afghanistan (AF)', value: 'AF' },
  { label: 'Albania (AL)', value: 'AL' },
  { label: 'Algeria (DZ)', value: 'DZ' },
  { label: 'Andorra (AD)', value: 'AD' },
  { label: 'Angola (AO)', value: 'AO' },
  { label: 'Argentina (AR)', value: 'AR' },
  { label: 'Armenia (AM)', value: 'AM' },
  { label: 'Australia (AU)', value: 'AU' },
  { label: 'Austria (AT)', value: 'AT' },
  { label: 'Azerbaijan (AZ)', value: 'AZ' },
  { label: 'Bahamas (BS)', value: 'BS' },
  { label: 'Bahrain (BH)', value: 'BH' },
  { label: 'Bangladesh (BD)', value: 'BD' },
  { label: 'Barbados (BB)', value: 'BB' },
  { label: 'Belarus (BY)', value: 'BY' },
  { label: 'Belgium (BE)', value: 'BE' },
  { label: 'Belize (BZ)', value: 'BZ' },
  { label: 'Benin (BJ)', value: 'BJ' },
  { label: 'Bhutan (BT)', value: 'BT' },
  { label: 'Bolivia (BO)', value: 'BO' },
  { label: 'Bosnia and Herzegovina (BA)', value: 'BA' },
  { label: 'Botswana (BW)', value: 'BW' },
  { label: 'Brazil (BR)', value: 'BR' },
  { label: 'Brunei (BN)', value: 'BN' },
  { label: 'Bulgaria (BG)', value: 'BG' },
  { label: 'Cambodia (KH)', value: 'KH' },
  { label: 'Cameroon (CM)', value: 'CM' },
  { label: 'Canada (CA)', value: 'CA' },
  { label: 'Chile (CL)', value: 'CL' },
  { label: 'China (CN)', value: 'CN' },
  { label: 'Colombia (CO)', value: 'CO' },
  { label: 'Costa Rica (CR)', value: 'CR' },
  { label: 'Croatia (HR)', value: 'HR' },
  { label: 'Cyprus (CY)', value: 'CY' },
  { label: 'Czechia (CZ)', value: 'CZ' },
  { label: 'Denmark (DK)', value: 'DK' },
  { label: 'Dominican Republic (DO)', value: 'DO' },
  { label: 'Ecuador (EC)', value: 'EC' },
  { label: 'Egypt (EG)', value: 'EG' },
  { label: 'El Salvador (SV)', value: 'SV' },
  { label: 'Estonia (EE)', value: 'EE' },
  { label: 'Ethiopia (ET)', value: 'ET' },
  { label: 'Fiji (FJ)', value: 'FJ' },
  { label: 'Finland (FI)', value: 'FI' },
  { label: 'France (FR)', value: 'FR' },
  { label: 'Georgia (GE)', value: 'GE' },
  { label: 'Germany (DE)', value: 'DE' },
  { label: 'Ghana (GH)', value: 'GH' },
  { label: 'Greece (GR)', value: 'GR' },
  { label: 'Guatemala (GT)', value: 'GT' },
  { label: 'Honduras (HN)', value: 'HN' },
  { label: 'Hong Kong (HK)', value: 'HK' },
  { label: 'Hungary (HU)', value: 'HU' },
  { label: 'Iceland (IS)', value: 'IS' },
  { label: 'India (IN)', value: 'IN' },
  { label: 'Indonesia (ID)', value: 'ID' },
  { label: 'Iraq (IQ)', value: 'IQ' },
  { label: 'Ireland (IE)', value: 'IE' },
  { label: 'Israel (IL)', value: 'IL' },
  { label: 'Italy (IT)', value: 'IT' },
  { label: 'Jamaica (JM)', value: 'JM' },
  { label: 'Japan (JP)', value: 'JP' },
  { label: 'Jordan (JO)', value: 'JO' },
  { label: 'Kazakhstan (KZ)', value: 'KZ' },
  { label: 'Kenya (KE)', value: 'KE' },
  { label: 'Kuwait (KW)', value: 'KW' },
  { label: 'Latvia (LV)', value: 'LV' },
  { label: 'Lebanon (LB)', value: 'LB' },
  { label: 'Liechtenstein (LI)', value: 'LI' },
  { label: 'Lithuania (LT)', value: 'LT' },
  { label: 'Luxembourg (LU)', value: 'LU' },
  { label: 'Malaysia (MY)', value: 'MY' },
  { label: 'Maldives (MV)', value: 'MV' },
  { label: 'Malta (MT)', value: 'MT' },
  { label: 'Mauritius (MU)', value: 'MU' },
  { label: 'Mexico (MX)', value: 'MX' },
  { label: 'Monaco (MC)', value: 'MC' },
  { label: 'Morocco (MA)', value: 'MA' },
  { label: 'Nepal (NP)', value: 'NP' },
  { label: 'Netherlands (NL)', value: 'NL' },
  { label: 'New Zealand (NZ)', value: 'NZ' },
  { label: 'Nigeria (NG)', value: 'NG' },
  { label: 'Norway (NO)', value: 'NO' },
  { label: 'Oman (OM)', value: 'OM' },
  { label: 'Pakistan (PK)', value: 'PK' },
  { label: 'Panama (PA)', value: 'PA' },
  { label: 'Paraguay (PY)', value: 'PY' },
  { label: 'Peru (PE)', value: 'PE' },
  { label: 'Philippines (PH)', value: 'PH' },
  { label: 'Poland (PL)', value: 'PL' },
  { label: 'Portugal (PT)', value: 'PT' },
  { label: 'Qatar (QA)', value: 'QA' },
  { label: 'Romania (RO)', value: 'RO' },
  { label: 'Russia (RU)', value: 'RU' },
  { label: 'Saudi Arabia (SA)', value: 'SA' },
  { label: 'Senegal (SN)', value: 'SN' },
  { label: 'Serbia (RS)', value: 'RS' },
  { label: 'Singapore (SG)', value: 'SG' },
  { label: 'Slovakia (SK)', value: 'SK' },
  { label: 'Slovenia (SI)', value: 'SI' },
  { label: 'South Africa (ZA)', value: 'ZA' },
  { label: 'South Korea (KR)', value: 'KR' },
  { label: 'Spain (ES)', value: 'ES' },
  { label: 'Sri Lanka (LK)', value: 'LK' },
  { label: 'Sweden (SE)', value: 'SE' },
  { label: 'Switzerland (CH)', value: 'CH' },
  { label: 'Taiwan (TW)', value: 'TW' },
  { label: 'Thailand (TH)', value: 'TH' },
  { label: 'Turkey (TR)', value: 'TR' },
  { label: 'Ukraine (UA)', value: 'UA' },
  { label: 'United Arab Emirates (AE)', value: 'AE' },
  { label: 'United Kingdom (GB)', value: 'GB' },
  { label: 'United States (US)', value: 'US' },
  { label: 'Uruguay (UY)', value: 'UY' },
  { label: 'Uzbekistan (UZ)', value: 'UZ' },
  { label: 'Venezuela (VE)', value: 'VE' },
  { label: 'Vietnam (VN)', value: 'VN' }
];

// ── Helpers ────────────────────────────────────────────────────────────────

function nanoid8() {
  return Math.random().toString(36).slice(2, 10);
}

// ── Color Utilities for ColorPicker ─────────────────────────────────────────
interface HSBColor { hue: number; saturation: number; brightness: number; }
function hexToHsb(hex: string): HSBColor {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let hue = 0;
  if (d !== 0) {
    if (max === r) hue = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) hue = ((b - r) / d + 2) * 60;
    else hue = ((r - g) / d + 4) * 60;
  }
  return { hue, saturation: max === 0 ? 0 : d / max, brightness: max };
}
function hsbToHex(hsb: HSBColor): string {
  const { hue, saturation, brightness } = hsb;
  const c = brightness * saturation;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = brightness - c;
  let r = 0, g = 0, b = 0;
  if (hue < 60) { r = c; g = x; } else if (hue < 120) { r = x; g = c; }
  else if (hue < 180) { g = c; b = x; } else if (hue < 240) { g = x; b = c; }
  else if (hue < 300) { r = x; b = c; } else { r = c; b = x; }
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
function isValidHex(hex: string): boolean { return /^#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})$/.test(hex); }
function normalizeHex(hex: string): string {
  if (/^#[A-Fa-f0-9]{3}$/.test(hex)) return '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
  return hex.toLowerCase();
}

interface ColorFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
}
function ColorField({ label, value, onChange }: ColorFieldProps) {
  const safeValue = isValidHex(value) ? normalizeHex(value) : '#000000';
  const [hsbColor, setHsbColor] = useState<HSBColor>(hexToHsb(safeValue));
  const [hexInput, setHexInput] = useState(safeValue.toUpperCase());
  const [pickerOpen, setPickerOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (isValidHex(value)) {
      const norm = normalizeHex(value);
      setHsbColor(hexToHsb(norm));
      setHexInput(norm.toUpperCase());
    }
  }, [value]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    if (pickerOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [pickerOpen]);

  const handlePickerChange = useCallback((color: HSBColor) => {
    setHsbColor(color);
    const hex = hsbToHex(color);
    onChange(hex);
    setHexInput(hex.toUpperCase());
  }, [onChange]);

  const handleHexChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.toUpperCase();
    if (val && !val.startsWith('#')) val = '#' + val;
    setHexInput(val);
    if (isValidHex(val)) {
      const normalized = normalizeHex(val);
      onChange(normalized);
      setHsbColor(hexToHsb(normalized));
    }
  }, [onChange]);

  return (
    <div className="pp-color-row" ref={wrapperRef} style={{ position: 'relative' }}>
      <span className="pp-color-label">{label}</span>
      <div className="pp-color-picker-wrap">
        <div
          className="pp-color-swatch-btn"
          style={{ backgroundColor: safeValue }}
          onClick={() => {
            if (!pickerOpen && wrapperRef.current) {
              const rect = wrapperRef.current.getBoundingClientRect();
              const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
              const estimatedHeight = 280;
              const spaceBelow = viewportHeight - rect.bottom;
              const openAbove = spaceBelow < estimatedHeight;

              let top: number;
              if (openAbove) {
                top = rect.top - estimatedHeight - 8;
                if (top < 8) top = 8;
              } else {
                top = rect.bottom + 8;
              }

              setPopoverPos({
                top,
                left: rect.left + 150, // offset rightwards past the label
              });
            }
            setPickerOpen(!pickerOpen);
          }}
        />
        <input
          type="text"
          className="pp-color-text"
          value={hexInput}
          onChange={handleHexChange}
          maxLength={7}
        />
      </div>
      {pickerOpen && popoverPos && (
        <div style={{ position: 'fixed', top: popoverPos.top, left: popoverPos.left, zIndex: 9999, background: '#fff', padding: '12px', border: '1px solid #e5e7eb', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.15)' }}>
          <ColorPicker onChange={handlePickerChange} color={hsbColor} />
        </div>
      )}
    </div>
  );
}

interface ToggleRowProps {
  label: string;
  sub?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}
function ToggleRow({ label, sub, checked, onChange }: ToggleRowProps) {
  return (
    <div className="pp-row" style={{ cursor: 'pointer' }} onClick={() => onChange(!checked)}>
      <div>
        <div className="pp-row-label">{label}</div>
        {sub && <div className="pp-row-sub">{sub}</div>}
      </div>
      <div className={`pp-toggle-track ${checked ? 'on' : ''}`}>
        <div className="pp-toggle-thumb" />
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function PartialPaymentsPage() {
  const { settings: initialSettings, shopDomain, shopCurrency } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const shopify = useAppBridge();
  const isSaving = navigation.state === 'submitting';
  const lastActionRef = useRef<any>(null);

  // ── Local state (mirroring saved settings) ──────────────────────────────
  const [settings, setSettings] = useState<PartialPaymentSettings>(initialSettings as PartialPaymentSettings);
  const [savedStr, setSavedStr] = useState(JSON.stringify(initialSettings));
  const [allowedCountrySelect, setAllowedCountrySelect] = useState('');
  const [excludedCountrySelect, setExcludedCountrySelect] = useState('');
  const [showPreview, setShowPreview] = useState(true);
  const [selectedTab, setSelectedTab] = useState(0);

  const hasChanges = useMemo(
    () => JSON.stringify(settings) !== savedStr,
    [settings, savedStr]
  );

  // Show / hide save bar
  useEffect(() => {
    try {
      hasChanges ? shopify.saveBar.show('pp-bar') : shopify.saveBar.hide('pp-bar');
    } catch (_e) {}
  }, [hasChanges, shopify]);

  // Toast on save
  useEffect(() => {
    if (actionData && actionData !== lastActionRef.current) {
      lastActionRef.current = actionData;
      if (actionData.success) {
        setSavedStr(JSON.stringify(settings));
        try { shopify.toast.show('Saved!', { duration: 3000 }); } catch (_e) {}
      } else if ((actionData as any).error) {
        try { shopify.toast.show(`Error: ${(actionData as any).error}`, { duration: 5000 }); } catch (_e) {}
      }
    }
  }, [actionData]);

  // ── Updaters ──────────────────────────────────────────────────────────────
  const upd = useCallback(<K extends keyof PartialPaymentSettings>(k: K, v: PartialPaymentSettings[K]) => {
    setSettings((p) => ({ ...p, [k]: v }));
  }, []);

  const updModal = useCallback(<K extends keyof ModalSettings>(k: K, v: ModalSettings[K]) => {
    setSettings((p) => ({ ...p, modal_settings: { ...p.modal_settings, [k]: v } }));
  }, []);

  const updFlag = useCallback(<K extends keyof ModuleFlags>(k: K, v: boolean) => {
    setSettings((p) => ({ ...p, module_flags: { ...p.module_flags, [k]: v } }));
  }, []);

  // ── Save / Discard ────────────────────────────────────────────────────────
  const handleSave = useCallback(() => {
    const fd = new FormData();
    fd.append('settingsData', JSON.stringify(settings));
    submit(fd, { method: 'post' });
  }, [settings, submit]);

  const handleDiscard = useCallback(() => {
    setSettings(JSON.parse(savedStr));
  }, [savedStr]);

  // ── Payment options ───────────────────────────────────────────────────────
  const addOption = () => {
    const newOpt: PaymentOption = {
      id: nanoid8(),
      label: 'Pay 10% Now',
      type: 'percentage',
      value: 10,
    };
    upd('payment_options', [...settings.payment_options, newOpt]);
  };

  const updateOption = (id: string, patch: Partial<PaymentOption>) => {
    upd(
      'payment_options',
      settings.payment_options.map((o) => (o.id === id ? { ...o, ...patch } : o))
    );
  };

  const deleteOption = (id: string) => {
    upd('payment_options', settings.payment_options.filter((o) => o.id !== id));
  };

  // ── Product / Collection pickers ─────────────────────────────────────────
  const pickProducts = async () => {
    try {
      const sel = await shopify.resourcePicker({
        type: 'product',
        multiple: true,
        selectionIds: settings.allowed_product_ids.map((id) => ({
          id: id.includes('gid://') ? id : `gid://shopify/Product/${id}`,
        })),
      });
      if (sel) {
        const ids = sel.map((p: any) => p.id.replace('gid://shopify/Product/', ''));
        const titles: Record<string, string> = {};
        sel.forEach((p: any) => {
          titles[p.id.replace('gid://shopify/Product/', '')] = p.title;
        });
        upd('allowed_product_ids', ids);
        // Store titles for display
        setProductTitles((prev) => ({ ...prev, ...titles }));
      }
    } catch (_e) {}
  };

  const pickCollections = async () => {
    try {
      const sel = await shopify.resourcePicker({
        type: 'collection',
        multiple: true,
        selectionIds: settings.allowed_collection_ids.map((id) => ({
          id: id.includes('gid://') ? id : `gid://shopify/Collection/${id}`,
        })),
      });
      if (sel) {
        const ids = sel.map((c: any) => c.id.replace('gid://shopify/Collection/', ''));
        const titles: Record<string, string> = {};
        sel.forEach((c: any) => {
          titles[c.id.replace('gid://shopify/Collection/', '')] = c.title;
        });
        upd('allowed_collection_ids', ids);
        setCollectionTitles((prev) => ({ ...prev, ...titles }));
      }
    } catch (_e) {}
  };

  // Local title maps (ephemeral — just for display, not saved)
  const [productTitles, setProductTitles] = useState<Record<string, string>>({});
  const [collectionTitles, setCollectionTitles] = useState<Record<string, string>>({});

  // ── Currency formatter ────────────────────────────────────────────────────
  const fmt = useCallback(
    (n: number) => {
      try {
        return new Intl.NumberFormat(undefined, {
          style: 'currency',
          currency: shopCurrency || 'INR',
          minimumFractionDigits: 0,
          maximumFractionDigits: 2,
        }).format(n);
      } catch {
        return `${shopCurrency} ${n}`;
      }
    },
    [shopCurrency]
  );

  // ── Deposit preview (using first option) ─────────────────────────────────
  const firstOpt = settings.payment_options[0];
  const previewOrderTotal = 1000;
  const previewDeposit = useMemo(() => {
    if (!firstOpt) return 0;
    if (firstOpt.type === 'percentage' || firstOpt.type === 'remaining_percentage') {
      return (previewOrderTotal * firstOpt.value) / 100;
    }
    return Math.min(firstOpt.value, previewOrderTotal);
  }, [firstOpt]);
  const previewCodFee = useMemo(() => {
    if (!settings.cod_fee_enabled || settings.cod_fee_amount <= 0) return 0;
    if (settings.cod_fee_type === 'percentage') {
      return (previewDeposit * settings.cod_fee_amount) / 100;
    }
    return settings.cod_fee_amount;
  }, [settings.cod_fee_enabled, settings.cod_fee_amount, settings.cod_fee_type, previewDeposit]);
  const previewPayNow = previewDeposit + previewCodFee;
  const previewRemaining = previewOrderTotal - previewDeposit;

  // ── Modal ─────────────────────────────────────────────────────────────────
  const ms = settings.modal_settings ?? DEFAULT_MODAL_SETTINGS;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: S }} />

      {/* Save bar */}
      <ui-save-bar id="pp-bar">
        <button variant="primary" onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={handleDiscard} disabled={isSaving}>Discard</button>
      </ui-save-bar>

      <div className="pp-page">
        {/* ── Page Header ── */}
        <div className="pp-header">
          <div className="pp-header-left">
            <Link to="/app" className="pp-back-btn">←</Link>
            <div className="pp-title">
              <h1>Payment Methods</h1>
              <p>Configure partial payments and prepaid options for your customers.</p>
            </div>
          </div>
          <Badge tone={(selectedTab === 0 ? settings.enabled : settings.full_prepaid_enabled) ? 'success' : 'critical'}>
            {(selectedTab === 0 ? settings.enabled : settings.full_prepaid_enabled) ? 'Active' : 'Inactive'}
          </Badge>
        </div>

        <div className="tabs">
          <button
            className={`tab ${selectedTab === 0 ? 'active' : ''}`}
            onClick={() => setSelectedTab(0)}
          >
            Partial Payments
          </button>
          <button
            className={`tab ${selectedTab === 1 ? 'active' : ''}`}
            onClick={() => setSelectedTab(1)}
          >
            Full Prepaid
          </button>
        </div>
        <Box paddingBlockStart="400">
          {selectedTab === 0 ? (
              <BlockStack gap="500">
                {/* ════════════════════════════════════════════════
                    PARTIAL PAYMENTS CARDS
                ════════════════════════════════════════════════ */}
                {/* ════════════════════════════════════════════════
                    CARD 1 — GENERAL SETTINGS
                ════════════════════════════════════════════════ */}
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">General Settings</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Control whether partial payments appear on your storefront.
                  </Text>
                </BlockStack>
              </InlineStack>

              <ToggleRow
                label="Partial Payment Status"
                sub={settings.enabled ? 'Customers can choose to pay a deposit now.' : 'Partial payment option is hidden from storefront.'}
                checked={settings.enabled}
                onChange={(v) => upd('enabled', v)}
              />

              {/*
              <Divider />

              <Text as="h3" variant="headingSm">Module Compatibility</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Control whether other Fox COD features apply when a customer uses partial payment.
              </Text>

              <ToggleRow
                label="Apply Coupons to Partial Orders"
                sub="Coupon discounts reduce the deposit and remaining amounts proportionally."
                checked={settings.module_flags?.apply_coupons_to_partial ?? true}
                onChange={(v) => updFlag('apply_coupons_to_partial', v)}
              />
              <ToggleRow
                label="Apply Bundle Discounts to Partial Orders"
                sub="Bundle offer pricing is applied before deposit calculation."
                checked={settings.module_flags?.apply_bundle_discounts_to_partial ?? true}
                onChange={(v) => updFlag('apply_bundle_discounts_to_partial', v)}
              />
              <ToggleRow
                label="Apply Upsells to Partial Orders"
                sub="Upsell items are included in the partial payment checkout."
                checked={settings.module_flags?.apply_upsells_to_partial ?? true}
                onChange={(v) => updFlag('apply_upsells_to_partial', v)}
              />
              */}
            </BlockStack>
          </Card>

          {/* ════════════════════════════════════════════════
              CARD 2 — PAYMENT OPTIONS
          ════════════════════════════════════════════════ */}
          {/* ════════════════════════════════════════════════
              CARD 2 — PAYMENT OPTIONS
          ════════════════════════════════════════════════ */}
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">Payment Options</Text>
              </InlineStack>
              <Text as="p" variant="bodySm" tone="subdued">
                Configure the partial payment options available to your customers. You can offer different deposit percentages to suit different customer needs.
              </Text>

              {/* Options list */}
              {settings.payment_options.length === 0 && (
                <Banner tone="warning">
                  <p>You have no payment options. Add at least one option for partial payments to work.</p>
                </Banner>
              )}

              {settings.payment_options.slice(0, 1).map((opt, idx) => {
                let displayValue = '';
                if (opt.type === 'percentage' || opt.type === 'remaining_percentage') {
                  displayValue = `${opt.value}%`;
                } else {
                  displayValue = fmt(opt.value);
                }

                return (
                  <div key={opt.id} className="pp-option-box">
                    <div className="pp-option-box-header">
                      <div className="pp-option-box-title">
                        <span className="pp-option-title-text">
                          <strong>{displayValue}</strong> deposit
                        </span>
                      </div>
                    </div>
                    <div className="pp-option-box-body">
                      <div className="pp-fg">
                        <label>Label</label>
                        <input
                          type="text"
                          value={opt.label}
                          placeholder="Pay 10% now"
                          onChange={(e) => updateOption(opt.id, { label: e.target.value })}
                        />
                      </div>
                      <div className="pp-fg">
                        <label>Deposit Type</label>
                        <select
                          value={opt.type}
                          onChange={(e) => updateOption(opt.id, { type: e.target.value as PaymentOption['type'] })}
                        >
                          <option value="percentage">Percentage (%)</option>
                          <option value="fixed">Fixed Amount</option>
                          <option value="remaining_percentage">% of Discounted Total</option>
                        </select>
                      </div>
                      <div className="pp-fg">
                        <label>{opt.type === 'fixed' ? 'Amount' : 'Percentage'}</label>
                        <div className="pp-input-suffix-wrap">
                          <input
                            type="number"
                            value={opt.value}
                            min={0}
                            max={opt.type === 'fixed' ? undefined : 100}
                            step={opt.type === 'fixed' ? 1 : 0.1}
                            onChange={(e) => updateOption(opt.id, { value: parseFloat(e.target.value) || 0 })}
                          />
                          <span className="pp-input-suffix">
                            {opt.type === 'percentage' || opt.type === 'remaining_percentage' ? '%' : shopCurrency}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              <Divider />

              {/* COD Fee */}
              <div className="pp-cod-fee-box">
                <div className={`pp-cod-fee-card ${settings.cod_fee_enabled ? 'expanded' : ''}`}>
                  <div className="pp-cod-fee-left">
                    <div className="pp-cod-fee-icon-wrap">
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="1" y="3" width="15" height="13" rx="2" ry="2" />
                        <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                        <circle cx="5.5" cy="18.5" r="2.5" />
                        <circle cx="18.5" cy="18.5" r="2.5" />
                      </svg>
                    </div>
                    <div className="pp-cod-fee-details">
                      <div className="pp-cod-fee-title">COD Fee</div>
                      <div className="pp-cod-fee-sub">Apply one fee to all partial payment orders</div>
                    </div>
                  </div>
                  <div
                    className={`pp-toggle-track ${settings.cod_fee_enabled ? 'on' : ''}`}
                    onClick={() => upd('cod_fee_enabled', !settings.cod_fee_enabled)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="pp-toggle-thumb" />
                  </div>
                </div>

                {settings.cod_fee_enabled && (
                  <div className="pp-cod-fee-body">
                    <div className="pp-option-box-body">
                      <div className="pp-fg">
                        <label>Fee Name</label>
                        <input
                          type="text"
                          value={settings.cod_fee_name}
                          placeholder="COD Fee"
                          onChange={(e) => upd('cod_fee_name', e.target.value)}
                        />
                      </div>
                      <div className="pp-fg">
                        <label>Fee Type</label>
                        <select
                          value={settings.cod_fee_type}
                          onChange={(e) => upd('cod_fee_type', e.target.value as 'fixed' | 'percentage')}
                        >
                          <option value="fixed">Fixed Amount</option>
                          <option value="percentage">Percentage of Deposit</option>
                        </select>
                      </div>
                      <div className="pp-fg">
                        <label>Amount</label>
                        <div className="pp-input-suffix-wrap">
                          <input
                            type="number"
                            value={settings.cod_fee_amount}
                            min={0}
                            step={0.5}
                            onChange={(e) => upd('cod_fee_amount', parseFloat(e.target.value) || 0)}
                          />
                          <span className="pp-input-suffix">
                            {settings.cod_fee_type === 'percentage' ? '%' : shopCurrency}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Live calculation preview */}
              {firstOpt && (
                <div className="pp-calc-preview">
                  <Text as="p" variant="bodySm" fontWeight="semibold">
                    Example: Order of {fmt(previewOrderTotal)}
                  </Text>
                  <div style={{ marginTop: 8 }}>
                    <div className="pp-calc-row">
                      <span>Product Total</span>
                      <span>{fmt(previewOrderTotal)}</span>
                    </div>
                    <div className="pp-calc-row">
                      <span>
                        Deposit ({firstOpt.label})
                      </span>
                      <span>{fmt(previewDeposit)}</span>
                    </div>
                    {settings.cod_fee_enabled && previewCodFee > 0 && (
                      <div className="pp-calc-row">
                        <span>{settings.cod_fee_name || 'COD Fee'}</span>
                        <span>+ {fmt(previewCodFee)}</span>
                      </div>
                    )}
                    <div className="pp-calc-row total">
                      <span>Pay Now (Online)</span>
                      <span>{fmt(previewPayNow)}</span>
                    </div>
                    <div className="pp-calc-row remaining">
                      <span>Remaining (COD on delivery)</span>
                      <span>{fmt(previewRemaining)}</span>
                    </div>
                  </div>
                </div>
              )}
            </BlockStack>
          </Card>

          {/* ════════════════════════════════════════════════
              CARD 3 — RESTRICTIONS
          ════════════════════════════════════════════════ */}
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">Restrictions</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Control exactly when the partial payment option appears. All rules must pass for it to show.
                </Text>
              </BlockStack>

              {/* Order Total */}
              <Text as="h3" variant="headingSm">Order Total Range</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Set to 0 to disable the restriction.
              </Text>
              <InlineGrid columns={2} gap="400">
                <TextField
                  label="Minimum Order Total"
                  type="number"
                  value={String(settings.minimum_order_total)}
                  prefix={shopCurrency}
                  min="0"
                  onChange={(v) => upd('minimum_order_total', parseFloat(v) || 0)}
                  autoComplete="off"
                  helpText="0 = no minimum"
                />
                <TextField
                  label="Maximum Order Total"
                  type="number"
                  value={String(settings.maximum_order_total)}
                  prefix={shopCurrency}
                  min="0"
                  onChange={(v) => upd('maximum_order_total', parseFloat(v) || 0)}
                  autoComplete="off"
                  helpText="0 = no maximum"
                />
              </InlineGrid>

              <Divider />

              {/* Products */}
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text as="h3" variant="headingSm">Specific Products</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {settings.allowed_product_ids.length === 0
                      ? 'Partial payment shows on all products.'
                      : `Only shows for ${settings.allowed_product_ids.length} selected product(s).`}
                  </Text>
                </BlockStack>
                <Button variant="secondary" onClick={pickProducts}>
                  {settings.allowed_product_ids.length === 0 ? 'Add Products' : `Edit Products (${settings.allowed_product_ids.length})`}
                </Button>
              </InlineStack>
              {settings.allowed_product_ids.length > 0 && (
                <div style={{ marginTop: '12px' }}>
                  <InlineStack gap="200">
                    {settings.allowed_product_ids.map((id) => (
                      <Tag
                        key={id}
                        onRemove={() => upd('allowed_product_ids', settings.allowed_product_ids.filter((x) => x !== id))}
                      >
                        {productTitles[id] || `Product …${id.slice(-6)}`}
                      </Tag>
                    ))}
                  </InlineStack>
                </div>
              )}

              <Divider />

              {/* Collections */}
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text as="h3" variant="headingSm">Specific Collections</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {settings.allowed_collection_ids.length === 0
                      ? 'Partial payment shows for all collections.'
                      : `Only shows for products in ${settings.allowed_collection_ids.length} selected collection(s).`}
                  </Text>
                </BlockStack>
                <Button variant="secondary" onClick={pickCollections}>
                  {settings.allowed_collection_ids.length === 0 ? 'Add Collections' : `Edit Collections (${settings.allowed_collection_ids.length})`}
                </Button>
              </InlineStack>
              {settings.allowed_collection_ids.length > 0 && (
                <div style={{ marginTop: '12px' }}>
                  <InlineStack gap="200">
                    {settings.allowed_collection_ids.map((id) => (
                      <Tag
                        key={id}
                        onRemove={() => upd('allowed_collection_ids', settings.allowed_collection_ids.filter((x) => x !== id))}
                      >
                        {collectionTitles[id] || `Collection …${id.slice(-6)}`}
                      </Tag>
                    ))}
                  </InlineStack>
                </div>
              )}

              <Divider />

              {/* Country Restrictions */}
              <Text as="h3" variant="headingSm">Country Restrictions</Text>

              <BlockStack gap="300">
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" fontWeight="semibold">Allowed Countries</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Leave empty to allow all countries. Use the dropdown to select countries.
                  </Text>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'end' }}>
                    <Select
                      label="Allowed Country"
                      labelHidden
                      options={COUNTRY_OPTIONS}
                      value={allowedCountrySelect}
                      onChange={setAllowedCountrySelect}
                    />
                    <Button
                      variant="primary"
                      disabled={!allowedCountrySelect}
                      onClick={() => {
                        if (allowedCountrySelect && !settings.allowed_countries.includes(allowedCountrySelect)) {
                          upd('allowed_countries', [...settings.allowed_countries, allowedCountrySelect]);
                        }
                        setAllowedCountrySelect('');
                      }}
                    >
                      Add
                    </Button>
                  </div>
                  {settings.allowed_countries.length > 0 && (
                    <div style={{ marginTop: '8px' }}>
                      <InlineStack gap="200">
                        {settings.allowed_countries.map((c) => {
                          const countryLabel = COUNTRY_OPTIONS.find((o) => o.value === c)?.label || c;
                          return (
                            <Tag
                              key={c}
                              onRemove={() => upd('allowed_countries', settings.allowed_countries.filter((x) => x !== c))}
                            >
                              {countryLabel}
                            </Tag>
                          );
                        })}
                      </InlineStack>
                    </div>
                  )}
                </BlockStack>

                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" fontWeight="semibold">Excluded Countries</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Block partial payments from specific countries even if "allowed" is empty.
                  </Text>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'end' }}>
                    <Select
                      label="Excluded Country"
                      labelHidden
                      options={COUNTRY_OPTIONS}
                      value={excludedCountrySelect}
                      onChange={setExcludedCountrySelect}
                    />
                    <Button
                      variant="primary"
                      disabled={!excludedCountrySelect}
                      onClick={() => {
                        if (excludedCountrySelect && !settings.excluded_countries.includes(excludedCountrySelect)) {
                          upd('excluded_countries', [...settings.excluded_countries, excludedCountrySelect]);
                        }
                        setExcludedCountrySelect('');
                      }}
                    >
                      Add
                    </Button>
                  </div>
                  {settings.excluded_countries.length > 0 && (
                    <div style={{ marginTop: '8px' }}>
                      <InlineStack gap="200">
                        {settings.excluded_countries.map((c) => {
                          const countryLabel = COUNTRY_OPTIONS.find((o) => o.value === c)?.label || c;
                          return (
                            <Tag
                              key={c}
                              onRemove={() => upd('excluded_countries', settings.excluded_countries.filter((x) => x !== c))}
                            >
                              {countryLabel}
                            </Tag>
                          );
                        })}
                      </InlineStack>
                    </div>
                  )}
                </BlockStack>
              </BlockStack>
            </BlockStack>
          </Card>

          <Box paddingBlockEnd="800" />
        </BlockStack>
      ) : (
        <BlockStack gap="500">
          {/* ════════════════════════════════════════════════
              FULL PREPAID CARDS
          ════════════════════════════════════════════════ */}
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">Full Prepaid Settings</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Offer customers an option to pay the full amount upfront.
                  </Text>
                </BlockStack>
              </InlineStack>

              <ToggleRow
                label="Full Prepaid Status"
                sub={settings.full_prepaid_enabled ? 'Customers can choose to pay the full amount upfront.' : 'Full prepaid option is hidden.'}
                checked={settings.full_prepaid_enabled}
                onChange={(v) => upd('full_prepaid_enabled', v)}
              />
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">Prepaid Discount</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Offer a discount when customers choose Full Prepaid.
                </Text>
              </BlockStack>

              <ToggleRow
                label="Enable Prepaid Discount"
                sub="Offer a discount to customers who choose Full Prepaid."
                checked={settings.prepaid_discount_enabled}
                onChange={(v) => upd('prepaid_discount_enabled', v)}
              />

              {settings.prepaid_discount_enabled && (
                <div style={{ padding: '16px', background: '#f9fafb', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
                  <BlockStack gap="400">
                    <InlineGrid columns={2} gap="400">
                      <Select
                        label="Discount Type"
                        options={[
                          { label: 'Percentage', value: 'percentage' },
                          { label: 'Fixed Amount', value: 'fixed' },
                        ]}
                        value={settings.prepaid_discount_type}
                        onChange={(v) => upd('prepaid_discount_type', v as 'percentage' | 'fixed')}
                      />
                      <TextField
                        label="Discount Value"
                        type="number"
                        min="0"
                        suffix={settings.prepaid_discount_type === 'percentage' ? '%' : shopCurrency}
                        value={String(settings.prepaid_discount_value)}
                        onChange={(v) => upd('prepaid_discount_value', parseFloat(v) || 0)}
                        autoComplete="off"
                      />
                    </InlineGrid>

                    <Divider />
                    <BlockStack gap="200">
                      <Text as="h3" variant="headingSm">Storefront Preview</Text>
                      <Text as="p" variant="bodySm" tone="subdued">Preview uses 500 as example cart total</Text>
                      <div style={{
                          display: 'flex', flexDirection: 'column', background: '#f0fdf4', borderRadius: '12px',
                          border: '2px solid #22c55e', position: 'relative', overflow: 'visible',
                          padding: '16px 12px 12px 12px', maxWidth: '400px'
                      }}>
                          <div style={{
                              position: 'absolute', top: '-10px', left: '16px', background: '#22c55e', color: 'white',
                              fontSize: '9px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px', letterSpacing: '0.05em',
                              display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'uppercase'
                          }}>
                              ★ MOST POPULAR
                          </div>

                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', width: '100%', boxSizing: 'border-box' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, width: '32px', height: '32px', borderRadius: '8px', color: '#16a34a', backgroundColor: '#dcfce7' }}>
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4" /><path d="M4 6v12c0 1.1.9 2 2 2h14v-4" /><path d="M18 12a2 2 0 0 0-2 2c0 1.1.9 2 2 2h4v-4h-4z" /></svg>
                              </div>

                              <div style={{ flex: 1, minWidth: 0, paddingTop: '2px' }}>
                                  <div style={{ fontWeight: 700, fontSize: '14px', color: '#166534', lineHeight: 1.2 }}>Full Prepaid</div>
                                  <div style={{ color: '#4ade80', fontSize: '11px', marginTop: '4px', lineHeight: 1.3 }}>Pay now &amp; get fastest delivery</div>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                                      <div style={{ background: '#dcfce7', color: '#166534', fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '99px', lineHeight: 1 }}>
                                          Save {settings.prepaid_discount_type === 'percentage' ? fmt(500 * (settings.prepaid_discount_value / 100)) : fmt(settings.prepaid_discount_value)}
                                      </div>
                                      <span style={{ fontWeight: 800, fontSize: '15px', color: '#166534' }}>
                                          {settings.prepaid_discount_type === 'percentage' ? fmt(500 - (500 * (settings.prepaid_discount_value / 100))) : fmt(500 - settings.prepaid_discount_value)}
                                      </span>
                                  </div>
                                  <input type="radio" checked readOnly style={{ width: '18px', height: '18px', accentColor: '#22c55e', margin: 0, pointerEvents: 'none' }} />
                              </div>
                          </div>
                      </div>
                    </BlockStack>
                  </BlockStack>
                </div>
              )}
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">Restrictions</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Control exactly when the full prepaid option appears. All rules must pass for it to show.
                </Text>
              </BlockStack>

              <Text as="h3" variant="headingSm">Order Total Range</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Set to 0 to disable the restriction.
              </Text>
              <InlineGrid columns={2} gap="400">
                <TextField
                  label="Minimum Order Total"
                  type="number"
                  value={String(settings.full_prepaid_minimum_order_total)}
                  prefix={shopCurrency}
                  min="0"
                  onChange={(v) => upd('full_prepaid_minimum_order_total', parseFloat(v) || 0)}
                  autoComplete="off"
                  helpText="0 = no minimum"
                />
                <TextField
                  label="Maximum Order Total"
                  type="number"
                  value={String(settings.full_prepaid_maximum_order_total)}
                  prefix={shopCurrency}
                  min="0"
                  onChange={(v) => upd('full_prepaid_maximum_order_total', parseFloat(v) || 0)}
                  autoComplete="off"
                  helpText="0 = no maximum"
                />
              </InlineGrid>

              <Divider />

              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text as="h3" variant="headingSm">Specific Products</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {settings.full_prepaid_allowed_product_ids.length === 0
                      ? 'Full prepaid shows on all products.'
                      : `Only shows for ${settings.full_prepaid_allowed_product_ids.length} selected product(s).`}
                  </Text>
                </BlockStack>
                <Button variant="secondary" onClick={async () => {
                  try {
                    const sel = await shopify.resourcePicker({
                      type: 'product',
                      multiple: true,
                      selectionIds: settings.full_prepaid_allowed_product_ids.map((id) => ({
                        id: id.includes('gid://') ? id : `gid://shopify/Product/${id}`,
                      })),
                    });
                    if (sel) {
                      const ids = sel.map((p: any) => p.id.replace('gid://shopify/Product/', ''));
                      const titles: Record<string, string> = {};
                      sel.forEach((p: any) => {
                        titles[p.id.replace('gid://shopify/Product/', '')] = p.title;
                      });
                      upd('full_prepaid_allowed_product_ids', ids);
                      setProductTitles((prev) => ({ ...prev, ...titles }));
                    }
                  } catch (_e) {}
                }}>
                  {settings.full_prepaid_allowed_product_ids.length === 0 ? 'Add Products' : `Edit Products (${settings.full_prepaid_allowed_product_ids.length})`}
                </Button>
              </InlineStack>
              {settings.full_prepaid_allowed_product_ids.length > 0 && (
                <div style={{ marginTop: '12px' }}>
                  <InlineStack gap="200">
                    {settings.full_prepaid_allowed_product_ids.map((id) => (
                      <Tag
                        key={id}
                        onRemove={() => upd('full_prepaid_allowed_product_ids', settings.full_prepaid_allowed_product_ids.filter((x) => x !== id))}
                      >
                        {productTitles[id] || `Product …${id.slice(-6)}`}
                      </Tag>
                    ))}
                  </InlineStack>
                </div>
              )}

              <Divider />

              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text as="h3" variant="headingSm">Specific Collections</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {settings.full_prepaid_allowed_collection_ids.length === 0
                      ? 'Full prepaid shows for all collections.'
                      : `Only shows for products in ${settings.full_prepaid_allowed_collection_ids.length} selected collection(s).`}
                  </Text>
                </BlockStack>
                <Button variant="secondary" onClick={async () => {
                  try {
                    const sel = await shopify.resourcePicker({
                      type: 'collection',
                      multiple: true,
                      selectionIds: settings.full_prepaid_allowed_collection_ids.map((id) => ({
                        id: id.includes('gid://') ? id : `gid://shopify/Collection/${id}`,
                      })),
                    });
                    if (sel) {
                      const ids = sel.map((c: any) => c.id.replace('gid://shopify/Collection/', ''));
                      const titles: Record<string, string> = {};
                      sel.forEach((c: any) => {
                        titles[c.id.replace('gid://shopify/Collection/', '')] = c.title;
                      });
                      upd('full_prepaid_allowed_collection_ids', ids);
                      setCollectionTitles((prev) => ({ ...prev, ...titles }));
                    }
                  } catch (_e) {}
                }}>
                  {settings.full_prepaid_allowed_collection_ids.length === 0 ? 'Add Collections' : `Edit Collections (${settings.full_prepaid_allowed_collection_ids.length})`}
                </Button>
              </InlineStack>
              {settings.full_prepaid_allowed_collection_ids.length > 0 && (
                <div style={{ marginTop: '12px' }}>
                  <InlineStack gap="200">
                    {settings.full_prepaid_allowed_collection_ids.map((id) => (
                      <Tag
                        key={id}
                        onRemove={() => upd('full_prepaid_allowed_collection_ids', settings.full_prepaid_allowed_collection_ids.filter((x) => x !== id))}
                      >
                        {collectionTitles[id] || `Collection …${id.slice(-6)}`}
                      </Tag>
                    ))}
                  </InlineStack>
                </div>
              )}
            </BlockStack>
          </Card>

          <Box paddingBlockEnd="800" />
        </BlockStack>
      )}
      </Box>
      </div>
    </>
  );
}
