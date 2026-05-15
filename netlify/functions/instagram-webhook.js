// Maychats <-> Global Bestie Instagram bridge.
//
// We used to call the Meta Graph API directly from this function. We now hand
// the Instagram connection off to Maychats:
//   - Maychats holds the Instagram Business / Meta Page authorization.
//   - Maychats POSTs inbound DMs to this webhook.
//   - We POST replies back to Maychats, which delivers them on the IG account.
//
// The Netlify path stays /api/webhooks/instagram so any existing Maychats
// configuration keeps working. We also expose /api/webhooks/maychats as the
// canonical alias.

import crypto from "node:crypto";
import { hasSupabase, json, supabase } from "./_shared/supabase.js";
import { canonPhone, isValidPkMobile } from "./_shared/phone.js";
import { sendWhatsappMessage } from "./_shared/whatsapp.js";

function env(name) {
  return globalThis.Netlify?.env?.get(name) || "";
}

// Maychats signs every webhook body with an HMAC-SHA256 over the raw bytes,
// using the shared secret you configured in the Maychats dashboard. If the
// secret isn't set we skip verification so local/dev still works.
function verifyMaychatsSignature(rawBody, signatureHeader) {
  const secret = env("MAYCHATS_WEBHOOK_SECRET");
  if (!secret) return true;
  if (!signatureHeader) return false;
  const provided = signatureHeader.startsWith("sha256=")
    ? signatureHeader.slice("sha256=".length)
    : signatureHeader;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function normalizeText(value = "") {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function extractPhone(text = "") {
  return text.match(/(?:\+92|0)3\d{2}[-\s]?\d{7}/)?.[0] || "";
}

function detectProduct(text = "") {
  const catalogHints = [
    "bag", "handbag", "coach", "tabby", "tote", "marc jacobs", "shoes", "sneaker",
    "nike", "v2k", "new balance", "makeup", "rare beauty", "dior", "lip", "blush",
    "perfume", "fragrance", "sunglasses",
  ];
  return catalogHints.find((hint) => normalizeText(text).includes(hint)) || "";
}

function detectCity(text = "") {
  const cities = ["karachi", "lahore", "islamabad", "rawalpindi", "faisalabad", "multan", "peshawar", "quetta", "sialkot"];
  return cities.find((city) => normalizeText(text).includes(city)) || "";
}

function detectVariant(text = "") {
  const value = normalizeText(text);
  if (/\b(size|shade|color|colour|black|white|pink|beige|brown|gold|silver|ml|eu|uk|us|\d{2,3}ml)\b/.test(value)) return "variant shared";
  return "";
}

function classifyMessage(text = "") {
  const value = normalizeText(text);
  const wantsOrderStatus = /\b(track|tracking|order status|where is|delivered|courier|shipment|late|delay)\b/.test(value);
  const wantsHuman = /\b(refund|cancel|wrong|complaint|urgent|angry|manager|human|call me|payment proof|paid|bank|transfer|address change)\b/.test(value);
  const wantsPrice = /\b(price|pkr|available|avail|how much|cost|order|preorder|want|need|buy|book)\b/.test(value);
  if (wantsHuman) return "human";
  if (wantsOrderStatus) return "order_status";
  if (wantsPrice) return "buying_intent";
  return "general";
}

function buildReply({ missingFields, intent, product }) {
  if (intent === "human") {
    return "Hi bestie, I’m sending this to our team now so they can personally check it for you. Please keep your order number, transfer reference, or screenshot ready if this is about payment or delivery.";
  }

  if (intent === "order_status") {
    return "Hi bestie, please send your order number or WhatsApp number so I can route this to the order desk. If your shipment is in Pakistan, the team will confirm the remaining balance before local dispatch.";
  }

  if (missingFields.length) {
    const fieldLabels = {
      product: "product name or screenshot",
      variant: "size / shade / color",
      city: "city in Pakistan",
      phone: "WhatsApp number",
    };
    return `Hi bestie, yes we can help with USA preorder. Please send: ${missingFields.map((field) => fieldLabels[field]).join(", ")}. Once complete, the team confirms availability, final PKR price, and the next shipment batch before payment.`;
  }

  return `Perfect, I have the key details for ${product || "your product"}. Our team will confirm availability, final PKR price, and shipment batch. Preorders require 50% advance after approval and the remaining balance once the shipment reaches Pakistan before local dispatch.`;
}

// Maychats has gone through several payload shapes depending on integration
// version. We normalize all of them into the same {senderId, text, ...} shape
// we used to build from Meta entry/messaging arrays.
function getEvents(payload) {
  const events = [];

  const push = (raw) => {
    if (!raw) return;
    const senderId =
      raw.sender_id ||
      raw.from_id ||
      raw.contact_id ||
      raw.user_id ||
      raw.sender?.id ||
      raw.sender?.user_id ||
      raw.from?.id ||
      raw.contact?.id ||
      "";
    const text =
      raw.text ||
      raw.body ||
      raw.message?.text ||
      raw.message?.body ||
      raw.content ||
      "";
    if (!senderId || !text) return;
    // Maychats payloads vary; the channel field tells us whether this is an
    // Instagram DM or a WhatsApp message. Default to instagram for backward
    // compatibility with older configurations.
    const channel = String(
      raw.channel ||
        raw.platform ||
        raw.message?.channel ||
        raw.source ||
        "instagram"
    ).toLowerCase();
    // Whatsapp inbound senders ARE their canonical phone — Maychats forwards
    // the contact's phone in sender.phone / from.phone, but the legacy
    // sender.id field on WhatsApp deliveries is also the phone number.
    const senderPhone =
      raw.sender?.phone ||
      raw.contact?.phone ||
      raw.from?.phone ||
      raw.message?.from ||
      "";
    events.push({
      senderId: String(senderId),
      senderPhone: String(senderPhone || (channel === "whatsapp" ? senderId : "")),
      channel,
      recipientId: String(
        raw.recipient_id ||
          raw.account_id ||
          raw.channel_id ||
          raw.recipient?.id ||
          raw.account?.id ||
          ""
      ),
      timestamp: raw.timestamp || raw.created_at || Date.now(),
      text,
      messageId:
        raw.message_id ||
        raw.id ||
        raw.message?.id ||
        `maychats-${raw.timestamp || Date.now()}`,
      senderName:
        raw.sender?.username ||
        raw.sender?.name ||
        raw.contact?.username ||
        raw.contact?.name ||
        "",
      raw,
    });
  };

  // Common Maychats shapes:
  // 1) { event: "message.received", data: { ... } }
  // 2) { events: [{ ... }] }
  // 3) { messages: [{ ... }] }
  // 4) Legacy Meta-style { entry: [{ messaging: [{ ... }] }] }
  if (payload.data) push(payload.data);
  if (Array.isArray(payload.events)) payload.events.forEach(push);
  if (Array.isArray(payload.messages)) payload.messages.forEach(push);
  if (Array.isArray(payload.entry)) {
    payload.entry.forEach((entry) => {
      (entry.messaging || []).forEach((event) => {
        push({
          sender_id: event.sender?.id,
          recipient_id: event.recipient?.id,
          timestamp: event.timestamp,
          text: event.message?.text || event.postback?.title || "",
          message_id: event.message?.mid || event.postback?.mid,
        });
      });
    });
  }
  // Some Maychats setups POST a single flat message object.
  if (!events.length && (payload.text || payload.body || payload.message)) push(payload);

  return events;
}

async function sendMaychatsReply(recipientId, text, accountId) {
  const apiKey = env("MAYCHATS_API_KEY");
  const endpoint =
    env("MAYCHATS_SEND_ENDPOINT") || "https://api.maychats.com/v1/messages";
  const channelId = env("MAYCHATS_ACCOUNT_ID") || accountId || "";

  if (!apiKey) return { sent: false, reason: "missing_maychats_api_key" };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      channel: "instagram",
      account_id: channelId || undefined,
      recipient: { id: recipientId },
      message: { text },
    }),
  });

  const data = await response.json().catch(() => ({}));
  return { sent: response.ok, status: response.status, data };
}

