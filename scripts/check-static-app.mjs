import { access, cp, mkdir, readFile, rm } from "node:fs/promises";

// Production guard: when Netlify is doing a production build, refuse to ship
// without the Maychats webhook signing secret. The webhook handler falls back
// to "accept anything" if the secret is missing, which is fine for dev but
// must not silently ship.
if (process.env.CONTEXT === "production" && !process.env.MAYCHATS_WEBHOOK_SECRET) {
  console.error(
    "MAYCHATS_WEBHOOK_SECRET is not set in this production build. The Instagram (Maychats) webhook will accept unsigned requests — set the secret in Netlify → Site settings → Environment variables before deploying."
  );
  process.exit(1);
}

const requiredFiles = [
  "index.html",
  "portal.html",
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
  [portal.includes('data-admin-panel="growth"'), "Growth Studio panel missing"],
  [portal.includes('data-admin-panel="shipments"'), "Shipment batch panel missing"],
  [portal.includes('data-admin-order-cards'), "Responsive order cards missing"],
  [portal.includes("noindex"), "Internal portal should discourage indexing"],
  [html.includes('data-view="checkout"'), "Checkout view missing"],
  [js.includes("calculatePrice"), "Pricing calculator missing"],
  [js.includes("renderMarketing"), "Marketing portal renderer missing"],
  [js.includes("ORDER_STEPS"), "Order tracking steps missing"],
  [js.includes("amountDueForOrder"), "Order payment detail helper missing"],
  [js.includes("renderShipmentBatches"), "Shipment batch renderer missing"],
  [portal.includes("24/7 DM automation"), "24/7 DM automation panel missing"],
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
await cp("assets", "dist/assets", { recursive: true });
try {
  await cp(preservedBatchDir, marketingBatchDir, { recursive: true });
  await rm(preservedBatchDir, { recursive: true, force: true });
} catch {
  await rm(preservedBatchDir, { recursive: true, force: true });
}

console.log("Static app checks passed and dist/ was prepared.");
