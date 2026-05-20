// Admin-only endpoint that takes ONE or MANY retailer product URLs (Coach,
// Sephora, Nordstrom, etc.) and returns a half-filled product candidate
// per URL ready for the Sourcing Tray. It does its best on the open web;
// retailer pages that load product data via client-side JS will return
// less. The admin is expected to review/edit before publishing — this is
// autofill, not autopilot.
//
// Request shapes (both supported):
//   POST { url: "https://..." }                  → { candidate, ...meta }
//   POST { urls: ["https://...", ...] }          → { results: [ { url, ...meta }, ... ] }

import { downloadAndStoreImage, getSettings, hasSupabase, json, requireAdmin, supabase } from "./_shared/supabase.js";

function decodeEntities(s = "") {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function pickMeta(html, ...names) {
  for (const name of names) {
    const re = new RegExp(
      `<meta[^>]+(?:property|name)=["']${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]+content=["']([^"']+)["']`,
      "i"
    );
    const match = html.match(re);
    if (match) return decodeEntities(match[1]);
  }
  return "";
}

function extractJsonLd(html) {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const block of blocks) {
    try {
      const raw = block[1].trim();
      const parsed = JSON.parse(raw);
      const candidates = Array.isArray(parsed) ? parsed : parsed["@graph"] || [parsed];
      for (const node of candidates) {
        const type = node["@type"];
        if (type === "Product" || (Array.isArray(type) && type.includes("Product"))) {
          return node;
        }
      }
    } catch {
      // Some sites emit invalid JSON-LD; skip.
    }
  }
  return null;
}

