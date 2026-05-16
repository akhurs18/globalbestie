// Scheduled-broadcast processor. Runs every 5 minutes. Finds any
// `scheduled_broadcasts` rows with status='pending' and send_at <= now(),
// fires each one through the same code path the live send uses, and flips
// status to 'sent' / 'failed'.
//
// We deliberately re-fetch recipients at send-time (not at schedule-time)
// so customer additions/opt-outs between schedule and send are honored.

import { hasSupabase, json, requireAdmin, supabase } from "./_shared/supabase.js";
import { sendWhatsappMessage, interpolate } from "./_shared/whatsapp.js";
import { isValidPkMobile } from "./_shared/phone.js";

const HARD_CAP = 200;

function env(name) {
  return globalThis.Netlify?.env?.get(name) || "";
}

function matches(customer, f) {
  if (!customer) return false;
  if (customer.whatsapp_opt_in === false) return false;
  if (!isValidPkMobile(customer.phone)) return false;
  if (f.city && String(customer.city || "").toLowerCase() !== String(f.city).toLowerCase()) return false;
  if (f.min_orders && Number(customer.total_orders || 0) < Number(f.min_orders)) return false;
  if (f.min_revenue && Number(customer.total_revenue_pkr || 0) < Number(f.min_revenue)) return false;
  if (f.tag) {
    const tags = Array.isArray(customer.tags) ? customer.tags : [];
    if (!tags.some((t) => String(t).toLowerCase() === String(f.tag).toLowerCase())) return false;
  }
  if (f.last_order_days > 0) {
    const ls = customer.last_seen ? new Date(customer.last_seen).getTime() : 0;
    const cutoff = Date.now() - Number(f.last_order_days) * 86_400_000;
    if (!ls || ls < cutoff) return false;
  }
  return true;
}

async function loadOverMessaged() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const rows = await supabase(
    `/rest/v1/marketing_messages?direction=eq.outbound&created_at=gte.${encodeURIComponent(since)}&select=customer_phone&customer_phone=not.is.null`,
  ).catch(() => []);
  const counts = new Map();
  for (const r of rows || []) {
    if (!r.customer_phone) continue;
    counts.set(r.customer_phone, (counts.get(r.customer_phone) || 0) + 1);
  }
  const blocked = new Set();
  for (const [p, n] of counts) if (n >= 3) blocked.add(p);
  return blocked;
}

async function runScheduledBroadcast(row) {
  // Resolve the template body. body_override wins; otherwise fetch by id.
  let body = row.body_override || "";
  let templateName = "Custom";
  if (!body && row.template_id) {
    const rows = await supabase(`/rest/v1/whatsapp_templates?id=eq.${encodeURIComponent(row.template_id)}&select=*`).catch(() => []);
    if (rows?.[0]) { body = rows[0].body; templateName = rows[0].name; }
  }
  if (!body) {
    await supabase(`/rest/v1/scheduled_broadcasts?id=eq.${encodeURIComponent(row.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "failed", error: "Template body could not be resolved.", updated_at: new Date().toISOString() }),
    }).catch(() => {});
    return { id: row.id, status: "failed", reason: "no_body" };
  }

  await supabase(`/rest/v1/scheduled_broadcasts?id=eq.${encodeURIComponent(row.id)}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "running", updated_at: new Date().toISOString() }),
  }).catch(() => {});

  const customers = await supabase("/rest/v1/customers?select=phone,name,city,total_orders,total_revenue_pkr,tags,whatsapp_opt_in,last_seen&order=last_seen.desc").catch(() => []);
  const recipients = (customers || []).filter((c) => matches(c, row.filters || {})).slice(0, HARD_CAP);
  const overMessaged = await loadOverMessaged();

  const campaignId = `bc-sched-${row.id}`;
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const now = new Date().toISOString();

  for (const c of recipients) {
    if (overMessaged.has(c.phone)) { skipped += 1; continue; }
    const text = interpolate(body, {
      name: (c.name || "").split(" ")[0] || "there",
      full_name: c.name || "",
      city: c.city || "",
      total: Number(c.total_revenue_pkr || 0).toLocaleString(),
      order_id: "your order",
      advance: "—", balance: "—", eta: "—", tracking: "—",
    });
    const result = await sendWhatsappMessage({ to: c.phone, text });
    if (result.sent) sent += 1; else failed += 1;
    await supabase("/rest/v1/marketing_messages", {
      method: "POST",
      body: JSON.stringify({
        lead_id: campaignId,
        customer_phone: c.phone,
        source: `Broadcast scheduled (${templateName})`,
        direction: "outbound",
        body: text,
        external_message_id: result.data?.message_id || result.data?.id || null,
        created_at: now,
      }),
    }).catch(() => {});
    await supabase(`/rest/v1/customers?phone=eq.${encodeURIComponent(c.phone)}`, {
      method: "PATCH",
      body: JSON.stringify({ last_outbound_at: now }),
    }).catch(() => {});
  }

  await supabase("/rest/v1/broadcast_campaigns", {
    method: "POST",
    body: JSON.stringify({
      id: campaignId,
      template_id: row.template_id || null,
      template_name: templateName,
      body,
      filters: row.filters || {},
      sent_count: sent,
      failed_count: failed,
      triggered_at: now,
    }),
  }).catch(() => {});

  await supabase(`/rest/v1/scheduled_broadcasts?id=eq.${encodeURIComponent(row.id)}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "sent",
      sent_count: sent,
      failed_count: failed,
      skipped_count: skipped,
      sent_at: now,
      updated_at: now,
    }),
  }).catch(() => {});

  return { id: row.id, status: "sent", sent, failed, skipped };
}

export default async (req) => {
  try {
    const isScheduled = req.headers.get("x-netlify-functions-source") === "schedule" ||
      (req.headers.get("user-agent") || "").includes("Netlify");
    if (!isScheduled && !requireAdmin(req)) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!hasSupabase()) return json({ ok: false, reason: "no_supabase" });

    const due = await supabase(
      `/rest/v1/scheduled_broadcasts?status=eq.pending&send_at=lte.${encodeURIComponent(new Date().toISOString())}&select=*&order=send_at.asc&limit=10`,
    );
    if (!due?.length) return json({ ok: true, processed: 0 });

    const results = [];
    for (const row of due) {
      try {
        results.push(await runScheduledBroadcast(row));
      } catch (err) {
        await supabase(`/rest/v1/scheduled_broadcasts?id=eq.${encodeURIComponent(row.id)}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "failed", error: String(err?.message || err), updated_at: new Date().toISOString() }),
        }).catch(() => {});
        results.push({ id: row.id, status: "failed", reason: String(err?.message || err) });
      }
    }
    return json({ ok: true, processed: results.length, results });
  } catch (error) {
    return json({ error: error.message }, { status: 500 });
  }
};

// Scheduled-only: Netlify rejects a custom `path` on cron functions. The
// manual trigger lives at /.netlify/functions/broadcasts-process if the
// team needs to flush the queue.
export const config = {
  schedule: "*/5 * * * *", // every 5 minutes
};
