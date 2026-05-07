# Global Bestie Marketing Agent

## Purpose

Run the daily product discovery and content handoff workflow for Global Bestie without auto-publishing anything to the storefront.

## Daily 4 PM Workflow

1. Create or reuse today’s `trend_batches` row with `target_count = 200`.
2. Fetch up to 200 USA brand product candidates from approved sources, official retailers, affiliate feeds, Instagram saves, or manual imports.
3. Store each candidate in `trend_candidates` with:
   - `batch_id`
   - title
   - brand/category
   - source URL
   - USA retail price
   - shipping estimate
   - suggested description
   - image or asset URLs
   - `production_status = fetched`
4. Shortlist candidates that fit Global Bestie’s luxury pink/black brand, especially handbags, shoes, makeup, and high-intent preorder requests.
5. Export the dated files in `dist/marketing-batches/`: full batch JSON, product listing JSON, product CSV, and Remotion manifest.
6. Move shortlisted candidates to `ready_for_remotion` only after product context, image references, caption angle, and video notes are complete.
7. The team manually produces Remotion assets outside the admin portal.
8. Add final image/video URLs back to Supabase.
9. Move polished candidates to `product_ready`.
10. Admin reviews and approves. Only approved candidates become storefront products.

## Marketing Priorities

- Short-form video: product-first Reels with price reveal, preorder timeline, and bank-transfer clarity.
- VIP WhatsApp drops: handbag, shoes, beauty, and fragrance segments.
- Creator seeding: track UGC rights, story deliverables, and referral codes.
- Retargeting: view product, add to bag, checkout started, DM but no order.
- SEO drop pages: target "USA brand in Pakistan" and "[brand/product] Pakistan preorder" searches.
- Referral credits: reward repeat buyers who bring high-ticket preorder customers.

## Guardrails

- Never publish scraped products automatically.
- Do not claim authenticity unless the source is verified.
- Do not use customer DMs, WhatsApp messages, or UGC in marketing without approval.
- Keep Remotion as a manual handoff. The portal is for collecting assets, captions, notes, and final URLs.
- Every published product must follow the pricing formula: USA retail converted to PKR, plus 25% markup, plus shipping.

## 24/7 Instagram Reply Workflow

1. Receive Instagram DM webhooks at `/api/webhooks/instagram`.
2. Turn every buying-intent DM into a `marketing_leads` record.
3. Save inbound and outbound copies in `marketing_messages`.
4. Auto-reply only with approved concierge copy:
   - ask for product/screenshot
   - ask for size, shade, or color
   - ask for city
   - ask for WhatsApp number
   - explain approval-first preorder flow
5. If the customer sends payment proof, asks for cancellation/refund, complains, mentions delay, asks for courier changes, or sounds upset, mark `automation_status = human_handoff`.
6. Human handoffs should alert the owner through `TEAM_ALERT_WEBHOOK_URL` when configured.
7. Do not make final availability, price, shipment, or refund promises automatically.
