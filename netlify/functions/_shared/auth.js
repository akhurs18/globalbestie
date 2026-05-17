// Shared auth helpers for the phone-OTP login flow used by both the
// customer-facing storefront and the portal. Both share the same
// otp_codes table for issuance; the verified session lands in either
// customer_sessions or team_sessions depending on which endpoint
// completed the flow.

import crypto from "node:crypto";
import { hasSupabase, supabase } from "./supabase.js";

export function env(name) {
  return globalThis.Netlify?.env?.get(name) || "";
}

// Pick a 6-digit numeric code. Padded so leading zeros work.
export function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// SHA-256 the code before storing so a raw DB leak doesn't reveal codes.
export function hashOtp(code) {
  return crypto.createHash("sha256").update(String(code)).digest("hex");
}

// Random session tokens are crypto-random + base64url-encoded.
export function generateSessionToken() {
  return crypto.randomBytes(32).toString("base64url");
}

// Cookie helper — Set-Cookie format with secure flags. SameSite=Lax so
// the cookie still flows on first-party navigations from a WhatsApp click.
export function sessionCookie(name, value, maxAgeSeconds) {
  const flags = [
    `${name}=${value}`,
    "Path=/",
    `Max-Age=${maxAgeSeconds}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ];
  return flags.join("; ");
}

export function clearCookie(name) {
  return `${name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

// Extract a cookie value by name from the Cookie header.
export function readCookie(req, name) {
  const header = req.headers.get("cookie") || "";
  const parts = header.split(";").map((p) => p.trim());
  for (const p of parts) {
    const [k, ...rest] = p.split("=");
    if (k === name) return rest.join("=");
  }
  return "";
}

// Returns the current customer session or null. Touches last_used_at.
export async function currentCustomer(req) {
  if (!hasSupabase()) return null;
  const token = readCookie(req, "gb_session");
  if (!token) return null;
  try {
    const rows = await supabase(`/rest/v1/customer_sessions?token=eq.${encodeURIComponent(token)}&select=*`);
    const row = rows?.[0];
    if (!row) return null;
    if (new Date(row.expires_at).getTime() < Date.now()) return null;
    // Touch last_used_at — non-blocking
    supabase(`/rest/v1/customer_sessions?token=eq.${encodeURIComponent(token)}`, {
      method: "PATCH",
      body: JSON.stringify({ last_used_at: new Date().toISOString() }),
    }).catch(() => {});
    return row;
  } catch {
    return null;
  }
}

// Returns the current team session or null. Touches last_used_at.
export async function currentTeamMember(req) {
  if (!hasSupabase()) return null;
  const token = readCookie(req, "gb_team_session");
  if (!token) return null;
  try {
    const rows = await supabase(`/rest/v1/team_sessions?token=eq.${encodeURIComponent(token)}&select=*`);
    const row = rows?.[0];
    if (!row) return null;
    if (new Date(row.expires_at).getTime() < Date.now()) return null;
    supabase(`/rest/v1/team_sessions?token=eq.${encodeURIComponent(token)}`, {
      method: "PATCH",
      body: JSON.stringify({ last_used_at: new Date().toISOString() }),
    }).catch(() => {});
    return row;
  } catch {
    return null;
  }
}
