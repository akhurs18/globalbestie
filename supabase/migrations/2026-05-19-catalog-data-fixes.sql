-- =====================================================================
-- 2026-05-19 — Catalog data fixes flagged in the QA audit.
--
-- 1. Tory Burch Romy Slide Sandals → category "shoes" (was "handbags").
-- 2. Tory Burch Small Charlie at Rs 7,550 → flag for review (likely a
--    data-entry error, real retail ≈ Rs 80k+). We mark it 'archived'
--    so it stops showing on the storefront until you confirm the price.
-- 3. Maison Margiela REPLICA "Gift set option" listing → archive so the
--    catalog stops showing two near-identical rows. Re-introduce as a
--    variant on the canonical row when you next edit it.
--
-- Idempotent. Safe to run more than once.
-- =====================================================================

begin;

-- 1. Reclassify the sandals listing. We match on title because the row
-- id can vary depending on when it was first scraped.
update public.products
set category = 'shoes'
where (title ilike '%romy slide%' or title ilike '%designer sandals%')
  and category = 'handbags';

-- 2. Park the Tory Burch Small Charlie row until the price is verified.
-- We touch product_status (the soft-archive flag used by the storefront)
-- rather than deleting the row, so admin can review history.
update public.products
set product_status = 'archived',
    description = coalesce(description, '') ||
      ' [Price flagged for review — was Rs 7,550. Verify against current Tory Burch USA retail before re-publishing.]'
where title ilike '%small charlie%'
  and customer_price_pkr > 0
  and customer_price_pkr < 20000  -- guard: only the obviously-wrong row
  and product_status <> 'archived';

-- 3. Collapse the duplicate Maison Margiela "Gift set option" into the
-- main variant by archiving the gift-set row. The remaining row keeps
-- the "30ml / 50ml / 90ml" variant string — you can extend variants
-- later via the portal variant editor.
update public.products
set product_status = 'archived',
    description = coalesce(description, '') ||
      ' [Duplicate of the main By the Fireplace listing — re-introduce gift-set as a variant on the canonical row.]'
where title ilike '%by the fireplace%gift set%'
  and product_status <> 'archived';

commit;

-- Spot-check after running:
--   select id, title, category, customer_price_pkr, product_status
--     from public.products
--    where title ilike '%romy slide%'
--       or title ilike '%small charlie%'
--       or title ilike '%by the fireplace%'
--    order by title;
