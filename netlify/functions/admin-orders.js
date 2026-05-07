import { hasSupabase, json, requireAdmin, supabase } from "./_shared/supabase.js";

function nextPaymentStatus(status, current = "") {
  if (status === "pakistan_processing" && !["balance_uploaded", "paid_in_full"].includes(current)) return "balance_due";
  if (status === "delivered") return "paid_in_full";
  if (current === "awaiting_confirmation") return "awaiting_advance";
  if (current === "confirmation_uploaded") return "advance_uploaded";
  if (current === "deposit_confirmed") return "advance_confirmed";
  return current || "awaiting_advance";
}

export default async (req, context) => {
  if (!requireAdmin(req)) return json({ error: "Unauthorized" }, { status: 401 });
  if (req.method !== "PATCH") return json({ error: "Method not allowed" }, { status: 405 });

  try {
    const { id } = context.params;
    const payload = await req.json();
    if (!payload.status) return json({ error: "Status is required." }, { status: 400 });

    if (!hasSupabase()) {
      return json({
        order: {
          id,
          status: payload.status,
          payment_status: payload.payment_status || nextPaymentStatus(payload.status),
        },
        configured: false,
      });
    }

    const updates = {
      status: payload.status,
      payment_status: payload.payment_status || nextPaymentStatus(payload.status),
      eta: payload.eta,
      next_action: payload.next_action,
      accepted_at: payload.status === "accepted" ? new Date().toISOString() : undefined,
      updated_at: new Date().toISOString(),
    };
    Object.keys(updates).forEach((key) => updates[key] === undefined && delete updates[key]);

    const [order] = await supabase(`/rest/v1/orders?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(updates),
    });

    await supabase("/rest/v1/order_events", {
      method: "POST",
      body: JSON.stringify({
        order_id: id,
        status: payload.status,
        note: payload.note || `Admin moved order to ${payload.status.replaceAll("_", " ")} with payment marked ${(updates.payment_status || "").replaceAll("_", " ")}.`,
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