// Pull every URL we can find that looks like a product image. Score them
// by detected width so we can pick the biggest. Returns sorted desc.
function extractImagesFromHtml(html) {
  const candidates = new Map(); // url → score

  const remember = (url, score = 1) => {
    if (!url || typeof url !== "string") return;
    if (!/^https?:\/\//i.test(url)) return;
    candidates.set(url, Math.max(candidates.get(url) || 0, score));
  };

  // og:image (high signal)
  const ogRe = /<meta[^>]+(?:property|name)=["'](?:og:image|og:image:secure_url|og:image:url|twitter:image)["'][^>]+content=["']([^"']+)["']/gi;
  for (const match of html.matchAll(ogRe)) remember(match[1], 100);

  // Image widths from srcset entries: ".../foo.jpg 1200w, .../foo.jpg 800w"
  for (const match of html.matchAll(/srcset=["']([^"']+)["']/gi)) {
    for (const entry of match[1].split(",")) {
      const m = entry.trim().match(/^(\S+)\s+(\d+)w/);
      if (m) remember(m[1], Number(m[2]));
    }
  }

  // JSON "image":"..." or "image":[...]
  for (const match of html.matchAll(/"image"\s*:\s*"([^"]+)"/g)) remember(match[1], 50);
  for (const match of html.matchAll(/"image"\s*:\s*\[([^\]]+)\]/g)) {
    for (const url of match[1].matchAll(/"([^"]+)"/g)) remember(url[1], 40);
  }

  // contentUrl on ImageObject nodes
  for (const match of html.matchAll(/"contentUrl"\s*:\s*"([^"]+)"/g)) remember(match[1], 60);

  return [...candidates.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([url]) => url)
    .slice(0, 8);
}

function guessCategory(text = "") {
  const t = text.toLowerCase();
  if (/\b(bag|handbag|tote|crossbody|satchel|clutch|wallet|pouch|backpack)\b/.test(t)) return "handbags";
  if (/\b(shoe|sneaker|trainer|loafer|heel|sandal|boot|pump)\b/.test(t)) return "shoes";
  if (/\b(lip|blush|foundation|eyeshadow|mascara|liner|gloss|brow|cheek|makeup|palette)\b/.test(t)) return "makeup";
  if (/\b(perfume|eau de|fragrance|cologne|edp|edt|parfum)\b/.test(t)) return "fragrance";
  return "accessories";
}

function guessVariantHint(category) {
  return {
    shoes: "Sizes 36–42 EU available on request. DM to confirm your size.",
    handbags: "Multiple colors may be available. DM to confirm colorway.",
    makeup: "Shade options on request. DM to confirm your shade.",
    fragrance: "Sizes (30ml / 50ml / 90ml) on request.",
    accessories: "Variant options on request. DM before ordering.",
  }[category] || "Variant options on request.";
}

function brandFromUrl(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const dictionary = {
      "coach.com": "Coach",
      "toryburch.com": "Tory Burch",
      "katespade.com": "Kate Spade",
      "michaelkors.com": "Michael Kors",
      "nike.com": "Nike",
      "newbalance.com": "New Balance",
      "adidas.com": "Adidas",
      "sephora.com": "Sephora",
      "fentybeauty.com": "Fenty Beauty",
      "rarebeauty.com": "Rare Beauty",
      "dior.com": "Dior",
      "yslbeautyus.com": "YSL Beauty",
      "charlottetilbury.com": "Charlotte Tilbury",
      "maisonmargiela-fragrances.us": "Maison Margiela",
      "ray-ban.com": "Ray-Ban",
      "apple.com": "Apple",
      "nordstrom.com": "Nordstrom",
      "ulta.com": "Ulta",
    };
    return dictionary[host] || host.split(".")[0].replace(/^./, (c) => c.toUpperCase());
  } catch {
    return "";
  }
}

function priceFromJsonLd(node) {
  if (!node) return 0;
  const offers = node.offers;
  if (!offers) return 0;
  const list = Array.isArray(offers) ? offers : [offers];
  for (const offer of list) {
    const candidates = [offer.price, offer.priceSpecification?.price, offer.lowPrice, offer.highPrice];
    for (const p of candidates) {
      const num = Number(p);
      if (num > 0) return num;
    }
  }
  return 0;
}

// Retailer adapters — run after the generic JSON-LD pass for sites that
// don't expose JSON-LD or hide the real data inside other script blocks.
// Each adapter takes the raw HTML and returns a partial candidate, OR
// null if it can't extract anything useful.
const ADAPTERS = {
  // Sephora embeds full product JSON in window.__INITIAL_REDUX_STATE__ or
  // inside a JSON island; the og:image is usually the real hero, but the
  // JSON-LD price is often missing on category-level pages.
  "sephora.com": (html) => {
    const titleMatch = html.match(/"productName"\s*:\s*"([^"]+)"/);
    const priceMatch = html.match(/"listPrice"\s*:\s*"\$?([\d.]+)/)
                    || html.match(/"currentSku"\s*:\s*\{[^}]*"listPrice"\s*:\s*"\$?([\d.]+)/);
    const brandMatch = html.match(/"brand"\s*:\s*\{[^}]*"displayName"\s*:\s*"([^"]+)"/);
    return {
      title: titleMatch ? decodeEntities(titleMatch[1]) : "",
      brand: brandMatch ? decodeEntities(brandMatch[1]) : "Sephora",
      usa_price_usd: priceMatch ? Number(priceMatch[1]) : 0,
    };
  },
  // Ulta sometimes uses a similar embedded JSON.
  "ulta.com": (html) => {
    const titleMatch = html.match(/"name"\s*:\s*"([^"]{6,180})"\s*,\s*"image"/);
    const priceMatch = html.match(/"priceListPrice"\s*:\s*"\$?([\d.]+)/)
                    || html.match(/"salePrice"\s*:\s*"\$?([\d.]+)/);
    return {
      title: titleMatch ? decodeEntities(titleMatch[1]) : "",
      usa_price_usd: priceMatch ? Number(priceMatch[1]) : 0,
    };
  },
  // Nike — product data sits in NEXT_DATA. We sniff it out roughly.
  "nike.com": (html) => {
    const nextMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!nextMatch) return null;
    try {
      const data = JSON.parse(nextMatch[1]);
      // Search anywhere in the tree for the first object with fullTitle + price.
      const stack = [data];
      while (stack.length) {
        const node = stack.pop();
        if (node && typeof node === "object") {
          if (node.fullTitle && node.currentPrice != null) {
            return {
              title: String(node.fullTitle),
              usa_price_usd: Number(node.currentPrice),
            };
          }
          for (const v of Object.values(node)) {
            if (v && typeof v === "object") stack.push(v);
          }
        }
      }
    } catch {}
    return null;
  },
  // Nordstrom — has solid og:title and og:image but price often hidden
  // behind dynamic JS. Fall back to the price embedded in product JSON.
  "nordstrom.com": (html) => {
    const priceMatch = html.match(/"price"\s*:\s*\{[^}]*"currentPrice"\s*:\s*\{[^}]*"amount"\s*:\s*([\d.]+)/)
                    || html.match(/"currentPrice"\s*:\s*([\d.]+)/);
    return priceMatch ? { usa_price_usd: Number(priceMatch[1]) } : null;
  },
};

function runAdapter(host, html) {
  const key = Object.keys(ADAPTERS).find((domain) => host.endsWith(domain));
  if (!key) return null;
  try {
    return ADAPTERS[key](html);
  } catch {
    return null;
  }
}

// Category-default shipping band in PKR. Used as the suggested shipping
// when the admin hasn't overridden per-product. Conservative estimates.
const SHIPPING_DEFAULTS_PKR = {
  handbags: 4500,
  shoes: 5500,
  makeup: 2500,
  fragrance: 3500,
  accessories: 2500,
};

function suggestedPkrPrice(usd, category, settings) {
  const fx = Number(settings.fx_rate || 282);
  const markup = Number(settings.markup_rate || 0.25);
  const shipping = SHIPPING_DEFAULTS_PKR[category] || 3500;
  const retailPkr = Number(usd || 0) * fx;
  return Math.ceil(retailPkr + retailPkr * markup + shipping);
}

// Look up an existing product by source_url so the tray can flag
// duplicates instead of creating a second product. Best-effort: if
// Supabase isn't configured we just say "no duplicate".
async function findExistingBySourceUrl(url) {
  if (!hasSupabase() || !url) return null;
  try {
    const rows = await supabase(
      `/rest/v1/products?source_url=eq.${encodeURIComponent(url)}&select=id,title&limit=1`
    );
    return rows[0] || null;
  } catch {
    return null;
  }
}

// Core single-URL fetcher — returns { ok, candidate?, error?, existing? }.
async function fetchOne(rawUrl, settings) {
  const url = String(rawUrl || "").trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    return { url: rawUrl, ok: false, error: "Invalid URL", status: "error" };
  }

  const existing = await findExistingBySourceUrl(url);
  if (existing) {
    return {
      url,
      ok: true,
      status: "duplicate",
      existing_product_id: existing.id,
      existing_title: existing.title,
    };
  }

  let html = "";
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; GlobalBestieBot/1.0; +team approved publishing)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(9000),
    });
    if (!response.ok) {
      return {
        url,
        ok: false,
        status: "blocked",
        error: `Retailer returned ${response.status}. Likely bot-blocked — fill manually or send on WhatsApp.`,
      };
    }
    html = await response.text();
  } catch (err) {
    return {
      url,
      ok: false,
      status: "blocked",
      error: `Could not fetch the URL: ${err.message}. Many retailers block server-side fetches.`,
    };
  }

  // Generic extraction first.
  const jsonld = extractJsonLd(html);
  const ogTitle = pickMeta(html, "og:title", "twitter:title");
  const ogDesc = pickMeta(html, "og:description", "twitter:description", "description");
  const htmlTitle = (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || "").trim();
  let title = jsonld?.name || ogTitle || htmlTitle || "";
  let description = jsonld?.description || ogDesc || "";
  let brand = (typeof jsonld?.brand === "string" ? jsonld.brand : jsonld?.brand?.name) || "";
  let priceUsd = priceFromJsonLd(jsonld);
  const images = [
    ...(Array.isArray(jsonld?.image) ? jsonld.image : jsonld?.image ? [jsonld.image] : []),
    ...extractImagesFromHtml(html),
  ];

  // Adapter pass — fills in whatever the generic parser missed.
  const adapter = runAdapter(host, html);
  if (adapter) {
    if (!title && adapter.title) title = adapter.title;
    if (!brand && adapter.brand) brand = adapter.brand;
    if (!priceUsd && adapter.usa_price_usd) priceUsd = adapter.usa_price_usd;
  }

  if (!brand) brand = brandFromUrl(url);

  const uniqueImages = [...new Set(images.filter((u) => typeof u === "string" && /^https?:\/\//i.test(u)))].slice(0, 8);
  const category = jsonld?.category || guessCategory(`${title} ${description}`);

  // Re-host the scraped images in our own bucket so retailer URL rot can't
  // break products later. Best-effort: if Supabase isn't configured we just
  // pass the original URLs through.
  let storedImages = uniqueImages;
  if (hasSupabase() && uniqueImages.length) {
    const tempId = `incoming-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    storedImages = (await Promise.all(
      uniqueImages.map((src) => downloadAndStoreImage(tempId, src).catch(() => null))
    )).filter(Boolean);
  }

  const candidate = {
    title: decodeEntities(title).slice(0, 180),
    brand: decodeEntities(String(brand || "")).slice(0, 80),
    category,
    description: decodeEntities(description).slice(0, 1200),
    usa_price_usd: priceUsd,
    image_url: storedImages[0] || "",
    gallery_urls: storedImages,
    source_url: url,
    variants: guessVariantHint(category),
    authenticity_note: "Verify official retailer source and attach receipt before publishing.",
    // Suggested PKR price + shipping for the admin to confirm. Helps the
    // bulk save flow — no need to open each product to compute pricing.
    suggested_customer_price_pkr: suggestedPkrPrice(priceUsd, category, settings),
    suggested_shipping_pkr: SHIPPING_DEFAULTS_PKR[category] || 3500,
  };

  // Decide an overall status code.
  let status = "ok";
  if (!candidate.title && !candidate.usa_price_usd) status = "blocked";
  else if (!candidate.title || !candidate.usa_price_usd) status = "partial";

  return { url, ok: true, status, candidate };
}

// Run an async function over a list with a concurrency cap.
async function runWithConcurrency(items, fn, concurrency = 4) {
  const results = new Array(items.length);
  let i = 0;
  const workers = Array(Math.min(concurrency, items.length)).fill(0).map(async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

export default async (req) => {
  if (!requireAdmin(req)) return json({ error: "Unauthorized" }, { status: 401 });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

  try {
    const body = await req.json();
    const settings = hasSupabase() ? await getSettings().catch(() => ({})) : {};

    // Bulk path
    if (Array.isArray(body.urls)) {
      const urls = body.urls.filter((u) => u && typeof u === "string").slice(0, 50);
      if (!urls.length) return json({ error: "Provide at least one URL." }, { status: 400 });
      const results = await runWithConcurrency(urls, (url) => fetchOne(url, settings), 4);
      return json({
        results,
        configured: hasSupabase(),
        settings: {
          fx_rate: Number(settings.fx_rate || 282),
          markup_rate: Number(settings.markup_rate || 0.25),
        },
      });
    }

    // Single-URL path (legacy)
    const url = body.url;
    if (!url) return json({ error: "Provide a URL or an array of URLs" }, { status: 400 });
    const result = await fetchOne(url, settings);
    // Preserve the legacy shape so existing single-URL callers keep working.
    if (result.status === "duplicate") {
      return json({
        existing_product_id: result.existing_product_id,
        existing_title: result.existing_title,
        source_url: url,
        configured: hasSupabase(),
      });
    }
    if (!result.ok || !result.candidate) {
      return json({ error: result.error || "Could not parse this URL.", source_url: url }, { status: 200 });
    }
    return json({ candidate: result.candidate, configured: hasSupabase() });
  } catch (error) {
    return json({ error: error.message }, { status: 500 });
  }
};

export const config = {
  path: "/api/admin/fetch-product",
};
