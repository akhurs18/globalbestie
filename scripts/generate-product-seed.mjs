// Generates seeds/product-import-100.json — 100 review-ready product DRAFTS
// for the portal bulk importer (Portal → Products → import). Output matches
// the shape normalizeImportedProduct() expects in assets/app.js.
//
// IMPORTANT — images are PLACEHOLDERS. Brand sites (Coach, Sephora, Nike…)
// block automated fetching and their CDN images are hotlink-protected, so we
// cannot embed real brand photos here. Every listing carries a category
// placeholder + an authenticity_note flag telling the team to replace it with
// the real brand photo during review (the portal's fetch/upload re-hosts it to
// Supabase via downloadAndStoreImage). Nothing here should be PUBLISHED until
// its image is replaced and its price verified — they import as drafts.
//
// Run: node scripts/generate-product-seed.mjs

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "..", "seeds", "product-import-100.json");

// Official brand domains (accurate at the brand level — the team adds the deep
// product URL when they source the real image).
const BRAND_URL = {
  Coach: "https://www.coach.com/",
  "Michael Kors": "https://www.michaelkors.com/",
  "Kate Spade": "https://www.katespade.com/",
  "Tory Burch": "https://www.toryburch.com/",
  "Marc Jacobs": "https://www.marcjacobs.com/",
  Furla: "https://www.furla.com/us/en/",
  Fossil: "https://www.fossil.com/",
  Nike: "https://www.nike.com/",
  Adidas: "https://www.adidas.com/us",
  "New Balance": "https://www.newbalance.com/",
  Converse: "https://www.converse.com/",
  Vans: "https://www.vans.com/",
  "Sam Edelman": "https://www.samedelman.com/",
  "Steve Madden": "https://www.stevemadden.com/",
  Birkenstock: "https://www.birkenstock.com/us",
  Crocs: "https://www.crocs.com/",
  UGG: "https://www.ugg.com/",
  "Charlotte Tilbury": "https://www.charlottetilbury.com/us",
  "Rare Beauty": "https://www.rarebeauty.com/",
  "Fenty Beauty": "https://fentybeauty.com/",
  NARS: "https://www.narscosmetics.com/",
  MAC: "https://www.maccosmetics.com/",
  Dior: "https://www.dior.com/",
  Benefit: "https://www.benefitcosmetics.com/",
  Tarte: "https://tartecosmetics.com/",
  "Too Faced": "https://www.toofaced.com/",
  "Laura Mercier": "https://www.lauramercier.com/",
  "e.l.f.": "https://www.elfcosmetics.com/",
  Maybelline: "https://www.maybelline.com/",
  NYX: "https://www.nyxcosmetics.com/",
  "Anastasia Beverly Hills": "https://www.anastasiabeverlyhills.com/",
  "Sol de Janeiro": "https://soldejaneiro.com/",
  YSL: "https://www.yslbeautyus.com/",
  Chanel: "https://www.chanel.com/us/",
  "Viktor&Rolf": "https://www.viktor-rolf.com/",
  "Carolina Herrera": "https://www.carolinaherrera.com/",
  Lancome: "https://www.lancome-usa.com/",
  Versace: "https://www.versace.com/us/en/",
  "Ariana Grande": "https://www.ulta.com/",
  "Billie Eilish": "https://www.billieeilishfragrances.com/",
  "Ray-Ban": "https://www.ray-ban.com/usa",
};

// Working shipping estimate (PKR) by category — the team adjusts per item.
const SHIPPING_PKR = {
  handbags: 3500,
  shoes: 4000,
  makeup: 1500,
  fragrance: 2200,
  accessories: 2000,
};

// Category placeholder images (clearly NOT the real product — replaced in
// review). Reuses the project's existing editorial stock so the draft grid
// still looks coherent while the team swaps real photos in.
const PLACEHOLDER = {
  handbags: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=900&q=84",
  shoes: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=84",
  makeup: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=900&q=84",
  fragrance: "https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?auto=format&fit=crop&w=900&q=84",
  accessories: "https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=900&q=84",
};

