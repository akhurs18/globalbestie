// Bulk-dispatch endpoint. Accepts a list of order IDs + per-ID tracking
// numbers and courier names, marks them `delivered` (or keeps them in
// `pakistan_processing` with tracking set, depending on `final`), writes
// timeline events, fires the dispatch WhatsApp template to each customer.
//
// Body:
//   {
//     items: [
//       { order_id: "GB-...", tracking_number: "abc123", courier_name: "Leopards", final?: false }
//     ]
//   }
//
// Returns per-order success/failure so the UI can show which orders
// flipped and which need attention.

import { hasSupabase, json, requireAdmin, supabase } from "./_shared/supabase.js";
import { sendWhatsappMessage, interpolate } from "./_shared/whatsapp.js";

const DEFAULT_DISPATCH_BODY = "Hi {{name}}, your order {{order_id}} is out for delivery 📦 Tracking: {{tracking}} via {{courier}}. Please expect a call from the courier within 1–2 working days.";

async function dispatchTemplateBody() {
  if (!hasSupabase()) return DEFAULT_DISPATCH_BODY;
  try {
    const rows = await supabase("/rest/v1/whatsapp_templates?category=eq.dispatch&is_active=eq.true&select=body&limit=1");
    return rows?.[0]?.body || DEFAULT_DISPATCH_BODY;
  } catch {
    return DEFAULT_DISPATCH_BODY;
  }
}

async function fetchOrder(orderId) {
  if (!hasSupabase()) return null;
  try {
    const rows = await supabase(`/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}&select=*`);
    return rows?.[0] || null;
  } catch {
    return null;
  }
}

export default async (req) => {
  if (!requireAdmin(req)) return json({ error: "Unauthorized" }, { status: 401 });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

  try {
    const payload = await req.json();
    const items = Array.isArray(payload.items) ? payload.items.slice(0, 50) : [];
    if (!items.length) return json({ error: "items[] is required" }, { status: 400 });

    const body = await dispatchTemplateBody();
    const now = new Date().toISOString();
    const results = [];

    for (const it of items) {
      const orderId = String(it.order_id || "").trim();
      const tracking = String(it.tracking_number || "").trim();
      const courier = String(it.courier_name || "").trim() || "courier";
      const final = it.final !== false;
      if (!orderId || !tracking) {
        results.push({ order_id: orderId, ok: false, reason: "missing_fields" });
        continue;
      }
      const order = await fetchOrder(orderId);
      if (!order) {
        results.push({ order_id: orderId, ok: false, reason: "not_found" });
        continue;
      }

      const updates = {
        tracking_number: tracking,
        courier_name: courier,
        local_courier: courier,
        next_action: `Dispatched via ${courier}.`,
        updated_at: now,
      };
      if (final) {
        updates.status = "delivered";
        updates.delivered_at = now;
      }

      if (hasSupabase()) {
        await supabase(`/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}`, {
          method: "PATCH",
          body: JSON.stringify(updates),
        }).catch(() => {});

        await supabase("/rest/v1/order_events", {
          method: "POST",
          body: JSON.stringify({
            order_id: orderId,
            status: final ? "delivered" : "in_transit",
            note: `Dispatched via ${courier}. Tracking: ${tracking}.`,
            created_at: now,
          }),
        }).catch(() => {});
      }

      // Fire dispatch WhatsApp (respects opt-out).
      let waResult = { sent: false, reason: "opt_out_or_invalid" };
      if (order.customer_phone && order.whatsapp_opt_in !== false) {
        const text = interpolate(body, {
          name: (order.customer_name || "").split(" ")[0] || "there",
          full_name: order.customer_name || "",
          order_id: orderId,
          tracking,
          courier,
          city: order.city || "",
          eta: "1–2 working days",
        });
        waResult = await sendWhatsappMessage({ to: order.customer_phone, text });
        if (hasSupabase()) {
          await supabase("/rest/v1/marketing_messages", {
            method: "POST",
            body: JSON.stringify({
              lead_id: `order-${orderId}`,
              customer_phone: order.customer_phone,
              source: "Auto (dispatch)",
              direction: "outbound",
              body: text,
              external_message_id: waResult.data?.message_id || waResult.data?.id || null,
              created_at: now,
            }),
          }).catch(() => {});
        }
      }

      results.push({ order_id: orderId, ok: true, wa_sent: waResult.sent, wa_reason: waResult.reason });
    }

    const sent = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok).length;
    return json({ ok: true, sent, failed, results });
  } catch (error) {
    return json({ error: error.message }, { status: 500 });
  }
};

export const config = {
  path: "/api/admin/dispatch",
};
