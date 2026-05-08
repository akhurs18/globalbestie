/**
 * Enhance product images and push them to the live website.
 *
 * 1. Reads products from dist/marketing-batches/*-products.json
 * 2. Downloads each image_url
 * 3. Upscales to 1080px with macOS sips
 * 4. Uploads to Supabase Storage (product-images bucket, public)
 * 5. Updates image_url on live products in Supabase
 * 6. Saves updated local JSON with new URLs
 *
 * Usage:
 *   node --env-file=.env scripts/enhance-and-push-images.mjs
 *   node --env-file=.env scripts/enhance-and-push-images.mjs dist/marketing-batches/batch-2026-05-07-products.json
 */

import fs from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";
import { glob } from "node:fs/promises";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Run with: node --env-file=.env ...");
  process.exit(1);
}

const imagesDir = path.resolve("dist/marketing-batches/images");
await fs.mkdir(imagesDir, { recursive: true });

// ── Ensure product-images bucket exists ──────────────────────────────────────
const bucketRes = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
  method: "POST",
  headers: {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ id: "product-images", name: "product-images", public: true }),
});
if (bucketRes.status !== 200 && bucketRes.status !== 409) {
  console.warn("Bucket create warning:", await bucketRes.text());
} else {
  console.log("✓ Storage bucket: product-images (public)\n");
}

// ── Upload to Supabase Storage ───────────────────────────────────────────────
async function uploadImage(localPath, fileName) {
  const file = await fs.readFile(localPath);
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/product-images/${fileName}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "image/jpeg",
      "x-upsert": "true",
    },
    body: file,
  });
  if (!res.ok) throw new Error(`Upload failed: ${await res.text()}`);
  return `${SUPABASE_URL}/storage/v1/object/public/product-images/${fileName}`;
}

// ── Update product image_url in Supabase ─────────────────────────────────────
async function updateProductImage(productId, imageUrl) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/products?id=eq.${encodeURIComponent(productId)}`,
    {
      method: "PATCH",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ image_url: imageUrl, updated_at: new Date().toISOString() }),
    }
  );
  const data = await res.json().catch(() => []);
  return Array.isArray(data) ? data[0] : null;
}

// ── Download + enhance an image ──────────────────────────────────────────────
async function enhanceImage(url, fileName) {
  const rawPath = path.join(imagesDir, `${fileName}-raw.jpg`);
  const enhancedPath = path.join(imagesDir, `${fileName}.jpg`);

  if (await fs.access(enhancedPath).then(() => true).catch(() => false)) {
    return enhancedPath;
  }

  execSync(`curl -sL --max-time 20 -o "${rawPath}" "${url}"`);

  let width = 0;
  try {
    const info = execSync(`sips -g pixelWidth "${rawPath}"`, { encoding: "utf-8" });
    width = Number(info.match(/pixelWidth:\s*(\d+)/)?.[1] || 0);
  } catch { }

  const targetWidth = Math.max(1080, width);
  execSync(
    `sips --resampleWidth ${targetWidth} --setProperty formatOptions best "${rawPath}" --out "${enhancedPath}"`,
    { stdio: "pipe" }
  );
  await fs.unlink(rawPath).catch(() => {});
  return enhancedPath;
}

// ── Load product files ───────────────────────────────────────────────────────
let productFiles = [];
if (process.argv[2]) {
  productFiles = [path.resolve(process.argv[2])];
} else {
  const entries = await fs.readdir("dist/marketing-batches");
  productFiles = entries
    .filter((f) => f.endsWith("-products.json"))
    .map((f) => path.resolve("dist/marketing-batches", f));
}

console.log(`Processing ${productFiles.length} product file(s)...\n`);

let totalEnhanced = 0;
let totalUploaded = 0;
let totalUpdated = 0;

for (const file of productFiles) {
  const products = JSON.parse(await fs.readFile(file, "utf-8"));
  console.log(`── ${path.basename(file)} (${products.length} products)`);

  for (const product of products) {
    const url = product.image_url;
    if (!url?.startsWith("http")) continue;

    const slug = (product.id || product.source_candidate_id || "product").slice(0, 48);
    process.stdout.write(`  ${product.title?.slice(0, 50) ?? slug}...`);

    try {
      // 1. Download + enhance
      const localPath = await enhanceImage(url, slug);
      totalEnhanced++;

      // 2. Upload to Supabase Storage
      const publicUrl = await uploadImage(localPath, `${slug}.jpg`);
      totalUploaded++;

      // 3. Update product record if it exists in DB
      const updated = await updateProductImage(product.id, publicUrl);
      if (updated) totalUpdated++;

      // 4. Update local JSON
      product.image_url = publicUrl;

      process.stdout.write(updated ? " ✓ live\n" : " ✓ uploaded\n");
    } catch (err) {
      process.stdout.write(` ✗ ${err.message.slice(0, 60)}\n`);
    }
  }

  // Save updated local JSON
  const updatedFile = file.replace("-products.json", "-products.updated.json");
  await fs.writeFile(updatedFile, JSON.stringify(products, null, 2));
  console.log(`  → saved: ${path.basename(updatedFile)}\n`);
}

console.log(`─────────────────────────────────────────────
✓ Enhanced:  ${totalEnhanced} images
✓ Uploaded:  ${totalUploaded} to Supabase Storage (product-images)
✓ Updated:   ${totalUpdated} live product records on the website
─────────────────────────────────────────────`);
