// GET /api/auth/me
//   Returns the currently-logged-in customer (or team member) based on
//   the gb_session / gb_team_session cookie. Used by the storefront to
//   render the "My account" state on every page load, and by the portal
//   to identify the operator for audit logs.

import { json, hasSupabase, supabase } from "./_shared/supabase.js";
import { currentCustomer, currentTeamMember } from "./_shared/auth.js";
import { canonPhone, formatPkDisplay } from "./_shared/phone.js";

export default async (req) => {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  try {
    // Team session takes precedence — an operator who happens to also be
    // a customer should see their team identity on the portal.
    const team = await currentTeamMember(req);
    if (team) {
      return json({
        team: { phone: team.phone, name: team.name, role: team.role, display_phone: formatPkDisplay(team.phone) },
      });
    }
    const session = await currentCustomer(req);
    if (!session) return json({ customer: null });
    const canon = canonPhone(session.phone);
    let customer = null;
    if (hasSupabase()) {
      const rows = await supabase(`/rest/v1/customers?phone=eq.${encodeURIComponent(canon)}&select=phone,name,email,city,default_address,total_orders,total_revenue_pkr,whatsapp_opt_in`);
      customer = rows?.[0] || null;
    }
    return json({
      customer: customer || { phone: canon },
      display_phone: formatPkDisplay(canon),
    });
  } catch (error) {
    return json({ error: error.message }, { status: 500 });
  }
};

export const config = { path: "/api/auth/me" };
