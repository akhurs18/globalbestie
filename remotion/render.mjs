/**
 * Batch render reels from a marketing manifest file.
 *
 * Usage:
 *   node render.mjs                                      # uses today's batch
 *   node render.mjs ../dist/marketing-batches/batch-2026-05-07-remotion-manifest.json
 *   LIMIT=5 node render.mjs                              # render first 5 only
 */

import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const today = new Date().toISOString().slice(0, 10);
const manifestArg = process.argv[2] || `../dist/marketing-batches/batch-${today}-remotion-manifest.json`;
const outDir = process.argv[3] || `../dist/reels/${today}`;
const limit = Number(process.env.LIMIT || 3);

const manifestPath = path.resolve(import.meta.dirname, manifestArg);
const outDirPath = path.resolve(import.meta.dirname, outDir);

const manifest = JSON.parse(await fs.readFile(manifestPath, "utf-8"));
await fs.mkdir(outDirPath, { recursive: true });

const items = manifest.slice(0, limit);
console.log(`Rendering ${items.length} reels from ${path.basename(manifestPath)}\n`);

for (const [i, item] of items.entries()) {
  const outFile = path.join(outDirPath, `${item.product_id}.mp4`);
  const props = JSON.stringify({
    title: item.title,
    brand: item.title.split(" ").slice(0, 2).join(" "),
    image_url: item.image_urls?.[0] ?? "",
    price_pkr: item.price_pkr,
    advance_due_pkr: item.advance_due_pkr,
    balance_due_pkr: item.balance_due_pkr,
    caption: item.brief?.caption ?? "",
  });

  console.log(`[${i + 1}/${items.length}] ${item.title}`);
  execSync(
    `npx remotion render src/index.jsx ProductReel "${outFile}" --props=${JSON.stringify(props)}`,
    { stdio: "inherit", cwd: path.resolve(import.meta.dirname) }
  );
  console.log(`  ✓ saved: ${outFile}\n`);
}

console.log(`Done. ${items.length} reel(s) saved to ${outDirPath}`);
