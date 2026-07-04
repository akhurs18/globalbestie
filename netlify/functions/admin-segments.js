// Smart-segment CRUD. Lets the team save filter combinations from the
// Customers tab as named segments, then reuse them on either the Customers
// tab or the Broadcast form. Admin-only.

import { hasSupabase, json, requireAdmin, supabase } from "./_shared/supabase.js";

function sanitizeFilters(raw) {
  if (!raw || typeof raw !== "object") return {};
  const out = {};
  const keys = ["city", "tag", "last_order_days", "min_orders", "min_revenue"];
  for (const k of keys) {
    if (raw[k] !== undefined && raw[k] !== "" && raw[k] !== null) out[k] = raw[k];
  }
  return out;
}

export default async (req) => {
  if (!(await requireAdmin(req))) return json({ error: "Unauthorized" }, { status: 401 });
  if (!hasSupabase()) return json({ segments: [], configured: false });

  try {
    if (req.method === "GET") {
      const rows = await supabase("/rest/v1/smart_segments?select=*&order=pinned.desc,updated_at.desc");
      return json({ segments: rows || [] });
    }

    if (req.method === "POST") {
      const payload = await req.json();
      const name = String(payload.name || "").trim();
      if (!name) return json({ error: "Segment name required." }, { status: 400 });
      const id = payload.id || `seg-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
      const row = {
        id,
        name,
        filters: sanitizeFilters(payload.filters),
        pinned: !!payload.pinned,
        updated_at: new Date().toISOString(),
      };
      await supabase("/rest/v1/smart_segments?on_conflict=id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify(row),
      });
      return json({ ok: true, segment: row });
    }

    if (req.method === "DELETE") {
      const url = new URL(req.url);
      const id = url.searchParams.get("id");
      if (!id) return json({ error: "Missing ?id=" }, { status: 400 });
      await supabase(`/rest/v1/smart_segments?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
      return json({ ok: true, deleted: id });
    }

    return json({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    return json({ error: error.message }, { status: 500 });
  }
};

export const config = {
  path: "/api/admin/segments",
};
