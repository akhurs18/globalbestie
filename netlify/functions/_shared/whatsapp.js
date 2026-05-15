// Outbound WhatsApp helper. Wraps the Maychats messages API so any function
// can fire a templated message to a canonicalized PK phone in one call.
//
// Returns `{ sent: boolean, status, data?, reason? }`. The caller should
// fire-and-forget — never block order placement on Maychats availability.
//
// Environment:
//   MAYCHATS_API_KEY        — required to actually send
//   MAYCHATS_SEND_ENDPOINT  — defaults to https://api.maychats.com/v1/messages
//   MAYCHATS_ACCOUNT_ID     — optional, used when the account has multiple
//                             connected numbers
//
// `to` must be the canonical form (`923xxxxxxxxx`). Use canonPhone() from
// _shared/phone.js before calling.

function env(name) {
  return globalThis.Netlify?.env?.get(name) || "";
}

export async function sendWhatsappMessage({ to, text, accountId }) {
  if (!to || !text) return { sent: false, reason: "missing_args" };
  const apiKey = env("MAYCHATS_API_KEY");
  const endpoint = env("MAYCHATS_SEND_ENDPOINT") || "https://api.maychats.com/v1/messages";
  const channelId = env("MAYCHATS_ACCOUNT_ID") || accountId || "";
  if (!apiKey) return { sent: false, reason: "missing_maychats_api_key" };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        channel: "whatsapp",
        account_id: channelId || undefined,
        recipient: { phone: to },
        message: { text },
      }),
      signal: AbortSignal.timeout(8000),
    });
    const data = await response.json().catch(() => ({}));
    return { sent: response.ok, status: response.status, data };
  } catch (error) {
    return { sent: false, reason: "send_error", error: String(error?.message || error) };
  }
}

// Simple {{placeholder}} interpolation — matches what the portal UI uses so
// templates render identically when sent automatically vs manually.
export function interpolate(body, vars) {
  return String(body || "").replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] ?? `{{${k}}}`));
}
