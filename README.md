# Fox COD (Cash on Delivery) - Shopify App

A comprehensive, performance-focused Shopify Embedded App built to supercharge Cash on Delivery (COD) functionality. It allows merchants to customize a powerful COD form, increase Average Order Value (AOV) with Upsells & Downsells, prevent fraudulent orders, and integrate with third-party tools seamlessly.

## ✨ Key Features

- **Customizable COD Form**: Embed a smooth, native-feeling order form directly onto your product pages using Theme App Extensions. No liquid code changes required.
- **Upsells & Downsells Engine**: Increase store revenue with 1-tick upsells, customizable bundle offers, and post-purchase post-conversion downsells.
- **Partial COD Payments**: Reduce RTO (Return to Origin) by requiring a partial advance payment. Draft orders are automatically managed.
- **Fraud Protection**: Built-in mechanisms to verify orders, ensuring that fraudulent or high-risk COD requests are blocked.
- **Third-Party Integrations**: Push data and sync operations gracefully with Google Sheets, SMS/WhatsApp services, and Address Autocomplete providers.
- **Pixel Tracking Integration**: Easily configure pixels (Facebook, TikTok, etc.) to track conversions properly, even with off-platform or draft-order approaches.
- **Settings Dashboard**: An intuitive, fast, Polaris-built admin dashboard to easily configure app behavior, form fields, and view critical analytics and statistics.

## 🛠 Tech Stack

- **Frontend (Admin Interface)**: [React Router](https://reactrouter.com/), [Shopify Polaris](https://polaris.shopify.com/), [App Bridge React](https://shopify.dev/docs/api/app-bridge-library)
- **Backend**: Node.js, [Shopify CLI](https://shopify.dev/docs/apps/tools/cli)
- **Database**: [Supabase](https://supabase.com/) (PostgreSQL) managed via [Prisma ORM](https://www.prisma.io/)
- **Storefront**: Theme App Extensions (Liquid + Vanilla JS)

---

## 🚀 Getting Started

To get the project running locally, follow these setup steps.

### Prerequisites

- [Node.js](https://nodejs.org/) (>= 20.19)
- [Shopify Partner Account](https://partners.shopify.com/)
- [Supabase](https://supabase.com/) Account (Free tier works perfectly)
- [Shopify CLI](https://shopify.dev/docs/apps/tools/cli/getting-started) (for local development/tunneling)

### 1. Supabase Setup
1. Create a new project in your Supabase dashboard.
2. Navigate to the **SQL Editor** in Supabase and run the SQL schema found in `database/schema.sql` (and its migrations like `migration_v15_fraud_protection.sql`) to initialize your database tables.
3. In Supabase, go to **Settings > API** and copy your:
   - Project URL (will be your `SUPABASE_URL`)
   - Service Role Key (will be your `SUPABASE_SERVICE_KEY`)

### 2. Environment Configuration
Copy the supplied example configuration to create your own environment file:
```bash
cp .env.example .env
```
Fill in the `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` fields in the generated `.env` file. *Note: Shopify CLI will auto-configure other required Shopify variables.*

### 3. Install Dependencies
Run the following in your root app directory:
```bash
npm install
```

### 4. Start the Development Server
```bash
npm run dev
```
Running this command accomplishes a few things:
- Initiates the Shopify CLI tunnel to ngrok/Cloudflare
- Starts the React Router backend and frontend servers
- Enables hot-reloading for theme extension development

### 5. Install on a Development Store
1. Follow the CLI terminal prompts to open your app on the local tunnel.
2. Select your development store to install the app.
3. During installation, the app handles the OAuth flow automatically, registers webhooks, securely creates the Shop data in Supabase, and opens the main dashboard.

---

## ⚙️ Store Configuration

### Adding the COD Form to Your Storefront
1. Go to your Shopify Admin, navigate to **Online Store > Themes**, and click **Customize**.
2. Open a **Product Page** template via the dropdown.
3. Under the Product Information section, click **Add Block** (or Add Section) and select the **COD Order Form** block provided by the form extension.
4. Position the block as needed and use the sidebar configurations to adjust button text, colors, fields, and behavior.
5. Save your theme changes.

---

## 📂 Project Structure

```text
├── app/
│   ├── config/
│   │   └── supabase.server.ts       # Supabase client instantiation
│   ├── routes/
│   │   ├── app._index.tsx           # Main Dashboard (Analytics & Stats)
│   │   ├── app.app-settings.tsx     # Consolidated Settings (Pixels, Fraud Protection, etc.)
│   │   ├── app.upsell-downsell.tsx  # Upsells & Downsells Management
│   │   ├── api.create-order.tsx     # API: Order processing (COD)
│   │   └── api.partial-cod.create-checkout.tsx # API: Checkout creation for advance payments
│   └── services/
│       └── shopify-orders.server.ts # Backend order utility methods
├── database/
│   ├── schema.sql                   # Supabase database table definitions
│   └── migration_*.sql              # Database migrations (e.g., fraud protection)
├── extensions/
│   └── cod-form-block/              # Theme App Extension (Storefront injects)
│       ├── blocks/cod-form.liquid   # Structure of the COD form block
│       └── assets/cod-form.js       # Storefront handler scripts (Cart, Variants, Forms)
├── package.json                     # CLI Tooling, Package dependencies
└── shopify.app.toml                 # Shopify App declarative configuration
```

---

## 🌱 Deployment

### Step 1: Backend Deployment (e.g., Render, Fly, Google Cloud Run)
1. Set up a Web Service on your provider (such as Render).
2. Connect your Git repository.
3. Configure your Build Command: `npm install && npm run build`
4. Configure your Start Command: `npm run start`
5. Inject all necessary environment variables into the deployment dashboard (e.g., `SUPABASE_URL`, Shopify client specs).

### Step 2: Push App Structure to Shopify
Update your Shopify configurations to point towards your production backend explicitly:
```bash
npm run deploy
```

---

## 🐛 Troubleshooting

| Scenario | Possible Fixes |
| --- | --- |
| **Supabase Connection Errors** | Ensure `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are correct. Also check RLS (Row Level Security) policies config in Supabase. |
| **Orders Not Creating on Storefront** | Verify your App Settings scopes have `write_orders` included (`shopify.app.toml`). Also, examine the browser console and server network logs for errors regarding product variants lacking information or Shopify API failures. |
| **Storefront Block / Extension Not Visible** | Make sure you’ve run `npm run deploy` to push the latest form block to your store. Make sure the block was added in the Online Store Customizer. |
| **Shopify Draft Orders Failing (Partial COD / Upsell)** | Ensure `write_draft_orders` is enabled in `shopify.app.toml`. Confirm product properties/variants supplied are valid. |

---

> Built with the [Shopify React Router template](https://github.com/Shopify/shopify-app-template-react-router) as a base.
