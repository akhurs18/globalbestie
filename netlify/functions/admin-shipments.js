import { hasSupabase, json, requireAdmin, supabase } from "./_shared/supabase.js";

export default async (req) => {
  if (!requireAdmin(req)) return json({ error: "Unauthorized" }, { status: 401 });

  // DELETE — remove a batch by id. Orders are intentionally left in place: the
  // batch→order link lives in shipment_batches.order_ids, so dropping the row
  // unassigns them without deleting any order. The client resets their ETA copy.
  if (req.method === "DELETE") {
    try {
      const body = await req.json().catch(() => ({}));
      const id = body.id || new URL(req.url).searchParams.get("id");
      if (!id) return json({ error: "Batch id is required." }, { status: 400 });
      if (!hasSupabase()) return json({ ok: true, configured: false });
      await supabase(`/rest/v1/shipment_batches?id=eq.${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { Prefer: "return=minimal" },
      });
      return json({ ok: true, configured: true });
    } catch (error) {
      return json({ error: error.message }, { status: 500 });
    }
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

  try {
    const payload = await req.json();
    if (!payload.id || !payload.name || !payload.eta_date) {
      return json({ error: "Batch id, name, and ETA date are required." }, { status: 400 });
    }

    const shipmentBatch = {
      id: payload.id,
      name: payload.name,
      eta_date: payload.eta_date,
      status: payload.status || "collecting",
      capacity: Number(payload.capacity || 0),
      used: Number(payload.used || 0),
      note: payload.note || "",
      order_ids: payload.order_ids || [],
      updated_at: new Date().toISOString(),
    };

    if (!hasSupabase()) return json({ shipmentBatch, configured: false });

    const [saved] = await supabase("/rest/v1/shipment_batches?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(shipmentBatch),
    });

    return json({ shipmentBatch: saved, configured: true });
  } catch (error) {
    return json({ error: error.message }, { status: 500 });
  }
};

export const config = {
  path: "/api/admin/shipments",
};
