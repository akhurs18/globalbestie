// Bulk WhatsApp broadcast. Picks a template, applies a customer-segment
// filter, fires individually-interpolated messages to every matching
// customer (respecting opt-out), and returns send-count stats.
//
// Endpoints:
//   GET  /api/admin/broadcast?<filters>   → recipient preview (no send)
//   POST /api/admin/broadcast             → fire the broadcast
//
// POST body shape:
//   {
//     template_id?: "tmpl-…"    // pick from whatsapp_templates
//     body_override?: string    // OR provide raw body with {{placeholders}}
//     filters: {
//       city?: string,
//       tag?: string,
//       last_order_days?: number,    // ordered within last N days
//       min_orders?: number,
//       min_revenue?: number,
//     },
//     dry_run?: boolean         // count only, don't send
//   }

import { hasSupabase, json, requireAdmin, supabase } from "./_shared/supabase.js";
import { sendWhatsappMessage, interpolate } from "./_shared/whatsapp.js";
import { isValidPkMobile } from "./_shared/phone.js";

// ─── Broadcast idempotency ───
// Same template + filters combo from the same token within 60 s returns the
// previous result instead of re-running. Cheap insurance against a frantic
// double-click during a busy day.
const broadcastIdempotency = new Map(); // hash → { result, at }
const IDEMPOTENCY_WINDOW_MS = 60_000;

function broadcastHash(token, payload) {
  return JSON.stringify({
    t: (token || "anon").slice(-12),
    tpl: payload.template_id || "",
    body: payload.body_override || "",
    f: payload.filters || {},
  });
}

function rememberBroadcast(hash, result) {
  broadcastIdempotency.set(hash, { result, at: Date.now() });
  for (const [k, v] of broadcastIdempotency) {
    if (Date.now() - v.at > IDEMPOTENCY_WINDOW_MS) broadcastIdempotency.delete(k);
  }
}

// ─── Per-token broadcast rate limit ───
// Lives in memory per function instance — fine as a soft brake; a determined
// operator across multiple instances could double-up. Tightens at:
//   • one broadcast every 30 s
//   • five broadcasts per hour
const broadcastHistory = new Map(); // token → [timestamps]
const MIN_INTERVAL_MS = 30_000;
const HOUR_CAP = 5;
const HOUR_MS = 60 * 60 * 1000;

function checkRateLimit(req) {
  const token = (req.headers.get("authorization") || "anon").slice(-32);
  const now = Date.now();
  const history = (broadcastHistory.get(token) || []).filter((t) => now - t < HOUR_MS);
  if (history.length && now - history[history.length - 1] < MIN_INTERVAL_MS) {
    return { ok: false, reason: "too_soon", wait_seconds: Math.ceil((MIN_INTERVAL_MS - (now - history[history.length - 1])) / 1000) };
  }
  if (history.length >= HOUR_CAP) {
    return { ok: false, reason: "hourly_cap", retry_after_minutes: Math.ceil((HOUR_MS - (now - history[0])) / 60_000) };
  }
  history.push(now);
  broadcastHistory.set(token, history);
  return { ok: true };
}

// ─── Per-recipient daily cap ───
// Returns a Set of canonical phones that have received ≥3 outbound messages
// in the past 24 hours. We skip these in the broadcast send so the team
// doesn't accidentally over-message anyone.
async function loadOverMessagedPhones() {
  if (!hasSupabase()) return new Set();
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const rows = await supabase(
      `/rest/v1/marketing_messages?direction=eq.outbound&created_at=gte.${encodeURIComponent(since)}&select=customer_phone&customer_phone=not.is.null`,
    );
    const counts = new Map();
    for (const row of rows || []) {
      if (!row.customer_phone) continue;
      counts.set(row.customer_phone, (counts.get(row.customer_phone) || 0) + 1);
    }
    const blocked = new Set();
    for (const [phone, n] of counts) {
      if (n >= 3) blocked.add(phone);
    }
    return blocked;
  } catch {
    return new Set();
  }
}

function parseFilters(src = {}) {
  return {
    city: String(src.city || "").trim().toLowerCase(),
    tag: String(src.tag || "").trim(),
    last_order_days: Number(src.last_order_days || 0),
    min_orders: Number(src.min_orders || 0),
    min_revenue: Number(src.min_revenue || 0),
    // Explicit phone allowlist — used by the bulk-order WhatsApp-send
    // flow ("send template to the 5 orders I've selected"). When this is
    // populated all other filters become non-restrictive.
    phones: Array.isArray(src.phones) ? src.phones.map((p) => String(p).replace(/\D/g, "")).filter(Boolean) : [],
  };
}

