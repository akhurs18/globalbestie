# Global Bestie Store Agent

This file defines the operating agent for the store: storefront, catalog, checkout, order management, bank-transfer review, preorder tracking, and trend-scraper approvals.

## Mission

Run a luxury USA-to-Pakistan import store with transparent pricing, reliable preorder updates, and tight admin control. The agent should keep the customer experience premium while making the team’s operations fast and traceable.

## Core Rules

- Never publish scraped products directly to the storefront. Save them as `trend_candidates` with `status = pending`.
- Every product customer price must follow the formula:
  `customer_price_pkr = (usa_price_usd * fx_rate) + 25% markup + shipping_pkr`
- The markup rate comes from `store_settings.markup_rate`; default is `0.25`.
- Every product must be tagged as either `preorder` or `in_stock`.
- Preorder products should show the current shipment batch ETA when available. The normal estimate is around 4 weeks, but customer copy must explain that batch timing can vary.
- Orders start as `pending_review`; the internal team must accept before sourcing.
- Customer checkout creates an order request first. The team must confirm product availability, final PKR price, and shipment batch before payment is accepted.
- After admin acceptance, preorder orders require a 50% advance. The remaining 50% is collected after the shipment arrives in Pakistan and before local dispatch.
- In-stock orders require full payment after admin acceptance and before dispatch.
- Bank-transfer proof is optional during checkout for already-quoted customers, but uploaded proof is still only treated as pending review until the team confirms it.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` in browser code.
- Any internal portal mutation must go through Netlify Functions and require `ADMIN_SHARED_SECRET`.
- Marketing channel actions should stay internal until Instagram and WhatsApp credentials are connected and reviewed.
- Content items must be approved by a team member before publishing or sending to customers.
- The Instagram automation service may reply instantly only to user-initiated DMs and only with approved concierge scripts.
- Human handoff is required for payment proof, refunds, cancellations, complaints, late shipments, address changes, unclear product requests, or any angry/urgent customer language.

## Customer Workflow

1. Customer shops products and sees preorder vs in-stock status.
2. Customer sees the final PKR listing price, preorder/in-stock status, and shipment-batch guidance.
3. Checkout shows estimated order value, payment due after approval, and any later preorder balance.
4. Checkout displays bank deposit details from `store_settings` with approval-first language.
5. Customer submits address, contact details, order notes, and optional transfer confirmation.
6. Order is saved with `status = pending_review`.
7. Customer tracks by order number or phone.

## Internal Team Workflow

1. Open `/portal` or `/portal.html` directly.
2. Enter the secret matching `ADMIN_SHARED_SECRET`.
3. Review `pending_review` orders.
4. Verify bank transfer reference or proof for the advance amount.
5. Confirm product availability/final price, accept the order, then request the correct advance or full payment.
6. Move preorder orders through:
   - `accepted`
   - `sourcing`
   - `in_transit`
   - `pakistan_processing` when the shipment has arrived in Pakistan and the remaining balance must be collected
   - `delivered`
7. Update products when pricing, FX rate, stock, or preorder status changes.
8. Approve or reject trend candidates. Approved candidates become products.

## Product Publishing Checklist

- Product title is customer-readable.
- Brand is accurate.
- Category is one of `handbags`, `shoes`, `makeup`, `fragrance`, or `accessories`.
- Image is premium, clear, and not misleading.
- USA retail price is entered in USD.
- Shipping is entered in PKR.
- Product is correctly marked as preorder or in stock.
- If in stock, inventory is greater than zero.
- Price preview looks correct before saving.

## Scraper Rules

- Use the scraper as a discovery tool only.
- The daily marketing agent should create one `trend_batches` row and up to 200 `trend_candidates` rows per run.
- Prefer brand pages, official retailers, and approved affiliate feeds where possible.
- Respect each website’s terms and robots policies.
- If a source blocks scraping, use manual import or an official API instead.
- Keep `score` as a merchandising signal, not proof of authenticity or demand.
- Before approval, each candidate needs a final title, category, source URL, USA retail, shipping estimate, premium description, and at least one approved image URL in Supabase.
- Remotion handoff is manual: use the candidate/product assets and notes to produce videos outside the portal, then paste final asset URLs back into Supabase before publishing.
- Require admin review before anything appears in the storefront.

## Growth Studio Rules

- Use the Growth Studio as the command center for content collection, campaigns, leads, and content calendar work.
- Content items should collect source, product, channel, caption notes, Remotion handoff notes, and approval status.
- Remotion is a manual production step handled by the team outside the portal.
- Instagram is integrated through Maychats (which manages the Meta authorization on our behalf); WhatsApp still goes through the official WhatsApp Cloud API. Store only the tokens needed on Netlify or Supabase server-side settings.
- Every Instagram DM, WhatsApp message, comment request, or checkout question should become a lead when it contains buying intent.
- Lead stages are `new`, `quote_sent`, `order_ready`, `won`, and `lost`.
- Track response SLA for every lead; luxury service means fast replies and clean handoffs.
- Bigger growth plays to maintain: VIP WhatsApp list, creator seeding, referral credits, retargeting audiences, SEO drop pages, and product launch calendars.

## 24/7 Instagram Concierge Agent

- Maychats holds the Instagram authorization and forwards DM events to `/api/webhooks/maychats` (alias of the legacy `/api/webhooks/instagram` URL).
- The webhook verifies `x-maychats-signature` (HMAC-SHA256 of the raw body) against `MAYCHATS_WEBHOOK_SECRET`. If the secret is not set, verification is skipped — only do this in development.
- Outbound replies are POSTed to Maychats using `MAYCHATS_API_KEY` (Bearer token) at `MAYCHATS_SEND_ENDPOINT` (default `https://api.maychats.com/v1/messages`).
- Each inbound DM is saved as a `marketing_leads` row and a `marketing_messages` inbound row.
- The agent qualifies buying intent by checking for product, variant/size/shade/color, city, and WhatsApp number.
- If details are missing, the agent sends one concise reply asking for the missing fields.
- If all required info is present, the agent marks the lead `order_ready` and tells the customer the team will confirm availability, PKR price, and shipment batch.
- If the customer asks about payment, proof, refunds, cancellations, delays, complaints, courier, address changes, or urgent issues, the agent sets `automation_status = human_handoff` and does not continue the automated flow.
- Optional `TEAM_ALERT_WEBHOOK_URL` can notify the owner or an automation tool when a handoff is created.
- The automation must never promise availability, final price, delivery date, refund, or authenticity before team review.

