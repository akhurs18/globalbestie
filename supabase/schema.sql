create extension if not exists pgcrypto;

create table if not exists public.store_settings (
  id text primary key default 'store',
  bank_name text not null,
  account_title text not null,
  account_number text not null,
  iban text,
  markup_rate numeric(8, 4) not null default 0.25,
  fx_rate numeric(12, 4) not null default 282,
  preorder_weeks integer not null default 4,
  next_shipment_date date,
  shipment_notice text,
  business_hours text,
  response_sla_minutes integer not null default 15,
  city_delivery_fees text,
  shipping_rules text,
  balance_reminder_template text,
  support_whatsapp text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.store_settings (id, bank_name, account_title, account_number, iban, markup_rate, fx_rate, preorder_weeks)
values ('store', 'Meezan Bank', 'Global Bestie Imports', '0210-0000-000000', 'PK00MEZN0000000000000000', 0.25, 282, 4)
on conflict (id) do nothing;

alter table public.store_settings add column if not exists business_hours text;
alter table public.store_settings add column if not exists response_sla_minutes integer not null default 15;
alter table public.store_settings add column if not exists city_delivery_fees text;
alter table public.store_settings add column if not exists shipping_rules text;
alter table public.store_settings add column if not exists balance_reminder_template text;
alter table public.store_settings add column if not exists support_whatsapp text;
alter table public.store_settings add column if not exists next_shipment_date date;
alter table public.store_settings add column if not exists shipment_notice text;

create table if not exists public.shipment_batches (
  id text primary key,
  name text not null,
  eta_date date not null,
  status text not null default 'collecting' check (status in ('collecting', 'sourcing', 'shipped', 'arriving', 'arrived', 'cancelled')),
  capacity integer not null default 0,
  used integer not null default 0,
  note text,
  order_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shipment_batches_eta_idx on public.shipment_batches (eta_date, status);

create table if not exists public.products (
  id text primary key,
  title text not null,
  brand text,
  category text not null,
  description text,
  usa_price_usd numeric(12, 2) not null default 0,
  shipping_pkr numeric(12, 2) not null default 0,
  fx_rate numeric(12, 4) not null default 282,
  markup_rate numeric(8, 4) not null default 0.25,
  stock_mode text not null check (stock_mode in ('preorder', 'in_stock')),
  inventory integer not null default 0,
  image_url text not null,
  gallery_urls jsonb not null default '[]'::jsonb,
  variants text,
  authenticity_note text,
  receipt_url text,
  supplier_cost_pkr numeric(14, 2) not null default 0,
  product_status text not null default 'active' check (product_status in ('draft', 'active', 'archived')),
  social_proof text,
  featured boolean not null default false,
  preorder_weeks integer not null default 4,
  status text not null default 'active' check (status in ('draft', 'active', 'archived')),
  source_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_status_category_idx on public.products (status, category);
create index if not exists products_stock_mode_idx on public.products (stock_mode);

alter table public.products add column if not exists gallery_urls jsonb not null default '[]'::jsonb;
alter table public.products add column if not exists variants text;
alter table public.products add column if not exists authenticity_note text;
alter table public.products add column if not exists receipt_url text;
alter table public.products add column if not exists supplier_cost_pkr numeric(14, 2) not null default 0;
alter table public.products add column if not exists product_status text not null default 'active';
alter table public.products add column if not exists social_proof text;

create table if not exists public.orders (
  id text primary key,
  customer_name text not null,
  customer_phone text not null,
  customer_email text,
  customer_instagram text,
  city text not null,
  address text not null,
  notes text,
  channel text,
  owner text,
  priority text default 'Standard',
  status text not null default 'pending_review' check (
    status in ('pending_review', 'accepted', 'sourcing', 'in_transit', 'pakistan_processing', 'delivered', 'cancelled')
  ),
  payment_status text not null default 'awaiting_confirmation' check (
    payment_status in (
      'awaiting_confirmation',
      'confirmation_uploaded',
      'deposit_confirmed',
      'deposit_rejected',
      'refunded',
      'awaiting_advance',
      'advance_uploaded',
      'advance_confirmed',
      'balance_due',
      'balance_uploaded',
      'paid_in_full',
      'payment_rejected'
    )
  ),
  transfer_reference text,
  total_pkr numeric(14, 2) not null default 0,
  advance_due_pkr numeric(14, 2) not null default 0,
  balance_due_pkr numeric(14, 2) not null default 0,
  advance_paid_pkr numeric(14, 2) not null default 0,
  balance_paid_pkr numeric(14, 2) not null default 0,
  cost_pkr numeric(14, 2) not null default 0,
  margin_pkr numeric(14, 2) not null default 0,
  proof_url text,
  transfer_sender text,
  source_retailer text,
  source_url text,
  source_purchase_id text,
  usa_tracking text,
  local_courier text,
  eta text,
  next_action text,
  internal_notes text,
  admin_note text,
  tracking_number text,
  courier_name text,
  accepted_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orders_status_idx on public.orders (status);
create index if not exists orders_phone_idx on public.orders (customer_phone);
create index if not exists orders_created_at_idx on public.orders (created_at desc);

alter table public.orders
add column if not exists advance_due_pkr numeric(14, 2) not null default 0;

alter table public.orders
add column if not exists balance_due_pkr numeric(14, 2) not null default 0;

alter table public.orders add column if not exists customer_instagram text;
alter table public.orders add column if not exists channel text;
alter table public.orders add column if not exists owner text;
alter table public.orders add column if not exists priority text default 'Standard';
alter table public.orders add column if not exists advance_paid_pkr numeric(14, 2) not null default 0;
alter table public.orders add column if not exists balance_paid_pkr numeric(14, 2) not null default 0;
alter table public.orders add column if not exists cost_pkr numeric(14, 2) not null default 0;
alter table public.orders add column if not exists margin_pkr numeric(14, 2) not null default 0;
alter table public.orders add column if not exists proof_url text;
alter table public.orders add column if not exists transfer_sender text;
alter table public.orders add column if not exists source_retailer text;
alter table public.orders add column if not exists source_url text;
alter table public.orders add column if not exists source_purchase_id text;
alter table public.orders add column if not exists usa_tracking text;
alter table public.orders add column if not exists local_courier text;
alter table public.orders add column if not exists eta text;
alter table public.orders add column if not exists next_action text;
alter table public.orders add column if not exists internal_notes text;

alter table public.orders
drop constraint if exists orders_payment_status_check;

alter table public.orders
add constraint orders_payment_status_check check (
  payment_status in (
    'awaiting_confirmation',
    'confirmation_uploaded',
    'deposit_confirmed',
    'deposit_rejected',
    'refunded',
    'awaiting_advance',
    'advance_uploaded',
    'advance_confirmed',
    'balance_due',
    'balance_uploaded',
    'paid_in_full',
    'payment_rejected'
  )
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references public.orders(id) on delete cascade,
  product_id text references public.products(id) on delete set null,
  title text not null,
  quantity integer not null default 1,
  unit_price_pkr numeric(14, 2) not null,
  stock_mode text not null check (stock_mode in ('preorder', 'in_stock')),
  image_url text,
  variant text,
  source_url text,
  source_status text,
  created_at timestamptz not null default now()
);

create table if not exists public.transfer_confirmations (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references public.orders(id) on delete cascade,
  transfer_reference text,
  proof_path text,
  status text not null default 'uploaded' check (status in ('uploaded', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table if not exists public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references public.orders(id) on delete cascade,
  status text not null,
  note text not null,
  created_by text default 'system',
  created_at timestamptz not null default now()
);

create index if not exists order_events_order_id_idx on public.order_events (order_id, created_at);

create table if not exists public.trend_candidates (
  id text primary key,
  batch_id text,
  title text not null,
  brand text,
  category text not null,
  source_url text not null,
  usa_price_usd numeric(12, 2) not null default 0,
  shipping_pkr numeric(12, 2) not null default 0,
  score integer not null default 0,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  image_url text,
  suggested_description text,
  asset_urls jsonb not null default '[]'::jsonb,
  variants text,
  authenticity_note text,
  social_proof text,
  remotion_brief jsonb,
  production_status text not null default 'fetched' check (
    production_status in ('fetched', 'needs_assets', 'ready_for_remotion', 'product_ready', 'approved', 'rejected')
  ),
  raw_source text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists trend_candidates_status_score_idx on public.trend_candidates (status, score desc);

alter table public.trend_candidates
add column if not exists batch_id text;

alter table public.trend_candidates
add column if not exists suggested_description text;

alter table public.trend_candidates
add column if not exists asset_urls jsonb not null default '[]'::jsonb;

alter table public.trend_candidates
add column if not exists brand text;

alter table public.trend_candidates
add column if not exists variants text;

alter table public.trend_candidates
add column if not exists authenticity_note text;

alter table public.trend_candidates
add column if not exists social_proof text;

alter table public.trend_candidates
add column if not exists remotion_brief jsonb;

alter table public.trend_candidates
add column if not exists production_status text not null default 'fetched';

alter table public.trend_candidates
drop constraint if exists trend_candidates_production_status_check;

alter table public.trend_candidates
add constraint trend_candidates_production_status_check check (
  production_status in ('fetched', 'needs_assets', 'ready_for_remotion', 'product_ready', 'approved', 'rejected')
);

create index if not exists trend_candidates_batch_idx on public.trend_candidates (batch_id, production_status);

create table if not exists public.trend_batches (
  id text primary key,
  source text not null default 'daily_marketing_agent',
  target_count integer not null default 200,
  fetched_count integer not null default 0,
  status text not null default 'queued' check (status in ('queued', 'fetched', 'in_remotion_handoff', 'ready_for_review', 'published', 'failed')),
  notes text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.admin_audit (
  id uuid primary key default gen_random_uuid(),
  actor text not null default 'admin',
  action text not null,
  entity_type text not null,
  entity_id text,
  payload jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.creative_jobs (
  id text primary key,
  title text not null,
  type text not null,
  status text not null default 'collected' check (status in ('collected', 'needs_review', 'ready_for_remotion', 'in_edit', 'approved', 'published', 'failed')),
  channel text not null,
  product text,
  hook text,
  source text,
  prompt text,
  script jsonb,
  render_engine text default 'remotion',
  preview_url text,
  output_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_campaigns (
  id text primary key,
  name text not null,
  channel text not null,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'live', 'paused', 'complete')),
  budget_pkr numeric(14, 2) not null default 0,
  leads integer not null default 0,
  revenue_pkr numeric(14, 2) not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  meta jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_leads (
  id text primary key,
  name text not null,
  source text not null,
  stage text not null default 'new' check (stage in ('new', 'quote_sent', 'order_ready', 'won', 'lost')),
  product text,
  value_pkr numeric(14, 2) not null default 0,
  last_message text,
  owner text,
  sla text,
  channel_thread_id text,
  customer_phone text,
  external_user_id text,
  automation_status text not null default 'manual' check (automation_status in ('manual', 'auto_replied', 'needs_info', 'human_handoff', 'muted')),
  missing_fields jsonb not null default '[]'::jsonb,
  required_fields jsonb not null default '[]'::jsonb,
  handoff_reason text,
  last_inbound_at timestamptz,
  last_auto_reply_at timestamptz,
  meta jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.marketing_leads add column if not exists external_user_id text;
alter table public.marketing_leads add column if not exists automation_status text not null default 'manual';
alter table public.marketing_leads add column if not exists missing_fields jsonb not null default '[]'::jsonb;
alter table public.marketing_leads add column if not exists required_fields jsonb not null default '[]'::jsonb;
alter table public.marketing_leads add column if not exists handoff_reason text;
alter table public.marketing_leads add column if not exists last_inbound_at timestamptz;
alter table public.marketing_leads add column if not exists last_auto_reply_at timestamptz;
alter table public.marketing_leads add column if not exists meta jsonb;

alter table public.marketing_leads
drop constraint if exists marketing_leads_automation_status_check;

alter table public.marketing_leads
add constraint marketing_leads_automation_status_check check (
  automation_status in ('manual', 'auto_replied', 'needs_info', 'human_handoff', 'muted')
);

create table if not exists public.marketing_messages (
  id uuid primary key default gen_random_uuid(),
  lead_id text references public.marketing_leads(id) on delete cascade,
  source text not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  body text not null,
  external_message_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.content_calendar (
  id text primary key,
  title text not null,
  channel text not null,
  status text not null default 'draft' check (status in ('draft', 'needs_caption', 'ready', 'scheduled', 'published')),
  date text,
  scheduled_at timestamptz,
  creative_job_id text references public.creative_jobs(id) on delete set null,
  caption text,
  asset_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.channel_integrations (
  id text primary key,
  provider text not null,
  status text not null default 'not_connected' check (status in ('not_connected', 'connected', 'needs_reauth', 'error')),
  account_label text,
  scopes text[],
  last_sync_at timestamptz,
  meta jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists creative_jobs_status_idx on public.creative_jobs (status, created_at desc);
create index if not exists marketing_campaigns_status_idx on public.marketing_campaigns (status, created_at desc);
create index if not exists marketing_leads_stage_idx on public.marketing_leads (stage, updated_at desc);
create index if not exists marketing_leads_automation_idx on public.marketing_leads (automation_status, updated_at desc);
create index if not exists marketing_leads_external_user_idx on public.marketing_leads (external_user_id);
create index if not exists content_calendar_scheduled_idx on public.content_calendar (scheduled_at, status);

insert into public.products (
  id, title, brand, category, description, usa_price_usd, shipping_pkr, fx_rate, markup_rate,
  stock_mode, inventory, image_url, featured, preorder_weeks, status
) values
(
  'bag-coach-tabby-blush',
  'Coach Tabby Shoulder Bag 26',
  'Coach',
  'handbags',
  'A polished blush shoulder bag sourced from USA retail with dust bag and authenticity-first packaging.',
  395,
  14500,
  282,
  0.25,
  'preorder',
  0,
  'https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=900&q=84',
  true,
  4,
  'active'
),
(
  'shoe-nike-v2k-pink',
  'Nike V2K Run Pink Foam',
  'Nike',
  'shoes',
  'Soft pink performance-inspired sneaker for everyday outfits, available by USA preorder.',
  120,
  10500,
  282,
  0.25,
  'preorder',
  0,
  'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=84',
  true,
  4,
  'active'
),
(
  'makeup-rare-beauty-set',
  'Rare Beauty Soft Pinch Set',
  'Rare Beauty',
  'makeup',
  'Curated blush and lip shade set for the customer who wants shade confirmation before sourcing.',
  64,
  5200,
  282,
  0.25,
  'in_stock',
  5,
  'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=900&q=84',
  true,
  0,
  'active'
)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('transfer-proofs', 'transfer-proofs', false)
on conflict (id) do nothing;

alter table public.store_settings enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.transfer_confirmations enable row level security;
alter table public.order_events enable row level security;
alter table public.trend_candidates enable row level security;
alter table public.trend_batches enable row level security;
alter table public.admin_audit enable row level security;
alter table public.creative_jobs enable row level security;
alter table public.marketing_campaigns enable row level security;
alter table public.marketing_leads enable row level security;
alter table public.marketing_messages enable row level security;
alter table public.content_calendar enable row level security;
alter table public.channel_integrations enable row level security;

drop policy if exists "Public can read active products" on public.products;
create policy "Public can read active products"
on public.products for select
using (status = 'active');

drop policy if exists "Public can read store settings" on public.store_settings;
create policy "Public can read store settings"
on public.store_settings for select
using (id = 'store');

-- All writes and private reads are performed by Netlify Functions with SUPABASE_SERVICE_ROLE_KEY.
-- Do not expose the service role key to the browser.
