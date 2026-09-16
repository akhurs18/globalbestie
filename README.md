# Global Bestie by HAR — website

Next.js site for Global Bestie: US brands, final PKR prices, 50/50 payments. How the business runs is in [BUSINESS_MODEL.md](BUSINESS_MODEL.md).

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Things to update

All in [lib/products.js](lib/products.js):

- `settings.fxRate` — USD → PKR rate (update twice a week)
- `settings.currentBatch` — batch number and closing time (drives the countdown)
- `settings.transitBatch` — the batch in transit, its stage (0–4) and dates (drives the tracker)
- `products` — the catalogue (placeholders for now: swap in real names, brands, US prices, shipping and photos)
- `shippingEstimates` — rough shipping bands used by the "Request anything" estimate

## Environment variables

| Name | Example | What it does |
| --- | --- | --- |
| `OMS_URL` | `https://oms.example.com` | Where the order management system runs. Server-side only. |
| `OMS_SITE_TOKEN` | `oms_pub_global-bestie_…` | Publishable site token from the OMS (`npm run site:token -- global-bestie "Website" https://globalbestiepk.com https://www.globalbestiepk.com`). Server-side only here. |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | `923001234567` | Questions, requests and Bestie Club sign-ups open WhatsApp with a pre-filled message. Without it they fall back to Instagram DMs (message copied to clipboard). |

With `OMS_URL` + `OMS_SITE_TOKEN` set, prices, stock and batches come from the OMS (refreshed every few minutes), the bag sends a real order request (a DRAFT the team reviews), and Track shows live status. Without them — or if the OMS is unreachable — the site falls back to `lib/products.js`, and checkout and tracking fall back to a DM.

For local development, put both in `.env.local` (git-ignored) pointing at a local OMS.

## Deploy (Hostinger, Node.js)

Hostinger builds with `npm install` → `npm run build` and runs `npm start`. Upload the source (no `node_modules`, no `.next`).