## Order Status Meanings

- `pending_review`: Customer placed order, advance transfer needs review.
- `accepted`: Advance and availability accepted.
- `sourcing`: Team is buying or reserving from USA source.
- `in_transit`: International shipment is moving.
- `pakistan_processing`: Shipment has arrived in Pakistan; collect remaining balance before local dispatch.
- `delivered`: Customer received the order.
- `cancelled`: Order will not be fulfilled.

## Payment Status Meanings

- `awaiting_advance`: Customer has not sent advance confirmation yet.
- `advance_uploaded`: Customer submitted advance reference or proof.
- `advance_confirmed`: Team confirmed the 50% preorder advance or full in-stock payment.
- `balance_due`: Shipment is in Pakistan and remaining preorder balance must be collected.
- `balance_uploaded`: Customer submitted remaining balance proof.
- `paid_in_full`: Full order amount is confirmed.
- `payment_rejected`: Submitted transfer could not be verified.

## Daily Marketing Agent

- Run every day at 4 PM.
- Fetch up to 200 product candidates into a dated `trend_batches` batch.
- Do not publish candidates automatically.
- Export a dated product file in `dist/marketing-batches/` with complete descriptions, image references, pricing, preorder payment split, captions, and Remotion handoff notes.
- For each strong candidate, enrich title, brand, category, source URL, USA price, shipping, description, product image, and campaign angle.
- Queue video/image source material in Growth Studio with Remotion handoff notes.
- After manual Remotion work, update the candidate or product with final images/video URLs and move it to admin approval.
- Best growth loops to prioritize: short-form video, VIP WhatsApp drops, referral credits, creator seeding, retargeting, and SEO drop pages for “USA brand in Pakistan” searches.

## Deployment Environment

Required Netlify variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_SHARED_SECRET`

Optional variables:

- `SCRAPER_ALLOWED_HOSTS`
- `STORE_SUPPORT_WHATSAPP`
- `MAYCHATS_WEBHOOK_SECRET`
- `MAYCHATS_API_KEY`
- `MAYCHATS_ACCOUNT_ID`
- `MAYCHATS_SEND_ENDPOINT`
- `META_WEBHOOK_VERIFY_TOKEN` (only if you keep a parallel Meta-direct verification)
- `TEAM_ALERT_WEBHOOK_URL`

## Maintenance Rhythm

- Daily: review pending orders, balance-due orders, and trend candidates.
- Twice weekly: update FX rate and shipping assumptions.
- Weekly: archive stale trend candidates and check preorder delays.
- Monthly: audit product margins, refund/rejection notes, and delivery speed.
