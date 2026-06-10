# CLAUDE.md

Guide Claude Code (claude.ai/code) when work code in this repo.

## Commands

```bash
npm run dev         # Shopify CLI dev: tunnel + React Router server + theme extension HMR
npm run build       # react-router build → ./build/server/index.js
npm run start       # Serve built app (production)
npm run lint        # ESLint over project (uses .gitignore + .eslintignore)
npm run typecheck   # react-router typegen, then tsc --noEmit
npm run deploy      # Push app config + theme extension to Shopify
npm run setup       # prisma generate + prisma migrate deploy (Session model only)
npm run graphql-codegen  # Regenerate Shopify GraphQL types (.graphqlrc.ts)
```

No test runner. Single-file lint: `npx eslint path/to/file.tsx`.

Supabase migrations NOT auto-applied. Run `database/migration_v*.sql` by hand in Supabase SQL Editor, numeric order. `database/schema.sql` is initial baseline.

## Architecture

Shopify embedded app on **React Router v7** (not Remix), Shopify React Router adapter. File-system routing via `@react-router/fs-routes` flatRoutes — filename in `app/routes/` is URL (`app.orders_.$id.tsx` → `/app/orders/:id`, `webhooks.orders.create.tsx` → `/webhooks/orders/create`, `api.create-order.tsx` → `/api/create-order`).

### Two-layer persistence (important)

- **Supabase Postgres** (`SUPABASE_URL` + `SUPABASE_SERVICE_KEY`) is real database for ALL app data: shops, form settings, order logs, upsells, partial payments, coupons, fraud rules, pixels, integrations. Service-role key server-side. Tables enable RLS, service-role full-access policies.
- **Prisma + SQLite** (`prisma/schema.prisma`, `dev.sqlite`) only declares `Session` model — essentially unused. **Real Shopify sessions stored in Supabase** via custom `SessionStorage` in `app/shopify/session-storage.server.ts` (table `shopify_sessions`). Prisma `Session` model legacy from Shopify template — do not add new persistence there.

`app/db.server.ts` exports shared PrismaClient (singleton via `globalThis` in dev).

### Shopify auth + session lifecycle

`app/shopify.server.ts` builds `shopifyApp` with:
- `sessionStorage: supabaseSessionStorage` (custom Supabase-backed; preserves session id, expires, onlineAccessInfo, refreshToken, refreshTokenExpires).
- `future.expiringOfflineAccessTokens: true` — refresh tokens persisted and rotated.
- `afterAuth` hook seeds default `form_settings` for new shops via `app/config/supabase.server.ts` helpers (`getFormSettings`, `saveFormSettings`, `DEFAULT_BLOCKS`, `DEFAULT_STYLES`, `DEFAULT_BUTTON_STYLES`).

Invariants in `session-storage.server.ts` (don't break):
- Session IDs persisted exactly as Shopify provides (`offline_<shop>` etc.) — never mutated.
- `shops.access_token` updated **only for offline sessions** — online tokens must not overwrite shop-level token.
- `onlineAccessInfo` round-trips as JSONB; `expires`/`refresh_token_expires` as timestamptz.

### Surfaces

- **Admin (embedded React app)**: routes prefixed `app.*` use Polaris + App Bridge React. Several admin route files very large (`app.settings.tsx` ~378KB, `app.upsell-downsell.tsx` ~215KB, `app.quantity-offers.tsx` ~189KB, `app.partial-payments.tsx` ~93KB), hold self-contained feature UIs; edit by section.
- **Storefront (Theme App Extension)**: `extensions/cod-form-block/` ships two targets in `shopify.extension.toml` — `blocks/cod-form.liquid` (block target on product pages) and `blocks/cod-form-embed.liquid` (body embed). Bundled vanilla-JS handler is `assets/cod-form.js` (~374KB; cart, variants, form submit, partial-COD flow). `blocks/cod-form-core.liquid` is shared markup snippet.
- **API endpoints**: `app/routes/api.*.tsx` are JSON endpoints called by storefront form (order creation, partial-COD checkout, coupon validation, customer lookup, settings, retries, cleanup).
- **App Proxy**: `shopify.app.toml` proxies `https://<storefront>/apps/fox-cod/*` → `/api/proxy/*` (route `app/routes/proxy.$.tsx`).
- **Webhooks**: declared in `shopify.app.toml` (`orders/create|updated|cancelled|fulfilled`, `app/scopes_update`, `app/uninstalled`, GDPR compliance topics), implemented under `app/routes/webhooks.*.tsx`.

### Server-side services

`app/services/*.server.ts` where multi-step business logic lives — keep API routes thin, call services:
- `shopify-orders.server.ts`, `shopify-partial-payment.server.ts`, `shopify-sync.server.ts` — Shopify Admin GraphQL/REST order + draft-order flows.
- `coupons.server.ts`, `shipping-rates.server.ts`, `upsell-offers.server.ts`, `partial-payment-settings.server.ts` — feature settings/business rules.
- `fraud-protection.server.ts`, `customer-lookup.server.ts` — order verification.
- `pixel-tracking.server.ts`, `google-sheets.server.ts` — third-party integrations.

`app/shopify/rest-client.server.ts` wraps REST client. `app/utils/price-calculator.ts` and `product-resolver.ts` shared helpers.

### Shopify API versions

`apiVersion: ApiVersion.October25` set in `shopify.server.ts`. Webhook API version `2026-04` set in `shopify.app.toml`. Keep in sync with whatever GraphQL queries assume.

### Required access scopes

`shopify.app.toml`: `write_draft_orders, read_orders, write_orders, write_order_edits, read_products, read_discounts, write_discounts, unauthenticated_read_product_listings`. Adding scope requires re-auth — increment via Shopify CLI flow, not manual edits to merchant installs.

## Environment

Required env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`. Shopify variables (`SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL`, `SCOPES`) managed by Shopify CLI during `npm run dev`. Production `application_url` is `https://fox-cod.vercel.app` (from `shopify.app.toml`).

Node `>=20.19 <22 || >=22.12` (see `package.json` engines + `.nvmrc`).

## MCP

`.cursor/mcp.json` and `.mcp.json` register `@shopify/dev-mcp` — use for Shopify Admin GraphQL schema lookups when editing GraphQL queries.