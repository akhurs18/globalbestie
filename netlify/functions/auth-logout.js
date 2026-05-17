// POST /api/auth/logout
//   Deletes the current session row (customer + team if both exist) and
//   clears the cookies.

import { json, hasSupabase, supabase } from "./_shared/supabase.js";
import { readCookie, clearCookie } from "./_shared/auth.js";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  try {
    const customerToken = readCookie(req, "gb_session");
    const teamToken = readCookie(req, "gb_team_session");
    if (hasSupabase()) {
      if (customerToken) {
        await supabase(`/rest/v1/customer_sessions?token=eq.${encodeURIComponent(customerToken)}`, { method: "DELETE" }).catch(() => {});
      }
      if (teamToken) {
        await supabase(`/rest/v1/team_sessions?token=eq.${encodeURIComponent(teamToken)}`, { method: "DELETE" }).catch(() => {});
      }
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        // Clear both — browsers send a single Set-Cookie per header value
        // but Netlify Functions Response can carry multiple via a single
        // string joined with newlines.
        "Set-Cookie": `${clearCookie("gb_session")}, ${clearCookie("gb_team_session")}`,
      },
    });
  } catch (error) {
    return json({ error: error.message }, { status: 500 });
  }
};

export const config = { path: "/api/auth/logout" };
