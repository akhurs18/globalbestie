// Public endpoint exposing the next-open shipment batch summary. No auth.
// Designed to be hit by ManyChat External Request (or anything else that
// needs to display "next batch closes on X, arrives around Y" without
// touching admin credentials.
//
// GET /api/public/next-batch
// →
// {
//   "name": "June USA Batch",
//   "status": "collecting",
//   "closes_on": "2026-06-02",
//   "eta_date": "2026-06-24",
//   "capacity": 42,
//   "used": 18,
//   "spots_left": 24,
//   "fx_rate": 282,
//   "configured": true
// }
//
// When no batch is in `collecting` status, falls back to the next one in
// `sourcing` so ManyChat never gets an empty payload.

import { getShipmentBatches, getSettings, hasSupabase, json } from "./_shared/supabase.js";

function pickActiveBatch(batches) {
  if (!batches?.length) return null;
  // Prefer a collecting batch (still accepting orders).
  const collecting = batches.find((b) => b.status === "collecting");
  if (collecting) return collecting;
  // Otherwise the next sourcing batch (already closed for new orders but
  // still en-route — gives the team a sensible "next ETA" answer).
  const sourcing = batches
    .filter((b) => b.status === "sourcing" || b.status === "shipped" || b.status === "arriving")
    .sort((a, b) => new Date(a.eta_date || 0) - new Date(b.eta_date || 0))[0];
  return sourcing || null;
}

export default async (req) => {
  if (req.method !== "GET") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }
  try {
    const [batches, settings] = await Promise.all([
      getShipmentBatches(),
      getSettings(),
    ]);
    const batch = pickActiveBatch(batches);
    if (!batch) {
      return json({
        name: null,
        status: null,
        closes_on: null,
        eta_date: null,
        capacity: 0,
        used: 0,
        spots_left: 0,
        fx_rate: Number(settings?.fx_rate || 0),
        configured: hasSupabase(),
        message: "No active batch — please contact the team for the next ETA.",
      });
    }
    const capacity = Number(batch.capacity || 0);
    const used = Number(batch.used || (batch.order_ids?.length || 0));
    const spotsLeft = Math.max(0, capacity - used);
    return json({
      name: batch.name,
      status: batch.status,
      // "Closes on" = the day before the batch ETA the team typically stops
      // accepting orders. We approximate as the batch eta_date − 14 days
      // when not explicitly set; the team can override by setting
      // batch.closes_on in Supabase later.
      closes_on: batch.closes_on || (batch.eta_date
        ? new Date(new Date(batch.eta_date).getTime() - 14 * 86_400_000).toISOString().slice(0, 10)
        : null),
      eta_date: batch.eta_date || null,
      capacity,
      used,
      spots_left: spotsLeft,
      fx_rate: Number(settings?.fx_rate || 0),
      note: batch.note || "",
      configured: hasSupabase(),
    }, {
      headers: { "Cache-Control": "public, max-age=300" }, // 5-min cache
    });
  } catch (error) {
    return json({ error: error.message }, { status: 500 });
  }
};

export const config = {
  path: "/api/public/next-batch",
};
