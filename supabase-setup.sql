-- ════════════════════════════════════════════════════════
-- Global Bestie — Supabase Setup
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ════════════════════════════════════════════════════════

-- ── TABLES ──

create table if not exists products (
  id           bigserial primary key,
  name         text not null,
  brand        text default '',
  gender       text default 'women',
  cat          text default 'accessories',
  pkr          integer default 0,
  in_stock     boolean default true,
  description  text default '',
  image        text default '',
  qty          integer default 0,
  sku          text default '',
  cost         integer default 0,
  low_stock_threshold integer default 3,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create table if not exists orders (
  id               uuid default gen_random_uuid() primary key,
  order_number     text,
  customer_name    text not null,
  customer_phone   text not null,
  customer_email   text default '',
  customer_city    text default '',
  customer_address text default '',
  status           text default 'new'
    check (status in ('new','confirmed','packed','shipped','delivered','cancelled')),
  total            integer not null default 0,
  advance          integer default 0,
  has_preorder     boolean default false,
  notes            text default '',
  screenshot_url   text default '',
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

create table if not exists order_items (
  id           bigserial primary key,
  order_id     uuid references orders(id) on delete cascade,
  product_id   bigint,
  product_name text not null,
  brand        text default '',
  qty          integer not null default 1,
  pkr          integer not null default 0,
  is_preorder  boolean default false
);

create table if not exists inventory_log (
  id           bigserial primary key,
  product_id   bigint,
  product_name text,
  op           text,
  qty_before   integer,
  qty_after    integer,
  reason       text,
  note         text,
  created_at   timestamptz default now()
);

-- ── ROW LEVEL SECURITY ──

alter table products      enable row level security;
alter table orders        enable row level security;
alter table order_items   enable row level security;
alter table inventory_log enable row level security;

-- Products: anyone can read; only authenticated (admin) can write
create policy "public_read_products"  on products for select using (true);
create policy "admin_write_products"  on products for all    using (auth.role() = 'authenticated');

-- Orders: anyone can place an order (insert); only admin can read/update
create policy "public_insert_orders"  on orders  for insert  with check (true);
create policy "admin_read_orders"     on orders  for select  using (auth.role() = 'authenticated');
create policy "admin_update_orders"   on orders  for update  using (auth.role() = 'authenticated');

-- Order items: anyone can insert (checkout); only admin can read
create policy "public_insert_items"   on order_items for insert with check (true);
create policy "admin_read_items"      on order_items for select using (auth.role() = 'authenticated');

-- Inventory log: admin only
create policy "admin_inventory_log"   on inventory_log for all using (auth.role() = 'authenticated');

-- ── INDEXES ──

create index if not exists orders_status_idx   on orders(status);
create index if not exists orders_created_idx  on orders(created_at desc);
create index if not exists items_order_idx     on order_items(order_id);

-- ── AUTO-UPDATE updated_at ──

create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger products_updated_at before update on products
  for each row execute function update_updated_at();
create trigger orders_updated_at before update on orders
  for each row execute function update_updated_at();

-- ── STORAGE (payment screenshots) ──
-- Run this AFTER enabling Storage in your Supabase project

insert into storage.buckets (id, name, public)
  values ('payment-screenshots', 'payment-screenshots', true)
  on conflict (id) do nothing;

create policy "anon_upload_screenshots" on storage.objects
  for insert with check (bucket_id = 'payment-screenshots');

create policy "public_read_screenshots" on storage.objects
  for select using (bucket_id = 'payment-screenshots');

create policy "admin_delete_screenshots" on storage.objects
  for delete using (bucket_id = 'payment-screenshots' and auth.role() = 'authenticated');

-- ── MIGRATION: add screenshot_url to existing orders table ──
-- Only needed if you already ran this SQL before — skip if running fresh
alter table orders add column if not exists screenshot_url text default '';

-- ── PUBLIC ORDER TRACKING ──
-- Use a security-definer RPC so we never expose the full orders table publicly.
-- The frontend calls: supabase.rpc('get_order_by_number', { p_order_number: '...' })

create index if not exists orders_number_idx on orders(order_number);

-- Drop the old open-read policies if they exist
drop policy if exists "public_track_orders"     on orders;
drop policy if exists "public_track_order_items" on order_items;

-- RPC: returns one order + its items given an exact order_number.
-- security definer means it runs as the DB owner (bypasses RLS) but only
-- returns the matching row — callers cannot enumerate other orders.
create or replace function get_order_by_number(p_order_number text)
returns jsonb
language plpgsql security definer as $$
declare
  v_order jsonb;
  v_items jsonb;
begin
  select row_to_json(o)::jsonb into v_order
  from orders o
  where o.order_number = p_order_number
  limit 1;

  if v_order is null then
    return null;
  end if;

  select jsonb_agg(row_to_json(i)) into v_items
  from order_items i
  where i.order_id = (v_order->>'id')::uuid;

  return v_order || jsonb_build_object('items', coalesce(v_items, '[]'::jsonb));
end;
$$;

-- ── PROMO CODES ──

create table if not exists promo_codes (
  id           bigserial primary key,
  code         text unique not null,
  type         text default 'percent' check (type in ('percent','fixed')),
  value        integer not null,
  min_order    integer default 0,
  active       boolean default true,
  created_at   timestamptz default now()
);

alter table promo_codes enable row level security;

-- Anyone can read active codes (needed for client-side validation at checkout)
create policy "public_read_promos" on promo_codes for select using (active = true);
-- Admin can manage all codes
create policy "admin_manage_promos" on promo_codes for all using (auth.role() = 'authenticated');

-- ── MIGRATION: add promo/discount columns to orders ──
alter table orders add column if not exists promo_code text default '';
alter table orders add column if not exists discount integer default 0;

-- ── MIGRATION: batch tagging + payment verification ──
alter table orders add column if not exists batch text default '';
alter table orders add column if not exists payment_confirmed boolean default false;
create index if not exists orders_batch_idx on orders(batch);

-- ── SALE PRICING ──
alter table products add column if not exists on_sale boolean default false;
alter table products add column if not exists sale_price integer default null;
create index if not exists products_on_sale_idx on products(on_sale) where on_sale = true;
alter table products add column if not exists stock_qty integer default null;

-- ── OUTLET ──
alter table products add column if not exists is_outlet boolean default false;
create index if not exists products_outlet_idx on products(is_outlet) where is_outlet = true;

-- ── FEATURED PRODUCTS ──
alter table products add column if not exists is_featured boolean default false;
create index if not exists products_featured_idx on products(is_featured) where is_featured = true;

-- ── NEW ARRIVAL BADGE ──
alter table products add column if not exists is_new boolean default false;
create index if not exists products_new_idx on products(is_new) where is_new = true;

-- ── MULTI-IMAGE + COLOR VARIANTS ──
-- images: JSON array of additional image URL strings e.g. ["https://...","https://..."]
-- colors: JSON array of {name, hex, image} objects e.g. [{"name":"Pillow Talk","hex":"#E8B8C2","image":""}]
alter table products add column if not exists images jsonb default '[]';
alter table products add column if not exists colors jsonb default '[]';

-- ── PRODUCT SIZES ──
-- sizes: JSON array of size strings e.g. ["XS","S","M","L","XL"] or ["6","7","8","9","10"]
alter table products add column if not exists sizes jsonb default '[]';

-- ── ORDER ITEM SIZE ──
alter table order_items add column if not exists size text default '';

-- ── PROMO CODE EXPIRY + USAGE LIMITS ──
alter table promo_codes add column if not exists uses_limit integer default null;
alter table promo_codes add column if not exists expires_at date default null;
alter table promo_codes add column if not exists usage_count integer default 0;

-- ── ORDER STATUS: RETURNS & REFUNDS ──
-- Drop old check constraint and add updated one with return/refund states
alter table orders drop constraint if exists orders_status_check;
alter table orders add constraint orders_status_check check (
  status in ('new','confirmed','packed','shipped','delivered','cancelled','return_requested','refunded')
);


-- ── ADMIN INTERNAL NOTES ON ORDERS ──
alter table orders add column if not exists admin_notes text default '';

-- ── PRODUCT REVIEWS (admin-set display fields) ──
alter table products add column if not exists review_rating decimal(2,1) default null;
alter table products add column if not exists review_count integer default 0;

-- ════════════════════════════════════════════════════════
-- DONE. Next steps:
-- 1. Go to Authentication → Users → Add user
--    (create your admin@yourstore.com + password)
-- 2. Copy Project URL and anon key from Settings → API
-- 3. Paste both into the SUPA_URL / SUPA_KEY config block
--    at the top of: admin.html, products.html, index.html
-- 4. Go to Storage → Create a new bucket named 'payment-screenshots'
--    (or run the storage SQL block above)
-- ════════════════════════════════════════════════════════


-- Create the reviews table
CREATE TABLE public.reviews (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    product_id BIGINT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    customer_name TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    review_text TEXT,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- Allow public read access to approved reviews only
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view approved reviews" 
ON public.reviews FOR SELECT 
USING (status = 'approved');
-- Allow anyone to insert a review (pending by default)
CREATE POLICY "Public can insert reviews" 
ON public.reviews FOR INSERT 
WITH CHECK (status = 'pending');
-- Allow authenticated admins to do everything
CREATE POLICY "Admins can manage all reviews"
ON public.reviews FOR ALL
USING (auth.role() = 'authenticated');

-- 1. Add email column to carts table to allow the admin panel to read it
ALTER TABLE public.carts ADD COLUMN IF NOT EXISTS customer_email TEXT;
-- 2. Create the email_logs table to prevent spamming customers
CREATE TABLE public.email_logs (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    customer_email TEXT NOT NULL,
    email_type TEXT NOT NULL, -- e.g., 'abandoned_cart'
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- Enable RLS for email_logs (only admins can read/write this, but we'll allow all for client-side admin simplicity)
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to email_logs"
ON public.email_logs FOR ALL
USING (true);

-- ── SITE CONTENT (replaces localStorage for admin-editable page copy) ──
-- Stores JSON blobs keyed by page slug: 'home', 'about', 'faq', 'contact', 'policy'
create table if not exists site_content (
  page        text primary key,
  content     jsonb not null default '{}'::jsonb,
  updated_at  timestamptz default now()
);
alter table site_content enable row level security;
-- Anyone can read (needed for customer pages to fetch live content)
create policy "public_read_site_content" on site_content for select using (true);
-- Only admin can write
create policy "admin_write_site_content" on site_content for all using (auth.role() = 'authenticated');

create or replace trigger site_content_updated_at
  before update on site_content
  for each row execute function update_updated_at();

-- ── FULL-TEXT SEARCH ON PRODUCTS ──
-- Generated tsvector column covering name, brand, category, and description.
-- The frontend can call: supabase.from('products').select('*').textSearch('textsearch', query)
alter table products
  add column if not exists textsearch tsvector
  generated always as (
    to_tsvector('english',
      coalesce(name, '') || ' ' ||
      coalesce(brand, '') || ' ' ||
      coalesce(cat, '') || ' ' ||
      coalesce(description, '')
    )
  ) stored;

create index if not exists products_textsearch_idx on products using gin(textsearch);

-- ── S1: APPROVAL COLUMN ──
-- Products default to unapproved; admin must explicitly approve before they go live.
alter table products add column if not exists is_approved boolean default false;
-- Existing products: treat as approved so the storefront doesn't go blank.
update products set is_approved = true where is_approved is null or is_approved = false;

-- Replace the open SELECT policy with one that hides unapproved products from the public.
-- Authenticated admin users can still see everything.
drop policy if exists "public_read_products" on products;
create policy "public_read_products"
  on products for select
  using (is_approved = true or auth.role() = 'authenticated');

-- ── S5: UNIQUE CONSTRAINT for upsert on (brand, name) ──
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'products_brand_name_unique'
  ) then
    alter table products add constraint products_brand_name_unique unique (brand, name);
  end if;
end $$;

-- ── S4: SUPABASE STORAGE BUCKET for product images ──
insert into storage.buckets (id, name, public)
  values ('product-images', 'product-images', true)
  on conflict (id) do nothing;

-- Allow anyone to read images (public CDN)
drop policy if exists "public_read_product_images" on storage.objects;
create policy "public_read_product_images"
  on storage.objects for select
  using (bucket_id = 'product-images');

-- Allow authenticated admin to upload/delete
drop policy if exists "admin_upload_product_images" on storage.objects;
create policy "admin_upload_product_images"
  on storage.objects for insert
  with check (bucket_id = 'product-images' and auth.role() = 'authenticated');

drop policy if exists "admin_delete_product_images" on storage.objects;
create policy "admin_delete_product_images"
  on storage.objects for delete
  using (bucket_id = 'product-images' and auth.role() = 'authenticated');