async function notifyTeam(lead, inboundText) {
  const url = env("TEAM_ALERT_WEBHOOK_URL");
  if (!url) return;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event: "instagram_handoff",
      lead,
      inboundText,
      note: "Global Bestie automation routed this Maychats DM to a human.",
    }),
  }).catch(() => {});
}

// Common WhatsApp / SMS unsubscribe keywords. Matches the WhatsApp Business
// API "global stop" guidance: any of these words on their own line should
// flip the customer's opt-in OFF and stop all promotional sends. We err on
// the side of strict matching ("stop kindly" still counts as stop) so we
// never accidentally re-message someone who said no.
const OPT_OUT_KEYWORDS = ["stop", "unsubscribe", "unsub", "opt out", "opt-out", "remove me", "off", "no more"];

function detectOptOut(text) {
  const norm = String(text || "").toLowerCase().trim();
  if (!norm) return false;
  // Whole-message match — "stop" alone, or one of the multi-word phrases.
  if (OPT_OUT_KEYWORDS.includes(norm)) return true;
  // Word-boundary scan for "stop", "unsubscribe", etc. anywhere in the body.
  return OPT_OUT_KEYWORDS.some((kw) => {
    const escaped = kw.replace(/[-]/g, "\\-").replace(/ /g, "\\s+");
    return new RegExp(`(?:^|\\s|,|\\.|!)${escaped}(?:$|\\s|,|\\.|!)`, "i").test(norm);
  });
}

