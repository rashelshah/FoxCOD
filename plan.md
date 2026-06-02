# Plan to Fix Partial COD Custom Pricing

## Goal
The user requires that downsells, upsells, and bundle offers (which modify the standard product price) are accurately reflected in the Shopify Checkout for Partial COD.

## Issue
Currently, Partial COD uses **Cart Permalinks** (`/cart/variant:quantity`). Cart Permalinks strictly load the native variant price from Shopify Admin and do not allow custom line item price overrides. Therefore, a product natively priced at $749.95 will always show as $749.95 in checkout, even if Fox COD applies a downsell price of $674.96.

## Solution
To override line item prices in Shopify Checkout, we must use **Draft Order Invoices**.
Draft Orders allow us to explicitly set `originalUnitPrice` for each line item (matching the Fox COD downsell/upsell prices). We can then apply a single order-level discount for the `remainingAmount`, reducing the final invoice total to exactly the `advanceAmount`.

When the customer visits the Draft Order `invoiceUrl`, they will see:
1. Exact line items with downsell/upsell prices.
2. An order discount equal to the remaining COD amount.
3. A total to pay matching the exact Advance Amount.

## Steps
1. **Update `shopify-partial-payment.server.ts`**:
   - Change `createPartialPaymentCheckout` to use the Admin GraphQL API `draftOrderCreate` mutation instead of Cart Permalinks.
   - Update the `LineItemInput` interface to include `price` and `title`.
   - Remove the `createTemporaryDiscount` function (Draft Orders use native `appliedDiscount`).
2. **Update `proxy.$.tsx`**:
   - Pass `pricing.discountItems` (which contains the accurate custom prices) into `createPartialPaymentCheckout` instead of just raw variant IDs.
   - Pass `shippingPrice` natively into the Draft Order.

