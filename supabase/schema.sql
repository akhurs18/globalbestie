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
-- Monthly confirmed-revenue target that drives the portal Overview gauge.
alter table public.store_settings add column if not exists monthly_revenue_target numeric(14, 2) not null default 1500000;
alter table public.store_settings add column if not exists city_delivery_fees text;
alter table public.store_settings add column if not exists shipping_rules text;
alter table public.store_settings add column if not exists balance_reminder_template text;
alter table public.store_settings add column if not exists support_whatsapp text;
alter table public.store_settings add column if not exists next_shipment_date date;
alter table public.store_settings add column if not exists shipment_notice text;
-- Announcement-bar fields. `batch_doorstep_window` is the human label
-- ("May 25-27") and `batch_doorstep_until` is the last day the label
-- is still relevant — once today > that date, the storefront auto-hides
-- the doorstep line so we never show a stale promise.
alter table public.store_settings add column if not exists batch_doorstep_window text;
alter table public.store_settings add column if not exists batch_doorstep_until date;

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
-- New product fields for the rebuilt upload flow:
--   marketing_badge: short tag like "Frequently requested" / "VIP drop" shown on cards
--   variant_display_hint: short text shown as a chip on product cards (e.g. "Choose your shade")
alter table public.products add column if not exists marketing_badge text;
alter table public.products add column if not exists variant_display_hint text;

-- Direct PKR price for in-stock items that are already in Pakistan. When
-- populated, the storefront / portal use this value verbatim instead of
-- deriving the price from USD × FX × (1+markup) + shipping. Lets the team
-- sell ready-to-ship inventory without dealing with the import-pricing
-- pipeline at all.
alter table public.products add column if not exists customer_price_pkr numeric(12, 2) default 0;

-- Per-product delivery window override. Defaults are sensible (28 days for
-- preorder, 5 days for in-stock) but the team can tighten or extend it per
-- product. delivery_days_max == 0 means "use the global default".
alter table public.products add column if not exists delivery_days_min integer default 0;
alter table public.products add column if not exists delivery_days_max integer default 0;

-- image_url was not null in the original schema. New uploads that come
-- with a file (not a URL) need to insert the row before the file lands —
-- so make this nullable on existing deployments. Old rows keep their
-- value, new rows can leave it blank temporarily.
alter table public.products alter column image_url drop not null;
-- Same for usa_price_usd: in-stock items have no USD cost.
alter table public.products alter column usa_price_usd drop not null;

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

-- New columns that came in with the canonical-phone migration. The
-- `customer_phone` itself is stored as the canonical E.164-without-plus
-- form (e.g. 923001234567). Display form is a convenience derived field.
alter table public.orders add column if not exists customer_phone_display text;
alter table public.orders add column if not exists whatsapp_opt_in boolean default true;
alter table public.orders add column if not exists pricing_note text;
alter table public.orders add column if not exists idempotency_key text;
create index if not exists orders_idempotency_idx on public.orders (idempotency_key);

-- True when at least one item in the order is a customer-pasted-URL
-- sourcing request rather than an existing catalog product. The team
-- portal's Kanban surfaces these orders in a dedicated swimlane so
-- they're quoted before the regular preorder flow proceeds.
alter table public.orders add column if not exists has_sourcing_request boolean not null default false;

