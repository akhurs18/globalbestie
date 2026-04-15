# Global Bestie — Setup & Operations Guide

> USA products delivered to Pakistan 🇺🇸 → 🇵🇰  
> Static HTML · Hosted on Netlify · Database on Supabase · Orders via WhatsApp

---

## Files

| File | What it is |
|------|-----------|
| `index.html` | Landing page — hero, about, testimonials, how-it-works |
| `products.html` | Shop — product grid, cart, checkout |
| `admin.html` | Admin panel — orders, products, inventory, categories, content, settings |
| `about.html` | About us page |
| `contact.html` | Contact page |
| `faq.html` | FAQ page |
| `policy.html` | Order policy + bank details |

---

## Hosting (Netlify)

### First deploy
1. Drag and drop this `files/` folder at [app.netlify.com](https://app.netlify.com) → **Deploy manually**
2. Site goes live at `yoursite.netlify.app`

### Auto-deploy (recommended)
1. Push `files/` to a GitHub or GitLab repo
2. Netlify → **Add site → Import from Git** → connect repo → publish directory: `/` → Deploy
3. Every push auto-deploys in ~30 seconds

### Custom domain (e.g. globalbestie.pk)
1. Netlify → **Domain settings → Add custom domain**
2. Point your domain's nameservers to Netlify's (shown in dashboard)
3. Free SSL included automatically

---

## Database (Supabase)

Supabase stores products and orders so they're shared across devices and survive browser resets.

### Setup
1. Create a free project at [supabase.com](https://supabase.com) (choose Mumbai or Singapore region)
2. Run `../supabase-setup.sql` in **SQL Editor → New Query**
3. Go to **Authentication → Users → Add user** — create your admin email + password
4. Go to **Settings → API** — copy the **Project URL** and **anon public** key

### Paste credentials into each file
Find the config block near the top of the `<script>` in each file and fill in:

```js
const SUPA_URL = 'https://YOUR_PROJECT.supabase.co';
const SUPA_KEY = 'eyJ...YOUR_ANON_KEY...';
```

Files to update:
- `admin.html` (search `SUPA_URL`)
- `products.html` (search `SUPA_URL`)
- `index.html` (search `SUPA_URL`)

### Add your Netlify URL to Supabase
Supabase → **Authentication → URL Configuration → Site URL** → set to your Netlify URL.

### Admin login
After setup, open `admin.html` and sign in with the email + password you created in Supabase Auth.

---

## Key settings to update before going live

All of these are editable from **Admin → Content** or **Admin → Settings** — no code edits needed.

| What | Where |
|------|-------|
| WhatsApp number | Admin → Content → Contact |
| Bank transfer details | Admin → Content → Policy |
| About page text | Admin → Content → About |
| FAQ answers | Admin → Content → FAQ |
| Product categories | Admin → Categories |
| EmailJS credentials | Admin → Settings |
| Anthropic API key (AI descriptions) | Admin → Settings |

---

## Adding products

**Option A — Admin panel**
Admin → Products → `+ Add Product` (fill in name, brand, price, stock, image)

**Option B — Bulk JSON import (scraper)**
1. Run `../scraper.py` to scrape Sephora/Ulta (requires `pip install requests beautifulsoup4`)
2. It outputs `import_products.json`
3. Admin → Products → `⬆ Import JSON` → paste the JSON → adjust PKR rate → Import

**Option C — AI Trends**
Admin → Trends → Fetch trending products → select → Add to store

---

## EmailJS (shipping notifications)

Free tier: 200 emails/month.

1. Sign up at [emailjs.com](https://emailjs.com)
2. Create an email service (connect Gmail or similar)
3. Create two templates:
   - **Shipping**: subject `Your Global Bestie order has shipped!`, body uses `{{customer_name}}` and `{{message}}`
   - **Promo**: subject `{{subject}}`, body uses `{{customer_name}}` and `{{message}}`
4. Admin → Settings → paste Public Key, Service ID, and both Template IDs → Save

---

## Pricing formula

PKR prices are set manually per product. When importing via JSON, the formula is:

```
PKR = round(USD × exchange_rate × (1 + markup%) / 100) × 100
```

Default: `USD × 278 × 1.30` (30% markup) — adjustable in the Import modal.

---

## Order flow

1. Customer browses `products.html`, adds to cart
2. Fills in name, phone, city, address
3. Transfers payment to bank account shown in checkout
4. Taps **Send Screenshot on WhatsApp** — pre-filled message sent to your number
5. Order is saved to Supabase automatically
6. You see it in Admin → Orders → confirm, pack, ship, mark delivered

---

## Preorder policy

| Policy | Detail |
|--------|--------|
| Advance required | 50% of order total |
| Delivery time | ~4 weeks from confirmation |
| Prices | Fixed — includes shipping, taxes, customs |
| Courier | Third-party — not under our control |

---

## Services used

| Service | Purpose | Cost |
|---------|---------|------|
| Netlify | Hosting | Free |
| Supabase | Products + orders database | Free (up to ~500MB) |
| EmailJS | Shipping notification emails | Free (200/mo) |
| Anthropic | AI product descriptions + trends | ~$0.01/use |

---

*Last updated: April 2026 · Global Bestie · 🇺🇸 → 🇵🇰*
