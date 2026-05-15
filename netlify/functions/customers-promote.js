// Nightly customer-tier promotion. Re-evaluates every customer's VIP tier
// based on lifetime orders + revenue. Designed to run on a Netlify scheduled
// function (Cron) once per day; can also be invoked manually via GET with
// the admin bearer token (handy for one-off recalcs after data fixes).
//
// Tier rules (tweak as the business evolves):
//   vip    → 5+ orders OR revenue ≥ ₨250,000
//   gold   → 3+ orders OR revenue ≥ ₨100,000
//   silver → 2+ orders OR revenue ≥ ₨ 40,000
//   standard otherwise

import { hasSupabase, json, requireAdmin, supabase } from "./_shared/supabase.js";

function tierFor(orders, revenue) {
  if (orders >= 5 || revenue >= 250000) return "vip";
  if (orders >= 3 || revenue >= 100000) return "gold";
  if (orders >= 2 || revenue >= 40000) return "silver";
  return "standard";
}

async function runPromotionPass() {
  if (!hasSupabase()) {
    return { ok: false, reason: "no_supabase" };
  }
  const customers = await supabase("/rest/v1/customers?select=phone,total_orders,total_revenue_pkr,vip_tier&order=total_revenue_pkr.desc");
  const changes = [];
  for (const c of customers || []) {
    const next = tierFor(Number(c.total_orders || 0), Number(c.total_revenue_pkr || 0));
    if (next !== (c.vip_tier || "standard")) {
      changes.push({ phone: c.phone, from: c.vip_tier || "standard", to: next });
    }
  }
  // Patch in small batches so a single bad row doesn't block the rest.
  for (const change of changes) {
    try {
      await supabase(`/rest/v1/customers?phone=eq.${encodeURIComponent(change.phone)}`, {
        method: "PATCH",
        body: JSON.stringify({ vip_tier: change.to }),
      });
    } catch {
      /* keep going */
    }
  }
  return {
    ok: true,
    total_customers: customers?.length || 0,
    promotions: changes.length,
    changes: changes.slice(0, 50),
  };
}

export default async (req) => {
  try {
    // Scheduled invocations don't carry an Authorization header. Allow them
    // through but otherwise require the admin secret so the endpoint can't
    // be hammered publicly.
    const isScheduled = req.headers.get("x-netlify-functions-source") === "schedule" ||
      req.headers.get("user-agent")?.includes("Netlify");
    if (!isScheduled && !requireAdmin(req)) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }
    const result = await runPromotionPass();
    return json(result);
  } catch (error) {
    return json({ error: error.message }, { status: 500 });
  }
};

// `schedule` runs this function nightly at 03:30 PKT (22:30 UTC). Adjust the
// cron string if the team wants to see fresh tiers earlier or later.
//
// Netlify forbids a custom `path` on scheduled functions; the manual
// trigger is available at /.netlify/functions/customers-promote.
export const config = {
  schedule: "30 22 * * *",
};
