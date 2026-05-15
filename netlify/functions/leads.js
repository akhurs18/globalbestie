// Phone-blur lead capture. Called from the checkout page the moment a
// customer types a valid phone number, BEFORE they submit. Creates (or
// upgrades) a `customers` row and a `marketing_leads` row tagged
// `abandoned_checkout = true`. If the order eventually submits, /api/orders
// flips the lead state and increments customer counters.
//
// Why this exists: today, if a customer fills name+phone+city and then
// closes the tab, nothing is saved server-side and the team has zero way
// to follow up. With this endpoint we capture intent at the first blur.

import { hasSupabase, json, supabase } from "./_shared/supabase.js";
import { canonPhone, isValidPkMobile } from "./_shared/phone.js";

export default async (req) => {
  try {
    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, { status: 405 });
    }
    const payload = await req.json();
    const canon = canonPhone(payload.customer_phone);
    if (!isValidPkMobile(canon)) {
      return json({ error: "Phone is not a valid Pakistani mobile." }, { status: 400 });
    }

    const now = new Date().toISOString();
    const lead = {
      customer_phone: canon,
      customer_name: payload.customer_name || "",
      customer_email: payload.customer_email || "",
      city: payload.city || "",
      source: payload.source || "checkout",
      intent: payload.intent || "abandoned_checkout",
      cart_summary: payload.cart_summary || "",
      status: "new",
      automation_status: "pending_followup",
      created_at: now,
      updated_at: now,
    };

    if (!hasSupabase()) {
      return json({ lead, configured: false });
    }

    // Upsert the customer row at the same time. We never overwrite a name or
    // email that the customer already provided previously — only add to
    // missing fields. This way the lead-capture pass never erases real
    // checkout data.
    const existing = await supabase(`/rest/v1/customers?phone=eq.${encodeURIComponent(canon)}&select=*`);
    if (!existing?.length) {
      await supabase("/rest/v1/customers", {
        method: "POST",
        body: JSON.stringify({
          phone: canon,
          name: payload.customer_name || "",
          email: payload.customer_email || "",
          city: payload.city || "",
          default_address: payload.address || "",
          total_orders: 0,
          total_revenue_pkr: 0,
          first_seen: now,
          last_seen: now,
        }),
      });
    } else {
      const c = existing[0];
      await supabase(`/rest/v1/customers?phone=eq.${encodeURIComponent(canon)}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: c.name || payload.customer_name || "",
          email: c.email || payload.customer_email || "",
          city: c.city || payload.city || "",
          last_seen: now,
        }),
      });
    }

    // Insert a marketing lead so Growth Studio's lead pipeline can show it.
    await supabase("/rest/v1/marketing_leads", {
      method: "POST",
      body: JSON.stringify(lead),
    });

    return json({ ok: true, lead, configured: true });
  } catch (error) {
    return json({ error: error.message }, { status: 500 });
  }
};

export const config = {
  path: "/api/leads",
};