// Async, fire-and-forget: lookup the customer by canonical phone, flip the
// opt-in flag to false, and write a marketing_leads event so the team can
// see what happened. Never throws.
async function handleOptOut({ senderPhone, channel, text }) {
  const canon = canonPhone(senderPhone);
  if (!isValidPkMobile(canon)) return { ok: false, reason: "no_valid_phone" };
  if (!hasSupabase()) {
    return { ok: true, configured: false, canon };
  }
  try {
    // Look up existing customer row first; create one if missing so we
    // never lose the consent record.
    const existing = await supabase(`/rest/v1/customers?phone=eq.${encodeURIComponent(canon)}&select=phone,name`);
    if (!existing?.length) {
      await supabase("/rest/v1/customers", {
        method: "POST",
        body: JSON.stringify({
          phone: canon,
          whatsapp_opt_in: false,
          notes: `Opted out via ${channel} on ${new Date().toISOString()} ("${text.slice(0, 80)}").`,
          first_seen: new Date().toISOString(),
          last_seen: new Date().toISOString(),
        }),
      });
    } else {
      await supabase(`/rest/v1/customers?phone=eq.${encodeURIComponent(canon)}`, {
        method: "PATCH",
        body: JSON.stringify({
          whatsapp_opt_in: false,
          last_seen: new Date().toISOString(),
        }),
      });
    }
    // Also flip future-order behavior: stamp every existing order with
    // whatsapp_opt_in=false so auto-templates don't re-engage.
    await supabase(`/rest/v1/orders?customer_phone=eq.${encodeURIComponent(canon)}`, {
      method: "PATCH",
      body: JSON.stringify({ whatsapp_opt_in: false }),
    }).catch(() => {});
    // Audit row for Growth Studio so the team can see "Customer opted out".
    await supabase("/rest/v1/marketing_leads?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({
        id: `optout-${canon}-${Date.now()}`,
        customer_phone: canon,
        source: `${channel} (opt-out)`,
        stage: "lost",
        automation_status: "opted_out",
        last_message: text,
        handoff_reason: `Customer sent opt-out keyword on ${channel}.`,
        last_inbound_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    }).catch(() => {});
    return { ok: true, configured: true, canon };
  } catch (err) {
    return { ok: false, reason: String(err?.message || err) };
  }
}

// Opt-IN re-subscribe keywords — used so a customer who said STOP can
// switch back on without contacting the team.
const OPT_IN_KEYWORDS = ["start", "subscribe", "resume", "opt in", "opt-in", "yes please"];

function detectOptIn(text) {
  const norm = String(text || "").toLowerCase().trim();
  if (OPT_IN_KEYWORDS.includes(norm)) return true;
  return OPT_IN_KEYWORDS.some((kw) => {
    const escaped = kw.replace(/-/g, "\\-").replace(/ /g, "\\s+");
    return new RegExp(`(?:^|\\s)${escaped}(?:$|\\s|,|\\.|!)`, "i").test(norm);
  });
}

