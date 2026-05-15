// Team-member CRUD. Lets the team manage who receives the daily digest
// and (eventually) per-role workflows. Admin-only.

import { hasSupabase, json, requireAdmin, supabase } from "./_shared/supabase.js";
import { canonPhone, isValidPkMobile } from "./_shared/phone.js";

const VALID_ROLES = ["owner", "team", "support", "marketing"];

export default async (req) => {
  if (!requireAdmin(req)) return json({ error: "Unauthorized" }, { status: 401 });
  if (!hasSupabase()) return json({ members: [], configured: false });

  try {
    if (req.method === "GET") {
      const rows = await supabase("/rest/v1/team_members?select=*&order=created_at.asc");
      return json({ members: rows || [] });
    }

    if (req.method === "POST") {
      const payload = await req.json();
      const canon = canonPhone(payload.phone);
      if (!isValidPkMobile(canon)) return json({ error: "Valid PK mobile required." }, { status: 400 });
      const role = VALID_ROLES.includes(payload.role) ? payload.role : "team";
      const row = {
        phone: canon,
        name: String(payload.name || "").trim() || null,
        role,
        digest_opt_in: payload.digest_opt_in !== false,
      };
      await supabase("/rest/v1/team_members?on_conflict=phone", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify(row),
      });
      return json({ ok: true, member: row });
    }

    if (req.method === "DELETE") {
      const url = new URL(req.url);
      const canon = canonPhone(url.searchParams.get("phone"));
      if (!canon) return json({ error: "Missing ?phone=" }, { status: 400 });
      await supabase(`/rest/v1/team_members?phone=eq.${encodeURIComponent(canon)}`, { method: "DELETE" });
      return json({ ok: true, deleted: canon });
    }

    return json({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    return json({ error: error.message }, { status: 500 });
  }
};

export const config = {
  path: "/api/admin/team-members",
};
