import { hasSupabase, json, requireAdmin, supabase } from "./_shared/supabase.js";

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

    // Audit row — best-effort, never throws. Captures who changed what so
    // the team can answer "who marked this delivered yesterday?".
    try {
      await supabase("/rest/v1/admin_audit", {
        method: "POST",
        body: JSON.stringify({
          actor: "admin",
          action: "order.update",
          entity_type: "order",
          entity_id: id,
          payload: { before: existing, updates },
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
