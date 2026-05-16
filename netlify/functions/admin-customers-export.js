// CSV export of the customers table — accepts the same filter query string
// as the Customers tab so the team can download exactly what they see.
//
// GET /api/admin/customers/export?city=Karachi&min_orders=2
//
// Returns text/csv with a Content-Disposition header so browsers offer it
// as a download.

import { hasSupabase, json, requireAdmin, supabase } from "./_shared/supabase.js";
import { canonPhone, isValidPkMobile, formatPkDisplay } from "./_shared/phone.js";

function matches(c, f) {
  if (!c) return false;
  if (f.city && String(c.city || "").toLowerCase() !== String(f.city).toLowerCase()) return false;
  if (f.min_orders && Number(c.total_orders || 0) < Number(f.min_orders)) return false;
  if (f.min_revenue && Number(c.total_revenue_pkr || 0) < Number(f.min_revenue)) return false;
  if (f.tag) {
    const tags = Array.isArray(c.tags) ? c.tags : [];
    if (!tags.some((t) => String(t).toLowerCase() === String(f.tag).toLowerCase())) return false;
  }
  if (f.search) {
    const hay = [c.name, c.phone, c.city, c.email, ...(c.tags || [])].filter(Boolean).join(" ").toLowerCase();
    if (!hay.includes(f.search)) return false;
  }
  return true;
}

function esc(v) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default async (req) => {
  if (!requireAdmin(req)) return json({ error: "Unauthorized" }, { status: 401 });
  try {
    const url = new URL(req.url);
    const f = {
      city: url.searchParams.get("city") || "",
      min_orders: url.searchParams.get("min_orders") || "",
      min_revenue: url.searchParams.get("min_revenue") || "",
      tag: url.searchParams.get("tag") || "",
      search: (url.searchParams.get("search") || "").toLowerCase(),
    };
    if (!hasSupabase()) return json({ error: "No Supabase configured" }, { status: 503 });

    const customers = await supabase("/rest/v1/customers?select=*&order=total_revenue_pkr.desc");
    const filtered = (customers || []).filter((c) => matches(c, f));

    const headers = [
      "Phone (canonical)",
      "Phone (display)",
      "Name",
      "Email",
      "City",
      "Total orders",
      "Lifetime revenue (PKR)",
      "Tags",
      "WhatsApp opt-in",
      "Risk flag",
      "Risk reason",
      "First seen",
      "Last seen",
      "Last outbound",
      "Notes",
    ];
    const body = filtered.map((c) => [
      c.phone || "",
      isValidPkMobile(c.phone) ? formatPkDisplay(c.phone) : (c.phone || ""),
      c.name || "",
      c.email || "",
      c.city || "",
      Number(c.total_orders || 0),
      Number(c.total_revenue_pkr || 0),
      Array.isArray(c.tags) ? c.tags.join(" | ") : "",
      c.whatsapp_opt_in === false ? "no" : "yes",
      c.risk_flag ? "yes" : "no",
      c.risk_reason || "",
      c.first_seen || "",
      c.last_seen || "",
      c.last_outbound_at || "",
      (c.notes || "").replace(/\n/g, " "),
    ].map(esc).join(","));

    const csv = [headers.join(","), ...body].join("\n");
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv;charset=utf-8",
        "Content-Disposition": `attachment; filename="global-bestie-customers-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return json({ error: error.message }, { status: 500 });
  }
};

export const config = {
  path: "/api/admin/customers/export",
};
