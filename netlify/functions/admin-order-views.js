// Saved-view CRUD for the Orders tab. Same shape as admin-segments.js but
// the `filters` keys mirror what the Orders tab persists (status, batch,
// dateRange, customStart/customEnd, search).

import { hasSupabase, json, requireAdmin, supabase } from "./_shared/supabase.js";

const ALLOWED_KEYS = ["status", "batch", "dateRange", "customStart", "customEnd", "search", "slaOnly"];

function sanitizeFilters(raw) {
  if (!raw || typeof raw !== "object") return {};
  const out = {};
  for (const k of ALLOWED_KEYS) {
    if (raw[k] !== undefined && raw[k] !== "" && raw[k] !== null) out[k] = raw[k];
  }
  return out;
}

export default async (req) => {
  if (!requireAdmin(req)) return json({ error: "Unauthorized" }, { status: 401 });
  if (!hasSupabase()) return json({ views: [], configured: false });

  try {
    if (req.method === "GET") {
      const rows = await supabase("/rest/v1/order_views?select=*&order=pinned.desc,updated_at.desc");
      return json({ views: rows || [] });
    }

    if (req.method === "POST") {
      const payload = await req.json();
      const name = String(payload.name || "").trim();
      if (!name) return json({ error: "View name required." }, { status: 400 });
      const id = payload.id || `ov-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
      const row = {
        id,
        name,
        filters: sanitizeFilters(payload.filters),
        pinned: !!payload.pinned,
        updated_at: new Date().toISOString(),
      };
      await supabase("/rest/v1/order_views?on_conflict=id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify(row),
      });
      return json({ ok: true, view: row });
    }

    if (req.method === "DELETE") {
      const url = new URL(req.url);
      const id = url.searchParams.get("id");
      if (!id) return json({ error: "Missing ?id=" }, { status: 400 });
      await supabase(`/rest/v1/order_views?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
      return json({ ok: true, deleted: id });
    }

    return json({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    return json({ error: error.message }, { status: 500 });
  }
};

export const config = {
  path: "/api/admin/order-views",
};
