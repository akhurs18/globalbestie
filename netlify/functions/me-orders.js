// GET /api/me/orders
//   Returns every order belonging to the currently-logged-in customer
//   (matched by canonical phone). Auth required via gb_session cookie.
//   No admin token needed.

import { hasSupabase, json, supabase } from "./_shared/supabase.js";
import { currentCustomer } from "./_shared/auth.js";

export default async (req) => {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  try {
    const session = await currentCustomer(req);
    if (!session) return json({ error: "Not logged in." }, { status: 401 });
    if (!hasSupabase()) return json({ orders: [], configured: false });
    const phone = session.phone;
    const orders = await supabase(
      `/rest/v1/orders?customer_phone=eq.${encodeURIComponent(phone)}&select=*,order_items(*),order_events(*)&order=created_at.desc`,
    );
    return json({ orders: orders || [] });
  } catch (error) {
    return json({ error: error.message }, { status: 500 });
  }
};

export const config = { path: "/api/me/orders" };
