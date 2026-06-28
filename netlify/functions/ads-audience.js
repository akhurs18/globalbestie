// Data-driven targeting — extract → analyze → recommend.
//
// Pulls Meta performance broken down by age+gender and by region over the last
// 30 days, finds the segments that convert cheapest (with a minimum-spend gate
// so a single lucky sale can't anoint a segment), and caches ONE recommended
// targeting spec in meta_targeting_reco. ads-create.js reads that cache when it
// builds a new ad set, so new campaigns target who actually converts instead of
// the flat "Pakistan / 18-45 / all genders" default.
//
// This touches no spend and creates nothing on Meta — it only reads insights
// and writes a recommendation row.
//
// Cron: 08:00 UTC Monday = weekly refresh (segment performance moves slowly).
//
//   GET /api/admin/ads-audience            → recompute, cache, return reco
//   GET /api/admin/ads-audience?days=60    → wider analysis window

import { getSettings, hasSupabase, json, requireAdmin, supabase } from "./_shared/supabase.js";
import {
  getInsightsBreakdown, hasMetaAds, normalizeInsightRow, searchAdGeoRegion,
} from "./_shared/meta-ads.js";

// Aggregate breakdown rows by a key function into { key, label, spend, purchases, value }.
function aggregate(rows, keyOf, labelOf) {
  const map = new Map();
  for (const r of rows) {
    const k = keyOf(r);
    if (k == null) continue;
    const n = normalizeInsightRow(r);
    const cur = map.get(k) || { key: k, label: labelOf(r), spend: 0, purchases: 0, value: 0 };
    cur.spend += n.spend;
    cur.purchases += n.purchases;
    cur.value += n.purchase_value;
    map.set(k, cur);
  }
  return [...map.values()].map((s) => ({
    ...s,
    cpa: s.purchases > 0 ? s.spend / s.purchases : Infinity,
    roas: s.spend > 0 ? s.value / s.spend : 0,
  }));
}

// A segment is trustworthy only if it spent enough to be a real signal AND
// actually converted. Cheapest CPA wins among those.
function rankSegments(segments, minSpend) {
  return segments
    .filter((s) => s.spend >= minSpend && s.purchases > 0)
    .sort((a, b) => a.cpa - b.cpa);
}

// Meta age breakdown values look like "25-34"; gender is "male"/"female"/"unknown".
function parseAgeRange(label) {
  const m = String(label || "").match(/(\d+)\s*-\s*(\d+|\+)?/);
  if (!m) return null;
  const min = Number(m[1]);
  const max = m[2] && m[2] !== "+" ? Number(m[2]) : 65;
  return Number.isFinite(min) ? { min, max } : null;
}

