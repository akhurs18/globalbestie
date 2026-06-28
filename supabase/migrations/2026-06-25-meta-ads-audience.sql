-- Meta Ads — audience intelligence (data-driven targeting).
--
-- Backs ads-audience.js: the bot extracts performance broken down by age,
-- gender, and region from the Meta Insights API, finds the segments that
-- convert cheapest, and caches a single recommended targeting spec here.
-- ads-create.js then builds new ad sets from this recommendation instead of
-- the flat "Pakistan / 18-45 / all genders" default.
--
-- One row, id = 'current' — the latest recommendation, overwritten each run.
-- The `basis` jsonb keeps the segment math so the portal can show *why* a
-- recommendation was made (transparency, and a sanity check before trusting it).

create table if not exists public.meta_targeting_reco (
  id text primary key default 'current',
  age_min integer,
  age_max integer,
  genders integer[] not null default '{}',     -- Meta codes: {}=all, {1}=male, {2}=female
  region_keys text[] not null default '{}',     -- resolved adgeolocation region keys for targeting
  region_labels text[] not null default '{}',   -- human names, for display
  confidence text not null default 'none' check (confidence in ('none', 'low', 'high')),
  basis jsonb,                                   -- per-segment spend/CPA/ROAS that drove the pick
  window_days integer not null default 30,
  computed_at timestamptz not null default now()
);

alter table public.meta_targeting_reco enable row level security;
-- Service-role only (Netlify functions). No public policies — internal data.
