import fs from "node:fs/promises";
import path from "node:path";

import runScraper from "../netlify/functions/scraper.js";
import adminMarketing from "../netlify/functions/admin-marketing.js";

function makeNetlifyEnvShim() {
  globalThis.Netlify = {
    env: {
      get: (name) => process.env[name] || "",
    },
  };
}

async function readJsonResponse(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function summarizeCandidates(candidates) {
  const byCategory = candidates.reduce((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + 1;
    return acc;
  }, {});
  const needsAssets = candidates.filter((c) => (c.production_status || "fetched") === "needs_assets").length;
  const missingSource = candidates.filter((c) => !String(c.source_url || "").startsWith("http")).length;
  const missingPrice = candidates.filter((c) => Number(c.usa_price_usd || 0) <= 0).length;
  return { byCategory, needsAssets, missingSource, missingPrice };
}

function money(value) {
  return Math.ceil(Number(value || 0));
}

function productPrice(candidate) {
  const fxRate = Number(process.env.FX_RATE || 282);
  const markupRate = Number(process.env.MARKUP_RATE || 0.25);
  const retailPkr = Number(candidate.usa_price_usd || 0) * fxRate;
  const marginPkr = retailPkr * markupRate;
  const shippingPkr = Number(candidate.shipping_pkr || 0);
  const totalPkr = money(retailPkr + marginPkr + shippingPkr);
  return {
    fx_rate: fxRate,
    markup_rate: markupRate,
    retail_pkr: money(retailPkr),
    margin_pkr: money(marginPkr),
    shipping_pkr: money(shippingPkr),
    total_pkr: totalPkr,
    advance_due_pkr: money(totalPkr * 0.5),
    balance_due_pkr: money(totalPkr * 0.5),
  };
}

function csvEscape(value) {
  const text = Array.isArray(value) ? value.join(" | ") : String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function makeProductListingRows(candidates) {
  return candidates.map((candidate) => {
    const price = productPrice(candidate);
    const images = [candidate.image_url, ...(candidate.asset_urls || [])].filter(Boolean);
    const brand = candidate.brand || candidate.title.split(" ").slice(0, 2).join(" ");
    const slug = candidate.id.replace(/^trend-/, "");
    const remotionBrief = candidate.remotion_brief || {
      format: "9:16 Reel",
      duration_seconds: 10,
      scenes: [
        { time: "0-2s", instruction: "Product-first hero image with brand/title overlay." },
        { time: "2-5s", instruction: "Price reveal and 50% advance." },
        { time: "5-8s", instruction: "4-week preorder timeline." },
        { time: "8-10s", instruction: "CTA to order or WhatsApp." },
      ],
      caption: `${candidate.title} now open for USA preorder. DM to confirm size/shade.`,
    };

    return {
      id: slug,
      source_candidate_id: candidate.id,
      batch_id: candidate.batch_id,
      title: candidate.title,
      brand,
      category: candidate.category,
      description: candidate.suggested_description || `USA preorder candidate for ${candidate.title}.`,
      seo_title: `${candidate.title} Pakistan preorder | Global Bestie`,
      meta_description: `Preorder ${candidate.title} from the USA to Pakistan with Global Bestie. 50% advance, remaining balance before local dispatch.`,
      usa_price_usd: Number(candidate.usa_price_usd || 0),
      shipping_pkr: price.shipping_pkr,
      fx_rate: price.fx_rate,
      markup_rate: price.markup_rate,
      retail_pkr: price.retail_pkr,
      service_margin_pkr: price.margin_pkr,
      customer_price_pkr: price.total_pkr,
      advance_due_pkr: price.advance_due_pkr,
      balance_due_pkr: price.balance_due_pkr,
      stock_mode: "preorder",
      inventory: 0,
      preorder_weeks: 4,
      source_url: candidate.source_url,
      image_url: images[0] || "",
      gallery_urls: images,
      variants: candidate.variants || "Confirm variant before approval.",
      authenticity_note: candidate.authenticity_note || "Verify official source and receipt before publishing.",
      social_proof: candidate.social_proof || "Daily trend candidate.",
      product_status: "draft",
      production_status: candidate.production_status || "needs_assets",
      remotion_input: {
        product_id: slug,
        title: candidate.title,
        image_urls: images,
        price_pkr: price.total_pkr,
        advance_due_pkr: price.advance_due_pkr,
        balance_due_pkr: price.balance_due_pkr,
        source_url: candidate.source_url,
        brief: remotionBrief,
      },
      caption: remotionBrief.caption || "",
      approval_checklist: [
        "Verify official source URL",
        "Confirm USA retail price",
        "Replace placeholder media with approved product images",
        "Run manual Remotion render if promoting",
        "Paste final asset URLs back before publishing",
      ],
    };
  });
}

function toCsv(rows) {
  const columns = [
    "id",
    "title",
    "brand",
    "category",
    "description",
    "usa_price_usd",
    "shipping_pkr",
    "customer_price_pkr",
    "advance_due_pkr",
    "balance_due_pkr",
    "stock_mode",
    "preorder_weeks",
    "source_url",
    "image_url",
    "gallery_urls",
    "variants",
    "authenticity_note",
    "social_proof",
    "production_status",
    "caption",
  ];
  return [
    columns.join(","),
    ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(",")),
  ].join("\n");
}

function makeCreativeJobsFromCandidates(candidates, batchId) {
  const top = [...candidates]
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
    .slice(0, 12);

  return top.map((candidate, index) => ({
    id: `creative-${batchId}-${String(index + 1).padStart(2, "0")}`,
    title: `${candidate.title} — preorder Reel`,
    type: "Reel (9:16)",
    status: "collected",
    channel: "Instagram",
    product: candidate.title,
    hook:
      "Show product first (0–2s), reveal price + preorder advance (2–6s), timeline (4 weeks), then CTA: DM / order via site.",
    source: candidate.source_url,
    prompt: candidate.suggested_description || "Add official images + short hook caption.",
    preview_url: candidate.image_url,
    output_url: "",
  }));
}

async function main() {
  makeNetlifyEnvShim();

  const targetCount = Math.min(10, Math.max(1, Number(process.env.TARGET_COUNT || 10)));
  const batchId = process.env.BATCH_ID || `batch-${todayISO()}`;
  const secret = process.env.ADMIN_SHARED_SECRET || "";

  const request = new Request("http://localhost/api/scraper", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
    },
    body: JSON.stringify({ target_count: targetCount, batch_id: batchId }),
  });

  const scraperResponse = await runScraper(request);
  const scraperPayload = await readJsonResponse(scraperResponse);

  const trends = Array.isArray(scraperPayload.trends) ? scraperPayload.trends : [];
  const summary = summarizeCandidates(trends);
  const creativeJobs = makeCreativeJobsFromCandidates(trends, batchId);
  const productListings = makeProductListingRows(trends);
  const remotionManifest = productListings.map((product) => product.remotion_input);

  const outDir = path.join(process.cwd(), "dist", "marketing-batches");
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `${batchId}.json`);
  const productsPath = path.join(outDir, `${batchId}-products.json`);
  const csvPath = path.join(outDir, `${batchId}-products.csv`);
  const remotionPath = path.join(outDir, `${batchId}-remotion-manifest.json`);
  await fs.writeFile(
    outPath,
    JSON.stringify(
      {
        batch: scraperPayload.batch || { id: batchId, target_count: targetCount, fetched_count: trends.length },
        configured: Boolean(scraperPayload.configured),
        trends,
        summary,
        productListings,
        remotionManifest,
        creativeJobs,
      },
      null,
      2
    )
  );
  await fs.writeFile(productsPath, JSON.stringify(productListings, null, 2));
  await fs.writeFile(csvPath, toCsv(productListings));
  await fs.writeFile(remotionPath, JSON.stringify(remotionManifest, null, 2));

  if (scraperPayload.configured) {
    for (const job of creativeJobs) {
      const saveReq = new Request("http://localhost/api/admin/marketing", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
        },
        body: JSON.stringify({ type: "creative_job", payload: job }),
      });
      await adminMarketing(saveReq);
    }
  }

  process.stdout.write(
    JSON.stringify(
      {
        batch_id: batchId,
        target_count: targetCount,
        fetched_count: trends.length,
        configured: Boolean(scraperPayload.configured),
        by_category: summary.byCategory,
        needs_assets: summary.needsAssets,
        output_file: outPath,
        product_file: productsPath,
        csv_file: csvPath,
        remotion_manifest: remotionPath,
      },
      null,
      2
    ) + "\n"
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
