-- Global Bestie Supabase reset
-- WARNING: this permanently deletes the old and new Global Bestie tables,
-- policies, functions, triggers, and known storage buckets.
--
-- Use only when you want a clean Supabase project before rerunning schema.sql.
-- Recommended flow:
-- 1. Supabase Dashboard -> SQL Editor -> run this file.
-- 2. Then run supabase/schema.sql.
-- 3. Recreate any Storage buckets or secrets you still need.

begin;

-- Storage objects and buckets from the old Global Bestie setup and current transfer proof flow.
delete from storage.objects
where bucket_id in ('payment-screenshots', 'product-images', 'transfer-proofs');

delete from storage.buckets
where id in ('payment-screenshots', 'product-images', 'transfer-proofs');

-- Old helper functions and triggers.
drop function if exists public.get_order_by_number(text) cascade;
drop function if exists public.update_updated_at() cascade;

-- Current Global Bestie 2.0 tables.
drop table if exists public.content_calendar cascade;
drop table if exists public.marketing_messages cascade;
drop table if exists public.marketing_leads cascade;
drop table if exists public.marketing_campaigns cascade;
drop table if exists public.creative_jobs cascade;
drop table if exists public.channel_integrations cascade;
drop table if exists public.admin_audit cascade;
drop table if exists public.trend_candidates cascade;
drop table if exists public.trend_batches cascade;
drop table if exists public.order_events cascade;
drop table if exists public.transfer_confirmations cascade;
drop table if exists public.order_items cascade;
drop table if exists public.orders cascade;
drop table if exists public.products cascade;
drop table if exists public.shipment_batches cascade;
drop table if exists public.store_settings cascade;

-- Previous Global Bestie tables that may still exist from the old setup.
drop table if exists public.inventory_log cascade;
drop table if exists public.promo_codes cascade;
drop table if exists public.reviews cascade;
drop table if exists public.carts cascade;
drop table if exists public.email_logs cascade;
drop table if exists public.site_content cascade;

commit;
