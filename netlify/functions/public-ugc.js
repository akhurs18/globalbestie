// Public UGC feed — approved customer photos + quotes for the storefront
// "From real besties" rail. No auth. Returns the curated demo set when no
// approved rows exist so the rail never renders blank.
//
// GET /api/public/ugc
// → { items: [ { id, handle, city, quote, image_url, cta_text, cta_href } ], configured }

import { getUgcPosts, hasSupabase, json } from "./_shared/supabase.js";

export default async (req) => {
  if (req.method !== "GET") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }
  try {
    const rows = await getUgcPosts();
    const items = (rows || []).slice(0, 8).map((p) => ({
      id: p.id,
      handle: p.handle,
      city: p.city || "",
      quote: p.quote,
      image_url: p.image_url || "",
      category: p.category || "",
      cta_text: p.cta_text || "Order this look →",
      cta_href: p.cta_href || "/quote",
    }));
    return json(
      { items, configured: hasSupabase() },
      { headers: { "Cache-Control": "public, max-age=300" } }
    );
  } catch (error) {
    return json({ error: error.message }, { status: 500 });
  }
};

export const config = {
  path: "/api/public/ugc",
};
