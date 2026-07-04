-- Product & inventory integrity pass (2026-06-25).
--
-- Fixes the inventory-corruption class of bugs found in review:
--   • stock writes were non-atomic read-modify-write (last-writer-wins races)
--   • the "already deducted" guard lived only in browser memory, so a reload
--     or a second operator could double-deduct an order's stock
--   • the products table carried two parallel publish-status columns
--     (status + product_status) that could silently drift
--
-- After this migration, stock movement is server-authoritative and atomic, the
-- dedupe guard is durable on the order row, and `status` is the single source
-- of truth for publish state.

-- ── Atomic stock adjustment ────────────────────────────────────────────────
-- Single primitive every server path uses to move stock. Runs as one UPDATE so
-- concurrent callers can't clobber each other, and floors at 0 so stock can
-- never go negative. Returns the new on-hand quantity.
create or replace function public.adjust_inventory(p_id text, p_delta integer)
returns integer
language plpgsql
as $$
declare
  new_qty integer;
begin
  update public.products
     set inventory = greatest(0, coalesce(inventory, 0) + p_delta),
         updated_at = now()
   where id = p_id
  returning inventory into new_qty;
  return new_qty;  -- null when the product id doesn't exist
end;
$$;

-- ── Durable "stock already moved for this order" guard ─────────────────────
-- Flipped true once an order's in-stock units are deducted (at delivery) and
-- back to false if the order is later reversed. Persisting it on the row means
-- the guard survives reloads and is shared across operators/devices.
alter table public.orders
  add column if not exists stock_deducted boolean not null default false;

-- ── Collapse product_status into status ────────────────────────────────────
-- Reconcile any drifted rows so the canonical `status` reflects an archive that
-- only ever got written to `product_status`, then drop the redundant column.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'products'
      and column_name = 'product_status'
  ) then
    -- If product_status said archived/draft but status still says active,
    -- trust the more-restrictive product_status (it was the editor's field).
    update public.products
       set status = product_status
     where product_status is not null
       and product_status is distinct from status
       and product_status in ('draft', 'archived');

    alter table public.products drop column product_status;
  end if;
end $$;
