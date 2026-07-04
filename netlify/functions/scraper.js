import { getTrends, hasSupabase, json, requireAdmin, supabase } from "./_shared/supabase.js";

const TREND_SOURCES = [
  {
    name: "Nike women new arrivals",
    category: "shoes",
    url: "https://www.nike.com/w/womens-new-shoes-3n82yz5e1x6zy7ok",
  },
  {
    name: "Sephora makeup new arrivals",
    category: "makeup",
    url: "https://www.sephora.com/beauty/new-makeup",
  },
  {
    name: "Coach new bags",
    category: "handbags",
    url: "https://www.coach.com/shop/women/handbags/new-arrivals",
  },
];

const FALLBACK_TRENDS = [
  {
    id: "trend-tory-fleming-mini",
    title: "Tory Burch Fleming Mini",
    category: "handbags",
    source_url: "https://www.toryburch.com/",
    usa_price_usd: 398,
    shipping_pkr: 15000,
    score: 91,
    status: "pending",
    image_url: "https://images.unsplash.com/photo-1566150905458-1bf1fc113f0d?auto=format&fit=crop&w=900&q=84",
    production_status: "needs_assets",
    suggested_description:
      "Luxury preorder candidate. Confirm size + material, then add official images. Remotion: 0–2s hero shot, 2–5s price reveal, 5–8s preorder timeline (4 weeks), CTA to DM/order.",
  },
  {
    id: "trend-charlotte-pillow-talk",
    title: "Charlotte Tilbury Pillow Talk",
    category: "makeup",
    source_url: "https://www.charlottetilbury.com/",
    usa_price_usd: 35,
    shipping_pkr: 4200,
    score: 89,
    status: "pending",
    image_url: "https://images.unsplash.com/photo-1631214540242-3cd8c30f9f60?auto=format&fit=crop&w=900&q=84",
    production_status: "needs_assets",
    suggested_description:
      "High-intent beauty preorder candidate. Confirm shade/size. Remotion: macro texture + shade name overlay, price reveal, preorder timeline, ‘shade confirm before sourcing’ note.",
  },
];

const CATEGORY_DEFAULTS = {
  handbags: { usd: 325, shipping: 15000 },
  shoes: { usd: 120, shipping: 11000 },
  makeup: { usd: 35, shipping: 4800 },
  fragrance: { usd: 105, shipping: 6500 },
  accessories: { usd: 165, shipping: 8500 },
};

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function inferBrand(title = "") {
  return title.split(" ").slice(0, 2).join(" ").replace(/[^\w\s&.-]/g, "").trim() || "Global Bestie";
}

