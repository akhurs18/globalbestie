import { access, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { transform } from "esbuild";

// Production guard for the Maychats Instagram bridge.
//
// The webhook handler accepts unsigned requests when MAYCHATS_WEBHOOK_SECRET
// isn't set (so local dev "just works"). That's safe ONLY when the integration
// isn't live — if Maychats isn't sending real DMs to your webhook, nobody can
// abuse the unsigned path either.
//
// So we only fail the build when the user is *partially* configured: outbound
// is enabled (MAYCHATS_API_KEY is set, meaning the bridge is going to be
// active in production) but the inbound signing secret is missing. A
// brand-new deploy with no Maychats config at all is fine — the webhook will
// sit there inert until you wire it up.
if (
  process.env.CONTEXT === "production" &&
  process.env.MAYCHATS_API_KEY &&
  !process.env.MAYCHATS_WEBHOOK_SECRET
) {
  console.error(
    "MAYCHATS_WEBHOOK_SECRET is missing but MAYCHATS_API_KEY is set, which means inbound DMs would be accepted without signature verification while outbound replies are live. Set MAYCHATS_WEBHOOK_SECRET in Netlify → Site settings → Environment variables before deploying."
  );
  process.exit(1);
}

const requiredFiles = [
  "index.html",
  "portal.html",
  "ads.html",
  "assets/styles.css",
  "assets/app.js",
  "netlify.toml",
  "netlify/functions/instagram-webhook.js",
  "supabase/schema.sql",
  "AGENTS.md",
];

for (const file of requiredFiles) {
  await access(file);
}

const html = await readFile("index.html", "utf8");
const portal = await readFile("portal.html", "utf8");
const js = await readFile("assets/app.js", "utf8");
const css = await readFile("assets/styles.css", "utf8");

const checks = [
  [!html.includes('href="#admin"') && !html.includes('data-view="admin"'), "Public site still exposes admin"],
  [html.includes("Global Bestie"), "Public brand name missing"],
  [portal.includes('data-view="admin"'), "Internal portal view missing"],
  [!portal.includes('data-admin-panel="growth"') && !portal.includes("Growth Studio"), "Growth Studio should be removed from portal"],
  // Meta Ads automation lives on its own page (ads.html), not in the ops portal.
  [!portal.includes('data-ads-panel'), "Meta Ads panel should be moved out of the portal to ads.html"],
  [portal.includes('href="/ads.html"'), "Portal should link to the standalone ads page"],
  [portal.includes('data-admin-panel="shipments"'), "Shipment batch panel missing"],
  [portal.includes('data-admin-order-cards'), "Responsive order cards missing"],
  [portal.includes("noindex"), "Internal portal should discourage indexing"],
  [html.includes('data-view="checkout"'), "Checkout view missing"],
  [js.includes("calculatePrice"), "Pricing calculator missing"],
  [js.includes("ORDER_STEPS"), "Order tracking steps missing"],
  [js.includes("amountDueForOrder"), "Order payment detail helper missing"],
  [js.includes("renderShipmentBatches"), "Shipment batch renderer missing"],
  [(await readFile("netlify/functions/instagram-webhook.js", "utf8")).includes("/api/webhooks/instagram"), "Instagram webhook endpoint missing"],
  [css.includes("--pink"), "Brand color tokens missing"],
];

const failures = checks.filter(([passed]) => !passed).map(([, message]) => message);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

const marketingBatchDir = "dist/marketing-batches";
const preservedBatchDir = ".tmp-marketing-batches";
try {
  await rm(preservedBatchDir, { recursive: true, force: true });
  await cp(marketingBatchDir, preservedBatchDir, { recursive: true });
} catch {
  await rm(preservedBatchDir, { recursive: true, force: true });
}

await rm("dist", { recursive: true, force: true });
await mkdir("dist/assets", { recursive: true });
await cp("index.html", "dist/index.html");
await cp("portal.html", "dist/portal.html");
await cp("ads.html", "dist/ads.html");
await cp("assets", "dist/assets", { recursive: true });
// Copy SEO files (robots/sitemap) and the service worker if they exist.
// We swallow missing-file errors so the build still works on a fresh
// checkout that hasn't generated these yet.
for (const file of ["robots.txt", "sitemap.xml", "sw.js"]) {
  try { await cp(file, `dist/${file}`); } catch {}
}
try {
  await cp(preservedBatchDir, marketingBatchDir, { recursive: true });
  await rm(preservedBatchDir, { recursive: true, force: true });
} catch {
  await rm(preservedBatchDir, { recursive: true, force: true });
}

// ── Minify + content-hash the big assets ────────────────────────────────
// app.js (~700 KB) and styles.css (~450 KB) ship unminified otherwise —
// several seconds of extra download on Pakistani mobile connections.
// Minified copies land in dist/assets/v/<name>-<hash8>.min.<ext> (that
// directory gets immutable cache headers in netlify.toml), and the dist
// HTML files are rewritten to point at them. Source files keep their
// `?v=` cache-bust workflow; the originals also stay in dist/assets as a
// fallback for anything still referencing the plain paths (e.g. sw.js).
const hashedAssets = [
  { src: "assets/app.js", loader: "js", pattern: /\.\/assets\/app\.js(\?v=[^"']*)?/g },
  { src: "assets/styles.css", loader: "css", pattern: /\.\/assets\/styles\.css(\?v=[^"']*)?/g },
  { src: "assets/ads.css", loader: "css", pattern: /\.\/assets\/ads\.css(\?v=[^"']*)?/g },
];

await mkdir("dist/assets/v", { recursive: true });
const rewrites = [];
for (const { src, loader, pattern } of hashedAssets) {
  const code = await readFile(src, "utf8");
  const { code: minified } = await transform(code, {
    loader,
    minify: true,
    // app.js runs as-is in the browser (no bundler) — keep syntax modern,
    // just strip whitespace/comments and shorten locals.
    target: "es2020",
  });
  const hash = createHash("sha256").update(minified).digest("hex").slice(0, 8);
  const base = src.split("/").pop().replace(/\.(js|css)$/, "");
  const ext = loader === "js" ? "js" : "css";
  const outName = `${base}-${hash}.min.${ext}`;
  await writeFile(`dist/assets/v/${outName}`, minified);
  rewrites.push({ pattern, replacement: `./assets/v/${outName}` });
  console.log(`[build] ${src} → dist/assets/v/${outName} (${(code.length / 1024).toFixed(0)} KB → ${(minified.length / 1024).toFixed(0)} KB)`);
}

for (const page of ["dist/index.html", "dist/portal.html", "dist/ads.html"]) {
  let markup = await readFile(page, "utf8");
  for (const { pattern, replacement } of rewrites) {
    markup = markup.replace(pattern, replacement);
  }
  await writeFile(page, markup);
}

console.log("Static app checks passed and dist/ was prepared.");
