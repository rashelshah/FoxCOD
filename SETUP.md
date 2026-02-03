# Fox COD App - Setup Instructions

Complete setup guide for the Shopify Cash on Delivery (COD) embedded app.

## Prerequisites

- Node.js >= 20.19
- Shopify Partner account
- Supabase account (free tier works)
- ngrok or Shopify CLI for local development

---

## 1. Supabase Setup

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Navigate to **SQL Editor**
3. Run the SQL from `database/schema.sql` to create tables
4. Go to **Settings > API** and copy:
   - Project URL → `SUPABASE_URL`
   - Service Role Key → `SUPABASE_SERVICE_KEY`

---

## 2. Environment Setup

Copy the example file and fill in your values:

```bash
cp .env.example .env
```

Required environment variables:
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_KEY` - Your Supabase service role key

Shopify variables are auto-configured by CLI.

---

## 3. Install Dependencies

```bash
npm install
```

---

## 4. Start Development

```bash
npm run dev
```

This starts:
- Shopify CLI tunnel
- React Router dev server
- Theme extension preview

---

## 5. Install on Development Store

1. Follow the CLI prompts to open your app
2. Install on a development store
3. The app automatically:
   - Handles OAuth
   - Stores shop data in Supabase
   - Shows the admin dashboard

---

## 6. Add COD Form to Store

1. In Shopify Admin, go to **Online Store > Customize**
2. Navigate to a product page template
3. Add the **COD Order Form** block/section
4. Configure colors, button text, etc.
5. Save and publish

---

## 7. Deploy to Production

### Backend (Render)

1. Create a Render Web Service
2. Connect your GitHub repo
3. Set build command: `npm install && npm run build`
4. Set start command: `npm run start`
5. Add environment variables in Render dashboard

### Update Shopify Config

```bash
npm run deploy
```

---

## Project Structure

```
├── app/
│   ├── config/
│   │   └── supabase.server.ts    # Database client
│   ├── routes/
│   │   ├── app._index.tsx        # Dashboard
│   │   ├── app.settings.tsx      # Settings page
│   │   ├── api.create-order.tsx  # Order API
│   │   └── api.settings.tsx      # Settings API
│   └── services/
│       └── shopify-orders.server.ts  # Order creation
├── database/
│   └── schema.sql                # Supabase tables
└── extensions/
    └── cod-form-block/           # Theme extension
        ├── blocks/cod-form.liquid
        └── assets/cod-form.js
```

---

## Features Implemented

✅ OAuth install flow (via Shopify CLI)  
✅ Shop data stored in Supabase  
✅ Admin dashboard with stats  
✅ Settings page (toggle, colors, fields)  
✅ COD order form on storefront  
✅ Order creation with pending status  
✅ Uninstall webhook cleanup  

---

## Troubleshooting

**Supabase connection errors:**
- Verify `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are correct
- Check RLS policies in Supabase

**Orders not creating:**
- Verify `write_orders` scope is granted
- Check browser console for API errors

**Extension not showing:**
- Ensure extension is deployed: `npm run deploy`
- Add block to theme via customizer
