// Cancel a pending scheduled broadcast before the cron picks it up.
// Idempotent: cancelling an already-cancelled or already-sent row returns
// the current state without erroring.

import { hasSupabase, json, requireAdmin, supabase } from "./_shared/supabase.js";

export default async (req) => {
  if (!requireAdmin(req)) return json({ error: "Unauthorized" }, { status: 401 });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "Missing ?id=" }, { status: 400 });
    if (!hasSupabase()) return json({ ok: true, configured: false });

    const rows = await supabase(`/rest/v1/scheduled_broadcasts?id=eq.${encodeURIComponent(id)}&select=*`);
    const row = rows?.[0];
    if (!row) return json({ error: "Not found" }, { status: 404 });
    if (row.status !== "pending") {
      return json({ ok: true, already: row.status });
    }
    await supabase(`/rest/v1/scheduled_broadcasts?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "cancelled", updated_at: new Date().toISOString() }),
    });
    return json({ ok: true, cancelled: true });
  } catch (error) {
    return json({ error: error.message }, { status: 500 });
  }
};

export const config = {
  path: "/api/admin/broadcast/cancel",
};
