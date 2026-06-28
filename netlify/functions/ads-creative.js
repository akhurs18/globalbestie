// Phase 2 — Meta ad creative queue.
//
// Holds the image+copy for ads before any of it goes live on Meta. The bot (or
// an operator) drops creatives here; ads-create.js later promotes a 'ready' one
// into a real campaign. Nothing in this function touches Meta or spends money.
//
//   GET  /api/admin/ads-creative                 → list the queue
//   POST /api/admin/ads-creative {action:'add', creative}      → save a creative
//   POST /api/admin/ads-creative {action:'generate', product_id} → draft copy
//   POST /api/admin/ads-creative {action:'status', id, status}  → ready/archive
//
// `generate` produces channel-ready copy from the product row using simple,
// deterministic templates (no external AI call, so it runs 24/7 on a schedule
// or on demand). Swap the body of draftCopy() for a Claude API call if you want
// live generation — the queue contract stays identical.

import { getAllProducts, hasSupabase, json, requireAdmin, supabase } from "./_shared/supabase.js";
import { customerPricePkr } from "./_shared/pricing.js";

function pkr(n) {
  return `Rs ${Math.round(Number(n || 0)).toLocaleString("en-PK")}`;
}

// Deterministic copy templates. Three angles so an operator can A/B them.
function draftCopy(product) {
  const price = customerPricePkr(product);
  const brand = product.brand || "USA";
  const name = product.title || "this piece";
  const isPreorder = (product.stock_mode || "preorder") === "preorder";
  const eta = isPreorder
    ? `Preorder now — arrives in about ${product.preorder_weeks || 4} weeks.`
    : `In stock in Pakistan — ships now.`;

  const angles = [
    {
      headline: `${brand} ${product.category || "find"}, priced in PKR`,
      primary_text:
        `Authentic ${name} sourced direct from the USA. Final price in rupees — ${pkr(price)}, no hidden customs surprises. ${eta} DM-free checkout on our site. 🇵🇰`,
      description: `Authenticity-first packaging • Clear PKR pricing`,
    },
    {
      headline: `Stop overpaying local boutiques`,
      primary_text:
        `Besties, the ${name} you've been eyeing — we get it from the US so you pay ${pkr(price)} all-in, not double at a local shop. ${eta} Tap to lock yours.`,
      description: `Real USA sourcing • ${product.category || "Curated"}`,
    },
    {
      headline: `${name} — the bestie way`,
      primary_text:
        `Genuine ${brand}, quoted in PKR, delivered to your door. ${pkr(price)} all-in. ${eta} We confirm everything on WhatsApp before sourcing.`,
      description: `Trusted by besties across Pakistan`,
    },
  ];
  return angles;
}

export default async (req) => {
  if (!requireAdmin(req)) return json({ error: "Unauthorized" }, { status: 401 });

  try {
    if (req.method === "GET") {
      if (!hasSupabase()) return json({ creatives: [], configured: false });
      const creatives = await supabase(
        "/rest/v1/meta_ad_creatives?select=*&order=created_at.desc&limit=200"
      );
      return json({ creatives, configured: true });
    }

    if (req.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

    const { action, ...rest } = await req.json();

    // Draft copy for a product and return options (does NOT save). The portal
    // shows these; the operator picks one and re-POSTs it as `add`.
    if (action === "generate") {
      const products = await getAllProducts();
      const product = products.find((p) => p.id === rest.product_id);
      if (!product) return json({ error: "Product not found." }, { status: 404 });
      return json({
        product_id: product.id,
        image_url: product.image_url || "",
        destination_url: `/product/${product.id}`,
        options: draftCopy(product),
        configured: hasSupabase(),
      });
    }

    if (action === "add") {
      const c = rest.creative || rest;
      if (!c.headline || !c.primary_text || !c.destination_url) {
        return json({ error: "headline, primary_text and destination_url are required." }, { status: 400 });
      }
      const row = {
        id: c.id || `cre-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        product_id: c.product_id || null,
        headline: c.headline,
        primary_text: c.primary_text,
        description: c.description || null,
        cta_type: c.cta_type || "SHOP_NOW",
        destination_url: c.destination_url,
        image_url: c.image_url || null,
        source: c.source || "manual",
        status: c.status || "draft",
        meta: c.meta || null,
        updated_at: new Date().toISOString(),
      };
      if (!hasSupabase()) return json({ creative: row, configured: false });
      const [saved] = await supabase("/rest/v1/meta_ad_creatives?on_conflict=id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify(row),
      });
      return json({ creative: saved, configured: true });
    }

    if (action === "status") {
      if (!rest.id || !rest.status) return json({ error: "id and status are required." }, { status: 400 });
      if (!hasSupabase()) return json({ ok: true, configured: false });
      const [saved] = await supabase(
        `/rest/v1/meta_ad_creatives?id=eq.${encodeURIComponent(rest.id)}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({ status: rest.status, updated_at: new Date().toISOString() }),
        }
      );
      return json({ creative: saved, configured: true });
    }

    return json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return json({ error: error.message }, { status: 500 });
  }
};

export const config = {
  path: "/api/admin/ads-creative",
};
