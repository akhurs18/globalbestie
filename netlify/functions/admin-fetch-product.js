// Admin-only endpoint that takes a retailer product URL (Coach, Sephora,
// Nordstrom, etc.) and returns a half-filled product candidate ready for the
// approval modal. It does its best on the open web; retailer pages that load
// product data via client-side JS will return less. The user is expected to
// review/edit before publishing — this is autofill, not autopilot.

import { downloadAndStoreImage, hasSupabase, json, requireAdmin } from "./_shared/supabase.js";

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
  // Pull every <script type="application/ld+json"> block and try to parse it.
  // Some pages have multiple — we look for one with @type=Product.
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
      // Some sites emit invalid JSON-LD; skip and try the next block.
    }
  }
  return null;
}

function extractImagesFromHtml(html) {
  const og = [];
  const ogRe = /<meta[^>]+(?:property|name)=["'](?:og:image|og:image:secure_url|og:image:url|twitter:image)["'][^>]+content=["']([^"']+)["']/gi;
  for (const match of html.matchAll(ogRe)) og.push(match[1]);

  // Any image URLs that appear in `"image":"..."` or `"image":[...]` pairs.
  const inline = [];
  for (const match of html.matchAll(/"image"\s*:\s*"([^"]+)"/g)) inline.push(match[1]);
  for (const match of html.matchAll(/"image"\s*:\s*\[([^\]]+)\]/g)) {
    for (const url of match[1].matchAll(/"([^"]+)"/g)) inline.push(url[1]);
  }
  return [...new Set([...og, ...inline])].filter((u) => /^https?:\/\//i.test(u)).slice(0, 8);
}

function guessCategory(text = "") {
  const t = text.toLowerCase();
  if (/\b(bag|handbag|tote|crossbody|satchel|clutch|wallet|pouch|backpack)\b/.test(t)) return "handbags";
  if (/\b(shoe|sneaker|trainer|loafer|heel|sandal|boot|pump)\b/.test(t)) return "shoes";
  if (/\b(lip|blush|foundation|eyeshadow|mascara|liner|gloss|brow|cheek|makeup)\b/.test(t)) return "makeup";
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

export default async (req) => {
  if (!requireAdmin(req)) return json({ error: "Unauthorized" }, { status: 401 });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

  try {
    const { url } = await req.json();
    if (!url || !/^https?:\/\//i.test(url)) {
      return json({ error: "Provide a valid http(s) URL" }, { status: 400 });
    }

    let html = "";
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; GlobalBestieBot/1.0; +team approved publishing)",
          Accept: "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        return json({
          error: `Retailer returned ${response.status}. Most likely the page is bot-blocked — paste the title and price manually.`,
          source_url: url,
        }, { status: 200 });
      }
      html = await response.text();
    } catch (err) {
      return json({
        error: `Could not fetch the URL: ${err.message}. Many retailers block server-side fetches; you can still create the product manually.`,
        source_url: url,
      }, { status: 200 });
    }

    const jsonld = extractJsonLd(html);
    const ogTitle = pickMeta(html, "og:title", "twitter:title");
    const ogDesc = pickMeta(html, "og:description", "twitter:description", "description");
    const htmlTitle = (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || "").trim();
    const title = jsonld?.name || ogTitle || htmlTitle || "";
    const description = jsonld?.description || ogDesc || "";
    const brand = (typeof jsonld?.brand === "string" ? jsonld.brand : jsonld?.brand?.name) || brandFromUrl(url);
    const priceUsd = priceFromJsonLd(jsonld);
    const images = [
      ...(Array.isArray(jsonld?.image) ? jsonld.image : jsonld?.image ? [jsonld.image] : []),
      ...extractImagesFromHtml(html),
    ];
    const uniqueImages = [...new Set(images.filter((u) => typeof u === "string" && /^https?:\/\//i.test(u)))].slice(0, 8);
    const category = jsonld?.category || guessCategory(`${title} ${description}`);

    // Re-host the scraped images in our own bucket so retailer URL rot can't
    // break products later. Best-effort: if Supabase isn't configured we just
    // pass the original URLs through.
    let storedImages = uniqueImages;
    if (hasSupabase() && uniqueImages.length) {
      const tempId = `incoming-${Date.now()}`;
      storedImages = await Promise.all(
        uniqueImages.map((src) => downloadAndStoreImage(tempId, src))
      );
    }

    return json({
      candidate: {
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
      },
      configured: true,
    });
  } catch (error) {
    return json({ error: error.message }, { status: 500 });
  }
};

export const config = {
  path: "/api/admin/fetch-product",
};