function extractImageUrls(html) {
  const urls = [
    ...[...html.matchAll(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)["']/gi)].map((match) => match[1]),
    ...[...html.matchAll(/"image"\s*:\s*(?:"([^"]+)"|\[([^\]]+)\])/gi)].flatMap((match) => {
      if (match[1]) return [match[1]];
      return [...String(match[2] || "").matchAll(/"([^"]+)"/g)].map((item) => item[1]);
    }),
  ].filter((url) => /^https?:\/\//i.test(url));
  return [...new Set(urls)].slice(0, 8);
}

// Customer-facing description generator. Kept deliberately short, free of
// internal merchandising language (no "selling angles", "high intent",
// "service margin", source URLs, or 50%-advance payment notes — that's
// surfaced separately on the storefront via the order-summary card).
function buildProductDescription({ title, category, variant = "" }) {
  const categoryCopy = {
    handbags: "A polished USA-sourced handbag, packed with dust bag and authenticity-first attention.",
    shoes: "USA-sourced sneakers with authentic packaging and full-size availability.",
    makeup: "A curated beauty pick sourced from USA retail with shade confirmation before dispatch.",
    fragrance: "A premium fragrance sourced from USA retail with gift-ready packaging.",
    accessories: "A branded accessory sourced from USA retail and packed for safe Pakistan delivery.",
  };
  const lead = categoryCopy[category] || "A curated USA-sourced piece, handpicked for Global Bestie customers in Pakistan.";
  const variantNote = variant ? ` Available in ${String(variant).toLowerCase()}.` : "";
  return lead + variantNote;
}

function makeRemotionBrief(candidate) {
  return {
    format: "9:16 Reel",
    duration_seconds: 10,
    manual_step: "Run in Remotion manually after replacing any placeholder image with approved product media.",
    scenes: [
      { time: "0-2s", instruction: "Product-first hero image with brand/title overlay." },
      { time: "2-5s", instruction: "Show USA price, PKR price, and 50% preorder advance." },
      { time: "5-8s", instruction: "Show 4-week USA-to-Pakistan preorder timeline." },
      { time: "8-10s", instruction: "CTA: order on Global Bestie or WhatsApp for size/shade confirmation." },
    ],
    caption: `${candidate.title} now open for USA preorder. 50% advance, remaining balance after Pakistan arrival before local dispatch. DM to confirm size/shade.`,
  };
}

function completeCandidate(candidate, index = 0) {
  const category = candidate.category || "accessories";
  const defaults = CATEGORY_DEFAULTS[category] || CATEGORY_DEFAULTS.accessories;
  const imageUrl = candidate.image_url || "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=900&q=84";
  const description = candidate.suggested_description || buildProductDescription({
    title: candidate.title || "USA preorder product",
    category,
    variant: candidate.variants || "",
  });
  return {
    id: candidate.id || `trend-${slugify(candidate.title || `candidate-${index}`)}-${String(index).padStart(3, "0")}`,
    batch_id: candidate.batch_id,
    title: candidate.title || `USA ${category} preorder candidate`,
    brand: candidate.brand || inferBrand(candidate.title || ""),
    category,
    source_url: candidate.source_url || "https://www.sephora.com/",
    usa_price_usd: Number(candidate.usa_price_usd || defaults.usd),
    shipping_pkr: Number(candidate.shipping_pkr || defaults.shipping),
    score: Number(candidate.score || Math.max(70, 95 - index)),
    status: candidate.status || "pending",
    image_url: imageUrl,
    suggested_description: description.length >= 60 ? description : `${description} Final product details can be adjusted by the team before approval.`,
    asset_urls: Array.isArray(candidate.asset_urls) && candidate.asset_urls.length ? candidate.asset_urls : [imageUrl],
    production_status: candidate.production_status || "ready_for_review",
    variants: candidate.variants || "Confirm size, shade, color, or volume before approval.",
    authenticity_note: candidate.authenticity_note || "Verify official retailer source and attach receipt before publishing.",
    social_proof: candidate.social_proof || "Review candidate for the next Global Bestie USA preorder batch.",
    remotion_brief: candidate.remotion_brief || makeRemotionBrief(candidate),
    raw_source: candidate.raw_source || "curated_seed",
    created_at: candidate.created_at || new Date().toISOString(),
  };
}

function makeSeedCandidates(batchId = "", targetCount = 10) {
  const IMAGES = {
    handbags: [
      "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=900&q=84",
      "https://images.unsplash.com/photo-1594223274512-ad4803739b7c?auto=format&fit=crop&w=900&q=84",
      "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?auto=format&fit=crop&w=900&q=84",
      "https://images.unsplash.com/photo-1566150905458-1bf1fc113f0d?auto=format&fit=crop&w=900&q=84",
      "https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=900&q=84",
    ],
    shoes: [
      "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=84",
      "https://images.unsplash.com/photo-1543163521-1bf539c55dd2?auto=format&fit=crop&w=900&q=84",
      "https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?auto=format&fit=crop&w=900&q=84",
      "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?auto=format&fit=crop&w=900&q=84",
      "https://images.unsplash.com/photo-1460353581641-37baddab0fa2?auto=format&fit=crop&w=900&q=84",
    ],
    makeup: [
      "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=900&q=84",
      "https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=900&q=84",
      "https://images.unsplash.com/photo-1631214540242-3cd8c30f9f60?auto=format&fit=crop&w=900&q=84",
      "https://images.unsplash.com/photo-1583241800698-e8ab01830a6a?auto=format&fit=crop&w=900&q=84",
      "https://images.unsplash.com/photo-1586495777744-4e6ffeef8041?auto=format&fit=crop&w=900&q=84",
    ],
    fragrance: [
      "https://images.unsplash.com/photo-1541643600914-78b084683702?auto=format&fit=crop&w=900&q=84",
      "https://images.unsplash.com/photo-1595535873420-a599195b3f4a?auto=format&fit=crop&w=900&q=84",
      "https://images.unsplash.com/photo-1588405748880-12d1d2a59f75?auto=format&fit=crop&w=900&q=84",
      "https://images.unsplash.com/photo-1615634260167-c8cdede054de?auto=format&fit=crop&w=900&q=84",
      "https://images.unsplash.com/photo-1610461888750-10bfc601b4a6?auto=format&fit=crop&w=900&q=84",
    ],
    accessories: [
      "https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=900&q=84",
      "https://images.unsplash.com/photo-1574258495973-f010dfbb5371?auto=format&fit=crop&w=900&q=84",
      "https://images.unsplash.com/photo-1572635196237-14b3f281503f?auto=format&fit=crop&w=900&q=84",
      "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=84",
      "https://images.unsplash.com/photo-1585386959984-a4155224a1ad?auto=format&fit=crop&w=900&q=84",
    ],
  };

  const seeds = [
    // Handbags
    { brand: "Coach", title: "Tabby Shoulder Bag 26", category: "handbags", url: "https://www.coach.com/", usd: 395, ship: 14500, score: 96, angle: "most-requested blush/neutral", hook: "Unbox → price reveal → 4-week preorder window." },
    { brand: "Coach", title: "Brooklyn Shoulder Bag 28", category: "handbags", url: "https://www.coach.com/", usd: 295, ship: 14500, score: 92, angle: "everyday shoulder bag", hook: "Outfit match + capacity shots + preorder timeline." },
    { brand: "Tory Burch", title: "Kira Chevron Small Convertible", category: "handbags", url: "https://www.toryburch.com/", usd: 498, ship: 15500, score: 94, angle: "wedding-season polish", hook: "Gold hardware close-ups + price reveal + preorder." },
    { brand: "Kate Spade", title: "Knott Medium Satchel", category: "handbags", url: "https://www.katespade.com/", usd: 398, ship: 14500, score: 88, angle: "work-to-dinner", hook: "Day-to-night montage + preorder window." },
    { brand: "Michael Kors", title: "Jet Set Travel Medium", category: "handbags", url: "https://www.michaelkors.com/", usd: 228, ship: 14000, score: 85, angle: "logo classic", hook: "Logo detail + straps + price reveal." },

    // Shoes
    { brand: "Nike", title: "V2K Run (Pink/Neutral)", category: "shoes", url: "https://www.nike.com/", usd: 120, ship: 10500, score: 95, angle: "soft pink streetwear", hook: "On-feet + comfort claim (no medical) + preorder timeline." },
    { brand: "Nike", title: "Air Force 1 (White)", category: "shoes", url: "https://www.nike.com/", usd: 115, ship: 10500, score: 90, angle: "always-on staple", hook: "Before/after outfit match + price reveal." },
    { brand: "New Balance", title: "530 (Silver)", category: "shoes", url: "https://www.newbalance.com/", usd: 100, ship: 11000, score: 92, angle: "trend sneaker", hook: "2 looks + preorder timeline + sizing note." },
    { brand: "Adidas", title: "Samba OG", category: "shoes", url: "https://www.adidas.com/", usd: 100, ship: 11000, score: 89, angle: "clean minimal", hook: "Close-up texture + ‘limited restocks’ (if verified) + preorder." },

    // Makeup
    { brand: "Rare Beauty", title: "Soft Pinch Liquid Blush", category: "makeup", url: "https://www.sephora.com/brand/rare-beauty-by-selena-gomez", usd: 25, ship: 4500, score: 95, angle: "shade-confirm preorder", hook: "Swatch overlay + shade name + preorder timeline." },
    { brand: "Dior", title: "Lip Glow Oil", category: "makeup", url: "https://www.dior.com/", usd: 40, ship: 5200, score: 92, angle: "luxury beauty gift", hook: "Gloss shine macro + price reveal + preorder window." },
    { brand: "Fenty Beauty", title: "Gloss Bomb", category: "makeup", url: "https://fentybeauty.com/", usd: 24, ship: 4500, score: 88, angle: "viral gloss", hook: "Before/after lips + shade list CTA." },
    { brand: "Sephora", title: "Makeup Favorites Set", category: "makeup", url: "https://www.sephora.com/", usd: 45, ship: 5200, score: 84, angle: "value set", hook: "What’s inside quick cuts + preorder timeline." },

    // Fragrance
    { brand: "YSL Beauty", title: "Libre Eau de Parfum", category: "fragrance", url: "https://www.yslbeautyus.com/", usd: 110, ship: 6500, score: 92, angle: "best-seller scent", hook: "Bottle glam + ‘DM for size options’ + preorder window." },
    { brand: "Dior", title: "Miss Dior Eau de Parfum", category: "fragrance", url: "https://www.dior.com/", usd: 125, ship: 6500, score: 90, angle: "gift-season", hook: "Ribbon bottle shot + price reveal + preorder timeline." },
    { brand: "Maison Margiela", title: "REPLICA By the Fireplace", category: "fragrance", url: "https://www.maisonmargiela-fragrances.us/", usd: 85, ship: 6500, score: 86, angle: "cozy niche vibe", hook: "Aesthetic B-roll + preorder timeline." },

    // Accessories
    { brand: "Ray-Ban", title: "Wayfarer Classic", category: "accessories", url: "https://www.ray-ban.com/", usd: 163, ship: 8500, score: 87, angle: "icon accessory", hook: "Face-on try-on + price reveal + preorder." },
    { brand: "Apple", title: "AirPods Pro", category: "accessories", url: "https://www.apple.com/", usd: 249, ship: 9500, score: 83, angle: "high-ticket accessory", hook: "Unbox-style shots + pricing + preorder window." },
  ];

  const variantsByCategory = {
    handbags: ["Black", "Blush Pink", "Taupe", "Ivory", "Burgundy"],
    shoes: ["EU 37–40 sizes", "Pink/White", "Beige", "Black/White"],
    makeup: ["Shade 1–3 options", "Mini vs Full size", "Set variant"],
    fragrance: ["30ml / 50ml / 90ml", "Gift set option", "EDP vs EDT"],
    accessories: ["Color options", "Gift-ready", "Limited drop (verify)"],
  };

  const candidates = [];
  let cursor = 0;
  while (candidates.length < targetCount) {
    const seed = seeds[cursor % seeds.length];
    const variantList = variantsByCategory[seed.category] || ["Variant"];
    const variant = variantList[Math.floor(cursor / seeds.length) % variantList.length];
    const title = `${seed.brand} ${seed.title} · ${variant}`;
    const id = `trend-${slugify(title).slice(0, 48)}-${String(cursor).padStart(3, "0")}`;
    // Give each candidate the FULL category image pool (5 images), with
    // the hero rotated so consecutive candidates don't all start on the
    // same shot. Each suggested card then shows a proper gallery — hero
    // plus thumbnail strip — instead of one lonely image.
    const pool = IMAGES[seed.category] || IMAGES.handbags;
    const heroOffset = cursor % pool.length;
    const gallery = [...pool.slice(heroOffset), ...pool.slice(0, heroOffset)];
    candidates.push({
      id,
      batch_id: batchId,
      title,
      brand: seed.brand,
      category: seed.category,
      source_url: seed.url,
      usa_price_usd: seed.usd,
      shipping_pkr: seed.ship,
      score: Math.max(70, seed.score - Math.floor(candidates.length / 8)),
      status: "pending",
      image_url: gallery[0],
      suggested_description: buildProductDescription({
        title,
        category: seed.category,
        angle: seed.angle,
        variant,
        source: seed.url,
      }),
      asset_urls: gallery,
      production_status: "ready_for_review",
      variants: variant,
      authenticity_note: "Verify official retailer source and attach receipt before publishing.",
      social_proof: seed.angle,
      remotion_brief: makeRemotionBrief({ title }),
      raw_source: `fallback_seed:${seed.brand}`,
      created_at: new Date().toISOString(),
    });
    cursor += 1;
  }
  return candidates;
}

function extractCandidates(html, source, limit = 67, batchId = "") {
  const titles = [...html.matchAll(/<title[^>]*>(.*?)<\/title>/gis)]
    .map((match) => match[1].replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const jsonLdNames = [...html.matchAll(/"name"\s*:\s*"([^"]{8,90})"/g)]
    .map((match) => match[1].replace(/\\"/g, '"'))
    .filter((title) => !/sign in|privacy|shipping/i.test(title));

  const imageUrls = extractImageUrls(html);
  return [...new Set([...jsonLdNames, ...titles])]
    .slice(0, limit)
    .map((title, index) => ({
      id: `trend-${slugify(title).slice(0, 54)}`,
      batch_id: batchId,
      title,
      brand: inferBrand(title),
      category: source.category,
      source_url: source.url,
      usa_price_usd: CATEGORY_DEFAULTS[source.category]?.usd || CATEGORY_DEFAULTS.accessories.usd,
      shipping_pkr: CATEGORY_DEFAULTS[source.category]?.shipping || CATEGORY_DEFAULTS.accessories.shipping,
      score: Math.max(70, 96 - index * 4),
      status: "pending",
      image_url: imageUrls[index % Math.max(1, imageUrls.length)] || "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=900&q=84",
      suggested_description: buildProductDescription({ title, category: source.category, source: source.name }),
      asset_urls: imageUrls,
      production_status: imageUrls.length ? "ready_for_remotion" : "needs_assets",
      variants: "Confirm size, shade, color, or volume before approval.",
      authenticity_note: "Verify official source and attach receipt before publishing.",
      social_proof: `Candidate from ${source.name}`,
      remotion_brief: makeRemotionBrief({ title }),
      raw_source: source.name,
      created_at: new Date().toISOString(),
    }));
}

async function scrapeSources(targetCount = 10, batchId = "") {
  const limitPerSource = Math.max(4, Math.ceil(targetCount / TREND_SOURCES.length));
  const batches = await Promise.allSettled(
    TREND_SOURCES.map(async (source) => {
      const response = await fetch(source.url, {
        headers: {
          "User-Agent": "GlobalBestieTrendBot/1.0 (+team approved publishing)",
          Accept: "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(`${source.name}: ${response.status}`);
      return extractCandidates(await response.text(), source, limitPerSource, batchId);
    })
  );

  const candidates = batches.flatMap((result) => (result.status === "fulfilled" ? result.value : []))
    .map((candidate, index) => completeCandidate(candidate, index));
  const seedCandidates = makeSeedCandidates(batchId, targetCount).slice(0, targetCount);
  if (candidates.length) {
    const seenIds = new Set(candidates.map((candidate) => candidate.id));
    const topUps = seedCandidates.filter((candidate) => !seenIds.has(candidate.id));
    return [...candidates, ...topUps].slice(0, targetCount).map((candidate, index) => completeCandidate(candidate, index));
  }

  if (seedCandidates.length) return seedCandidates.map((candidate, index) => completeCandidate(candidate, index));

  return FALLBACK_TRENDS.map((candidate) => ({
    ...candidate,
    batch_id: batchId,
    suggested_description: candidate.suggested_description || "Fallback trend candidate. Add final product copy and media before approval.",
    asset_urls: candidate.asset_urls || [],
    asset_urls: candidate.asset_urls || [candidate.image_url],
    production_status: candidate.production_status || "ready_for_review",
    brand: candidate.brand || inferBrand(candidate.title),
    variants: candidate.variants || "Confirm variant before approval.",
    authenticity_note: candidate.authenticity_note || "Verify source before approval.",
    social_proof: candidate.social_proof || "Trend candidate for preorder testing.",
    remotion_brief: candidate.remotion_brief || makeRemotionBrief(candidate),
  })).slice(0, targetCount).map((candidate, index) => completeCandidate(candidate, index));
}

export default async (req) => {
  if (req.method === "POST" && !(await requireAdmin(req))) return json({ error: "Unauthorized" }, { status: 401 });

  try {
    const payload = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const targetCount = Math.min(10, Math.max(1, Number(payload.target_count || 10)));
    const batchId = payload.batch_id || `batch-${new Date().toISOString().slice(0, 10)}`;
    const candidates = await scrapeSources(targetCount, batchId);
    if (!hasSupabase()) return json({ trends: candidates, configured: false });

    await supabase("/rest/v1/trend_batches?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({
        id: batchId,
        source: "daily_marketing_agent",
        target_count: targetCount,
        fetched_count: candidates.length,
        status: "fetched",
        notes: "Fetched 10 complete candidates for manual review before publishing.",
      }),
    });

    await supabase("/rest/v1/trend_candidates?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(candidates),
    });

    const trends = await getTrends();
    return json({ trends, batch: { id: batchId, target_count: targetCount, fetched_count: candidates.length }, configured: true });
  } catch (error) {
    return json({ error: error.message, trends: FALLBACK_TRENDS }, { status: 200 });
  }
};

export const config = {
  schedule: "@daily",
};