async function handleOptIn({ senderPhone, channel }) {
  const canon = canonPhone(senderPhone);
  if (!isValidPkMobile(canon) || !hasSupabase()) return { ok: false, canon };
  try {
    await supabase(`/rest/v1/customers?phone=eq.${encodeURIComponent(canon)}`, {
      method: "PATCH",
      body: JSON.stringify({ whatsapp_opt_in: true, last_seen: new Date().toISOString() }),
    });
    await supabase(`/rest/v1/orders?customer_phone=eq.${encodeURIComponent(canon)}`, {
      method: "PATCH",
      body: JSON.stringify({ whatsapp_opt_in: true }),
    }).catch(() => {});
    return { ok: true, canon };
  } catch {
    return { ok: false, canon };
  }
}

async function handleInbound(event) {
  // ─── Opt-in (re-subscribe) short circuit ───
  if (event.channel === "whatsapp" && detectOptIn(event.text)) {
    const result = await handleOptIn({ senderPhone: event.senderPhone, channel: event.channel });
    if (result.canon) {
      await sendWhatsappMessage({
        to: result.canon,
        text: "Welcome back! You're subscribed to Global Bestie WhatsApp updates again. Reply STOP anytime to unsubscribe.",
      }).catch(() => {});
    }
    return { optIn: true, ...result };
  }

  // ─── Opt-out short circuit ───
  // Honored before classify/lead-create — a "STOP" message should NEVER
  // enter the qualification flow or trigger an automated reply other than
  // the one confirmation we send below. Required for compliance, and saves
  // us from being shadow-banned by the WhatsApp Business API.
  if (event.channel === "whatsapp" && detectOptOut(event.text)) {
    const result = await handleOptOut({
      senderPhone: event.senderPhone,
      channel: event.channel,
      text: event.text,
    });
    // Send a single confirmation message acknowledging the opt-out. If
    // Maychats credentials aren't configured this silently no-ops.
    if (result.canon) {
      await sendWhatsappMessage({
        to: result.canon,
        text: "You've been unsubscribed from Global Bestie WhatsApp updates. You won't receive promotional messages from us. If this was a mistake, reply START to opt back in.",
      }).catch(() => {});
    }
    return { optOut: true, ...result };
  }

  const intent = classifyMessage(event.text);
  const product = detectProduct(event.text);
  const city = detectCity(event.text);
  const variant = detectVariant(event.text);
  const phone = extractPhone(event.text);
  const requiredFields = intent === "order_status" ? ["order_number_or_phone"] : ["product", "variant", "city", "phone"];
  const missingFields = intent === "order_status"
    ? []
    : [
      product ? "" : "product",
      variant ? "" : "variant",
      city ? "" : "city",
      phone ? "" : "phone",
    ].filter(Boolean);
  const needsHuman = intent === "human";
  const reply = buildReply({ missingFields, intent, product });
  const stage = needsHuman ? "new" : missingFields.length ? "new" : "order_ready";
  const automationStatus = needsHuman ? "human_handoff" : missingFields.length ? "needs_info" : "auto_replied";
  const now = new Date().toISOString();
  const displayName =
    event.senderName || `Instagram ${String(event.senderId).slice(-5)}`;
  const lead = {
    id: `ig-${event.senderId}`,
    name: displayName,
    source: "Instagram DM (Maychats)",
    stage,
    product: product || "Needs product details",
    value_pkr: 0,
    last_message: event.text,
    owner: needsHuman ? "Owner" : "Automation",
    sla: needsHuman ? "Needs owner" : "Auto",
    channel_thread_id: event.senderId,
    customer_phone: phone,
    external_user_id: event.senderId,
    automation_status: automationStatus,
    missing_fields: missingFields,
    required_fields: requiredFields,
    handoff_reason: needsHuman ? `Detected ${intent} intent` : "",
    last_inbound_at: now,
    last_auto_reply_at: needsHuman ? null : now,
    meta: {
      intent,
      city,
      variant,
      recipientId: event.recipientId,
      provider: "maychats",
    },
    updated_at: now,
  };

  let sendResult = { sent: false, reason: "not_attempted" };
  if (!needsHuman) sendResult = await sendMaychatsReply(event.senderId, reply, event.recipientId);

  if (!hasSupabase()) {
    return { lead, reply, sendResult, configured: false };
  }

  await supabase("/rest/v1/marketing_leads?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(lead),
  });

  // Tag every message with the canonical phone when we have one — lets the
  // customer-modal history list and the per-recipient broadcast cap work
  // without joining via lead_id.
  const msgPhone = phone ? canonPhone(phone) : (event.senderPhone ? canonPhone(event.senderPhone) : "");

  // Reply-to-broadcast detection: if this inbound is within 7 days of any
  // outbound we sent on a broadcast campaign, mark the inbound with the
  // matching campaign id AND bump that campaign's reply_count. Pure
  // best-effort — never throws into the main handler.
  let repliedToBroadcast = null;
  if (msgPhone && hasSupabase()) {
    try {
      const cutoff = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const previousOutbounds = await supabase(
        `/rest/v1/marketing_messages?customer_phone=eq.${encodeURIComponent(msgPhone)}&direction=eq.outbound&created_at=gte.${encodeURIComponent(cutoff)}&lead_id=like.bc-*&select=lead_id,created_at&order=created_at.desc&limit=1`,
      );
      const match = previousOutbounds?.[0];
      if (match?.lead_id) {
        repliedToBroadcast = match.lead_id;
        // Only count one reply per (customer, campaign) — check if we
        // already credited this pair.
        const existing = await supabase(
          `/rest/v1/marketing_messages?customer_phone=eq.${encodeURIComponent(msgPhone)}&direction=eq.inbound&replied_to_broadcast=eq.${encodeURIComponent(match.lead_id)}&select=id&limit=1`,
        );
        if (!existing?.length) {
          // Bump reply_count atomically by reading then writing — Supabase
          // doesn't expose RPC-style increment here, so we accept the
          // small race window. Worst case: 1 reply counted twice during
          // a true concurrent inbound.
          const camp = await supabase(
            `/rest/v1/broadcast_campaigns?id=eq.${encodeURIComponent(match.lead_id)}&select=reply_count`,
          );
          const current = Number(camp?.[0]?.reply_count || 0);
          await supabase(`/rest/v1/broadcast_campaigns?id=eq.${encodeURIComponent(match.lead_id)}`, {
            method: "PATCH",
            body: JSON.stringify({ reply_count: current + 1 }),
          }).catch(() => {});
        }
      }
    } catch {
      /* reply detection is best-effort */
    }
  }
  await supabase("/rest/v1/marketing_messages", {
    method: "POST",
    body: JSON.stringify([
      {
        lead_id: lead.id,
        customer_phone: msgPhone || null,
        source: "Instagram DM (Maychats)",
        direction: "inbound",
        body: event.text,
        external_message_id: event.messageId,
        replied_to_broadcast: repliedToBroadcast || null,
      },
      {
        lead_id: lead.id,
        customer_phone: msgPhone || null,
        source: "Instagram automation (Maychats)",
        direction: "outbound",
        body: needsHuman ? "Human handoff created; automation did not reply." : reply,
        external_message_id:
          sendResult.data?.message_id ||
          sendResult.data?.id ||
          null,
      },
    ]),
  });

  if (needsHuman) await notifyTeam(lead, event.text);
  return { lead, reply: needsHuman ? "" : reply, sendResult, configured: true };
}

export default async (req) => {
  const url = new URL(req.url);

  // GET is used for two things:
  // 1) Maychats "test connection" — returns 200 + a simple ok payload.
  // 2) Legacy Meta hub.challenge verification, kept so existing customers can
  //    point Meta directly at this URL during migration if needed.
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe") {
      if (token && token === env("META_WEBHOOK_VERIFY_TOKEN")) {
        return new Response(challenge || "", { status: 200 });
      }
      return json({ error: "Webhook verification failed." }, { status: 403 });
    }
    return json({ ok: true, provider: "maychats" });
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

  const raw = await req.text();
  const signature =
    req.headers.get("x-maychats-signature") ||
    req.headers.get("x-signature") ||
    req.headers.get("x-hub-signature-256") ||
    "";
  if (!verifyMaychatsSignature(raw, signature)) {
    return json({ error: "Invalid Maychats signature." }, { status: 401 });
  }

  const payload = JSON.parse(raw || "{}");
  const events = getEvents(payload);
  const results = [];
  for (const event of events) {
    results.push(await handleInbound(event));
  }
  return json({ received: true, processed: results.length, results, provider: "maychats" });
};

export const config = {
  path: ["/api/webhooks/instagram", "/api/webhooks/maychats"],
};