-- =========================================================================
-- CUSTOMERS — keyed by canonical phone (923xxxxxxxxx). One row per unique
-- buyer. Counters maintained from /api/orders POST and /api/leads.
-- =========================================================================
create table if not exists public.customers (
  phone text primary key,
  name text,
  email text,
  city text,
  default_address text,
  whatsapp_opt_in boolean default true,
  total_orders integer not null default 0,
  total_revenue_pkr numeric(14, 2) not null default 0,
  tags text[] default '{}',
  notes text,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
create index if not exists customers_last_seen_idx on public.customers (last_seen desc);
create index if not exists customers_revenue_idx on public.customers (total_revenue_pkr desc);

-- =========================================================================
-- WHATSAPP TEMPLATES — pre-written messages with {{name}}, {{order_id}},
-- {{eta}}, {{advance}}, {{balance}}, {{tracking}} placeholders.
-- =========================================================================
create table if not exists public.whatsapp_templates (
  id text primary key,
  name text not null,
  category text not null,    -- 'advance_request' | 'balance_reminder' | 'sourcing_update' | 'dispatch' | 'custom'
  body text not null,
  is_active boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Seed a useful starter set so the team has something to send on day one.
insert into public.whatsapp_templates (id, name, category, body) values
  ('tmpl-advance', 'Advance payment request', 'advance_request',
   'Hi {{name}}, thank you for your Global Bestie order {{order_id}}. Please transfer the 50% advance of PKR {{advance}} to confirm — bank details on the order page. Reply once sent so we can match it. ETA: {{eta}}'),
  ('tmpl-balance', 'Balance reminder (arrived in PK)', 'balance_reminder',
   'Hi {{name}}, your order {{order_id}} has arrived in Pakistan. Please transfer the remaining balance of PKR {{balance}} so we can dispatch via courier today. Thank you!'),
  ('tmpl-sourcing', 'Sourcing update', 'sourcing_update',
   'Hi {{name}}, quick update on order {{order_id}} — we''ve sourced your item and it''s on its way to the consolidator. ETA: {{eta}}. We''ll message again once it lands in Pakistan.'),
  ('tmpl-dispatch', 'Dispatch confirmation', 'dispatch',
   'Hi {{name}}, your order {{order_id}} is out for delivery 📦 Tracking: {{tracking}}. Please expect a call from the courier within 1–2 working days.'),
  ('tmpl-instock', 'In-stock order confirmation', 'in_stock_confirmation',
   'Hi {{name}}, thank you for your Global Bestie order {{order_id}}. Your item is in stock — please transfer PKR {{advance}} to confirm and we''ll dispatch within 1–2 working days. Reply with your transfer reference so we can match it.')
on conflict (id) do nothing;

-- Direct phone link on every outbound/inbound message — lets us count
-- broadcasts per recipient (per-day cap) and surface a per-customer
-- message history without joining via lead_id.
alter table public.marketing_messages add column if not exists customer_phone text;
alter table public.marketing_messages add column if not exists replied_to_broadcast text; -- broadcast id when an inbound is recognized as a reply
create index if not exists marketing_messages_phone_idx on public.marketing_messages (customer_phone, created_at desc);

-- Last successful outbound timestamp on the customer row — enables segments
-- like "haven't been messaged in 90+ days" without scanning all messages.
alter table public.customers add column if not exists last_outbound_at timestamptz;
alter table public.customers add column if not exists risk_flag boolean default false;

-- Snooze an SLA breach on an order. The UI hides the chip until this time
-- passes — useful when the customer asked to wait.
alter table public.orders add column if not exists sla_snoozed_until timestamptz;

-- =========================================================================
-- SCHEDULED BROADCASTS — admin can queue a send for a future time. A 5-min
-- cron function (broadcasts-process) finds rows where status='pending' and
-- send_at <= now(), fires them via the same code path as the live send,
-- then flips status to 'sent' or 'failed'.
-- =========================================================================
create table if not exists public.scheduled_broadcasts (
  id text primary key,
  template_id text not null,
  body_override text,
  filters jsonb not null default '{}'::jsonb,
  send_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'sent', 'failed', 'cancelled')),
  recipient_count integer,
  sent_count integer default 0,
  failed_count integer default 0,
  skipped_count integer default 0,
  error text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists scheduled_broadcasts_status_idx on public.scheduled_broadcasts (status, send_at);

-- =========================================================================
-- BROADCAST CAMPAIGNS — when a broadcast is fired (live or via scheduler),
-- we insert one row here so the team can later see "this template got 12
-- replies in 14 days". Tracked counters (sent / failed / replies) keep
-- denormalized so the dashboard never has to aggregate messages.
-- =========================================================================
create table if not exists public.broadcast_campaigns (
  id text primary key,
  template_id text,
  template_name text,
  body text,
  filters jsonb not null default '{}'::jsonb,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  reply_count integer not null default 0,
  triggered_by text,
  triggered_at timestamptz not null default now()
);
create index if not exists broadcast_campaigns_recent_idx on public.broadcast_campaigns (triggered_at desc);

-- Reason a customer was flagged risky (refund/cancel/angry keywords). Stored
-- so the UI can show why, not just that.
alter table public.customers add column if not exists risk_reason text;

-- =========================================================================
-- SMART SEGMENTS — saved filter combos for the Customers tab + broadcast
-- form. One row per segment; `filters` is the same JSON shape the broadcast
-- form serializes (city, tag, vip_tier, last_order_days, etc.).
-- =========================================================================
create table if not exists public.smart_segments (
  id text primary key,
  name text not null,
  filters jsonb not null default '{}'::jsonb,
  pinned boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists smart_segments_pinned_idx on public.smart_segments (pinned desc, updated_at desc);

-- Seed a few useful starter segments so the team has working examples on
-- day one. Win-back, VIPs in Karachi, anyone overdue on a balance.
insert into public.smart_segments (id, name, filters, pinned) values
  ('seg-winback-90', 'Win-back · 90+ days dormant', '{"min_orders": 2, "last_order_days": 9999}'::jsonb, true),
  ('seg-karachi', 'Karachi customers', '{"city": "Karachi"}'::jsonb, true),
  ('seg-recent-30', 'Active this month', '{"last_order_days": 30}'::jsonb, false),
  ('seg-high-value', 'High-value (≥3 orders)', '{"min_orders": 3}'::jsonb, true)
on conflict (id) do nothing;

-- Courier choices for the dispatch modal. Stored in store_settings as a
-- comma-separated string so the team can edit them on the Settings tab.
alter table public.store_settings add column if not exists couriers text default 'Leopards,TCS,M&P,OCS,Trax';

-- Per-product low-stock threshold. The Overview attention queue and
-- Products tab chip both compare against this when populated; otherwise
-- they fall back to the global default of 2.
alter table public.products add column if not exists low_stock_threshold integer default 2;

-- VIP tier was removed from the app. Drop the check constraint if it
-- exists on customers.vip_tier so older deployments don't reject writes
-- that no longer mention the column. The column itself is left in place
-- for historical data; nothing reads or writes to it.
alter table public.customers drop constraint if exists customers_vip_tier_check;

-- Optional team member roster — used by the daily digest fan-out (and any
-- future per-role workflows). Each row's phone is canonical (923xxxxxxxxx).
create table if not exists public.team_members (
  phone text primary key,
  name text,
  role text default 'team',
  digest_opt_in boolean default true,
  created_at timestamptz not null default now()
);

-- =========================================================================
-- AUTH — phone-OTP sessions for both customers and team members.
-- We don't use Supabase Auth directly because we already canonicalize
-- phones ourselves and want one identity model. The flow:
--   1. POST /api/auth/request-otp { phone }
--        → server generates 6-digit code, stores hash in otp_codes,
--          sends via Maychats template
--   2. POST /api/auth/verify-otp { phone, code }
--        → server matches the hash, deletes the otp row, creates a
--          session row, returns Set-Cookie: gb_session=<token>
--   3. Every request: server reads cookie → looks up session →
--          identifies the user
-- Sessions expire after 30 days for customers, 7 days for team.
-- =========================================================================
create table if not exists public.otp_codes (
  phone text not null,
  code_hash text not null,
  attempts integer not null default 0,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (phone)
);

create table if not exists public.customer_sessions (
  token text primary key,
  phone text not null,
  user_agent text,
  ip_address text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);
create index if not exists customer_sessions_phone_idx on public.customer_sessions (phone);
create index if not exists customer_sessions_expires_idx on public.customer_sessions (expires_at);

create table if not exists public.team_sessions (
  token text primary key,
  phone text not null,
  name text,
  role text default 'team',
  user_agent text,
  ip_address text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);
create index if not exists team_sessions_phone_idx on public.team_sessions (phone);
create index if not exists team_sessions_expires_idx on public.team_sessions (expires_at);

-- =========================================================================
-- ORDER VIEWS — saved filter combinations for the Orders tab. Mirrors the
-- smart_segments pattern (city/tier/etc) but with order-specific fields.
-- =========================================================================
create table if not exists public.order_views (
  id text primary key,
  name text not null,
  filters jsonb not null default '{}'::jsonb,
  pinned boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists order_views_pinned_idx on public.order_views (pinned desc, updated_at desc);

-- Seed three useful starter order views.
insert into public.order_views (id, name, filters, pinned) values
  ('ov-pending-today', 'Pending today', '{"status": "pending_review", "dateRange": "7"}'::jsonb, true),
  ('ov-balance-due', 'Balance due', '{"status": "pakistan_processing"}'::jsonb, true),
  ('ov-this-month', 'This month', '{"dateRange": "month"}'::jsonb, false)
on conflict (id) do nothing;

-- Helpful index for the audit log so the customer modal can query "what
-- happened to this customer recently" without scanning the whole table.
create index if not exists admin_audit_entity_idx on public.admin_audit (entity_type, entity_id, created_at desc);
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
  -- Per-item actual USD cost recorded by the owner when they buy in the USA.
  -- Drives the Cashflow panel's "where is the money" math.
  actual_usd_cost numeric(12, 2),
  usd_purchased_at timestamptz,
  created_at timestamptz not null default now()
);

-- Backfill-safe migration: these columns may not exist on installs that ran
-- earlier versions of the schema.
alter table public.order_items add column if not exists actual_usd_cost numeric(12, 2);
alter table public.order_items add column if not exists usd_purchased_at timestamptz;
create index if not exists order_items_purchased_idx on public.order_items (usd_purchased_at desc);

-- Per-product-on-order real photos uploaded after the item arrives in the USA.
-- Drives the cashflow sourcing queue's "Add real photos" passive nudge.
alter table public.order_items add column if not exists real_photo_urls jsonb not null default '[]'::jsonb;

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

insert into storage.buckets (id, name, public)
values ('store-assets', 'store-assets', true)
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
