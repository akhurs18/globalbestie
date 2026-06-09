// Public "This week" feed — the approved-but-not-yet-published trend
// candidates the team is sourcing into the next open batch. Powers /this-week.
// No auth. Customer sees the final all-inclusive PKR estimate only — never the
// USD cost / FX / shipping inputs (same privacy rule as /api/catalog).
//
// GET /api/public/this-week
// → {
//     batch: { id, name, etaWindow, closesOn, spotsLeft } | null,
//     items: [ { id, title, brand, category, image_url, price_pkr,
//                advance_pkr, blurb }, ... ],
//     configured: boolean
//   }

import {
  getApprovedCandidates,
  getSettings,
  getShipmentBatches,
  hasSupabase,
  json,
} from "./_shared/supabase.js";

function customerPrice(candidate, settings) {
  const fx = Number(candidate.fx_rate || settings.fx_rate || 282);
  const markup = Number(candidate.markup_rate ?? settings.markup_rate ?? 0.25);
  const retailPkr = Number(candidate.usa_price_usd || 0) * fx;
  return Math.ceil(retailPkr + retailPkr * markup + Number(candidate.shipping_pkr || 0));
}

function etaWindow(etaDate) {
  if (!etaDate) return null;
  const start = new Date(etaDate);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + 2 * 86_400_000);
  return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-US", { day: "numeric" })}`;
}

export default async (req) => {
  if (req.method !== "GET") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }
  try {
    const [batches, settings] = await Promise.all([getShipmentBatches(), getSettings()]);

    // The "this week" batch is the one still collecting orders.
    const openBatch = (batches || []).find((b) => b.status === "collecting")
      || (batches || []).find((b) => b.status === "sourcing")
      || null;

    // Prefer candidates explicitly tagged to the open batch; if none are
    // tagged yet, show all approved candidates so the page is never empty.
    let candidates = await getApprovedCandidates(openBatch?.id);
    if (!candidates?.length && openBatch?.id) {
      candidates = await getApprovedCandidates();
    }

    const items = (candidates || []).slice(0, 12).map((c) => {
      const price = customerPrice(c, settings);
      return {
        id: c.id,
        title: c.title,
        brand: c.brand || "",
        category: c.category || "",
        image_url: c.image_url || (Array.isArray(c.asset_urls) ? c.asset_urls[0] : "") || "",
        price_pkr: price,
        // Preorder split is always 50% on this surface (all candidates are
        // preorders by definition — they're not sourced yet).
        advance_pkr: Math.ceil(price / 2),
        blurb: c.suggested_description || c.social_proof || "",
      };
    });

    const capacity = Number(openBatch?.capacity || 0);
    const used = Number(openBatch?.used || (openBatch?.order_ids?.length || 0));

    return json(
      {
        batch: openBatch
          ? {
              id: openBatch.id,
              name: openBatch.name,
              etaWindow: etaWindow(openBatch.eta_date),
              closesOn: openBatch.closes_on || null,
              spotsLeft: Math.max(0, capacity - used),
            }
          : null,
        items,
        configured: hasSupabase(),
      },
      { headers: { "Cache-Control": "public, max-age=300" } }
    );
  } catch (error) {
    return json({ error: error.message }, { status: 500 });
  }
};

export const config = {
  path: "/api/public/this-week",
};
