// Daily team digest — assembles a short WhatsApp summary of what's pending
// and sends it to the team owner's number via Maychats. Also pingable on
// demand via GET with the admin bearer token (great for "show me where
// things stand right now").
//
// Cron: 04:00 UTC = 09:00 PKT, every day.
//
// Environment:
//   TEAM_OWNER_WHATSAPP — canonical (923xxxxxxxxx) or any format that
//                         canonPhone() can resolve. Required for the WA send.
//   TEAM_ALERT_WEBHOOK_URL — optional, also receives the digest payload.

import { getOrders, hasSupabase, json, requireAdmin, supabase } from "./_shared/supabase.js";
import { sendWhatsappMessage } from "./_shared/whatsapp.js";
import { canonPhone, isValidPkMobile } from "./_shared/phone.js";

function env(name) {
  return globalThis.Netlify?.env?.get(name) || "";
}

function minutesSince(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 60_000);
}

function hoursSince(iso) {
  const m = minutesSince(iso);
  return m == null ? null : Math.floor(m / 60);
}

function daysSince(iso) {
  const h = hoursSince(iso);
  return h == null ? null : Math.floor(h / 24);
}

async function buildDigest() {
  const orders = (await getOrders().catch(() => [])) || [];

  // SLA breach counters
  const pendingOverSla = orders.filter((o) =>
    o.status === "pending_review" && (minutesSince(o.created_at) || 0) >= 15,
  );
  const balanceOverdue = orders.filter((o) => {
    const balance = Math.max(0, Number(o.balance_due_pkr || 0) - Number(o.balance_paid_pkr || 0));
    if (o.status !== "pakistan_processing" || balance <= 0) return false;
    const h = hoursSince(o.arrived_at || o.updated_at || o.created_at);
    return h !== null && h >= 24;
  });
  const staleAccepted = orders.filter((o) => {
    if (o.status !== "accepted") return false;
    const d = daysSince(o.accepted_at || o.created_at);
    return d !== null && d >= 7;
  });

  // Today's broadcasts + auto-WAs
  let broadcastsToday = 0;
  let autoWhatsappToday = 0;
  if (hasSupabase()) {
    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const msgs = await supabase(
        `/rest/v1/marketing_messages?direction=eq.outbound&created_at=gte.${encodeURIComponent(since)}&select=source`,
      );
      for (const m of msgs || []) {
        if (String(m.source || "").startsWith("Broadcast")) broadcastsToday += 1;
        else if (String(m.source || "").startsWith("Auto")) autoWhatsappToday += 1;
      }
    } catch {
      /* digest still renders without breakdown */
    }
  }

  // Batches closing in next 24h
  let closingBatches = [];
  if (hasSupabase()) {
    try {
      const today = new Date();
      const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
      const batches = await supabase(
        `/rest/v1/shipment_batches?status=eq.collecting&select=name,eta_date,capacity,used`,
      );
      closingBatches = (batches || []).filter((b) => {
        if (!b.eta_date) return false;
        const eta = new Date(b.eta_date).getTime();
        return eta <= tomorrow.getTime() && eta >= today.getTime() - 86_400_000;
      });
    } catch {
      /* skip if table missing */
    }
  }

  return {
    pendingOverSla: pendingOverSla.length,
    balanceOverdue: balanceOverdue.length,
    staleAccepted: staleAccepted.length,
    broadcastsToday,
    autoWhatsappToday,
    closingBatches,
    pending_review_total: orders.filter((o) => o.status === "pending_review").length,
    accepted_total: orders.filter((o) => o.status === "accepted").length,
    sourcing_total: orders.filter((o) => o.status === "sourcing").length,
    in_transit_total: orders.filter((o) => o.status === "in_transit").length,
    pakistan_processing_total: orders.filter((o) => o.status === "pakistan_processing").length,
  };
}

