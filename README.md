# Global Bestie Commerce

Luxury ecommerce site for a Pakistan-based Instagram store selling USA branded products. The app includes storefront, cart, bank-transfer checkout, order tracking, a separate internal operations portal, product controls, Supabase storage, and a trend approval pipeline.

## What Is Included

- Premium black and pink storefront focused on women’s handbags, shoes, and makeup.
- Product pricing formula: USA retail in USD, FX rate, 25% markup, and shipping in PKR.
- Checkout with direct bank deposit instructions, approval-first order requests, 50% preorder advance after acceptance, and remaining balance tracking.
- Optional transfer confirmation upload.
- Customer order tracking page.
- Separate internal portal for products, orders, settings, and trend approvals.
- Growth Studio for content collection, manual Remotion handoff, campaign planning, Instagram/WhatsApp lead tracking, content calendar, and channel integration setup.
- Netlify Functions for API endpoints.
- Supabase SQL schema.
- Scraper endpoint that queues trend candidates for admin approval.
- `AGENTS.md` operating guide for the store workflow.

## Local Preview

This project does not require npm packages for the frontend preview.

```bash
python3 -m http.server 4173
```

Then open:

```text
http://localhost:4173
```

The local static preview uses demo fallback data. Netlify Functions run when deployed on Netlify or through Netlify Dev.

## Supabase Setup

1. Create a Supabase project.
2. Open the SQL editor.
3. Run `supabase/schema.sql`.
4. Confirm the private storage bucket `transfer-proofs` exists.
5. Copy your project URL and service role key.

Do not expose the service role key in browser code.

## Netlify Setup

Add these environment variables in Netlify:

```text
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
ADMIN_SHARED_SECRET=choose_a_strong_admin_password
META_WEBHOOK_VERIFY_TOKEN=choose_a_meta_webhook_verify_token
```

For the 24/7 Instagram DM concierge, also add these when your Meta app is approved and connected:

```text
META_APP_SECRET=your_meta_app_secret
META_PAGE_ACCESS_TOKEN=page_or_instagram_messaging_token
INSTAGRAM_BUSINESS_ACCOUNT_ID=your_instagram_business_account_id
META_GRAPH_VERSION=v24.0
TEAM_ALERT_WEBHOOK_URL=optional_make_n8n_slack_or_email_webhook
```

Build settings are already defined in `netlify.toml`:

```text
Build command: node scripts/check-static-app.mjs
Publish directory: dist
Functions directory: netlify/functions
```

## API Routes

- `GET /api/catalog`: product catalog and store settings.
- `POST /api/catalog`: admin product upsert.
- `GET /api/orders?query=...`: customer tracking lookup.
- `POST /api/orders`: create checkout order with advance and balance amounts.
- `GET /api/admin/dashboard`: admin dashboard data.
- `GET /api/admin/marketing`: internal Growth Studio data.
- `POST /api/admin/marketing`: create content items, campaigns, leads, or calendar items.
- `GET /api/webhooks/instagram`: Meta webhook verification.
- `POST /api/webhooks/instagram`: receive Instagram DMs, qualify leads, auto-reply, and route human handoffs.
- `PATCH /api/admin/orders/:id`: update order status.
- `POST /api/admin/settings`: update bank, markup, FX, and preorder settings.
- `PATCH /api/admin/trends/:id`: approve or reject trend candidates.
- `POST /api/scraper`: run trend candidate discovery.

## Internal Team Portal

Open `/portal` or `/portal.html` directly and enter the same value as `ADMIN_SHARED_SECRET`.

Your internal team can:

- Accept or move orders through fulfillment stages.
- View each order’s line items, advance required, remaining balance, customer notes, and payment stage.
- Update product prices, shipping fees, inventory, and preorder status.
- Change bank account details and pricing settings.
- Approve scraped/trending products before they publish.
- Collect uploaded, Instagram-sourced, UGC, and product-shoot content for manual production.
- Manage campaigns, Instagram/WhatsApp lead replies, and the posting calendar.

## Growth Studio Roadmap

The portal now includes the operating surface for:

- Content library: uploaded files, Instagram pulls, UGC, product shoots, captions, and Remotion handoff notes.
- Instagram operations: posting queue, comment/DM lead capture, content calendar, and performance review.
- WhatsApp operations: lead replies, quote follow-ups, VIP broadcasts, preorder updates, and abandoned checkout nudges.
- Campaign management: budgets, channels, lead counts, revenue attribution, and retargeting planning.
- Bigger growth loops: VIP WhatsApp list, creator seeding, referral credits, Meta retargeting, and SEO drop pages.

Production integrations to add later:

```text
META_APP_ID
META_APP_SECRET
INSTAGRAM_BUSINESS_ACCOUNT_ID
WHATSAPP_BUSINESS_PHONE_NUMBER_ID
META_ACCESS_TOKEN
REMOTION_RENDER_WEBHOOK_URL
```

## Notes For Production

- Replace demo bank details before launch.
- Replace demo product images with approved product or editorial images.
- Connect a domain and test checkout uploads on a Netlify deploy.
- Preorder orders are approved by the team first, then collect 50% advance. The remaining balance is collected once the shipment reaches Pakistan, before local dispatch.
- Use official retailer APIs or affiliate feeds for high-volume trend ingestion where possible.
- The daily marketing workflow can fetch up to 200 product candidates into Supabase, enrich descriptions/assets, hand them to Remotion manually, then publish only after admin approval.
- Each daily run exports files in `dist/marketing-batches/`: full batch JSON, product listing JSON, CSV for team review, and a Remotion manifest with image URLs, captions, pricing, advance/balance amounts, and scene notes.
- Add staff accounts later if you want per-person audit trails beyond the shared admin secret.
