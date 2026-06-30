// Phase 1 — Meta ads reporting (read-only, always-on).
//
// Runs on a daily cron AND on demand via GET from the portal. Pulls yesterday's
// + last-7d insights from the Meta Marketing API at campaign and ad level,
// upserts them into meta_ad_snapshots, and returns a dashboard rollup. Touches
// no spend and creates nothing on Meta — safe to run anytime.
//
// Cron: 06:00 UTC = 11:00 PKT (after Meta has finalized the prior day).
//
//   GET /api/admin/ads-report           → dashboard rollup (last 7d) + refresh
//   GET /api/admin/ads-report?days=30   → 30-day window

import { hasSupabase, json, requireAdmin, supabase } from "./_shared/supabase.js";
import { getInsights, hasMetaAds, normalizeInsightRow } from "./_shared/meta-ads.js";

function todayMinus(days) {
  const d = new Date(Date.now() - days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

// Pull insights at one level for a window and upsert a snapshot row per
// (entity, day). Returns the number of rows written.
async function syncLevel(level, datePreset) {
  const rows = await getInsights({ level, datePreset, timeIncrement: 1 });
  if (!rows.length) return 0;

  const entityId = (r) =>
    level === "ad" ? r.ad_id : level === "adset" ? r.adset_id : level === "campaign" ? r.campaign_id : (r.account_id || "account");
  const entityName = (r) =>
    level === "ad" ? r.ad_name : level === "adset" ? r.adset_name : r.campaign_name;

  const snapshots = rows.map((r) => {
    const n = normalizeInsightRow(r);
    const date = r.date_start || todayMinus(1);
    const id = `${level}:${entityId(r)}:${date}`;
    return {
      id,
      level,
      entity_id: entityId(r) || "account",
      entity_name: entityName(r) || null,
      campaign_id: r.campaign_id || null,
      date,
      ...n,
      raw: r,
      updated_at: new Date().toISOString(),
    };
  });

  // Upsert in chunks so a huge account doesn't blow the request size.
  for (let i = 0; i < snapshots.length; i += 200) {
    const chunk = snapshots.slice(i, i + 200);
    await supabase("/rest/v1/meta_ad_snapshots?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(chunk),
    });
  }
  return snapshots.length;
}

// Build the dashboard rollup the portal renders from the stored snapshots.
async function buildDashboard(days) {
  const since = todayMinus(days);
  const campaignRows = await supabase(
    `/rest/v1/meta_ad_snapshots?level=eq.campaign&date=gte.${since}&select=*&order=date.desc`
  );

  const totals = campaignRows.reduce(
    (acc, r) => {
      acc.spend += Number(r.spend);
      acc.impressions += Number(r.impressions);
      acc.clicks += Number(r.clicks);
      acc.purchases += Number(r.purchases);
      acc.purchase_value += Number(r.purchase_value);
      acc.leads += Number(r.leads);
      return acc;
    },
    { spend: 0, impressions: 0, clicks: 0, purchases: 0, purchase_value: 0, leads: 0 }
  );
  totals.roas = totals.spend > 0 ? Number((totals.purchase_value / totals.spend).toFixed(2)) : 0;
  totals.cpa = totals.purchases > 0 ? Number((totals.spend / totals.purchases).toFixed(0)) : 0;
  totals.ctr = totals.impressions > 0 ? Number(((totals.clicks / totals.impressions) * 100).toFixed(2)) : 0;

  // Roll campaign rows up per campaign for the table.
  const byCampaign = new Map();
  for (const r of campaignRows) {
    const key = r.entity_id;
    const c = byCampaign.get(key) || {
      campaign_id: key, name: r.entity_name,
      spend: 0, impressions: 0, clicks: 0, purchases: 0, purchase_value: 0,
    };
    c.spend += Number(r.spend);
    c.impressions += Number(r.impressions);
    c.clicks += Number(r.clicks);
    c.purchases += Number(r.purchases);
    c.purchase_value += Number(r.purchase_value);
    byCampaign.set(key, c);
  }
  const campaigns = [...byCampaign.values()]
    .map((c) => ({
      ...c,
      roas: c.spend > 0 ? Number((c.purchase_value / c.spend).toFixed(2)) : 0,
      cpa: c.purchases > 0 ? Number((c.spend / c.purchases).toFixed(0)) : 0,
    }))
    .sort((a, b) => b.spend - a.spend);

  // Daily time-series (powers the sparklines). One point per day in the window.
  const byDate = new Map();
  for (const r of campaignRows) {
    const d = byDate.get(r.date) || { date: r.date, spend: 0, purchase_value: 0, clicks: 0, impressions: 0 };
    d.spend += Number(r.spend);
    d.purchase_value += Number(r.purchase_value);
    d.clicks += Number(r.clicks);
    d.impressions += Number(r.impressions);
    byDate.set(r.date, d);
  }
  const daily = [...byDate.values()]
    .map((d) => ({ ...d, roas: d.spend > 0 ? Number((d.purchase_value / d.spend).toFixed(2)) : 0 }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const creativeStats = await buildCreativeStats(since);

  return { window_days: days, totals, daily, campaigns, creativeStats };
}

// Per-creative performance: join ad-level snapshots back to the creative that
// each campaign was built from (meta_ad_campaigns.creative_ref ↔ meta_ad_id).
// Returns { creative_ref: {spend, purchases, purchase_value, roas, cpa, ctr} }.
async function buildCreativeStats(since) {
  try {
    const camps = await supabase(
      "/rest/v1/meta_ad_campaigns?meta_ad_id=not.is.null&creative_ref=not.is.null&select=creative_ref,meta_ad_id"
    );
    const adToCreative = new Map();
    for (const c of camps || []) adToCreative.set(c.meta_ad_id, c.creative_ref);
    if (!adToCreative.size) return {};
    const adRows = await supabase(
      `/rest/v1/meta_ad_snapshots?level=eq.ad&date=gte.${since}&select=entity_id,spend,impressions,clicks,purchases,purchase_value`
    );
    const byCreative = {};
    for (const r of adRows || []) {
      const ref = adToCreative.get(r.entity_id);
      if (!ref) continue;
      const s = byCreative[ref] || { spend: 0, impressions: 0, clicks: 0, purchases: 0, purchase_value: 0 };
      s.spend += Number(r.spend);
      s.impressions += Number(r.impressions);
      s.clicks += Number(r.clicks);
      s.purchases += Number(r.purchases);
      s.purchase_value += Number(r.purchase_value);
      byCreative[ref] = s;
    }
    for (const s of Object.values(byCreative)) {
      s.roas = s.spend > 0 ? Number((s.purchase_value / s.spend).toFixed(2)) : 0;
      s.cpa = s.purchases > 0 ? Number((s.spend / s.purchases).toFixed(0)) : 0;
      s.ctr = s.impressions > 0 ? Number(((s.clicks / s.impressions) * 100).toFixed(2)) : 0;
    }
    return byCreative;
  } catch {
    return {}; // creative stats are a nice-to-have — never fail the dashboard
  }
}

export const adsReport = async (req) => {
  const isScheduled =
    req.headers.get("x-netlify-functions-source") === "schedule" ||
    new URL(req.url).searchParams.get("scheduled") === "1";

  // Scheduled invocations have no bearer; on-demand portal calls must be admin.
  if (!isScheduled && !requireAdmin(req)) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const days = Math.min(90, Math.max(1, Number(new URL(req.url).searchParams.get("days") || 7)));

  if (!hasMetaAds()) {
    return json({ configured: false, reason: "meta_not_configured", totals: {}, campaigns: [] });
  }
  if (!hasSupabase()) {
    return json({ configured: false, reason: "supabase_not_configured", totals: {}, campaigns: [] });
  }

  try {
    // Refresh snapshots: campaign + ad level for the requested window.
    const preset = days <= 7 ? "last_7d" : days <= 14 ? "last_14d" : days <= 30 ? "last_30d" : "last_90d";
    const [campaignWritten, adWritten] = await Promise.all([
      syncLevel("campaign", preset),
      syncLevel("ad", preset),
    ]);

    const dashboard = await buildDashboard(days);
    return json({
      configured: true,
      refreshed: { campaign_rows: campaignWritten, ad_rows: adWritten },
      ...dashboard,
    });
  } catch (error) {
    return json({ error: error.message, meta: error.metaError || null }, { status: 502 });
  }
};

export default adsReport;

// HTTP endpoint only — a Netlify function cannot have BOTH a custom path and a
// schedule. The daily cron lives in ads-report-scheduled.js, which imports
// adsReport and invokes it with a scheduled request.
export const config = {
  path: "/api/admin/ads-report",
};