function formatDigest(d) {
  const date = new Date().toLocaleDateString("en-PK", { weekday: "long", month: "short", day: "numeric" });
  const lines = [];
  lines.push(`☕ Global Bestie · ${date}`);
  lines.push("");
  if (d.pendingOverSla > 0 || d.balanceOverdue > 0 || d.staleAccepted > 0) {
    lines.push("⚠️ Needs your attention");
    if (d.pendingOverSla > 0) lines.push(`• ${d.pendingOverSla} pending order${d.pendingOverSla === 1 ? "" : "s"} past 15-min SLA`);
    if (d.balanceOverdue > 0) lines.push(`• ${d.balanceOverdue} balance${d.balanceOverdue === 1 ? "" : "s"} overdue (>24h since arrival)`);
    if (d.staleAccepted > 0) lines.push(`• ${d.staleAccepted} accepted order${d.staleAccepted === 1 ? "" : "s"} without a batch (>7 days)`);
    lines.push("");
  } else {
    lines.push("✓ No SLA breaches — nice work yesterday.");
    lines.push("");
  }
  lines.push("📦 Open pipeline");
  lines.push(`• Pending review: ${d.pending_review_total}`);
  lines.push(`• Accepted: ${d.accepted_total}`);
  lines.push(`• Sourcing: ${d.sourcing_total}`);
  lines.push(`• In transit: ${d.in_transit_total}`);
  lines.push(`• Arrived in PK: ${d.pakistan_processing_total}`);
  lines.push("");
  if (d.closingBatches.length) {
    lines.push("🛬 Batches closing soon");
    for (const b of d.closingBatches) {
      const cap = Number(b.capacity || 0);
      const used = Number(b.used || 0);
      lines.push(`• ${b.name} — ETA ${b.eta_date}${cap ? ` · ${used}/${cap} spots used` : ""}`);
    }
    lines.push("");
  }
  lines.push("📨 Messages in last 24h");
  lines.push(`• Broadcasts: ${d.broadcastsToday}`);
  lines.push(`• Auto order WAs: ${d.autoWhatsappToday}`);
  lines.push("");
  lines.push("Open portal: /portal.html");
  lines.push("Yesterday's CSV: /api/admin/orders/export?date=yesterday");
  return lines.join("\n");
}

async function notifyTeamWebhook(payload) {
  const url = env("TEAM_ALERT_WEBHOOK_URL");
  if (!url) return;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event: "daily_digest", ...payload }),
  }).catch(() => {});
}

export default async (req) => {
  try {
    const isScheduled = req.headers.get("x-netlify-functions-source") === "schedule" ||
      (req.headers.get("user-agent") || "").includes("Netlify");
    if (!isScheduled && !requireAdmin(req)) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const summary = await buildDigest();
    const text = formatDigest(summary);

    // Allow ?dry=1 from the admin so we can preview the message without
    // actually firing the WhatsApp send.
    const url = new URL(req.url);
    if (url.searchParams.get("dry") === "1") {
      return json({ ok: true, dry: true, summary, text });
    }

    // Fan out: union of the env-var fallback and every team_members row
    // with digest_opt_in. Dedupe by canonical phone so we never double-send.
    const recipients = new Set();
    const ownerCanon = canonPhone(env("TEAM_OWNER_WHATSAPP"));
    if (isValidPkMobile(ownerCanon)) recipients.add(ownerCanon);
    if (hasSupabase()) {
      try {
        const rows = await supabase("/rest/v1/team_members?digest_opt_in=eq.true&select=phone");
        for (const r of rows || []) {
          if (isValidPkMobile(r.phone)) recipients.add(r.phone);
        }
      } catch {}
    }
    const sends = [];
    for (const phone of recipients) {
      const r = await sendWhatsappMessage({ to: phone, text });
      sends.push({ phone, sent: r.sent, reason: r.reason || r.status });
    }
    const sendResult = { sent_count: sends.filter((s) => s.sent).length, recipients: sends };
    await notifyTeamWebhook({ summary, text, sendResult });

    return json({ ok: true, summary, text, sendResult });
  } catch (error) {
    return json({ error: error.message }, { status: 500 });
  }
};

// Scheduled-only: 04:00 UTC = 09:00 PKT. Manual trigger / dry-run preview
// is available at /.netlify/functions/team-digest?dry=1
export const config = {
  schedule: "0 4 * * *",
};
