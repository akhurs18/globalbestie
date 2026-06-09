// Public batch tracker feed — powers the /batches page and the storefront
// announce-bar status rail. No auth. Returns every batch mapped onto the
// 5-stage customer rail, plus a categorized split (active / open / delivered)
// and a single `announce` summary for the top-of-page ribbon.
//
// GET /api/public/batches
// → {
//     announce: { id, name, stageIndex, stageKey, etaWindow, ... } | null,
//     active:  [ batch, ... ],   // in transit (sourcing/shipped/arriving)
//     open:    [ batch, ... ],   // collecting — still accepting orders
//     delivered: [ batch, ... ], // arrived (history, newest first)
//     configured: boolean
//   }

import { getShipmentBatches, getSettings, hasSupabase, json } from "./_shared/supabase.js";

// The customer-facing rail has 5 fixed stages. Map each DB status onto the
// index of the stage that should read as "active". `arrived` lights the final
// stage (Dispatched) since, to the customer, an arrived batch is going out.
const RAIL_STAGES = ["Collecting", "Sourced", "Shipped", "Arrived PK", "Dispatched"];
const STATUS_TO_STAGE = {
  collecting: 0,
  sourcing: 1,
  shipped: 2,
  arriving: 3,
  arrived: 4,
};

function fmtDate(d) {
  if (!d) return null;
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// "May 25 – 27" doorstep window: ETA day through ETA + 2 days.
function etaWindow(etaDate) {
  if (!etaDate) return null;
  const start = new Date(etaDate);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + 2 * 86_400_000);
  const startStr = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const endStr = end.toLocaleDateString("en-US", { day: "numeric" });
  return `${startStr} – ${endStr}`;
}

function publicBatch(b) {
  const stageIndex = STATUS_TO_STAGE[b.status] ?? 0;
  const capacity = Number(b.capacity || 0);
  const used = Number(b.used || (b.order_ids?.length || 0));
  return {
    id: b.id,
    name: b.name,
    status: b.status,
    stageIndex,
    stageKey: RAIL_STAGES[stageIndex],
    stages: RAIL_STAGES,
    etaDate: b.eta_date || null,
    etaWindow: etaWindow(b.eta_date),
    closesOn: b.closes_on || (b.eta_date
      ? fmtDate(new Date(new Date(b.eta_date).getTime() - 14 * 86_400_000))
      : null),
    capacity,
    used,
    spotsLeft: Math.max(0, capacity - used),
    fillPct: capacity > 0 ? Math.min(100, Math.round((used / capacity) * 100)) : 0,
    note: b.note || "",
  };
}

export default async (req) => {
  if (req.method !== "GET") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }
  try {
    const [batches, settings] = await Promise.all([getShipmentBatches(), getSettings()]);
    const mapped = (batches || []).map(publicBatch);

    const open = mapped.filter((b) => b.status === "collecting");
    const active = mapped
      .filter((b) => ["sourcing", "shipped", "arriving"].includes(b.status))
      .sort((a, c) => new Date(a.etaDate || 0) - new Date(c.etaDate || 0));
    const delivered = mapped
      .filter((b) => b.status === "arrived")
      .sort((a, c) => new Date(c.etaDate || 0) - new Date(a.etaDate || 0));

    // The announce ribbon shows the most "in flight" batch — prefer the
    // soonest-arriving active one, then the open one, then anything.
    const announceSource = active[0] || open[0] || mapped[0] || null;
    const announce = announceSource
      ? {
          id: announceSource.id,
          name: announceSource.name,
          stageIndex: announceSource.stageIndex,
          stageKey: announceSource.stageKey,
          stages: RAIL_STAGES,
          etaWindow: announceSource.etaWindow
            || settings?.batch_doorstep_window
            || null,
        }
      : null;

    return json(
      { announce, active, open, delivered, configured: hasSupabase() },
      { headers: { "Cache-Control": "public, max-age=300" } }
    );
  } catch (error) {
    return json({ error: error.message }, { status: 500 });
  }
};

export const config = {
  path: "/api/public/batches",
};
