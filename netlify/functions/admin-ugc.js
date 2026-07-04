// UGC management — lets the team add / approve / remove customer photos that
// power the storefront "From real besties" rail. Admin-only. The public read
// path is /api/public/ugc (approved rows only); this is the write side.
//
//   GET    /api/admin/ugc            → { posts: [...all rows...] }
//   POST   /api/admin/ugc            → upsert one post (approve, edit, create)
//   DELETE /api/admin/ugc?id=...     → remove a post

import { hasSupabase, json, requireAdmin, supabase } from "./_shared/supabase.js";

const FIELDS = new Set([
  "id", "handle", "city", "quote", "image_url", "product_ref",
  "category", "cta_text", "cta_href", "source", "status", "sort_order",
]);

export default async (req) => {
  if (!(await requireAdmin(req))) return json({ error: "Unauthorized" }, { status: 401 });
  if (!hasSupabase()) return json({ posts: [], configured: false });

  try {
    if (req.method === "GET") {
      const rows = await supabase(
        "/rest/v1/ugc_posts?select=*&order=status.asc,sort_order.asc,created_at.desc"
      );
      return json({ posts: rows || [], configured: true });
    }

    if (req.method === "POST") {
      const payload = await req.json();
      const quote = String(payload.quote || "").trim();
      const handle = String(payload.handle || "").trim();
      if (!quote || !handle) {
        return json({ error: "handle and quote are required." }, { status: 400 });
      }
      const row = { updated_at: new Date().toISOString() };
      for (const [k, v] of Object.entries(payload)) {
        if (FIELDS.has(k) && v !== undefined) row[k] = v;
      }
      row.id = row.id || `ugc-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
      // New rows default to pending; the team flips status to "approved".
      if (!row.status) row.status = "pending";
      await supabase("/rest/v1/ugc_posts?on_conflict=id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify(row),
      });
      return json({ ok: true, post: row });
    }

    if (req.method === "DELETE") {
      const url = new URL(req.url);
      const id = url.searchParams.get("id");
      if (!id) return json({ error: "Missing ?id=" }, { status: 400 });
      await supabase(`/rest/v1/ugc_posts?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
      return json({ ok: true, deleted: id });
    }

    return json({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    return json({ error: error.message }, { status: 500 });
  }
};

export const config = {
  path: "/api/admin/ugc",
};
