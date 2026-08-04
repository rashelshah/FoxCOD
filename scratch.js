import { shopifyApi, LATEST_API_VERSION } from '@shopify/shopify-api';
// We need to fetch the settings_data.json from the active theme.
// Since we don't have the active session token, let's just grep the themeExtraction.ts to see what we can do.
