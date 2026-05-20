// Public endpoint: customer pastes a USA retailer URL and gets back either
//   • { matched_product_id, matched_title }   — already in our catalog
//   • { candidate: { title, image_url, source_url }, estimated_pkr, notes }
//   • { blocked: true, support_whatsapp }     — retailer bot-blocked us
//
// Hard rules:
//   • READ-ONLY. Never writes to the catalog. Never creates a product.
//   • USD price, FX rate, markup, shipping are NEVER returned. Customer
//     sees one final PKR estimate that already includes the safety buffer.
//   • IP-rate-limited (10 quotes / hour) to keep abuse + retailer load down.
//   • Only allowlisted hosts (SCRAPER_ALLOWED_HOSTS) — anything else gets
//     a "send on WhatsApp" fallback.

import { getSettings, hasSupabase, json, supabase } from "./_shared/supabase.js";

// Reuse the same retailer-parsing pipeline that the admin tray uses.
// We import via dynamic import to keep this function's cold start small
// if the admin parser ever grows.
let _parser;
async function parser() {
  if (!_parser) _parser = await import("./admin-fetch-product.js");
  return _parser;
}

// Crude in-memory rate limit. Netlify Functions reuse warm containers
// across requests, so this catches most repeat-IP abuse. Persistence
// across cold starts isn't critical — this is a soft brake, not auth.
const HITS = new Map(); // ip → array of timestamps (ms)
const RATE_WINDOW_MS = 60 * 60 * 1000;   // 1 hour
const RATE_LIMIT = 10;                   // 10 quotes per IP per hour

