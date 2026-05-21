-- =====================================================================
-- 2026-05-19 — Clean leaked merchandising-template language from product
-- descriptions.
--
-- Context: an earlier version of netlify/functions/scraper.js auto-
-- generated customer-facing descriptions that exposed internal phrases
-- ("25% service margin", "high intent", "Source reference: ...", source
-- URLs, "Variant focus:", "Merchandising angle:"). This script strips
-- the offending sentences from every product row, leaving only the
-- first clean sentence (the category lead-in). Run once in Supabase
-- against the production project.
--
-- Idempotent — safe to re-run; rows already clean are left untouched.
-- =====================================================================

begin;

-- Strip the four templated sentences whenever they appear. We use
-- regexp_replace with multiple patterns so we don't drop the whole
-- description if only one sentence leaked.
update public.products
set description = trim(
  regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              description,
              -- pricing-model sentence (the "25% service margin" one)
              '\s*Price follows[^\.]*service margin[^\.]*\.\s*',
              ' ',
              'gi'
            ),
            -- "Source reference: https://..."
            '\s*Source reference:\s*https?://[^\s\.]+\.?\s*',
            ' ',
            'gi'
          ),
          -- "Variant focus: ...."
          '\s*Variant focus:[^\.]*\.\s*',
          ' ',
          'gi'
        ),
        -- "Merchandising angle: ...."
        '\s*Merchandising angle:[^\.]*\.\s*',
        ' ',
        'gi'
      ),
      -- "Customer pays 50% advance ... before local dispatch." (only
      -- when it appears as part of the leaked template — the policy
      -- copy on product cards is generated separately and not stored
      -- in the description column.)
      '\s*Customer pays 50% advance[^\.]*before local dispatch\.\s*',
      ' ',
      'gi'
    ),
    -- the "selling angles" / "high intent" accessories lead-in —
    -- replaced with a clean accessories description
    'A branded accessory preorder chosen for high intent, gifting potential, and strong Instagram/WhatsApp selling angles\.',
    'A branded accessory sourced from USA retail and packed for safe Pakistan delivery.',
    'gi'
  )
)
where description ~* '(service margin|Source reference:|Variant focus:|Merchandising angle:|selling angles|high intent.*gifting potential)';

-- Collapse any double-spaces left behind from the replacements above.
update public.products
set description = regexp_replace(description, '\s{2,}', ' ', 'g')
where description ~ '\s{2,}';

-- Final guard: anything still ending with a stray "Price follows" or
-- starting with our internal phrasing gets the generic category
-- fallback (mirrors what netlify/functions/scraper.js now generates).
update public.products
set description = case category
  when 'handbags' then 'A polished USA-sourced handbag, packed with dust bag and authenticity-first attention.'
  when 'shoes' then 'USA-sourced sneakers with authentic packaging and full-size availability.'
  when 'makeup' then 'A curated beauty pick sourced from USA retail with shade confirmation before dispatch.'
  when 'fragrance' then 'A premium fragrance sourced from USA retail with gift-ready packaging.'
  when 'accessories' then 'A branded accessory sourced from USA retail and packed for safe Pakistan delivery.'
  else 'A curated USA-sourced piece, handpicked for Global Bestie customers in Pakistan.'
end
where description is null
   or trim(description) = ''
   or description ~* '(service margin|Source reference:|Variant focus:|Merchandising angle:)';

commit;

-- Spot-check after running:
--   select id, title, category, description from public.products order by created_at desc limit 20;
