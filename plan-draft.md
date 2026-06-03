# Add COD Form to Cart Page

We will expand the Fox COD functionality so that the "Buy with COD" button and checkout form work natively on the Cart page for multiple items.

## Proposed Changes

1. **New App Block for Cart**: Create a new Theme App extension block (e.g. `cod-cart-form.liquid`) that merchants can drop into their Cart template.
2. **Frontend Javascript Modifications**: Update the monolithic `cod-form.js` to detect when it's running in Cart mode. When clicked, it will:
   - Fetch the active cart via Shopify's `/cart.js` AJAX API.
   - Dynamically build the order summary UI with all cart items (rather than a single product).
   - Pass an array of `cartItems` to the backend.
3. **Backend API Overhaul**: 
   - Modify the `proxy.$.tsx` endpoints to accept a flexible `cartItems` array.
   - Refactor the `calculateOrderPricing` engine (which currently assumes a primary `variantId` + upsells) to iterate securely over the entire array of cart items, accurately totaling up prices for both standard COD and Partial COD checkouts.

## Verification Plan

1. We will deploy the updated extension to Shopify.
2. Instruct you to add the new App Block to the Cart page via Theme Editor.
3. Place a test COD order containing 3 different products.
4. Verify the backend successfully generates the Draft Order / Cart Permalink containing all 3 items with exact totals.
