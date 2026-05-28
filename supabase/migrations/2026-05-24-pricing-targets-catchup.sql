-- 2026-05-24 — Catch-up migration
--
-- Columns the application code now depends on that were added to
-- supabase/schema.sql AFTER the 2026-05-19 migration batch, but never got
-- their own migration file. A production database applied incrementally
-- (migration-by-migration) would be MISSING these, causing:
--   • in-stock direct PKR pricing to silently fall back to USD math
--   • the per-product 3-5 day delivery window to never render
--   • product uploads without a USD price / image URL to fail on NOT NULL
--   • the portal Overview monthly-target gauge to use the default only
--
-- Every statement is idempotent (`if not exists` / `drop not null` is a
-- no-op when already applied), so this is safe to run on any database —
-- fresh, partially-migrated, or fully up to date.

-- ── products: in-stock direct pricing + delivery window ──────────────────
alter table public.products
  add column if not exists customer_price_pkr numeric(12, 2) default 0;

-- Per-product delivery window for in-stock items already in Pakistan.
-- 0 means "use the global default".
alter table public.products
  add column if not exists delivery_days_min integer default 0;
alter table public.products
  add column if not exists delivery_days_max integer default 0;

-- ── products: card metadata (added pre-catchup, included for safety) ─────
alter table public.products
  add column if not exists marketing_badge text;
alter table public.products
  add column if not exists variant_display_hint text;
alter table public.products
  add column if not exists low_stock_threshold integer default 2;

-- ── products: relax NOT NULL so PKR-only / image-later uploads work ──────
-- The original schema marked these NOT NULL. In-stock products priced
-- directly in PKR have no USD price, and drafts can be saved before an
-- image URL is attached.
alter table public.products alter column image_url drop not null;
alter table public.products alter column usa_price_usd drop not null;

-- ── store_settings: monthly confirmed-revenue target ─────────────────────
-- Drives the portal Overview target gauge. Admin-only; never exposed in
-- the public settings allowlist.
alter table public.store_settings
  add column if not exists monthly_revenue_target numeric(14, 2) not null default 1500000;
