// POST /api/auth/verify-otp { phone, code, team? }
//   Matches the code hash against otp_codes. On success, creates a row
//   in customer_sessions (or team_sessions when ?team=1 and the phone
//   appears in team_members), deletes the otp row, returns Set-Cookie.
//
// Failure modes:
//   - No OTP for phone → 400
//   - Expired → 400 (delete the row)
//   - Wrong code → 400 (increment attempts; on 5 attempts the row is
//     deleted to force a new request)

import { hasSupabase, json, supabase } from "./_shared/supabase.js";
import { canonPhone, isValidPkMobile } from "./_shared/phone.js";
import { hashOtp, generateSessionToken, sessionCookie } from "./_shared/auth.js";

const CUSTOMER_SESSION_TTL_DAYS = 30;
const TEAM_SESSION_TTL_DAYS = 7;

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  if (!hasSupabase()) return json({ error: "Auth requires Supabase configured." }, { status: 503 });
  try {
    const payload = await req.json();
    const canon = canonPhone(payload.phone);
    if (!isValidPkMobile(canon)) return json({ error: "Invalid phone." }, { status: 400 });
    const code = String(payload.code || "").trim();
    if (!/^\d{6}$/.test(code)) return json({ error: "Code must be 6 digits." }, { status: 400 });

    const rows = await supabase(`/rest/v1/otp_codes?phone=eq.${encodeURIComponent(canon)}&select=*`);
    const row = rows?.[0];
    if (!row) return json({ error: "No code requested for this number. Please request a new one." }, { status: 400 });

    if (new Date(row.expires_at).getTime() < Date.now()) {
      await supabase(`/rest/v1/otp_codes?phone=eq.${encodeURIComponent(canon)}`, { method: "DELETE" });
      return json({ error: "Code expired. Please request a new one." }, { status: 400 });
    }

    if (row.attempts >= 5) {
      await supabase(`/rest/v1/otp_codes?phone=eq.${encodeURIComponent(canon)}`, { method: "DELETE" });
      return json({ error: "Too many attempts. Request a new code." }, { status: 400 });
    }

    if (hashOtp(code) !== row.code_hash) {
      await supabase(`/rest/v1/otp_codes?phone=eq.${encodeURIComponent(canon)}`, {
        method: "PATCH",
        body: JSON.stringify({ attempts: Number(row.attempts || 0) + 1 }),
      });
      return json({ error: "That code didn't match. Try again." }, { status: 400 });
    }

    // Valid! Decide whether this is a team session or a customer session.
    const wantsTeam = payload.team === true || payload.team === "1";
    let teamMember = null;
    if (wantsTeam) {
      const tm = await supabase(`/rest/v1/team_members?phone=eq.${encodeURIComponent(canon)}&select=*`);
      teamMember = tm?.[0] || null;
      if (!teamMember) {
        return json({ error: "Phone is not on the team list. Ask the owner to add you." }, { status: 403 });
      }
    }

    // Delete the OTP row — single-use only.
    await supabase(`/rest/v1/otp_codes?phone=eq.${encodeURIComponent(canon)}`, { method: "DELETE" });

    const token = generateSessionToken();
    const userAgent = req.headers.get("user-agent")?.slice(0, 250) || "";
    const ip = (req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for") || "").split(",")[0]?.trim() || "";

    if (wantsTeam) {
      const expiresAt = new Date(Date.now() + TEAM_SESSION_TTL_DAYS * 86_400_000).toISOString();
      await supabase("/rest/v1/team_sessions", {
        method: "POST",
        body: JSON.stringify({
          token,
          phone: canon,
          name: teamMember.name || "",
          role: teamMember.role || "team",
          user_agent: userAgent,
          ip_address: ip,
          expires_at: expiresAt,
        }),
      });
      return new Response(JSON.stringify({
        ok: true,
        team: true,
        member: { phone: canon, name: teamMember.name, role: teamMember.role },
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": sessionCookie("gb_team_session", token, TEAM_SESSION_TTL_DAYS * 86_400),
        },
      });
    }

    // Customer session
    const expiresAt = new Date(Date.now() + CUSTOMER_SESSION_TTL_DAYS * 86_400_000).toISOString();
    await supabase("/rest/v1/customer_sessions", {
      method: "POST",
      body: JSON.stringify({
        token,
        phone: canon,
        user_agent: userAgent,
        ip_address: ip,
        expires_at: expiresAt,
      }),
    });

    // Ensure a customer row exists so future orders can attach to it.
    const existing = await supabase(`/rest/v1/customers?phone=eq.${encodeURIComponent(canon)}&select=phone`);
    if (!existing?.length) {
      await supabase("/rest/v1/customers", {
        method: "POST",
        body: JSON.stringify({
          phone: canon,
          first_seen: new Date().toISOString(),
          last_seen: new Date().toISOString(),
        }),
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      customer: { phone: canon },
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": sessionCookie("gb_session", token, CUSTOMER_SESSION_TTL_DAYS * 86_400),
      },
    });
  } catch (error) {
    return json({ error: error.message }, { status: 500 });
  }
};

export const config = { path: "/api/auth/verify-otp" };
