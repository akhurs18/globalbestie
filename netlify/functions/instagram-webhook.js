import crypto from "node:crypto";
import { hasSupabase, json, supabase } from "./_shared/supabase.js";

function env(name) {
  return globalThis.Netlify?.env?.get(name) || "";
}

function verifySignature(rawBody, signature) {
  const secret = env("META_APP_SECRET");
  if (!secret) return true;
  if (!signature?.startsWith("sha256=")) return false;
  const expected = `sha256=${crypto.createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
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

function buildReply({ text, missingFields, intent, product }) {
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

function getEvents(payload) {
  return (payload.entry || []).flatMap((entry) => (entry.messaging || []).map((event) => ({
    senderId: event.sender?.id || "",
    recipientId: event.recipient?.id || "",
    timestamp: event.timestamp || Date.now(),
    text: event.message?.text || event.postback?.title || "",
    messageId: event.message?.mid || event.postback?.mid || `ig-${event.timestamp || Date.now()}`,
    raw: event,
  }))).filter((event) => event.senderId && event.text);
}

async function sendInstagramReply(recipientId, text) {
  const accessToken = env("META_PAGE_ACCESS_TOKEN") || env("INSTAGRAM_PAGE_ACCESS_TOKEN") || env("META_ACCESS_TOKEN");
  const endpoint = env("META_IG_MESSAGES_ENDPOINT");
  const accountId = env("INSTAGRAM_BUSINESS_ACCOUNT_ID") || env("META_PAGE_ID");
  const version = env("META_GRAPH_VERSION") || "v24.0";
  const url = endpoint || (accountId ? `https://graph.facebook.com/${version}/${accountId}/messages` : "");
  if (!url || !accessToken) return { sent: false, reason: "missing_meta_send_credentials" };

  const response = await fetch(`${url}${url.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(accessToken)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
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
      note: "Global Bestie automation routed this Instagram DM to a human.",
    }),
  }).catch(() => {});
}

async function handleInbound(event) {
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
  const reply = buildReply({ text: event.text, missingFields, intent, product });
  const stage = needsHuman ? "new" : missingFields.length ? "new" : "order_ready";
  const automationStatus = needsHuman ? "human_handoff" : missingFields.length ? "needs_info" : "auto_replied";
  const now = new Date().toISOString();
  const lead = {
    id: `ig-${event.senderId}`,
    name: `Instagram ${event.senderId.slice(-5)}`,
    source: "Instagram DM",
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
    meta: { intent, city, variant, recipientId: event.recipientId },
    updated_at: now,
  };

  let sendResult = { sent: false, reason: "not_attempted" };
  if (!needsHuman) sendResult = await sendInstagramReply(event.senderId, reply);

  if (!hasSupabase()) {
    return { lead, reply, sendResult, configured: false };
  }

  await supabase("/rest/v1/marketing_leads?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(lead),
  });

  await supabase("/rest/v1/marketing_messages", {
    method: "POST",
    body: JSON.stringify([
      {
        lead_id: lead.id,
        source: "Instagram DM",
        direction: "inbound",
        body: event.text,
        external_message_id: event.messageId,
      },
      {
        lead_id: lead.id,
        source: "Instagram automation",
        direction: "outbound",
        body: needsHuman ? "Human handoff created; automation did not reply." : reply,
        external_message_id: sendResult.data?.message_id || null,
      },
    ]),
  });

  if (needsHuman) await notifyTeam(lead, event.text);
  return { lead, reply: needsHuman ? "" : reply, sendResult, configured: true };
}

export default async (req) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === env("META_WEBHOOK_VERIFY_TOKEN")) {
      return new Response(challenge || "", { status: 200 });
    }
    return json({ error: "Webhook verification failed." }, { status: 403 });
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get("x-hub-signature-256"))) {
    return json({ error: "Invalid Meta signature." }, { status: 401 });
  }

  const payload = JSON.parse(raw || "{}");
  const events = getEvents(payload);
  const results = [];
  for (const event of events) {
    results.push(await handleInbound(event));
  }
  return json({ received: true, processed: results.length, results });
};

export const config = {
  path: "/api/webhooks/instagram",
};
