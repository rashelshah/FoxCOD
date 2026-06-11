import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { supabaseSessionStorage } from "./shopify/session-storage.server";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October25,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: supabaseSessionStorage,
  distribution: AppDistribution.AppStore,
  future: {
    expiringOfflineAccessTokens: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
  hooks: {
    afterAuth: async ({ session }) => {
      shopify.registerWebhooks({ session });

      try {
        const { getFormSettings, saveFormSettings, DEFAULT_BLOCKS, DEFAULT_STYLES, DEFAULT_BUTTON_STYLES } = await import("./config/supabase.server");
        const { getPartialPaymentSettings, savePartialPaymentSettings } = await import("./services/partial-payment-settings.server");
        const { DEFAULT_MODAL_SETTINGS, DEFAULT_MODULE_FLAGS, DEFAULT_PAYMENT_OPTIONS } = await import("./config/partial-payment.types");
        
        const existingSettings = await getFormSettings(session.shop);
        if (!existingSettings) {
          await saveFormSettings({
            shop_domain: session.shop,
            enabled: true,
            button_text: "Buy Now - Cash on Delivery",
            form_title: "Enter your Details",
            form_subtitle: "Fill in your details to place a COD orders.",
            primary_color: "#000000",
            required_fields: ["phone", "name", "address"],
            max_quantity: 10,
            button_styles: {
              ...DEFAULT_BUTTON_STYLES,
              showAddToCart: true,
            },
            fields: [
              { id: 'phone', label: 'Phone Number', type: 'tel', visible: true, required: true, order: 1 },
              { id: 'name', label: 'Full Name', type: 'text', visible: true, required: true, order: 2 },
              { id: 'address', label: 'Address', type: 'text', visible: true, required: true, order: 3 },
              { id: 'state', label: 'State', type: 'text', visible: true, required: false, order: 4 },
              { id: 'city', label: 'City', type: 'text', visible: true, required: false, order: 5 },
              { id: 'zip', label: 'ZIP Code', type: 'text', visible: true, required: false, order: 6 },
              { id: 'email', label: 'Email', type: 'email', visible: false, required: false, order: 7 },
              { id: 'shipping', label: 'Shipping', type: 'text', visible: true, required: false, order: 8 },
              { id: 'payment_mode', label: 'Payment Mode', type: 'text', visible: true, required: false, order: 9 },
              { id: 'order_summary', label: 'Order Summary', type: 'text', visible: true, required: false, order: 10 },
              { id: 'coupon', label: 'Coupon Code', type: 'text', visible: false, required: false, order: 11 },
            ],
            blocks: DEFAULT_BLOCKS,
            styles: DEFAULT_STYLES,
          });
          console.log(`[Install] Initialized default form settings for ${session.shop}`);
        }

        const existingPartialSettings = await getPartialPaymentSettings(session.shop);
        if (!existingPartialSettings) {
          await savePartialPaymentSettings({
            shop_domain: session.shop,
            enabled: true,
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
            pure_cod_enabled: true,
            pure_cod_fee_enabled: false,
            pure_cod_fee_name: 'COD Fee',
            pure_cod_fee_type: 'fixed',
            pure_cod_fee_amount: 0,
            pure_cod_minimum_order_total: 0,
            pure_cod_maximum_order_total: 0,
            pure_cod_allowed_product_ids: [],
            pure_cod_allowed_collection_ids: [],
            full_prepaid_enabled: true,
            full_prepaid_minimum_order_total: 0,
            full_prepaid_maximum_order_total: 0,
            full_prepaid_allowed_product_ids: [],
            full_prepaid_allowed_collection_ids: [],
            prepaid_discount_enabled: false,
            prepaid_discount_type: 'percentage',
            prepaid_discount_value: 0,
          });
          console.log(`[Install] Initialized default partial payment settings for ${session.shop}`);
        }
      } catch (error) {
        console.error(`[Install] Error initializing settings for ${session.shop}:`, error);
      }
    },
  },
});

export default shopify;
export const apiVersion = ApiVersion.October25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
