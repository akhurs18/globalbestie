# Meta Ads bot

A four-phase automation that runs Meta (Facebook/Instagram) ad campaigns for
Global Bestie. Everything operational runs 24/7 in Netlify's cloud — there is
**no dependency on any local machine**. Campaign *creation* is gated behind a
human "Launch" click so the bot can never start spending on its own.

## The four phases

| Phase | Function | Trigger | Spends money? |
|---|---|---|---|
| 1 · Reporting | `ads-report.js` | cron `0 6 * * *` + portal Refresh | No (read-only) |
| 2 · Creative queue | `ads-creative.js` | portal "Draft ad copy" | No |
| 3 · Campaign creation | `ads-create.js` | portal "Use & build" → **Launch** | Only on Launch |
| 4 · Optimization | `ads-optimize.js` | cron `0 7 * * *` | Only if autopilot ON |

All four are Netlify Functions under `netlify/functions/`. The portal **Growth →
Meta Ads** tab is the operator surface. Backing tables and guardrail columns are
in `supabase/migrations/2026-06-25-meta-ads.sql` — run that migration once.

## Required environment variables (Netlify → Site settings → Environment)

These are **secrets** — set them in Netlify, never commit them.

| Variable | Required | What it is |
|---|---|---|
| `META_SYSTEM_USER_TOKEN` | ✅ | Long-lived **System User** token with `ads_management`, `ads_read`, `business_management`. Generate in Business Settings → System Users → Generate Token. |
| `META_AD_ACCOUNT_ID` | ✅ | Numeric ad account id, **without** the `act_` prefix. |
| `META_PAGE_ID` | ✅ | The Facebook Page the ads post as. |
| `META_PIXEL_ID` | optional | Pixel for conversion-optimized ad sets (enables ROAS optimization). |
| `META_INSTAGRAM_ACTOR_ID` | ✅ for IG ads | Instagram account id (connected to the Page in Business Settings). **Required when running Instagram-only** — without it IG placements have no actor to run as. |
| `META_PUBLISHER_PLATFORMS` | optional | Comma-separated placements. **Defaults to `instagram` (Instagram-only).** Set e.g. `instagram,facebook` to widen. Setting this disables Advantage+ automatic placements. |
| `META_GRAPH_VERSION` | optional | Graph API version, defaults to `v21.0`. |
| `META_CURRENCY_MINOR_UNITS` | optional | Minor units per major currency unit for budget fields. Defaults to `100`. **Verify for your ad account's currency before enabling live spend** — Meta expects budgets in the account currency's minor unit. |
| `PUBLIC_SITE_ORIGIN` | optional | Absolute origin used to turn `/product/x` into an ad link. Defaults to `https://globalbestie.com`. |

Until `META_*` is set, the portal panel shows **Not configured** and every
function returns `{ configured: false }` gracefully — nothing breaks.

## How spend is kept safe

1. **Everything is built PAUSED.** `ads-create.js` only ever creates campaigns,
   ad sets, and ads in `PAUSED` status. They sit in the **Approval queue** as
   `built`.
2. **Launch is the only path to ACTIVE** and is operator-only (the
   "Approve & launch" button). It logs who approved it.
3. **Undo re-pauses** any launched campaign, mirroring the order Advance/Undo
   pattern.
4. **The optimizer is dry-run by default.** With `ads_autopilot` off (Settings →
   Ads guardrails), Phase 4 only *logs* the action it would take. Turn autopilot
   on to let it actually adjust budgets / pause duds.
5. **Hard guardrails** (Settings → Ads guardrails) bound every automated action:
   - `ads_max_daily_budget_pkr` — budgets are clamped to this at build, and the
     optimizer never scales past it.
   - `ads_scale_step_pct` — how much to raise a winning ad set's budget.
   - `ads_target_roas` — ROAS an ad must beat before its budget is scaled.
   - `ads_max_cpa_pkr` — CPA above which an ad is paused.
   - `ads_learn_spend_pkr` — spend an ad must reach before it can be paused for
     zero purchases (stops the bot killing ads before a fair test).

## Optimizer rules (Phase 4)

Run daily over the last 3 days of ad-level snapshots:

- **Pause** an ad that has spent ≥ `ads_learn_spend_pkr` with **0 purchases**.
- **Pause** an ad whose **CPA > `ads_max_cpa_pkr`**.
- **Scale** the ad set's daily budget up by `ads_scale_step_pct` when its
  **ROAS ≥ `ads_target_roas`** — never above `ads_max_daily_budget_pkr`.

Every action is written to `meta_ad_actions` with the before/after value and is
reversible via `GET /api/admin/ads-optimize?undo=<action_id>`.

## Creative library (Phase 2)

Creatives are operator-supplied: the team uploads media and writes copy in the
ads page's Creatives tab. (The old template-based `generate` action was
removed 2026-07 — the store runs on human-made creative only.)

## Endpoints

```
GET  /api/admin/ads-report[?days=7]              dashboard + refresh snapshots
GET  /api/admin/ads-creative                     list creative queue
POST /api/admin/ads-creative {action:'add'|'status'}
GET  /api/admin/ads-create                        local campaigns + Ads Manager sync (`external`)
POST /api/admin/ads-create {action:'build'|'launch'|'undo'|'resume'|'reject'|'set_budget'}
POST /api/admin/ads-create {action:'meta_status'|'meta_budget'}   control Ads-Manager campaigns
GET  /api/admin/ads-optimize[?force=1|undo=ID]    run optimizer / revert action
```

All require the portal admin bearer (auto-attached by the portal for
`/api/admin/*`). The two scheduled functions also accept Netlify's own
schedule invocation with no bearer.
