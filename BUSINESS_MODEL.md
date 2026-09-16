# Global Bestie — Business Model

How we operate. Tech-agnostic: this describes the business, not any particular implementation.

## What We Are

A luxury, Instagram-first import store based in Pakistan that sells USA-branded products (handbags, shoes, makeup, fragrance, accessories) to Pakistani customers. Brand feel: premium, pink and black, fast concierge-style service.

## Pricing

Every customer price follows one formula:

```
customer_price_pkr = (usa_price_usd × fx_rate) × (1 + markup) + shipping_pkr
```

- **Markup:** 25% by default (adjustable).
- **FX rate:** USD→PKR, updated twice weekly (last default used: 282).
- **Shipping:** estimated per product, in PKR.
- Always show customers the final PKR price.

## Product Types

Every product is either:

- **Preorder:** we buy it from the USA after the order is accepted. Normal ETA is about 4 weeks, tied to a shipment batch. Customer copy must say batch timing can vary.
- **In stock:** already in Pakistan, and inventory must be above zero.

Shipment batches move through: `collecting → sourcing → shipped → arriving → arrived` (or `cancelled`).

## Order & Payment Flow (Approval-First)

1. The customer places an **order request**. It is not yet a confirmed sale.
2. The team reviews it and confirms availability, the final PKR price, and the shipment batch.
3. After acceptance:
   - **Preorder:** the customer pays a **50% advance** by bank transfer. The remaining **50% balance** is collected when the shipment arrives in Pakistan, before local dispatch.
   - **In stock:** the customer pays **100%** before dispatch.
4. The team verifies every transfer proof. An uploaded proof counts as "pending" until confirmed.
5. Customers can track orders by order number or phone.

**Order stages:** `pending_review → accepted → sourcing → in_transit → pakistan_processing → delivered` (or `cancelled`)

**Payment stages:** `awaiting_advance → advance_uploaded → advance_confirmed → balance_due → balance_uploaded → paid_in_full` (or `payment_rejected`)

## Product Sourcing

- We find trending USA products through brand sites, official retailers, affiliate feeds, Instagram saves, and manual imports. We respect each site's terms and robots rules.
- A daily discovery run shortlists up to about 200 candidates.
- **Nothing publishes automatically.** Before a team member approves a candidate, it needs a final title, a brand, a category, a source URL, the USA price, a shipping estimate, a premium description, and approved imagery.
- Never claim a product is authentic unless the source is verified.

## Sales & Customer Service

- Instagram DMs and WhatsApp are the main sales channels. Every message that shows buying intent becomes a **lead**.
- **Lead stages:** `new → quote_sent → order_ready → won / lost`
- **Response SLA:** 15 minutes. For a luxury brand, fast replies matter.
- An automated concierge can reply only to DMs the customer started, using approved scripts. It collects the product or screenshot, the size, shade, or colour, the city, and a WhatsApp number, and it explains the approval-first flow.
- Automation must never promise availability, the final price, a delivery date, a refund, or authenticity.
- **Hand off to a human** for payment proof, refunds, cancellations, complaints, delays, courier or address changes, unclear requests, and any angry or urgent message.

## Marketing & Growth

- **Short-form video (Reels):** product first, with a price reveal, the preorder timeline, and clear bank-transfer info.
- **VIP WhatsApp drops:** segmented into handbags, shoes, beauty, and fragrance.
- **Creator seeding:** track UGC rights, deliverables, and referral codes.
- **Referral credits:** reward repeat buyers who bring in high-ticket customers.
- **Retargeting:** people who viewed a product, added to bag, started checkout, or sent a DM without ordering.
- **SEO drop pages:** target searches like "USA brand in Pakistan" and "[brand/product] Pakistan preorder".
- A team member approves every piece of content before it goes out. Never use customer DMs or UGC in marketing without permission.

## Operating Rhythm

- **Daily:** review pending orders, balance-due orders, new leads, and product candidates.
- **Twice weekly:** update the FX rate and shipping assumptions.
- **Weekly:** archive stale candidates and check for preorder delays.
- **Monthly:** audit margins, refunds and rejections, and delivery speed.
