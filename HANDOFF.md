# Handoff — commit & push the QA/security/UI pass

**For Claude Code (runs locally, no sandbox restrictions).**
The changes below are already in the working tree — they just need committing and pushing.

## First: clear the stale lock

A sandbox tool left a zero-byte `.git/index.lock` it couldn't delete. Remove it before any git op:

```bash
rm -f .git/index.lock
```

## Commit

Branch: `meta-ads-and-inventory-integrity` (commit here; do not switch branches).

Stage everything from this pass **except** the temp batch output and secrets:

```bash
echo ".tmp-marketing-batches/" >> .gitignore   # if not already ignored
git add assets/app.js assets/styles.css assets/ads.css portal.html \
        docs/qa-audit-2026-07-04.md HANDOFF.md .gitignore \
        netlify/functions/
git status   # sanity check — confirm .env and .tmp-marketing-batches are NOT staged
git commit -m "Security fix + UI restructure pass"
git push origin meta-ads-and-inventory-integrity
```

Do **not** commit `.env` (contains `ADMIN_SHARED_SECRET`) or `.tmp-marketing-batches/`.

## What changed and why

### P0 security — admin auth bypass (the reason 31 function files changed)
`netlify/functions/_shared/supabase.js` → `requireAdmin(req)` used to authorize **any**
request whose cookie merely contained the string `gb_team_session=`, without validating it.
Confirmed live: a forged `gb_team_session=anything` cookie returned the full admin dashboard
(all orders + customer PII). It's now `async` and validates the token against the
`team_sessions` table (checking expiry), mirroring `currentTeamMember`. All admin/ads/scraper
endpoints were updated to `await requireAdmin(req)` — that's the one-line change across the
`netlify/functions/*.js` files.

### P0 safety — placeholder bank details at checkout
`assets/app.js` (`renderBankDetails`) — if the store's bank settings are still the demo
placeholders (`0210-0000-000000`), checkout no longer shows a fake account a customer could
wire money to; it shows a "get transfer details on WhatsApp" panel instead. Real details render
normally once the `store_settings` row is filled in.

### P1 — product editor rejected valid prices
`portal.html` — customer price input `step="100"` → `step="1"` (prices like 15,750 silently
failed to save before).

### P2 — console exceptions on navigation
`assets/app.js` — swallow the View Transitions API `.ready`/`.finished` rejections that fired
`InvalidStateError` on fast route changes / product opens.

### UI restructure pass (assets/app.js, assets/styles.css, assets/ads.css)
- Storefront: preorder cards show a single payment line (`Rs X advance · 50% balance on arrival`)
  instead of two heavy boxes; cart drawer flags size/shade as **Required** (red → green when
  filled) and, on a blocked checkout, scrolls to + shakes the offending field.
- Sign-in modal: added a three-item benefits list (track orders, faster checkout, reorder).
- Portal: colored per-order status pill; readiness-checklist items became "Fix now →" buttons
  that deep-link to the tab that fixes them; order amount cell restructured into a labeled
  total/due/advance/balance breakdown with "Due now" highlighted.
- Ads portal: proper empty states for Campaigns and Creatives.
- Mobile: the new preorder payment line stacks cleanly at narrow widths.

All changed files pass `node --check` (JS) and have balanced CSS braces. The build
(`scripts/check-static-app.mjs`) minifies `assets/` into `dist/assets/v/` on deploy, so no
manual bundling is needed.

## Still open (owner actions, not code)
- Rotate `ADMIN_SHARED_SECRET` (it was exposed via the auth bug and is in `.env`).
- Run the Supabase migration for `otp_codes` / `team_sessions` (sign-in returns 503 without it;
  it's also what makes the new admin-auth validation effective).
- Enter real bank details, support WhatsApp, and next shipment ETA in `store_settings`.
- Replace demo product images (59 flagged); grant Meta `ads_management`/`ads_read` for the ads dashboard.

Full write-up: `docs/qa-audit-2026-07-04.md`.
