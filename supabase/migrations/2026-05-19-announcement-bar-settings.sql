-- =====================================================================
-- 2026-05-19 — Add settings-backed announcement-bar fields.
--
-- batch_doorstep_window  : human-readable label for the active batch
--                          ("May 25-27").
-- batch_doorstep_until   : last day the label is still relevant. Once
--                          today > this date the storefront auto-hides
--                          the doorstep line.
--
-- Run once in Supabase against the production project. Idempotent.
-- =====================================================================

begin;

alter table public.store_settings
  add column if not exists batch_doorstep_window text,
  add column if not exists batch_doorstep_until date;

-- Seed with sensible defaults if not already set. Admin can change via
-- the portal Settings panel.
update public.store_settings
set
  batch_doorstep_window = coalesce(batch_doorstep_window, 'May 25-27'),
  batch_doorstep_until  = coalesce(batch_doorstep_until,  date '2026-05-27')
where id = 'store';

commit;