const VARIANT_HINT = {
  handbags: "Confirm colour with concierge (e.g. black, tan, blush).",
  shoes: "Confirm US size + colourway with concierge.",
  makeup: "Confirm shade with concierge.",
  fragrance: "Confirm size (e.g. 50ml / 90ml) with concierge.",
  accessories: "Confirm colour / style with concierge.",
};

// Per-category authenticity / handling line woven into the description.
const CATEGORY_LINE = {
  handbags: "Authenticated piece with original dust bag and care card.",
  shoes: "Brand-new in box — original box available for an extra Rs 2,500 on request.",
  makeup: "Sealed and authentic with fresh batch codes.",
  fragrance: "Sealed retail packaging, authentic and batch-coded.",
  accessories: "Authenticated with original brand packaging.",
};

// ── The 100 products — real brands, real models, realistic USA retail (USD).
// Prices are accurate-tier (verify the exact current retail in review). ──
const P = [
  // ── Handbags (28) ──
  ["Coach", "Tabby Shoulder Bag 26", "handbags", 495],
  ["Coach", "Willow Tote 24", "handbags", 450],
  ["Coach", "Pillow Tabby 18", "handbags", 595],
  ["Coach", "Brooklyn Shoulder Bag 28", "handbags", 550],
  ["Coach", "Teri Shoulder Bag", "handbags", 350],
  ["Coach", "Cassie Crossbody 19", "handbags", 350],
  ["Coach", "Hampton Hobo", "handbags", 425],
  ["Michael Kors", "Jet Set Medium Tote", "handbags", 398],
  ["Michael Kors", "Hamilton Legacy Satchel", "handbags", 448],
  ["Michael Kors", "Mercer Medium Messenger", "handbags", 358],
  ["Michael Kors", "Bedford Legacy Tote", "handbags", 328],
  ["Michael Kors", "Greenwich Small Saffiano", "handbags", 298],
  ["Michael Kors", "Voyager Medium Tote", "handbags", 378],
  ["Kate Spade", "Knott Medium Crossbody", "handbags", 349],
  ["Kate Spade", "Madison Saffiano Satchel", "handbags", 379],
  ["Kate Spade", "Sam Icon Nylon Medium", "handbags", 248],
  ["Kate Spade", "Cameron Street Hilli", "handbags", 299],
  ["Kate Spade", "Carlyle Shoulder Bag", "handbags", 358],
  ["Tory Burch", "Fleming Mini Bag", "handbags", 498],
  ["Tory Burch", "Robinson Convertible Tote", "handbags", 528],
  ["Tory Burch", "Kira Chevron Camera Bag", "handbags", 528],
  ["Tory Burch", "Lee Radziwill Petite", "handbags", 698],
  ["Tory Burch", "Ella Canvas Tote", "handbags", 268],
  ["Marc Jacobs", "The Tote Bag Medium", "handbags", 350],
  ["Marc Jacobs", "The Snapshot Camera Bag", "handbags", 295],
  ["Marc Jacobs", "The Leather Tote", "handbags", 395],
  ["Furla", "Metropolis Mini", "handbags", 328],
  ["Fossil", "Carmen Crossbody", "handbags", 168],

  // ── Shoes (24) ──
  ["Nike", "Air Force 1 '07", "shoes", 115],
  ["Nike", "Air Max 90", "shoes", 130],
  ["Nike", "Dunk Low Retro", "shoes", 120],
  ["Nike", "Air Jordan 1 Low", "shoes", 120],
  ["Nike", "Cortez", "shoes", 90],
  ["Adidas", "Samba OG", "shoes", 100],
  ["Adidas", "Gazelle", "shoes", 100],
  ["Adidas", "Superstar", "shoes", 100],
  ["Adidas", "Stan Smith", "shoes", 100],
  ["New Balance", "550", "shoes", 120],
  ["New Balance", "9060", "shoes", 150],
  ["New Balance", "530", "shoes", 100],
  ["New Balance", "327", "shoes", 90],
  ["Converse", "Chuck Taylor All Star Hi", "shoes", 65],
  ["Vans", "Old Skool", "shoes", 70],
  ["Sam Edelman", "Loraine Loafer", "shoes", 150],
  ["Sam Edelman", "Felicia Ballet Flat", "shoes", 130],
  ["Sam Edelman", "Hazel Pump", "shoes", 160],
  ["Steve Madden", "Carrson Sandal", "shoes", 90],
  ["Steve Madden", "Klubb Ankle Boot", "shoes", 150],
  ["Steve Madden", "Maxima Sneaker", "shoes", 100],
  ["Birkenstock", "Arizona Sandal", "shoes", 110],
  ["Crocs", "Classic Clog", "shoes", 50],
  ["UGG", "Tasman Slipper", "shoes", 110],

  // ── Makeup (26) ──
  ["Charlotte Tilbury", "Pillow Talk Lipstick", "makeup", 38],
  ["Charlotte Tilbury", "Flawless Filter", "makeup", 49],
  ["Charlotte Tilbury", "Airbrush Flawless Foundation", "makeup", 49],
  ["Charlotte Tilbury", "Beauty Light Wand", "makeup", 42],
  ["Rare Beauty", "Soft Pinch Liquid Blush", "makeup", 23],
  ["Rare Beauty", "Soft Pinch Tinted Lip Oil", "makeup", 20],
  ["Rare Beauty", "Positive Light Liquid Luminizer", "makeup", 25],
  ["Rare Beauty", "Perfect Strokes Matte Liner", "makeup", 20],
  ["Fenty Beauty", "Pro Filt'r Soft Matte Foundation", "makeup", 40],
  ["Fenty Beauty", "Gloss Bomb Universal Lip Luminizer", "makeup", 21],
  ["Fenty Beauty", "Killawatt Freestyle Highlighter", "makeup", 38],
  ["NARS", "Radiant Creamy Concealer", "makeup", 32],
  ["NARS", "Blush in Orgasm", "makeup", 34],
  ["MAC", "Matte Lipstick", "makeup", 23],
  ["MAC", "Studio Fix Powder Plus", "makeup", 36],
  ["Dior", "Lip Glow Oil", "makeup", 40],
  ["Dior", "Backstage Glow Face Palette", "makeup", 50],
  ["Benefit", "Hoola Matte Bronzer", "makeup", 34],
  ["Benefit", "Roller Lash Mascara", "makeup", 29],
  ["Tarte", "Shape Tape Concealer", "makeup", 33],
  ["Too Faced", "Better Than Sex Mascara", "makeup", 29],
  ["Laura Mercier", "Translucent Loose Setting Powder", "makeup", 43],
  ["e.l.f.", "Halo Glow Liquid Filter", "makeup", 16],
  ["Maybelline", "Sky High Mascara", "makeup", 13],
  ["NYX", "Fat Oil Lip Drip", "makeup", 10],
  ["Anastasia Beverly Hills", "Brow Wiz", "makeup", 25],

  // ── Fragrance (12) ──
  ["Sol de Janeiro", "Brazilian Crush Cheirosa 62 Mist", "fragrance", 38],
  ["Sol de Janeiro", "Cheirosa 68 Perfume Mist", "fragrance", 38],
  ["YSL", "Libre Eau de Parfum", "fragrance", 145],
  ["Dior", "Sauvage Eau de Toilette", "fragrance", 120],
  ["Chanel", "Coco Mademoiselle EDP", "fragrance", 145],
  ["Marc Jacobs", "Daisy Eau de Toilette", "fragrance", 102],
  ["Viktor&Rolf", "Flowerbomb EDP", "fragrance", 120],
  ["Carolina Herrera", "Good Girl EDP", "fragrance", 130],
  ["Lancome", "La Vie Est Belle EDP", "fragrance", 110],
  ["Versace", "Bright Crystal EDT", "fragrance", 100],
  ["Ariana Grande", "Cloud Eau de Parfum", "fragrance", 65],
  ["Billie Eilish", "Eilish Eau de Parfum", "fragrance", 72],

  // ── Accessories (10) ──
  ["Ray-Ban", "Wayfarer Sunglasses", "accessories", 171],
  ["Ray-Ban", "Aviator Classic Sunglasses", "accessories", 171],
  ["Ray-Ban", "Clubmaster Sunglasses", "accessories", 181],
  ["Coach", "Long Zip-Around Wallet", "accessories", 250],
  ["Coach", "Signature Buckle Belt", "accessories", 128],
  ["Michael Kors", "Jet Set Travel Wallet", "accessories", 158],
  ["Kate Spade", "Spencer Cardholder", "accessories", 98],
  ["Marc Jacobs", "The Leather Card Case", "accessories", 95],
  ["Tory Burch", "Miller Card Case", "accessories", 88],
  ["Fossil", "Logan RFID Zip Wallet", "accessories", 95],
];