function matches(customer, f) {
  if (!customer) return false;
  // Opt-out filter is skipped only by the post-send "what would have been
  // sent if everyone opted in" pass — used to count skipped_opt_out.
  if (!f._ignoreOptOut && customer.whatsapp_opt_in === false) return false;
  if (!isValidPkMobile(customer.phone)) return false;
  // Explicit-phone path short-circuits all other filters.
  if (f.phones && f.phones.length) {
    return f.phones.includes(String(customer.phone || "").replace(/\D/g, ""));
  }
  if (f.city && String(customer.city || "").toLowerCase() !== f.city) return false;
  if (f.min_orders && Number(customer.total_orders || 0) < f.min_orders) return false;
  if (f.min_revenue && Number(customer.total_revenue_pkr || 0) < f.min_revenue) return false;
  if (f.tag) {
    const tags = Array.isArray(customer.tags) ? customer.tags : [];
    if (!tags.some((t) => String(t).toLowerCase() === f.tag.toLowerCase())) return false;
  }
  if (f.last_order_days > 0) {
    const ls = customer.last_seen ? new Date(customer.last_seen).getTime() : 0;
    const cutoff = Date.now() - f.last_order_days * 86_400_000;
    if (!ls || ls < cutoff) return false;
  }
  return true;
}

async function loadRecipients(filters) {
  if (!hasSupabase()) return [];
  const all = await supabase("/rest/v1/customers?select=phone,name,city,total_orders,total_revenue_pkr,tags,whatsapp_opt_in,last_seen&order=last_seen.desc");
  const list = (all || []).filter((c) => matches(c, filters));
  // Explicit-phone path: if any of the supplied phones aren't in the
  // customers table yet (new lead, brand-new order) we still want to
  // send to them. Synthesize a minimal customer row for each missing.
  if (filters.phones && filters.phones.length) {
    const seen = new Set(list.map((c) => String(c.phone || "").replace(/\D/g, "")));
    for (const phone of filters.phones) {
      if (!seen.has(phone) && isValidPkMobile(phone)) {
        list.push({ phone, name: "", city: "", whatsapp_opt_in: true });
      }
    }
  }
  return list;
}

async function resolveTemplate({ template_id, body_override }) {
  if (body_override) return { id: "custom", name: "Custom", body: String(body_override) };
  if (!template_id) return null;
  if (!hasSupabase()) return null;
  const rows = await supabase(`/rest/v1/whatsapp_templates?id=eq.${encodeURIComponent(template_id)}&select=*`);
  return rows?.[0] || null;
}

function interpolateForCustomer(body, customer) {
  return interpolate(body, {
    name: (customer.name || "").split(" ")[0] || "there",
    full_name: customer.name || "",
    city: customer.city || "",
    total: Number(customer.total_revenue_pkr || 0).toLocaleString(),
    order_id: "your order",
    advance: "—",
    balance: "—",
    eta: "—",
    tracking: "—",
  });
}

