// Meta (Facebook/Instagram) Marketing API helper. Wraps the Graph API so the
// ads-*.js functions can create campaigns, manage budgets, and pull insights
// without each repeating auth/URL plumbing — same shape as _shared/supabase.js.
//
// Auth uses a long-lived **System User access token** (server-to-server), never
// a personal login. Generate it in Meta Business Settings → System Users →
// Generate Token with `ads_management`, `ads_read`, `business_management`.
//
// Environment:
//   META_SYSTEM_USER_TOKEN   required — the system-user access token
//   META_AD_ACCOUNT_ID       required — numeric ad account id (no `act_`)
//   META_PAGE_ID             required — Facebook Page the ads post as
//   META_PIXEL_ID            optional — for conversion-optimized ad sets
//   META_INSTAGRAM_ACTOR_ID  optional — IG account id for IG placements
//   META_GRAPH_VERSION       optional — defaults to v21.0
//   META_CURRENCY_MINOR_UNITS optional — minor units per major currency unit
//                            for budget fields. Meta expects budgets in the
//                            account currency's minor unit (e.g. cents).
//                            Defaults to 100. Verify for your ad account's
//                            currency before enabling live spend.
//
// Every operation returns plain data or throws; callers decide how to surface
// errors. Read operations (insights) never mutate. Money-moving operations
// (create/launch/budget) are only reached from gated/guardrailed callers.

function env(name) {
  return globalThis.Netlify?.env?.get(name) || "";
}

export function hasMetaAds() {
  return Boolean(
    env("META_SYSTEM_USER_TOKEN") &&
      env("META_AD_ACCOUNT_ID") &&
      env("META_PAGE_ID")
  );
}

function graphVersion() {
  return env("META_GRAPH_VERSION") || "v21.0";
}

function adAccountPath() {
  return `act_${env("META_AD_ACCOUNT_ID")}`;
}

// Minor-unit multiplier for budget fields. PKR budgets are entered as whole
// rupees in the portal; Meta wants the minor unit. Configurable per account.
export function toMinorUnits(majorAmount) {
  const mult = Number(env("META_CURRENCY_MINOR_UNITS") || 100);
  return Math.round(Number(majorAmount || 0) * mult);
}

export function fromMinorUnits(minorAmount) {
  const mult = Number(env("META_CURRENCY_MINOR_UNITS") || 100);
  return Number(minorAmount || 0) / mult;
}

// Core Graph fetch. `path` is relative to the graph host (e.g. `/act_x/insights`
// or `/{id}`). GET params go in `params`; POST bodies in `body` (form-encoded,
// which is what the Marketing API expects). Token is injected automatically.
export async function metaGraph(path, { method = "GET", params = {}, body } = {}) {
  const token = env("META_SYSTEM_USER_TOKEN");
  if (!token) throw new Error("META_SYSTEM_USER_TOKEN is not configured.");

  const url = new URL(`https://graph.facebook.com/${graphVersion()}${path}`);
  url.searchParams.set("access_token", token);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    url.searchParams.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  }

  const init = { method, signal: AbortSignal.timeout(20000) };
  if (method !== "GET" && body) {
    // Marketing API write endpoints take application/x-www-form-urlencoded.
    // Object values must be JSON-stringified before encoding.
    const form = new URLSearchParams();
    for (const [k, v] of Object.entries(body)) {
      if (v === undefined || v === null) continue;
      form.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
    }
    init.body = form;
    init.headers = { "Content-Type": "application/x-www-form-urlencoded" };
  }

  const response = await fetch(url, init);
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    const apiErr = data?.error?.message || text || `Meta API ${response.status}`;
    const err = new Error(apiErr);
    err.metaError = data?.error || null;
    err.status = response.status;
    throw err;
  }
  return data;
}

// ── Insights (Phase 1, read-only) ──────────────────────────────────────────
// Pull performance at a given level. `datePreset` like 'yesterday',
// 'last_7d', 'last_30d'. timeIncrement=1 returns one row per day.
export async function getInsights({ level = "campaign", datePreset = "last_7d", timeIncrement, extraFields = [] } = {}) {
  const fields = [
    "account_id", "campaign_id", "campaign_name",
    "adset_id", "adset_name", "ad_id", "ad_name",
    "spend", "impressions", "clicks", "ctr", "cpc", "cpm",
    "actions", "action_values",
    ...extraFields,
  ];
  const params = {
    level,
    date_preset: datePreset,
    fields: fields.join(","),
    limit: 500,
  };
  if (timeIncrement) params.time_increment = timeIncrement;

  const out = [];
  let path = `/${adAccountPath()}/insights`;
  let pageParams = params;
  // Follow cursor pagination until exhausted.
  // (Graph returns paging.next as a full URL; we re-issue via the same helper.)
  let guard = 0;
  while (path && guard < 20) {
    const page = await metaGraph(path, { params: pageParams });
    if (Array.isArray(page?.data)) out.push(...page.data);
    const next = page?.paging?.cursors?.after;
    if (next && page?.data?.length) {
      pageParams = { ...params, after: next };
      guard += 1;
    } else {
      path = null;
    }
  }
  return out;
}