function slug(s) {
  return s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const seen = new Set();
const products = P.map(([brand, model, category, usd]) => {
  let id = `${slug(brand)}-${slug(model)}`;
  while (seen.has(id)) id += "-x";
  seen.add(id);
  const title = `${brand} ${model}`;
  return {
    id,
    title,
    brand,
    category,
    description:
      `The ${model} by ${brand}, sourced directly from the USA. ${CATEGORY_LINE[category]} ` +
      `Your PKR price is all-inclusive — sourcing, international shipping, and duties. ` +
      `Preorder now and our concierge confirms the exact option and the current shipment batch on WhatsApp.`,
    usa_price_usd: usd,
    shipping_pkr: SHIPPING_PKR[category],
    stock_mode: "preorder",
    inventory: 0,
    image_url: PLACEHOLDER[category],
    gallery_urls: [],
    variants: VARIANT_HINT[category],
    // Loud, unmissable flag so no draft is published with a placeholder photo.
    authenticity_note:
      "⚠ PLACEHOLDER IMAGE — replace with the real brand photo before publishing " +
      `(source: ${BRAND_URL[brand] || "official brand site"}). Verify current USA retail price too.`,
    source_url: BRAND_URL[brand] || "",
    product_status: "draft",
  };
});

if (products.length !== 100) {
  console.error(`Expected 100 products, generated ${products.length}. Aborting.`);
  process.exit(1);
}

// Sanity: unique ids, required fields present, valid categories.
const validCats = new Set(["handbags", "shoes", "makeup", "fragrance", "accessories"]);
const problems = [];
const ids = new Set();
for (const p of products) {
  if (!p.id || ids.has(p.id)) problems.push(`bad/dup id: ${p.id}`);
  ids.add(p.id);
  if (!p.title || !p.brand) problems.push(`missing title/brand: ${p.id}`);
  if (!validCats.has(p.category)) problems.push(`bad category: ${p.id} → ${p.category}`);
  if (!(p.usa_price_usd > 0)) problems.push(`bad price: ${p.id}`);
  if (!p.image_url) problems.push(`missing image: ${p.id}`);
}
if (problems.length) {
  console.error("Validation failed:\n" + problems.join("\n"));
  process.exit(1);
}

const byCat = products.reduce((m, p) => ((m[p.category] = (m[p.category] || 0) + 1), m), {});

await mkdir(dirname(OUT), { recursive: true });
await writeFile(
  OUT,
  JSON.stringify(
    {
      _meta: {
        generated: new Date().toISOString(),
        count: products.length,
        note: "Import via Portal → Products → import. Lands as DRAFTS for review. " +
          "Replace each placeholder image with the real brand photo and verify the USA retail price before publishing.",
        byCategory: byCat,
      },
      productListings: products,
    },
    null,
    2
  ) + "\n"
);

console.log(`✓ Wrote ${products.length} products → ${OUT}`);
console.log("  by category:", byCat);
