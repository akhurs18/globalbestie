// POST /api/auth/request-otp { phone }
//   Generates a 6-digit code, stores its hash in otp_codes (5-min TTL),
//   sends the code to the customer via Maychats WhatsApp template.
//   Returns { ok: true } even on failure-to-find-customer so we don't
//   leak whether a phone is registered.

import { hasSupabase, json, supabase } from "./_shared/supabase.js";
import { canonPhone, isValidPkMobile } from "./_shared/phone.js";
import { sendWhatsappMessage } from "./_shared/whatsapp.js";
import { generateOtp, hashOtp } from "./_shared/auth.js";

const OTP_TTL_MS = 5 * 60 * 1000;
// Per-phone rate limit: at most 3 OTP requests per 15 minutes to slow
// down SMS-pumping-style abuse (free WhatsApp messages aren't paid per-
// request but bulk requests will still get our number flagged).
const requestHistory = new Map();
function isMissingAuthTable(error) {
  return /Could not find the table 'public\.otp_codes'|PGRST205/i.test(String(error?.message || error || ""));
}

function checkOtpRate(phone) {
  const now = Date.now();
  const hist = (requestHistory.get(phone) || []).filter((t) => now - t < 15 * 60_000);
  if (hist.length >= 3) {
    return { ok: false, retry_after_minutes: Math.ceil((15 * 60_000 - (now - hist[0])) / 60_000) };
  }
  hist.push(now);
  requestHistory.set(phone, hist);
  return { ok: true };
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  try {
    const payload = await req.json();
    const canon = canonPhone(payload.phone);
    if (!isValidPkMobile(canon)) {
      return json({ error: "Please enter a valid Pakistani mobile number." }, { status: 400 });
    }
    const rate = checkOtpRate(canon);
    if (!rate.ok) {
      return json({ error: `Too many requests. Try again in ${rate.retry_after_minutes} minutes.` }, { status: 429 });
    }

    const code = generateOtp();
    const codeHash = hashOtp(code);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();

    if (hasSupabase()) {
      // Upsert: a new request overwrites any pending OTP for the same phone.
      await supabase("/rest/v1/otp_codes?on_conflict=phone", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify({
          phone: canon,
          code_hash: codeHash,
          attempts: 0,
          expires_at: expiresAt,
        }),
      });
    }

    // Fire-and-forget — never block the response on Maychats. If Maychats
    // is unconfigured (dev mode) we ALSO return the code in the response
    // so local testing works without a real WhatsApp send.
    const text = `Your Global Bestie verification code is ${code}. Valid for 5 minutes. Don't share it with anyone.`;
    const sendResult = await sendWhatsappMessage({ to: canon, text });

    const response = { ok: true };
    if (!sendResult.sent) {
      // Dev / local mode: return the code so the operator can manually
      // verify when Maychats isn't wired. Never returns when Maychats IS
      // configured (sent: true) — production stays opaque.
      if (sendResult.reason === "missing_maychats_api_key") {
        response.dev_code = code;
      }
    }
    return json(response);
  } catch (error) {
    if (isMissingAuthTable(error)) {
      return json({
        error: "Account login is still being set up. Please track your order by order number or WhatsApp us for help.",
      }, { status: 503 });
    }
    return json({ error: error.message }, { status: 500 });
  }
};

export const config = { path: "/api/auth/request-otp" };
