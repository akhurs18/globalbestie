-- UGC posts — customer photos + quotes that power the storefront "From real
-- besties" rail. Kept deliberately small: the team curates these in the portal
-- (or seeds them from approved Instagram DMs) and only `approved` rows render
-- publicly. No PII beyond a display handle + city the customer agreed to show.

create table if not exists public.ugc_posts (
  id text primary key,
  handle text not null,                 -- "@ayeshakhan" (display only)
  city text,                            -- "Karachi"
  quote text not null,                  -- the testimonial line
  image_url text,                       -- customer photo (Supabase storage or remote)
  product_ref text,                     -- optional: product id / title this relates to
  category text,                        -- optional: handbags / shoes / makeup ...
  cta_text text default 'Order this look →',
  cta_href text default '/quote',       -- where the card CTA points
  source text not null default 'manual' check (source in ('manual', 'instagram', 'whatsapp')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  sort_order integer not null default 0,-- lower = earlier in the rail
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ugc_posts_status_sort_idx
  on public.ugc_posts (status, sort_order, created_at desc);

alter table public.ugc_posts enable row level security;

-- Public read of approved rows only; writes go through the service role
-- (Netlify functions), never the anon key.
drop policy if exists "ugc_public_read_approved" on public.ugc_posts;
create policy "ugc_public_read_approved"
  on public.ugc_posts for select
  using (status = 'approved');
