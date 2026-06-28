// Phase 3 — campaign creation with a human approval gate.
//
// The bot (or operator) builds a full campaign → ad set → ad on Meta, but
// ALWAYS in PAUSED state. It lands locally as approval_state='built'. Nothing
// spends until a human calls `launch`, which is the only path that flips the
// objects to ACTIVE. `undo` re-pauses. This mirrors the Advance/Undo pattern
// the portal OMS already uses for orders.
//
//   GET  /api/admin/ads-create                          → list built/launched
//   POST /api/admin/ads-create {action:'build', ...}    → create (PAUSED)
//   POST /api/admin/ads-create {action:'launch', id, approved_by} → go live
//   POST /api/admin/ads-create {action:'undo', id}      → re-pause a launch
//   POST /api/admin/ads-create {action:'reject', id}    → mark rejected
//
// Guardrail: a build's daily budget is clamped to store_settings
// ads_max_daily_budget_pkr so a typo can't queue a runaway-spend campaign.

import { getSettings, hasSupabase, json, requireAdmin, supabase } from "./_shared/supabase.js";
import {
  createAd, createAdCreative, createAdSet, createCampaign,
  hasMetaAds, setAdSetDailyBudget, setEntityStatus,
} from "./_shared/meta-ads.js";

const SITE_ORIGIN = () => globalThis.Netlify?.env?.get("PUBLIC_SITE_ORIGIN") || "https://globalbestie.com";

// Resolve a creative's destination into an absolute URL Meta will accept.
function absoluteUrl(dest) {
  if (!dest) return SITE_ORIGIN();
  if (/^https?:\/\//i.test(dest)) return dest;
  return `${SITE_ORIGIN()}${dest.startsWith("/") ? "" : "/"}${dest}`;
}

async function loadCampaign(id) {
  const rows = await supabase(`/rest/v1/meta_ad_campaigns?id=eq.${encodeURIComponent(id)}&select=*`);
  return rows?.[0] || null;
}

// Decide the ad set's targeting. An explicit override always wins. Otherwise we
// use the cached data-driven recommendation (meta_targeting_reco, produced by
// ads-audience.js) when it's confident — narrowing to the age/gender/regions
// that actually convert. When there's no confident recommendation we fall back
// to the broad default inside createAdSet (PK / 18-45 / all genders).
async function resolveTargeting(explicit) {
  if (explicit) return { targeting: explicit, note: "Targeting: manual override." };
  let reco = null;
  try {
    const rows = await supabase("/rest/v1/meta_targeting_reco?id=eq.current&select=*");
    reco = rows?.[0] || null;
  } catch { /* table not migrated yet — fall back to broad */ }
  if (!reco || reco.confidence === "none") {
    return { targeting: undefined, note: "Targeting: broad default (no audience data yet)." };
  }
  const targeting = {
    geo_locations: (reco.region_keys || []).length
      ? { regions: reco.region_keys.map((key) => ({ key })) }
      : { countries: ["PK"] },
    age_min: reco.age_min || 18,
    age_max: reco.age_max || 45,
  };
  if ((reco.genders || []).length) targeting.genders = reco.genders;
  const geoLabel = (reco.region_labels || []).length ? reco.region_labels.join(", ") : "Pakistan";
  const genderLabel = targeting.genders ? (targeting.genders[0] === 2 ? "women" : "men") : "all";
  return {
    targeting,
    note: `Targeting (${reco.confidence}-confidence, data-driven): ${geoLabel}, age ${targeting.age_min}-${targeting.age_max}, ${genderLabel}.`,
  };
}

async function logAction(entry) {
  await supabase("/rest/v1/meta_ad_actions", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ ...entry, created_at: new Date().toISOString() }),
  }).catch(() => {});
}

