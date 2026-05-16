// Admin customer mutations — keyed by canonical phone in the query string
// (`?phone=923xxxxxxxxx`). Used by the portal customer modal to inline-edit
// tags, notes, VIP tier, and the opt-in flag. All mutations require the
// admin bearer token; safe to expose only behind it.

import { hasSupabase, json, requireAdmin, supabase } from "./_shared/supabase.js";
import { canonPhone, isValidPkMobile } from "./_shared/phone.js";

// Whitelist of fields we'll PATCH. Anything else in the payload is dropped
// so a malicious client can't write to `total_revenue_pkr` or similar.
const ALLOWED_FIELDS = ["name", "email", "city", "default_address", "tags", "notes", "whatsapp_opt_in", "risk_flag", "risk_reason"];

// Keywords that, if they appear in customer notes, auto-set risk_flag = true.
// We err on the side of catching too many — false positives just get a red
// dot on the customer; false negatives mean a complaint goes unnoticed.
const RISK_KEYWORDS = [
  "refund", "cancel", "cancelled", "angry", "unhappy", "complaint",
  "late", "lost", "missing", "broken", "damaged", "wrong",
  "fake", "rude", "ignored", "scam", "frustrated",
];

function deriveRiskFlag(notes) {
  if (!notes) return { flag: false, reason: "" };
  const norm = String(notes).toLowerCase();
  const hits = RISK_KEYWORDS.filter((kw) => new RegExp(`\\b${kw}\\b`, "i").test(norm));
  if (!hits.length) return { flag: false, reason: "" };
  return { flag: true, reason: `Auto-flagged: notes mention ${hits.slice(0, 3).join(", ")}.` };
}

function sanitize(updates) {
  const out = {};
  for (const k of ALLOWED_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(updates, k)) out[k] = updates[k];
  }
  // Tags must be an array of strings
  if (Array.isArray(out.tags)) {
    out.tags = out.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 20);
  }
  return out;
}

export default async (req) => {
  if (!requireAdmin(req)) return json({ error: "Unauthorized" }, { status: 401 });

  try {
    const url = new URL(req.url);
    const canon = canonPhone(url.searchParams.get("phone"));
    if (!isValidPkMobile(canon)) {
      return json({ error: "Valid phone (canonical) required as ?phone=." }, { status: 400 });
    }

    if (req.method === "GET") {
      if (!hasSupabase()) return json({ customer: null, audit: [], configured: false });
      const [rows, audit] = await Promise.all([
        supabase(`/rest/v1/customers?phone=eq.${encodeURIComponent(canon)}&select=*`),
        supabase(`/rest/v1/admin_audit?entity_type=eq.customer&entity_id=eq.${encodeURIComponent(canon)}&select=*&order=created_at.desc&limit=30`).catch(() => []),
      ]);
      return json({ customer: rows[0] || null, audit, configured: true });
    }

    if (req.method === "PATCH") {
      const payload = await req.json();
      const updates = sanitize(payload);
      if (!Object.keys(updates).length) {
        return json({ error: "No editable fields supplied." }, { status: 400 });
      }
      // Auto-derive risk_flag whenever notes are updated, unless the caller
      // explicitly set risk_flag themselves (manual override wins).
      if ("notes" in updates && !("risk_flag" in payload)) {
        const derived = deriveRiskFlag(updates.notes);
        updates.risk_flag = derived.flag;
        updates.risk_reason = derived.reason;
      }
      // Snapshot the existing row BEFORE we patch so the audit log can
      // store the before-state. Best-effort — never throws.
      let before = null;
      if (hasSupabase()) {
        try {
          const rows = await supabase(`/rest/v1/customers?phone=eq.${encodeURIComponent(canon)}&select=*`);
          before = rows?.[0] || null;
        } catch {}
      }
      if (!hasSupabase()) {
        return json({ ok: true, configured: false, updates });
      }
      // Upsert behavior: if the customer row doesn't exist yet, create it.
      const existing = await supabase(`/rest/v1/customers?phone=eq.${encodeURIComponent(canon)}&select=phone`);
      if (!existing?.length) {
        await supabase("/rest/v1/customers", {
          method: "POST",
          body: JSON.stringify({
            phone: canon,
            ...updates,
            first_seen: new Date().toISOString(),
            last_seen: new Date().toISOString(),
          }),
        });
      } else {
        await supabase(`/rest/v1/customers?phone=eq.${encodeURIComponent(canon)}`, {
          method: "PATCH",
          body: JSON.stringify({ ...updates, last_seen: new Date().toISOString() }),
        });
      }
      // Audit row — captures who/what/before/after so the team can answer
      // "who changed Ayesha's tier last week?". Best-effort; never blocks.
      try {
        await supabase("/rest/v1/admin_audit", {
          method: "POST",
          body: JSON.stringify({
            actor: "admin",
            action: existing?.length ? "customer.update" : "customer.create",
            entity_type: "customer",
            entity_id: canon,
            payload: { before, updates },
            created_at: new Date().toISOString(),
          }),
        });
      } catch {}
      return json({ ok: true, updates });
    }

    return json({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    return json({ error: error.message }, { status: 500 });
  }
};

export const config = {
  path: "/api/admin/customers",
};
