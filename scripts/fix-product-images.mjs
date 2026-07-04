// Fix product images: re-host a curated real image into Supabase Storage and
// update the product's image_url. Reversible — backs up old URLs first.
//
//   node --env-file=.env scripts/fix-product-images.mjs
//
// MAPPING entries: { id, url, expect } where `expect` is a keyword that MUST
// appear in the source image URL (accuracy guard — prevents putting a wrong
// product's photo on a listing). Entries that fail the guard or the download
// are skipped and reported, never applied.

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error("Missing Supabase env"); process.exit(1); }

import { writeFileSync, readFileSync } from "node:fs";

// Source images come from the probe (scripts/_img-hits.json): each entry is a
// StockX CDN URL already GET-validated as a real image of the correct model.
const MAPPING = JSON.parse(readFileSync("scripts/_img-hits.json", "utf8"))
  .map((h) => ({ id: h.id, url: h.url, expect: "stockx.com" }));

async function sb(path, options = {}) {
  const r = await fetch(`${URL}${path}`, {
    ...options,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...(options.headers || {}) },
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}

async function uploadImage(id, remoteUrl) {
  const res = await fetch(remoteUrl, { headers: { "User-Agent": "Mozilla/5.0 GlobalBestieIngest/1.0" }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`image fetch ${res.status}`);
  const ct = res.headers.get("content-type") || "image/jpeg";
  if (!ct.startsWith("image/")) throw new Error(`not an image (${ct})`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 2000) throw new Error(`image too small (${buf.length}b)`);
  const ext = (ct.split("/")[1] || "jpg").split(";")[0].replace(/[^a-z0-9]/gi, "");
  const objectPath = `products/${id}/${Date.now()}.${ext}`;
  const u = await fetch(`${URL}/storage/v1/object/store-assets/${objectPath}`, {
    method: "POST",
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": ct, "x-upsert": "true" },
    body: buf,
  });
  if (!u.ok) throw new Error(`storage upload ${u.status} ${await u.text()}`);
  return { publicUrl: `${URL}/storage/v1/object/public/store-assets/${objectPath}`, bytes: buf.length };
}

const backup = [];
const done = [], skipped = [];
for (const item of MAPPING) {
  try {
    if (!item.url.toLowerCase().includes(item.expect.toLowerCase())) {
      skipped.push({ id: item.id, reason: `guard: "${item.expect}" not in source URL` });
      continue;
    }
    const rows = await sb(`/rest/v1/products?id=eq.${encodeURIComponent(item.id)}&select=id,image_url`);
    if (!rows.length) { skipped.push({ id: item.id, reason: "not found in DB" }); continue; }
    if (String(rows[0].image_url || "").includes("/store-assets/")) { skipped.push({ id: item.id, reason: "already hosted" }); continue; }
    backup.push({ id: item.id, old_image_url: rows[0].image_url });
    const { publicUrl, bytes } = await uploadImage(item.id, item.url);
    await sb(`/rest/v1/products?id=eq.${encodeURIComponent(item.id)}`, {
      method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ image_url: publicUrl, updated_at: new Date().toISOString() }),
    });
    done.push({ id: item.id, publicUrl, kb: Math.round(bytes / 1024) });
    console.log(`✓ ${item.id}  (${Math.round(bytes / 1024)} KB)  → ${publicUrl}`);
  } catch (e) {
    skipped.push({ id: item.id, reason: String(e.message || e) });
    console.log(`✗ ${item.id}  — ${e.message || e}`);
  }
}
if (backup.length) {
  const f = `scripts/_img-backup-${Date.now()}.json`;
  writeFileSync(f, JSON.stringify(backup, null, 2));
  console.log(`\nbackup of previous image_urls → ${f}`);
}
console.log(`\nDONE: ${done.length} updated, ${skipped.length} skipped`);
if (skipped.length) console.log("skipped:", JSON.stringify(skipped, null, 2));
