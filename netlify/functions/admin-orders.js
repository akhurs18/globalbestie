import { hasSupabase, json, requireAdmin, supabase } from "./_shared/supabase.js";

// ── Order state machine ──────────────────────────────────────────────────
// Legal forward transitions. Any status change not in this map is rejected
// (unless the caller passes force:true, which is logged as an override).
// This stops the team from accidentally skipping stages — e.g. marking an
// order "delivered" straight from "pending_review" before it was sourced,
// shipped, or paid.
const LEGAL_TRANSITIONS = {
  pending_review: ["accepted", "cancelled"],
  accepted: ["sourcing", "cancelled"],
  sourcing: ["in_transit", "cancelled"],
  in_transit: ["pakistan_processing", "cancelled"],
  pakistan_processing: ["delivered", "cancelled"],
  delivered: [],   // terminal
  cancelled: [],   // terminal
};

// Payment gate: an order may not be marked delivered until it's paid in full.
const PAID_STATES = new Set(["paid_in_full"]);

function transitionError(from, to, existing) {
  if (!to || to === from) return null;                 // no status change
  const allowed = LEGAL_TRANSITIONS[from];
  if (allowed === undefined) return null;              // unknown current state — don't block
  if (!allowed.includes(to)) {
    return `Cannot move an order from "${from}" to "${to}". Allowed next: ${allowed.join(", ") || "none (terminal)"}.`;
  }
  if (to === "delivered" && !PAID_STATES.has(existing.payment_status)) {
    return `Cannot mark delivered until payment is complete (current payment status: "${existing.payment_status || "unpaid"}").`;
  }
  return null;
}

function nextPaymentStatus(status, current = "") {
  if (status === "pakistan_processing" && !["balance_uploaded", "paid_in_full"].includes(current)) return "balance_due";
  if (status === "delivered") return "paid_in_full";
  if (current === "awaiting_confirmation") return "awaiting_advance";
  if (current === "confirmation_uploaded") return "advance_uploaded";
  if (current === "deposit_confirmed") return "advance_confirmed";
  return current || "awaiting_advance";
}

function paymentActionUpdates(action, order = {}) {
  const now = new Date().toISOString();
  const advanceDue = Number(order.advance_due_pkr || 0);
  const balanceDue = Number(order.balance_due_pkr || 0);
  if (action === "confirm_advance") {
    return {
      payment_status: balanceDue > 0 ? "advance_confirmed" : "paid_in_full",
      advance_paid_pkr: advanceDue,
      next_action: balanceDue > 0 ? "Source or ship order. Collect remaining balance after Pakistan arrival." : "Prepare for dispatch.",
      updated_at: now,
    };
  }
  if (action === "confirm_balance") {
    return {
      payment_status: "paid_in_full",
      balance_paid_pkr: balanceDue,
      next_action: "Payment complete. Dispatch locally and add courier tracking.",
      updated_at: now,
    };
  }
  if (action === "reject_payment") {
    return {
      payment_status: "payment_rejected",
      next_action: "Ask customer to resend transfer proof or confirm sender account.",
      updated_at: now,
    };
  }
  return {};
}

// Server-authoritative stock movement. In-stock items leave stock when an
// order reaches "delivered" and return if it's later reversed. Atomic via the
// adjust_inventory RPC (no read-modify-write race) and idempotent via the
// durable orders.stock_deducted flag, so a reload or a second operator can't
// double-count. Writes a shared audit row so stock history isn't trapped in
// one browser's localStorage. Best-effort: never throws into the caller, so a
// stock hiccup never blocks the status change itself. Returns the intended
// stock_deducted value, or null when no movement applies / it failed.
async function syncOrderStock(orderId, existing, toStatus) {
  const wasDeducted = Boolean(existing.stock_deducted);
  const goingDelivered = toStatus === "delivered" && !wasDeducted;
  const reversing = wasDeducted && toStatus === "cancelled";
  if (!goingDelivered && !reversing) return null;
  const sign = goingDelivered ? -1 : 1;
  try {
    const items = await supabase(
      `/rest/v1/order_items?order_id=eq.${encodeURIComponent(orderId)}&stock_mode=eq.in_stock&select=product_id,quantity,title`
    );
    const moved = [];
    for (const it of items || []) {
      if (!it.product_id) continue;
      const qty = Math.max(1, Number(it.quantity || 1));
      const onHand = await supabase("/rest/v1/rpc/adjust_inventory", {
        method: "POST",
        body: JSON.stringify({ p_id: it.product_id, p_delta: sign * qty }),
      });
      moved.push({ product_id: it.product_id, title: it.title, delta: sign * qty, on_hand: onHand });
    }
    if (moved.length) {
      await supabase("/rest/v1/admin_audit", {
        method: "POST",
        body: JSON.stringify({
          actor: "system",
          action: goingDelivered ? "stock.deduct" : "stock.restock",
          entity_type: "order",
          entity_id: orderId,
          payload: { reason: goingDelivered ? "Sold — order delivered" : "Restocked — order reversed", items: moved },
          created_at: new Date().toISOString(),
        }),
      }).catch(() => {});
    }
    return goingDelivered;
  } catch {
    return null; // never block the status change on a stock failure
  }
}

