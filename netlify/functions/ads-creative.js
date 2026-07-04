// Phase 2 — Meta ad creative library (operator-supplied media + copy).
//
// Holds the image+copy for ads before any of it goes live on Meta. The
// operator uploads media and writes copy on the ads page; ads-create.js later
// promotes a 'ready' one into a real campaign. Nothing in this function
// touches Meta or spends money. (The old template-based `generate` action was
// removed 2026-07 — the team supplies all creative by hand.)
//
//   GET  /api/admin/ads-creative                 → list the queue
//   POST /api/admin/ads-creative {action:'add', creative}      → save a creative
//   POST /api/admin/ads-creative {action:'status', id, status}  → ready/archive

import { hasSupabase, json, requireAdmin, supabase } from "./_shared/supabase.js";

export default async (req) => {
  if (!requireAdmin(req)) return json({ error: "Unauthorized" }, { status: 401 });

  try {
    if (req.method === "GET") {
      if (!hasSupabase()) return json({ creatives: [], configured: false });
      const creatives = await supabase(
        "/rest/v1/meta_ad_creatives?select=*&order=created_at.desc&limit=200"
      );
      return json({ creatives, configured: true });
    }

    if (req.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

    const { action, ...rest } = await req.json();

    if (action === "add") {
      const c = rest.creative || rest;
      if (!c.headline || !c.primary_text || !c.destination_url) {
        return json({ error: "headline, primary_text and destination_url are required." }, { status: 400 });
      }
      const row = {
        id: c.id || `cre-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        product_id: c.product_id || null,
        headline: c.headline,
        primary_text: c.primary_text,
        description: c.description || null,
        cta_type: c.cta_type || "SHOP_NOW",
        destination_url: c.destination_url,
        image_url: c.image_url || null,
        source: c.source || "manual",
        status: c.status || "draft",
        meta: c.meta || null,
        updated_at: new Date().toISOString(),
      };
      if (!hasSupabase()) return json({ creative: row, configured: false });
      const [saved] = await supabase("/rest/v1/meta_ad_creatives?on_conflict=id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify(row),
      });
      return json({ creative: saved, configured: true });
    }

    if (action === "status") {
      if (!rest.id || !rest.status) return json({ error: "id and status are required." }, { status: 400 });
      if (!hasSupabase()) return json({ ok: true, configured: false });
      const [saved] = await supabase(
        `/rest/v1/meta_ad_creatives?id=eq.${encodeURIComponent(rest.id)}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({ status: rest.status, updated_at: new Date().toISOString() }),
        }
      );
      return json({ creative: saved, configured: true });
    }

    return json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return json({ error: error.message }, { status: 500 });
  }
};

export const config = {
  path: "/api/admin/ads-creative",
};
