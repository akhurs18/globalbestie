// Phase 4 — guardrailed auto-optimization.
//
// Runs daily. Reads the last few days of ad-level snapshots, applies a small
// set of rules within hard caps, logs every action to meta_ad_actions, and —
// crucially — does nothing live unless store_settings.ads_autopilot is true.
// With autopilot off it runs in DRY-RUN: it records the action it *would* take
// so an operator can review the bot's judgment before trusting it with spend.
//
// Rules (all bounded by guardrails on store_settings):
//   • PAUSE an ad that has spent >= ads_learn_spend_pkr with zero purchases.
//   • PAUSE an ad whose CPA exceeds ads_max_cpa_pkr (had purchases, too pricey).
//   • SCALE its ad set's daily budget up by ads_scale_step_pct when ROAS beats
//     ads_target_roas — but never above ads_max_daily_budget_pkr.
// It never creates or launches anything (that's the gated Phase 3 path) and
// never scales past the ceiling.
//
// Cron: 07:00 UTC = 12:00 PKT (an hour after ads-report refreshes snapshots).
//
//   GET /api/admin/ads-optimize           → run (respects autopilot flag)
//   GET /api/admin/ads-optimize?force=1   → run live even if called on demand
//   GET /api/admin/ads-optimize?undo=ACTION_ID → revert one logged action

import { getSettings, hasSupabase, json, requireAdmin, supabase } from "./_shared/supabase.js";
import {
  getAdSetBudget, hasMetaAds, setAdSetDailyBudget, setEntityStatus,
} from "./_shared/meta-ads.js";

function todayMinus(days) {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

// Aggregate ad-level snapshots over the window into one row per ad.
async function loadAdPerformance(days) {
  const since = todayMinus(days);
  const rows = await supabase(
    `/rest/v1/meta_ad_snapshots?level=eq.ad&date=gte.${since}&select=*`
  );
  const byAd = new Map();
  for (const r of rows) {
    const a = byAd.get(r.entity_id) || {
      ad_id: r.entity_id, name: r.entity_name, campaign_id: r.campaign_id,
      spend: 0, purchases: 0, purchase_value: 0,
    };
    a.spend += Number(r.spend);
    a.purchases += Number(r.purchases);
    a.purchase_value += Number(r.purchase_value);
    byAd.set(r.entity_id, a);
  }
  // We need each ad's parent ad set to scale budget. The ad-level snapshot's
  // raw payload carries adset_id; pull it from the most recent row.
  for (const r of rows) {
    const a = byAd.get(r.entity_id);
    if (a && !a.adset_id) a.adset_id = r.raw?.adset_id || null;
  }
  return [...byAd.values()].map((a) => ({
    ...a,
    roas: a.spend > 0 ? a.purchase_value / a.spend : 0,
    cpa: a.purchases > 0 ? a.spend / a.purchases : 0,
  }));
}

async function logAction(entry) {
  await supabase("/rest/v1/meta_ad_actions", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ ...entry, created_at: new Date().toISOString() }),
  }).catch(() => {});
}

// Decide the action for one ad given the guardrails. Returns null = leave alone.
function decide(ad, g) {
  if (ad.spend >= g.learnSpend && ad.purchases === 0) {
    return { action: "pause", reason: `Spent ${Math.round(ad.spend)} PKR, 0 purchases (past learn budget).` };
  }
  if (ad.purchases > 0 && ad.cpa > g.maxCpa) {
    return { action: "pause", reason: `CPA ${Math.round(ad.cpa)} > cap ${g.maxCpa} PKR.` };
  }
  if (ad.roas >= g.targetRoas && ad.adset_id) {
    return { action: "scale_budget", reason: `ROAS ${ad.roas.toFixed(2)} ≥ target ${g.targetRoas} — scale ${g.scaleStep}%.` };
  }
  return null;
}