export default async (req) => {
  if (!requireAdmin(req)) return json({ error: "Unauthorized" }, { status: 401 });

  try {
    if (req.method === "GET") {
      if (!hasSupabase()) return json({ campaigns: [], configured: false });
      const campaigns = await supabase(
        "/rest/v1/meta_ad_campaigns?select=*&order=created_at.desc&limit=100"
      );
      return json({ campaigns, configured: true });
    }

    if (req.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

    const { action, ...rest } = await req.json();
    const settings = await getSettings();

    // ── BUILD — create the whole stack PAUSED on Meta, mirror locally ───────
    if (action === "build") {
      const creativeId = rest.creative_ref;
      if (!creativeId) return json({ error: "creative_ref is required." }, { status: 400 });
      if (!hasSupabase()) return json({ error: "Supabase not configured." }, { status: 400 });

      const creRows = await supabase(`/rest/v1/meta_ad_creatives?id=eq.${encodeURIComponent(creativeId)}&select=*`);
      const creative = creRows?.[0];
      if (!creative) return json({ error: "Creative not found." }, { status: 404 });

      // Guardrail: clamp the daily budget to the configured ceiling.
      const cap = Number(settings.ads_max_daily_budget_pkr || 5000);
      const requested = Number(rest.daily_budget_pkr || cap);
      const dailyBudget = Math.min(requested, cap);

      const localId = `GB-AD-${Date.now()}`;
      const name = rest.name || `${creative.headline}`.slice(0, 60);

      // Data-driven targeting: use the cached audience recommendation unless the
      // caller passed an explicit targeting override.
      const { targeting, note: targetingNote } = await resolveTargeting(rest.targeting);

      // If Meta isn't configured, still record the intent locally so the queue
      // works in dev — just without Meta ids.
      let metaIds = {};
      if (hasMetaAds()) {
        const campaign = await createCampaign({ name, objective: rest.objective || "OUTCOME_SALES" });
        const adset = await createAdSet({
          name: `${name} — adset`,
          campaignId: campaign.id,
          dailyBudgetPkr: dailyBudget,
          targeting,
        });
        const adCreative = await createAdCreative({
          name: creative.headline,
          message: creative.primary_text,
          headline: creative.headline,
          description: creative.description,
          link: absoluteUrl(creative.destination_url),
          imageUrl: creative.image_url,
          ctaType: creative.cta_type,
        });
        const ad = await createAd({ name: `${name} — ad`, adsetId: adset.id, creativeId: adCreative.id });
        metaIds = {
          meta_campaign_id: campaign.id,
          meta_adset_id: adset.id,
          meta_creative_id: adCreative.id,
          meta_ad_id: ad.id,
        };
      }

      const row = {
        id: localId,
        ...metaIds,
        name,
        objective: rest.objective || "OUTCOME_SALES",
        product_id: creative.product_id || null,
        creative_ref: creativeId,
        daily_budget_pkr: dailyBudget,
        targeting: targeting || null,
        approval_state: "built",
        effective_status: "PAUSED",
        created_by: rest.created_by || "bot",
        notes: [
          requested > cap ? `Budget clamped from ${requested} to cap ${cap}.` : null,
          targetingNote,
        ].filter(Boolean).join(" "),
        updated_at: new Date().toISOString(),
      };
      const [saved] = await supabase("/rest/v1/meta_ad_campaigns?on_conflict=id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify(row),
      });
      // Mark the creative as in-use so it isn't queued twice.
      await supabase(`/rest/v1/meta_ad_creatives?id=eq.${encodeURIComponent(creativeId)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ status: "in_use", updated_at: new Date().toISOString() }),
      }).catch(() => {});

      return json({ campaign: saved, configured: hasMetaAds(), clamped: requested > cap });
    }

    // ── LAUNCH — the human gate. Flip campaign + adset + ad to ACTIVE. ──────
    if (action === "launch") {
      if (!rest.id) return json({ error: "id is required." }, { status: 400 });
      if (!hasSupabase()) return json({ error: "Supabase not configured." }, { status: 400 });
      const c = await loadCampaign(rest.id);
      if (!c) return json({ error: "Campaign not found." }, { status: 404 });
      if (c.approval_state === "launched") return json({ campaign: c, already: true });

      if (hasMetaAds() && c.meta_campaign_id) {
        // Order matters: parent first, then children, so nothing is active
        // under a paused parent mid-flip.
        await setEntityStatus(c.meta_campaign_id, "ACTIVE");
        if (c.meta_adset_id) await setEntityStatus(c.meta_adset_id, "ACTIVE");
        if (c.meta_ad_id) await setEntityStatus(c.meta_ad_id, "ACTIVE");
      }

      const [saved] = await supabase(`/rest/v1/meta_ad_campaigns?id=eq.${encodeURIComponent(rest.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          approval_state: "launched",
          effective_status: "ACTIVE",
          launched_at: new Date().toISOString(),
          approved_by: rest.approved_by || "operator",
          updated_at: new Date().toISOString(),
        }),
      });
      await logAction({
        action: "launch", level: "campaign",
        entity_id: c.meta_campaign_id || c.id, entity_name: c.name,
        campaign_local_id: c.id, reason: "operator_launch",
        field: "status", value_before: "PAUSED", value_after: "ACTIVE",
        performed_by: rest.approved_by || "operator", dry_run: !hasMetaAds(),
      });
      return json({ campaign: saved, configured: hasMetaAds() });
    }

    // ── UNDO — re-pause a launched campaign ────────────────────────────────
    if (action === "undo") {
      if (!rest.id) return json({ error: "id is required." }, { status: 400 });
      const c = await loadCampaign(rest.id);
      if (!c) return json({ error: "Campaign not found." }, { status: 404 });

      if (hasMetaAds() && c.meta_campaign_id) {
        await setEntityStatus(c.meta_campaign_id, "PAUSED");
      }
      const [saved] = await supabase(`/rest/v1/meta_ad_campaigns?id=eq.${encodeURIComponent(rest.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          approval_state: "paused",
          effective_status: "PAUSED",
          updated_at: new Date().toISOString(),
        }),
      });
      await logAction({
        action: "pause", level: "campaign",
        entity_id: c.meta_campaign_id || c.id, entity_name: c.name,
        campaign_local_id: c.id, reason: "operator_undo",
        field: "status", value_before: "ACTIVE", value_after: "PAUSED",
        performed_by: rest.performed_by || "operator", dry_run: !hasMetaAds(),
      });
      return json({ campaign: saved, configured: hasMetaAds() });
    }

    // ── SET_BUDGET — operator changes a campaign's daily budget ────────────
    // Clamped to the same guardrail ceiling as build, so a UI typo can't blow
    // the cap. Updates Meta's ad set + the local mirror, and logs the change.
    if (action === "set_budget") {
      if (!rest.id) return json({ error: "id is required." }, { status: 400 });
      const c = await loadCampaign(rest.id);
      if (!c) return json({ error: "Campaign not found." }, { status: 404 });
      const cap = Number(settings.ads_max_daily_budget_pkr || 5000);
      const requested = Number(rest.daily_budget_pkr || 0);
      if (!(requested > 0)) return json({ error: "A positive daily budget is required." }, { status: 400 });
      const nextBudget = Math.min(requested, cap);
      const before = Number(c.daily_budget_pkr || 0);

      if (hasMetaAds() && c.meta_adset_id) {
        await setAdSetDailyBudget(c.meta_adset_id, nextBudget);
      }
      const [saved] = await supabase(`/rest/v1/meta_ad_campaigns?id=eq.${encodeURIComponent(rest.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ daily_budget_pkr: nextBudget, updated_at: new Date().toISOString() }),
      });
      await logAction({
        action: nextBudget >= before ? "scale_budget" : "reduce_budget", level: "adset",
        entity_id: c.meta_adset_id || c.id, entity_name: c.name,
        campaign_local_id: c.id, reason: "operator_set_budget",
        field: "daily_budget", value_before: String(before), value_after: String(nextBudget),
        performed_by: rest.performed_by || "operator", dry_run: !hasMetaAds(),
      });
      return json({ campaign: saved, clamped: requested > cap, configured: hasMetaAds() });
    }

    // ── RESUME — re-activate a paused campaign ─────────────────────────────
    if (action === "resume") {
      if (!rest.id) return json({ error: "id is required." }, { status: 400 });
      const c = await loadCampaign(rest.id);
      if (!c) return json({ error: "Campaign not found." }, { status: 404 });
      if (hasMetaAds() && c.meta_campaign_id) {
        await setEntityStatus(c.meta_campaign_id, "ACTIVE");
        if (c.meta_adset_id) await setEntityStatus(c.meta_adset_id, "ACTIVE");
        if (c.meta_ad_id) await setEntityStatus(c.meta_ad_id, "ACTIVE");
      }
      const [saved] = await supabase(`/rest/v1/meta_ad_campaigns?id=eq.${encodeURIComponent(rest.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          approval_state: "launched", effective_status: "ACTIVE", updated_at: new Date().toISOString(),
        }),
      });
      await logAction({
        action: "resume", level: "campaign",
        entity_id: c.meta_campaign_id || c.id, entity_name: c.name,
        campaign_local_id: c.id, reason: "operator_resume",
        field: "status", value_before: "PAUSED", value_after: "ACTIVE",
        performed_by: rest.performed_by || "operator", dry_run: !hasMetaAds(),
      });
      return json({ campaign: saved, configured: hasMetaAds() });
    }

    // ── REJECT — discard a built campaign without launching ────────────────
    if (action === "reject") {
      if (!rest.id) return json({ error: "id is required." }, { status: 400 });
      const c = await loadCampaign(rest.id);
      if (!c) return json({ error: "Campaign not found." }, { status: 404 });
      // Built campaigns are already PAUSED on Meta; nothing to flip.
      const [saved] = await supabase(`/rest/v1/meta_ad_campaigns?id=eq.${encodeURIComponent(rest.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ approval_state: "rejected", updated_at: new Date().toISOString() }),
      });
      return json({ campaign: saved });
    }

    return json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return json({ error: error.message, meta: error.metaError || null }, { status: 502 });
  }
};

export const config = {
  path: "/api/admin/ads-create",
};