export default async (req, context) => {
  if (!requireAdmin(req)) return json({ error: "Unauthorized" }, { status: 401 });
  if (req.method !== "PATCH") return json({ error: "Method not allowed" }, { status: 405 });

  try {
    const { id } = context.params;
    const payload = await req.json();
    if (!payload.status && !payload.payment_action && !payload.updates) {
      return json({ error: "Status, payment action, or updates are required." }, { status: 400 });
    }

    if (!hasSupabase()) {
      const fallbackUpdates = {
        ...(payload.updates || {}),
        ...(payload.status ? { status: payload.status } : {}),
        ...(payload.payment_status || payload.status ? { payment_status: payload.payment_status || nextPaymentStatus(payload.status) } : {}),
        ...paymentActionUpdates(payload.payment_action, payload.order || {}),
      };
      return json({
        order: {
          id,
          ...fallbackUpdates,
        },
        configured: false,
      });
    }

    const existingRows = await supabase(`/rest/v1/orders?id=eq.${encodeURIComponent(id)}&select=*`);
    const existing = existingRows[0] || {};

    // Guard illegal status jumps unless explicitly forced (and force is audited).
    if (payload.status && !payload.force) {
      const err = transitionError(existing.status || "", payload.status, existing);
      if (err) return json({ error: err, code: "illegal_transition" }, { status: 409 });
    }

    // If the caller is sending an `items` array (cashflow sourcing queue saves
    // actual_usd_cost + usd_purchased_at per line item), peel it out and
    // upsert each row into order_items separately — the orders table itself
    // has no items column.
    const rawUpdates = { ...(payload.updates || {}) };
    const itemUpdates = Array.isArray(rawUpdates.items) ? rawUpdates.items : null;
    delete rawUpdates.items;

    const updates = {
      status: payload.status,
      payment_status: payload.payment_status || (payload.status ? nextPaymentStatus(payload.status, existing.payment_status) : undefined),
      eta: payload.eta,
      next_action: payload.next_action,
      accepted_at: payload.status === "accepted" ? new Date().toISOString() : undefined,
      ...rawUpdates,
      ...paymentActionUpdates(payload.payment_action, existing),
      updated_at: new Date().toISOString(),
    };
    Object.keys(updates).forEach((key) => updates[key] === undefined && delete updates[key]);

    const [order] = await supabase(`/rest/v1/orders?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(updates),
    });

    // Server-authoritative, atomic, idempotent stock movement on delivery /
    // reversal. Runs after the status change so the flag only flips once the
    // units have actually moved. The portal no longer touches stock here.
    if (payload.status) {
      const newFlag = await syncOrderStock(id, existing, payload.status);
      if (newFlag !== null && newFlag !== Boolean(existing.stock_deducted)) {
        await supabase(`/rest/v1/orders?id=eq.${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ stock_deducted: newFlag, updated_at: new Date().toISOString() }),
        }).catch(() => {});
        if (order) order.stock_deducted = newFlag;
      }
    }

    // Audit row — best-effort, never throws. Captures who changed what so
    // the team can answer "who marked this delivered yesterday?". The
    // actor comes from the X-Actor header the portal injects after auth.
    try {
      const actor = req.headers.get("x-actor") || "admin";
      // Strip PII from order before/after — keep change-relevant scalars
      // but drop full address + phone in case the log ever leaks.
      const slim = (o) => {
        if (!o || typeof o !== "object") return o;
        const out = { ...o };
        if (out.address) out.address = "[redacted]";
        if (out.customer_phone) out.customer_phone = out.customer_phone.slice(0, 5) + "***";
        return out;
      };
      await supabase("/rest/v1/admin_audit", {
        method: "POST",
        body: JSON.stringify({
          actor,
          action: "order.update",
          entity_type: "order",
          entity_id: id,
          payload: { before: slim(existing), updates: slim(updates) },
          created_at: new Date().toISOString(),
        }),
      });
    } catch {}

    // Persist per-item cost updates. Only the two cashflow-relevant columns
    // are written; everything else on the line item is left alone.
    if (itemUpdates && itemUpdates.length) {
      for (const item of itemUpdates) {
        if (!item.id) continue; // can only update rows with a Supabase uuid
        const patch = {};
        if (item.actual_usd_cost !== undefined) patch.actual_usd_cost = item.actual_usd_cost;
        if (item.usd_purchased_at !== undefined) patch.usd_purchased_at = item.usd_purchased_at;
        if (!Object.keys(patch).length) continue;
        await supabase(`/rest/v1/order_items?id=eq.${encodeURIComponent(item.id)}`, {
          method: "PATCH",
          body: JSON.stringify(patch),
        });
      }
    }

    await supabase("/rest/v1/order_events", {
      method: "POST",
      body: JSON.stringify({
        order_id: id,
        status: updates.status || updates.payment_status || payload.payment_action || "admin_update",
        note: payload.note || `Admin updated order ${id}.`,
        created_at: new Date().toISOString(),
      }),
    });

    return json({ order, configured: true });
  } catch (error) {
    return json({ error: error.message }, { status: 500 });
  }
};

export const config = {
  path: "/api/admin/orders/:id",
};