// ── Audience breakdowns (Phase: data-driven targeting) ─────────────────────
// Same insights pull but sliced by a breakdown dimension (e.g. "age,gender" or
// "region"). Each returned row carries the breakdown keys plus the usual
// spend/actions, so normalizeInsightRow() works on it unchanged. Account-level
// so it reflects everything that's run, not one campaign.
export async function getInsightsBreakdown({ breakdowns, datePreset = "last_30d" } = {}) {
  const params = {
    level: "account",
    date_preset: datePreset,
    breakdowns,
    fields: ["spend", "impressions", "clicks", "actions", "action_values"].join(","),
    limit: 500,
  };
  const out = [];
  let pageParams = params;
  let guard = 0;
  let more = true;
  while (more && guard < 20) {
    const page = await metaGraph(`/${adAccountPath()}/insights`, { params: pageParams });
    if (Array.isArray(page?.data)) out.push(...page.data);
    const after = page?.paging?.cursors?.after;
    if (after && page?.data?.length) { pageParams = { ...params, after }; guard += 1; }
    else more = false;
  }
  return out;
}

// Resolve a region NAME (as reported in insights breakdowns, e.g. "Sindh") to
// the adgeolocation `key` that targeting requires. Scoped to one country so
// "Punjab, PK" doesn't match "Punjab, IN". Returns { key, name } or null.
export async function searchAdGeoRegion(query, countryCode = "PK") {
  if (!query) return null;
  try {
    const data = await metaGraph("/search", {
      params: {
        type: "adgeolocation",
        location_types: ["region"],
        country_code: countryCode,
        q: query,
        limit: 5,
      },
    });
    const hit = (data?.data || []).find((r) => r.country_code === countryCode) || data?.data?.[0];
    return hit ? { key: String(hit.key), name: hit.name } : null;
  } catch {
    return null; // geo search is best-effort — caller falls back to country
  }
}

// Normalize a raw insights row into the numbers the snapshot table stores.
// Meta nests conversions inside `actions`/`action_values` arrays keyed by
// action_type — we pull purchases + value out of those.
export function normalizeInsightRow(row) {
  const num = (v) => Number(v || 0);
  const findAction = (arr, type) =>
    num((arr || []).find((a) => a.action_type === type)?.value);

  const purchases =
    findAction(row.actions, "purchase") ||
    findAction(row.actions, "omni_purchase") ||
    findAction(row.actions, "offsite_conversion.fb_pixel_purchase");
  const purchaseValue =
    findAction(row.action_values, "purchase") ||
    findAction(row.action_values, "omni_purchase") ||
    findAction(row.action_values, "offsite_conversion.fb_pixel_purchase");
  const leads =
    findAction(row.actions, "lead") + findAction(row.actions, "onsite_conversion.lead_grouped");

  const spend = num(row.spend);
  return {
    spend,
    impressions: num(row.impressions),
    clicks: num(row.clicks),
    ctr: num(row.ctr),
    cpc: num(row.cpc),
    cpm: num(row.cpm),
    purchases,
    purchase_value: purchaseValue,
    leads,
    roas: spend > 0 ? Number((purchaseValue / spend).toFixed(4)) : 0,
    cpa: purchases > 0 ? Number((spend / purchases).toFixed(2)) : 0,
  };
}

// ── Creation (Phase 3) — every object is created PAUSED ────────────────────
export async function createCampaign({ name, objective = "OUTCOME_SALES" }) {
  return metaGraph(`/${adAccountPath()}/campaigns`, {
    method: "POST",
    body: {
      name,
      objective,
      status: "PAUSED",
      special_ad_categories: [],
    },
  });
}

// Which Meta placements ads run on. Defaults to Instagram-only — set
// META_PUBLISHER_PLATFORMS (comma-separated: instagram,facebook,...) to widen.
// Setting publisher_platforms disables Advantage+ automatic placements, which
// is exactly what "Instagram-only" requires (otherwise ads also run on FB).
function publisherPlatforms() {
  const raw = env("META_PUBLISHER_PLATFORMS");
  const list = (raw || "instagram").split(",").map((s) => s.trim()).filter(Boolean);
  return list.length ? list : ["instagram"];
}