async function handleUndo(actionId) {
  const rows = await supabase(`/rest/v1/meta_ad_actions?id=eq.${encodeURIComponent(actionId)}&select=*`);
  const a = rows?.[0];
  if (!a) return json({ error: "Action not found." }, { status: 404 });
  if (a.reverted) return json({ ok: true, already: true });

  if (!a.dry_run && hasMetaAds()) {
    if (a.field === "status" && a.value_before) {
      await setEntityStatus(a.entity_id, a.value_before);
    } else if (a.field === "daily_budget" && a.value_before) {
      await setAdSetDailyBudget(a.entity_id, Number(a.value_before));
    }
  }
  await supabase(`/rest/v1/meta_ad_actions?id=eq.${encodeURIComponent(actionId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ reverted: true, reverted_at: new Date().toISOString() }),
  });
  return json({ ok: true, reverted: actionId });
}

export const adsOptimize = async (req) => {
  const url = new URL(req.url);
  const isScheduled =
    req.headers.get("x-netlify-functions-source") === "schedule" ||
    url.searchParams.get("scheduled") === "1";
  if (!isScheduled && !(await requireAdmin(req))) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasSupabase()) return json({ configured: false, reason: "supabase_not_configured", actions: [] });

  try {
    const undoId = url.searchParams.get("undo");
    if (undoId) return await handleUndo(undoId);

    const settings = await getSettings();
    const guard = {
      autopilot: Boolean(settings.ads_autopilot) || url.searchParams.get("force") === "1",
      maxDailyBudget: Number(settings.ads_max_daily_budget_pkr || 5000),
      scaleStep: Number(settings.ads_scale_step_pct || 20),
      targetRoas: Number(settings.ads_target_roas || 2),
      maxCpa: Number(settings.ads_max_cpa_pkr || 2500),
      learnSpend: Number(settings.ads_learn_spend_pkr || 1500),
    };
    const dryRun = !guard.autopilot;

    const days = Math.min(14, Math.max(1, Number(url.searchParams.get("days") || 3)));
    const ads = await loadAdPerformance(days);

    const performed = [];
    for (const ad of ads) {
      const decision = decide(ad, guard);
      if (!decision) continue;

      let valueBefore = null;
      let valueAfter = null;
      let field = decision.action === "scale_budget" ? "daily_budget" : "status";

      if (decision.action === "pause") {
        valueBefore = "ACTIVE";
        valueAfter = "PAUSED";
        if (!dryRun && hasMetaAds()) await setEntityStatus(ad.ad_id, "PAUSED");
      } else if (decision.action === "scale_budget") {
        // Read current budget, bump by step, clamp to ceiling.
        let current = guard.maxDailyBudget;
        if (hasMetaAds() && ad.adset_id) {
          try { current = (await getAdSetBudget(ad.adset_id)).dailyBudgetPkr || current; } catch { /* keep estimate */ }
        }
        const proposed = Math.min(
          Math.round(current * (1 + guard.scaleStep / 100)),
          guard.maxDailyBudget
        );
        valueBefore = String(current);
        valueAfter = String(proposed);
        if (proposed <= current) continue; // already at ceiling — skip
        if (!dryRun && hasMetaAds()) await setAdSetDailyBudget(ad.adset_id, proposed);
      }

      const entry = {
        action: decision.action,
        level: decision.action === "scale_budget" ? "adset" : "ad",
        entity_id: decision.action === "scale_budget" ? ad.adset_id : ad.ad_id,
        entity_name: ad.name,
        reason: decision.reason,
        field,
        value_before: valueBefore,
        value_after: valueAfter,
        performed_by: "bot",
        dry_run: dryRun,
      };
      await logAction(entry);
      performed.push(entry);
    }

    return json({
      configured: hasMetaAds(),
      autopilot: guard.autopilot,
      dry_run: dryRun,
      evaluated: ads.length,
      acted: performed.length,
      actions: performed,
    });
  } catch (error) {
    return json({ error: error.message, meta: error.metaError || null }, { status: 502 });
  }
};

export default adsOptimize;

// HTTP endpoint only; the daily cron lives in ads-optimize-scheduled.js.
export const config = {
  path: "/api/admin/ads-optimize",
};