export default async (req) => {
  const url = new URL(req.url);
  const isScheduled =
    req.headers.get("x-netlify-functions-source") === "schedule" ||
    url.searchParams.get("scheduled") === "1";
  if (!isScheduled && !requireAdmin(req)) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasSupabase()) return json({ configured: false, reason: "supabase_not_configured" });

  // Cheap read: return the last cached recommendation without hitting Meta.
  // The portal uses this to display; only the explicit "refresh" recomputes.
  if (url.searchParams.get("cached") === "1") {
    try {
      const rows = await supabase("/rest/v1/meta_targeting_reco?id=eq.current&select=*");
      return json({ configured: hasMetaAds(), reco: rows?.[0] || null, cached: true });
    } catch {
      return json({ configured: hasMetaAds(), reco: null, cached: true });
    }
  }

  if (!hasMetaAds()) return json({ configured: false, reason: "meta_not_configured" });

  const days = Math.min(120, Math.max(7, Number(url.searchParams.get("days") || 30)));
  const datePreset = days <= 30 ? "last_30d" : days <= 60 ? "last_60d" : "last_90d";

  try {
    const settings = await getSettings();
    // Reuse the optimizer's learn-budget as the per-segment trust threshold.
    const minSpend = Number(settings.ads_learn_spend_pkr || 1000);

    const [ageGenderRows, regionRows] = await Promise.all([
      getInsightsBreakdown({ breakdowns: "age,gender", datePreset }),
      getInsightsBreakdown({ breakdowns: "region", datePreset }),
    ]);

    // ── Age + gender ──────────────────────────────────────────────────────
    const ageSegs = rankSegments(
      aggregate(ageGenderRows, (r) => r.age, (r) => r.age),
      minSpend
    );
    const genderSegs = rankSegments(
      aggregate(ageGenderRows, (r) => r.gender, (r) => r.gender),
      minSpend
    );

    // Recommended age band = span of the top-2 converting age buckets.
    let ageMin = 18, ageMax = 45;
    const topAges = ageSegs.slice(0, 2).map((s) => parseAgeRange(s.label)).filter(Boolean);
    if (topAges.length) {
      ageMin = Math.max(18, Math.min(...topAges.map((a) => a.min)));
      ageMax = Math.min(65, Math.max(...topAges.map((a) => a.max)));
    }

    // Gender: only narrow if one gender is clearly cheaper AND the other either
    // didn't qualify or costs materially more (>25% higher CPA).
    let genders = []; // [] = all
    if (genderSegs.length === 1) {
      const g = genderSegs[0].label;
      if (g === "male") genders = [1]; else if (g === "female") genders = [2];
    } else if (genderSegs.length >= 2) {
      const [best, second] = genderSegs;
      if (best.cpa * 1.25 < second.cpa) {
        if (best.label === "male") genders = [1]; else if (best.label === "female") genders = [2];
      }
    }

    // ── Region (province-level — Meta's finest insights geo) ──────────────
    const regionSegs = rankSegments(
      aggregate(regionRows, (r) => r.region, (r) => r.region),
      minSpend
    ).slice(0, 5);
    // Resolve names → targeting keys (best-effort; unresolved ones are dropped).
    const resolved = await Promise.all(
      regionSegs.map(async (s) => ({ seg: s, geo: await searchAdGeoRegion(s.label, "PK") }))
    );
    const regionKeys = [];
    const regionLabels = [];
    for (const { seg, geo } of resolved) {
      if (geo?.key) { regionKeys.push(geo.key); regionLabels.push(seg.label); }
    }

    // ── Confidence ────────────────────────────────────────────────────────
    const totalPurchases = aggregate(ageGenderRows, (r) => "all", () => "all")
      .reduce((s, x) => s + x.purchases, 0);
    const confidence = totalPurchases >= 25 && (ageSegs.length || genderSegs.length || regionKeys.length)
      ? "high"
      : totalPurchases > 0 ? "low" : "none";

    const reco = {
      id: "current",
      age_min: ageMin,
      age_max: ageMax,
      genders,
      region_keys: regionKeys,
      region_labels: regionLabels,
      confidence,
      basis: {
        window_days: days,
        min_segment_spend_pkr: minSpend,
        total_purchases: totalPurchases,
        top_ages: ageSegs.slice(0, 3).map((s) => ({ seg: s.label, cpa: Math.round(s.cpa), purchases: s.purchases })),
        top_genders: genderSegs.map((s) => ({ seg: s.label, cpa: Math.round(s.cpa), purchases: s.purchases })),
        top_regions: regionSegs.map((s) => ({ seg: s.label, cpa: Math.round(s.cpa), purchases: s.purchases })),
      },
      window_days: days,
      computed_at: new Date().toISOString(),
    };

    await supabase("/rest/v1/meta_targeting_reco?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(reco),
    });

    return json({ configured: true, reco });
  } catch (error) {
    return json({ error: error.message, meta: error.metaError || null }, { status: 502 });
  }
};

export const config = {
  path: "/api/admin/ads-audience",
  schedule: "0 8 * * 1",
};