// Targeting defaults to Pakistan, broad age, all genders — callers override.
export async function createAdSet({
  name, campaignId, dailyBudgetPkr, targeting, optimizationGoal,
  billingEvent = "IMPRESSIONS",
}) {
  const pixelId = env("META_PIXEL_ID");
  const goal = optimizationGoal || (pixelId ? "OFFSITE_CONVERSIONS" : "LINK_CLICKS");
  // Merge placement restriction into whatever targeting we use (explicit
  // override or the broad default) so the platform lock always applies.
  const baseTargeting = targeting || {
    geo_locations: { countries: ["PK"] },
    age_min: 18,
    age_max: 45,
  };
  const finalTargeting = { ...baseTargeting, publisher_platforms: publisherPlatforms() };
  const body = {
    name,
    campaign_id: campaignId,
    daily_budget: toMinorUnits(dailyBudgetPkr),
    billing_event: billingEvent,
    optimization_goal: goal,
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    status: "PAUSED",
    targeting: finalTargeting,
    start_time: new Date(Date.now() + 5 * 60_000).toISOString(),
  };
  if (pixelId && goal === "OFFSITE_CONVERSIONS") {
    body.promoted_object = { pixel_id: pixelId, custom_event_type: "PURCHASE" };
  }
  return metaGraph(`/${adAccountPath()}/adsets`, { method: "POST", body });
}

// Build the creative from a Page post spec. Uses an image URL (`picture`) so we
// don't need a separate image-hash upload step; works with Supabase-hosted art.
export async function createAdCreative({ name, message, headline, description, link, imageUrl, ctaType = "SHOP_NOW" }) {
  const linkData = {
    link,
    message,
    name: headline,
    description,
    picture: imageUrl,
    call_to_action: { type: ctaType, value: { link } },
  };
  const objectStorySpec = {
    page_id: env("META_PAGE_ID"),
    link_data: linkData,
  };
  const igActor = env("META_INSTAGRAM_ACTOR_ID");
  if (igActor) objectStorySpec.instagram_actor_id = igActor;

  return metaGraph(`/${adAccountPath()}/adcreatives`, {
    method: "POST",
    body: { name: name || headline, object_story_spec: objectStorySpec },
  });
}

export async function createAd({ name, adsetId, creativeId }) {
  return metaGraph(`/${adAccountPath()}/ads`, {
    method: "POST",
    body: {
      name,
      adset_id: adsetId,
      creative: { creative_id: creativeId },
      status: "PAUSED",
    },
  });
}

// ── Mutation (Phase 4) ─────────────────────────────────────────────────────
export async function setEntityStatus(entityId, status) {
  // status: 'ACTIVE' | 'PAUSED'
  return metaGraph(`/${entityId}`, { method: "POST", body: { status } });
}

export async function setAdSetDailyBudget(adsetId, dailyBudgetPkr) {
  return metaGraph(`/${adsetId}`, {
    method: "POST",
    body: { daily_budget: toMinorUnits(dailyBudgetPkr) },
  });
}

// CBO campaigns hold the daily budget on the campaign object itself (ad sets
// under them have none) — same POST shape as the ad-set version.
export async function setCampaignDailyBudget(campaignId, dailyBudgetPkr) {
  return metaGraph(`/${campaignId}`, {
    method: "POST",
    body: { daily_budget: toMinorUnits(dailyBudgetPkr) },
  });
}

// ── Campaign inventory (oversight) ─────────────────────────────────────────
// Every campaign on the ad account — including ones created directly in Ads
// Manager, which the local meta_ad_campaigns table knows nothing about. The
// nested adsets edge tells us where the budget lives: on the campaign (CBO)
// or on its ad sets.
export async function listAccountCampaigns() {
  const data = await metaGraph(`/${adAccountPath()}/campaigns`, {
    params: {
      fields: "id,name,objective,status,effective_status,daily_budget,lifetime_budget,created_time,updated_time,adsets.limit(5){id,name,daily_budget,effective_status}",
      limit: 100,
    },
  });
  return data?.data || [];
}

// Read current daily budget (in PKR major units) for guardrail checks.
export async function getAdSetBudget(adsetId) {
  const data = await metaGraph(`/${adsetId}`, { params: { fields: "daily_budget,name,effective_status" } });
  return {
    name: data?.name,
    effectiveStatus: data?.effective_status,
    dailyBudgetPkr: fromMinorUnits(data?.daily_budget),
  };
}