function rateLimitCheck(ip) {
  if (!ip) return true; // can't rate-limit a missing IP; let it through
  const now = Date.now();
  const fresh = (HITS.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (fresh.length >= RATE_LIMIT) {
    HITS.set(ip, fresh);
    return false;
  }
  fresh.push(now);
  HITS.set(ip, fresh);
  return true;
}

function clientIp(req) {
  return (
    req.headers.get("x-nf-client-connection-ip") ||
    req.headers.get("x-forwarded-for") ||
    ""
  ).split(",")[0]?.trim() || "";
}

function allowedHost(url, settings) {
  // SCRAPER_ALLOWED_HOSTS env var is a comma-separated allowlist. If unset,
  // we trust the same brand list used by the admin parser (Coach, Nike,
  // Sephora, etc.) — better than open-internet but still wide enough for
  // the use case. Customers asking for off-list domains get the WhatsApp
  // fallback.
  let host;
  try { host = new URL(url).hostname.replace(/^www\./, ""); }
  catch { return false; }
  const envList = (process.env.SCRAPER_ALLOWED_HOSTS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (envList.length) {
    return envList.some((d) => host === d || host.endsWith("." + d));
  }
  const DEFAULTS = [
    "coach.com", "toryburch.com", "katespade.com", "michaelkors.com",
    "nike.com", "newbalance.com", "adidas.com",
    "sephora.com", "fentybeauty.com", "rarebeauty.com",
    "dior.com", "yslbeautyus.com", "charlottetilbury.com",
    "maisonmargiela-fragrances.us", "ray-ban.com", "apple.com",
    "nordstrom.com", "ulta.com", "macys.com", "saksfifthavenue.com",
    "neimanmarcus.com", "bloomingdales.com", "amazon.com",
  ];
  return DEFAULTS.some((d) => host === d || host.endsWith("." + d));
}

// Final customer-facing PKR figure. Adds a 5% buffer so the team's
// confirmed quote almost always comes in AT or BELOW the estimate.
function customerEstimatePkr(usd, category, settings) {
  const fx = Number(settings.fx_rate || 282);
  const markup = Number(settings.markup_rate || 0.25);
  const SHIPPING_BY_CAT = {
    handbags: 4500, shoes: 5500, makeup: 2500,
    fragrance: 3500, accessories: 2500,
  };
  const shipping = SHIPPING_BY_CAT[category] || 3500;
  const retailPkr = Number(usd || 0) * fx;
  const base = retailPkr + retailPkr * markup + shipping;
  const buffered = base * 1.05; // 5% safety buffer
  // Round to nearest 100 PKR for cleaner customer-facing numbers.
  return Math.ceil(buffered / 100) * 100;
}

async function findExistingProductByUrl(url) {
  if (!hasSupabase() || !url) return null;
  try {
    const rows = await supabase(
      `/rest/v1/products?source_url=eq.${encodeURIComponent(url)}&status=eq.active&select=id,title&limit=1`
    );
    return rows[0] || null;
  } catch {
    return null;
  }
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

  const ip = clientIp(req);
  if (!rateLimitCheck(ip)) {
    return json({
      error: "Too many quotes from this device. Try again in an hour, or send the link on WhatsApp.",
    }, { status: 429 });
  }

  let body;
  try { body = await req.json(); }
  catch { return json({ error: "Invalid JSON" }, { status: 400 }); }

  const url = String(body.url || "").trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    return json({ error: "Paste a valid product link starting with https://" }, { status: 400 });
  }

  const settings = hasSupabase() ? await getSettings().catch(() => ({})) : {};
  const supportWa = settings.support_whatsapp || process.env.STORE_SUPPORT_WHATSAPP || "";

  // 1. Already in catalog? Redirect.
  const existing = await findExistingProductByUrl(url);
  if (existing) {
    return json({
      matched_product_id: existing.id,
      matched_title: existing.title,
      source_url: url,
    });
  }

  // 2. Allowlist check.
  if (!allowedHost(url, settings)) {
    return json({
      blocked: true,
      reason: "off_allowlist",
      support_whatsapp: supportWa,
      message: "This retailer isn't in our supported list yet. Send the link on WhatsApp and we'll quote within 15 minutes.",
    });
  }

  // 3. Parse via the admin parser (single-URL mode).
  let result;
  try {
    const { default: handler } = await parser();
    const innerReq = new Request("https://internal/api/admin/fetch-product", {
      method: "POST",
      // Use the admin secret server-side so the parser passes its auth gate.
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.ADMIN_SHARED_SECRET || ""}` },
      body: JSON.stringify({ url }),
    });
    const innerRes = await handler(innerReq);
    result = await innerRes.json();
  } catch (err) {
    return json({
      blocked: true,
      reason: "parser_error",
      support_whatsapp: supportWa,
      message: "We couldn't read that page. Send the link on WhatsApp and we'll quote it.",
    });
  }

  if (result.error && !result.candidate) {
    return json({
      blocked: true,
      reason: "retailer_blocked",
      support_whatsapp: supportWa,
      message: "We couldn't read that page (the retailer probably blocked us). Send the link on WhatsApp and we'll quote within 15 minutes.",
    });
  }

  const c = result.candidate || {};
  if (!c.usa_price_usd) {
    return json({
      blocked: true,
      reason: "no_price_found",
      support_whatsapp: supportWa,
      partial_title: c.title || "",
      message: "We could see the page but couldn't find a price. Send the link on WhatsApp and we'll quote it.",
    });
  }

  const estimated = customerEstimatePkr(c.usa_price_usd, c.category || "accessories", settings);

  // Strictly customer-facing payload — NO USD, FX, markup, shipping.
  return json({
    candidate: {
      title: c.title,
      image_url: c.image_url || "",
      source_url: c.source_url || url,
      category: c.category || "accessories",
      variant_note: String(body.variant_note || "").slice(0, 280),
    },
    estimated_pkr: estimated,
    preorder_weeks: Number(settings.preorder_weeks || 4),
    notes: "Estimate. Our team confirms the final PKR price within 15 min before any payment is collected.",
  });
};

export const config = {
  path: "/api/source-estimate",
};
