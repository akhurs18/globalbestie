// WhatsApp-template CRUD. Powers the template editor on the Settings tab —
// lets the team add new templates, edit existing bodies, toggle active,
// without touching SQL. Admin-only.

import { hasSupabase, json, requireAdmin, supabase } from "./_shared/supabase.js";

const ALLOWED_FIELDS = ["name", "category", "body", "is_active"];
const VALID_CATEGORIES = ["advance_request", "balance_reminder", "sourcing_update", "dispatch", "in_stock_confirmation", "custom"];

function sanitize(payload) {
  const out = {};
  for (const k of ALLOWED_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(payload, k)) out[k] = payload[k];
  }
  if (out.category && !VALID_CATEGORIES.includes(out.category)) {
    out.category = "custom";
  }
  if (typeof out.is_active !== "undefined") out.is_active = !!out.is_active;
  return out;
}

export default async (req) => {
  if (!(await requireAdmin(req))) return json({ error: "Unauthorized" }, { status: 401 });
  if (!hasSupabase()) return json({ templates: [], configured: false });

  try {
    if (req.method === "GET") {
      const rows = await supabase("/rest/v1/whatsapp_templates?select=*&order=category.asc,name.asc");
      return json({ templates: rows || [] });
    }

    if (req.method === "POST") {
      const payload = await req.json();
      const id = payload.id || `tmpl-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
      const fields = sanitize(payload);
      if (!fields.name || !fields.body) {
        return json({ error: "Name and body required." }, { status: 400 });
      }
      const row = {
        id,
        name: fields.name,
        category: fields.category || "custom",
        body: fields.body,
        is_active: fields.is_active !== false,
        updated_at: new Date().toISOString(),
      };
      await supabase("/rest/v1/whatsapp_templates?on_conflict=id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify(row),
      });
      return json({ ok: true, template: row });
    }

    if (req.method === "DELETE") {
      const url = new URL(req.url);
      const id = url.searchParams.get("id");
      if (!id) return json({ error: "Missing ?id=" }, { status: 400 });
      await supabase(`/rest/v1/whatsapp_templates?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
      return json({ ok: true, deleted: id });
    }

    return json({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    return json({ error: error.message }, { status: 500 });
  }
};

export const config = {
  path: "/api/admin/templates",
};