export default async (req) => {
  if (!(await requireAdmin(req))) return json({ error: "Unauthorized" }, { status: 401 });

  try {
    if (req.method === "GET") {
      const url = new URL(req.url);
      const f = parseFilters(Object.fromEntries(url.searchParams.entries()));
      const recipients = await loadRecipients(f);
      return json({
        count: recipients.length,
        sample: recipients.slice(0, 12).map((c) => ({
          phone: c.phone,
          name: c.name,
          city: c.city,
          total_orders: c.total_orders,
          total_revenue_pkr: c.total_revenue_pkr,
        })),
      });
    }

    if (req.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

    const payload = await req.json();
    const template = await resolveTemplate(payload);
    if (!template) {
      return json({ error: "Provide template_id or body_override." }, { status: 400 });
    }
    const f = parseFilters(payload.filters || {});
    const recipients = await loadRecipients(f);

    if (payload.dry_run) {
      return json({
        ok: true,
        dry_run: true,
        count: recipients.length,
        template: { id: template.id, name: template.name },
      });
    }

    // ─── Scheduled send branch ───
    // If send_at is present and in the future, persist a `scheduled_broadcasts`
    // row instead of sending now. The 5-minute cron picks it up.
    const sendAt = payload.send_at ? new Date(payload.send_at) : null;
    if (sendAt && !Number.isNaN(sendAt.getTime()) && sendAt.getTime() > Date.now() + 30_000) {
      if (!hasSupabase()) {
        return json({ error: "Scheduling requires Supabase to be configured." }, { status: 400 });
      }
      const id = `sched-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
      await supabase("/rest/v1/scheduled_broadcasts", {
        method: "POST",
        body: JSON.stringify({
          id,
          template_id: template.id,
          body_override: payload.body_override || null,
          filters: payload.filters || {},
          send_at: sendAt.toISOString(),
          recipient_count: recipients.length,
          status: "pending",
        }),
      });
      return json({
        ok: true,
        scheduled: true,
        id,
        send_at: sendAt.toISOString(),
        recipient_count: recipients.length,
        template: { id: template.id, name: template.name },
      });
    }

    // ─── Idempotency: dedupe a re-submit of the same broadcast within 60 s ───
    const idemHash = broadcastHash(req.headers.get("authorization") || "anon", payload);
    const cached = broadcastIdempotency.get(idemHash);
    if (cached && Date.now() - cached.at < IDEMPOTENCY_WINDOW_MS) {
      return json({ ...cached.result, idempotent_replay: true });
    }

    // Rate limit BEFORE we start hitting Maychats so a too-fast send aborts
    // cheaply.
    const rate = checkRateLimit(req);
    if (!rate.ok) {
      return json({ error: "rate_limited", ...rate }, { status: 429 });
    }

    // Send. We cap a single broadcast at 200 recipients to stay well under
    // Maychats' burst limits; the UI will warn before the team submits a
    // segment larger than this.
    const HARD_CAP = 200;
    const overMessaged = await loadOverMessagedPhones();
    const targets = recipients.slice(0, HARD_CAP);
    let sent = 0;
    let failed = 0;
    let skippedDailyCap = 0;
    const failures = [];
    const skipped = [];
    const now = new Date().toISOString();
    // Each fire-of-a-broadcast gets a campaign id. Stamped on every
    // outgoing message so an inbound reply (matched on customer_phone +
    // created_at within 7 days) can be attributed back to this campaign.
    const campaignId = `bc-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    for (const c of targets) {
      // Per-recipient daily cap (3 outbound / 24h).
      if (overMessaged.has(c.phone)) {
        skippedDailyCap += 1;
        if (skipped.length < 25) skipped.push({ phone: c.phone, name: c.name || "", reason: "daily_cap" });
        continue;
      }
      const text = interpolateForCustomer(template.body, c);
      const result = await sendWhatsappMessage({ to: c.phone, text });
      if (result.sent) {
        sent += 1;
      } else {
        failed += 1;
        if (failures.length < 25) failures.push({ phone: c.phone, name: c.name || "", reason: result.reason || result.status });
      }
      // Best-effort audit row so Growth Studio sees the message and the
      // per-day cap can count it next time. The lead_id IS the campaign id
      // — that's how a future inbound reply gets attributed back to the
      // right broadcast for reply-rate stats.
      if (hasSupabase()) {
        await supabase("/rest/v1/marketing_messages", {
          method: "POST",
          body: JSON.stringify({
            lead_id: campaignId,
            customer_phone: c.phone,
            source: `Broadcast (${template.name || template.id})`,
            direction: "outbound",
            body: text,
            external_message_id: result.data?.message_id || result.data?.id || null,
            created_at: now,
          }),
        }).catch(() => {});
        // Stamp the customer row too so we can sort by recency in the
        // Customers tab.
        await supabase(`/rest/v1/customers?phone=eq.${encodeURIComponent(c.phone)}`, {
          method: "PATCH",
          body: JSON.stringify({ last_outbound_at: now }),
        }).catch(() => {});
      }
    }

    // Insert the campaign summary row so the Growth Studio can show "this
    // template got X replies, sent to Y recipients."
    if (hasSupabase() && (sent + failed) > 0) {
      await supabase("/rest/v1/broadcast_campaigns", {
        method: "POST",
        body: JSON.stringify({
          id: campaignId,
          template_id: template.id,
          template_name: template.name,
          body: template.body,
          filters: payload.filters || {},
          sent_count: sent,
          failed_count: failed,
          triggered_at: now,
        }),
      }).catch(() => {});
    }

    // Opt-outs were filtered earlier (matches() returns false for opt-outs).
    // Recover the count by re-running the filter without the opt-in check —
    // the difference is how many opted-out matches there were.
    const totalUnfiltered = await loadRecipients({ ...f, _ignoreOptOut: true });
    const skippedOptOut = Math.max(0, totalUnfiltered.length - recipients.length);

    const response = {
      ok: true,
      campaign_id: campaignId,
      count: recipients.length,
      attempted: targets.length,
      sent,
      failed,
      skipped_daily_cap: skippedDailyCap,
      skipped_opt_out: skippedOptOut,
      hard_capped: recipients.length > HARD_CAP,
      failures,
      skipped,
      template: { id: template.id, name: template.name },
    };
    rememberBroadcast(idemHash, response);
    return json(response);
  } catch (error) {
    return json({ error: error.message }, { status: 500 });
  }
};

export const config = {
  path: "/api/admin/broadcast",
};
