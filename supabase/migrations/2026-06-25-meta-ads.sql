-- Meta Ads bot — backing tables for the four-phase automation that lives in
-- netlify/functions/ads-*.js. Everything the bot does against the Meta
-- Marketing API is also mirrored here so the portal can render it, so spend
-- decisions are auditable, and so every automated change is reversible.
--
--   meta_ad_snapshots   Phase 1 — daily insights pulled from Meta (read-only).
--   meta_ad_creatives   Phase 2 — generated image+copy waiting to be used.
--   meta_ad_campaigns    Phase 3 — campaigns the bot built, with a human gate
--                                  between "built (paused)" and "launched".
--   meta_ad_actions      Phase 4 — every optimization the bot took, with the
--                                  before/after values so it can be undone.
--
-- Guardrails (max daily budget, target ROAS/CPA, autopilot on/off) live as
-- columns on store_settings so they sit next to the existing FX/markup config.
-- All writes go through Netlify Functions with the service-role key — never the
-- browser. The Meta system-user token is a Netlify env var, never stored here.

-- ── Phase 1: performance snapshots ─────────────────────────────────────────
-- One row per (entity, date). `level` distinguishes account/campaign/adset/ad
-- rollups so the same table powers both the top-line dashboard and the
-- ad-level numbers the optimizer reasons over. Upserted on each report run.
create table if not exists public.meta_ad_snapshots (
  id text primary key,                       -- `${level}:${entity_id}:${date}`
  level text not null check (level in ('account', 'campaign', 'adset', 'ad')),
  entity_id text not null,                   -- Meta object id (or 'account')
  entity_name text,
  campaign_id text,                          -- denormalized for easy filtering
  date date not null,
  spend numeric(14, 2) not null default 0,   -- in ad-account currency (PKR)
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  ctr numeric(8, 4) not null default 0,      -- percent
  cpc numeric(14, 4) not null default 0,
  cpm numeric(14, 4) not null default 0,
  purchases integer not null default 0,
  purchase_value numeric(14, 2) not null default 0,
  leads integer not null default 0,
  roas numeric(10, 4) not null default 0,    -- purchase_value / spend
  cpa numeric(14, 2) not null default 0,     -- spend / purchases (0 = no buys)
  raw jsonb,                                  -- full insights row for forensics
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists meta_ad_snapshots_level_date_idx
  on public.meta_ad_snapshots (level, date desc);
create index if not exists meta_ad_snapshots_entity_idx
  on public.meta_ad_snapshots (entity_id, date desc);
create index if not exists meta_ad_snapshots_campaign_idx
  on public.meta_ad_snapshots (campaign_id, date desc);

-- ── Phase 2: creative queue ────────────────────────────────────────────────
-- Generated (or hand-uploaded) ad creatives waiting to be attached to a
-- campaign. Nothing here is live on Meta until ads-create.js promotes it.
create table if not exists public.meta_ad_creatives (
  id text primary key,
  product_id text,                           -- products.id this promotes
  headline text not null,                    -- ad "name" / headline
  primary_text text not null,                -- the post body / "message"
  description text,                          -- link description
  cta_type text not null default 'SHOP_NOW', -- Meta call_to_action type
  destination_url text not null,             -- landing page (quote / product)
  image_url text,                            -- creative image (Supabase/remote)
  source text not null default 'manual'
    check (source in ('manual', 'ai_generated', 'motion_insight')),
  status text not null default 'draft'
    check (status in ('draft', 'ready', 'in_use', 'archived')),
  meta jsonb,                                -- generation prompt, insight refs
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists meta_ad_creatives_status_idx
  on public.meta_ad_creatives (status, created_at desc);

-- ── Phase 3: campaigns the bot built (with the approval gate) ──────────────
-- approval_state is the human gate: the bot can only ever create rows in
-- 'built' (paused on Meta). A person flips it to 'launched' (or 'rejected').
-- The optimizer and undo paths never touch approval_state.
create table if not exists public.meta_ad_campaigns (
  id text primary key,                       -- local id (GB-AD-...)
  meta_campaign_id text,                      -- Meta campaign id (act-level)
  meta_adset_id text,
  meta_ad_id text,
  meta_creative_id text,
  name text not null,
  objective text not null default 'OUTCOME_SALES',
  product_id text,
  creative_ref text references public.meta_ad_creatives(id) on delete set null,
  daily_budget_pkr numeric(14, 2) not null default 0,
  targeting jsonb,                           -- geo/age/interests sent to Meta
  approval_state text not null default 'built'
    check (approval_state in ('built', 'launched', 'paused', 'rejected', 'archived')),
  effective_status text,                      -- last-known status from Meta
  launched_at timestamptz,
  created_by text,                            -- 'bot' or operator label
  approved_by text,                           -- operator who launched it
  notes text,
  meta jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists meta_ad_campaigns_state_idx
  on public.meta_ad_campaigns (approval_state, created_at desc);

-- ── Phase 4: optimization action log (reversible) ──────────────────────────
-- Every budget change / pause the optimizer makes lands here with the value
-- before and after, mirroring the Advance/Undo pattern in the portal OMS.
-- `reverted` flips true once undone so the same action can't be undone twice.
create table if not exists public.meta_ad_actions (
  id uuid primary key default gen_random_uuid(),
  action text not null
    check (action in ('scale_budget', 'reduce_budget', 'pause', 'resume', 'launch', 'undo')),
  level text not null check (level in ('campaign', 'adset', 'ad')),
  entity_id text not null,                   -- Meta object the action hit
  entity_name text,
  campaign_local_id text references public.meta_ad_campaigns(id) on delete set null,
  reason text,                               -- which rule fired
  field text,                                -- 'daily_budget' | 'status'
  value_before text,
  value_after text,
  performed_by text not null default 'bot',  -- 'bot' | operator label
  dry_run boolean not null default false,    -- true when autopilot is off
  reverted boolean not null default false,
  reverted_at timestamptz,
  meta jsonb,
  created_at timestamptz not null default now()
);

create index if not exists meta_ad_actions_created_idx
  on public.meta_ad_actions (created_at desc);
create index if not exists meta_ad_actions_entity_idx
  on public.meta_ad_actions (entity_id, created_at desc);

-- ── Guardrails on store_settings ───────────────────────────────────────────
-- These cap what the optimizer is allowed to do. With autopilot off, Phase 4
-- runs in dry-run mode: it logs the action it *would* take but never calls Meta.
alter table public.store_settings
  add column if not exists ads_autopilot boolean not null default false;
alter table public.store_settings
  add column if not exists ads_max_daily_budget_pkr numeric(14, 2) not null default 5000;
alter table public.store_settings
  add column if not exists ads_scale_step_pct numeric(6, 2) not null default 20;
alter table public.store_settings
  add column if not exists ads_target_roas numeric(8, 2) not null default 2.0;
alter table public.store_settings
  add column if not exists ads_max_cpa_pkr numeric(14, 2) not null default 2500;
-- Spend a single ad must reach before the optimizer is allowed to pause it for
-- having zero purchases (stops it killing ads before they've had a fair test).
alter table public.store_settings
  add column if not exists ads_learn_spend_pkr numeric(14, 2) not null default 1500;

-- ── RLS — service-role only, no public access ──────────────────────────────
alter table public.meta_ad_snapshots enable row level security;
alter table public.meta_ad_creatives enable row level security;
alter table public.meta_ad_campaigns enable row level security;
alter table public.meta_ad_actions enable row level security;
-- No SELECT policies are created: all reads/writes happen through Netlify
-- Functions using the service-role key, which bypasses RLS. The anon key can
-- see nothing here — this is internal spend data.
