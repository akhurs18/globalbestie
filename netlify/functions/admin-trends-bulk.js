import { hasSupabase, json, requireAdmin, supabase, upsertProduct } from "./_shared/supabase.js";

export default async (req) => {
  if (!requireAdmin(req)) return json({ error: "Unauthorized" }, { status: 401 });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

  try {
    const { ids, action, target_status = "draft" } = await req.json();
    if (!Array.isArray(ids) || !ids.length) return json({ error: "ids array required" }, { status: 400 });
    if (!["approved", "rejected"].includes(action)) return json({ error: "action must be approved or rejected" }, { status: 400 });

    if (!hasSupabase()) {
      return json({ updated: ids.length, productsCreated: 0, action, configured: false });
    }

    let productsCreated = 0;

    if (action === "approved") {
      const trends = await supabase(`/rest/v1/trend_candidates?id=in.(${ids.map(encodeURIComponent).join(",")})&select=*`);

      for (const trend of (trends || [])) {
        const title = trend.title || "USA preorder product";
        const category = trend.category || "accessories";
        const image = (trend.asset_urls && trend.asset_urls[0]) || trend.image_url || "";
        const description = trend.suggested_description || `Review-ready Global Bestie preorder candidate sourced from ${trend.source_url || "USA retail"}.`;
        const product = {
          id: title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
          title,
          brand: trend.brand || title.split(" ").slice(0, 2).join(" "),
          category,
          description: description.length >= 60 ? description : `${description} Final copy can be edited before publishing.`,
          usa_price_usd: Number(trend.usa_price_usd || 1),
          shipping_pkr: Number(trend.shipping_pkr || 0),
          stock_mode: "preorder",
          inventory: 0,
          image_url: image,
          gallery_urls: Array.isArray(trend.asset_urls) ? trend.asset_urls : [image].filter(Boolean),
          source_url: trend.source_url || "",
          variants: trend.variants || "Confirm size, shade, color, or volume before approval.",
          authenticity_note: trend.authenticity_note || "Verify official retailer source and attach receipt before publishing.",
          social_proof: trend.social_proof || "Review candidate for the next Global Bestie USA preorder batch.",
          featured: false,
          status: target_status === "active" ? "active" : "draft",
          product_status: target_status === "active" ? "active" : "draft",
        };
        await upsertProduct(product);
        productsCreated++;
      }
    }

    const idFilter = ids.map(encodeURIComponent).join(",");
    await supabase(`/rest/v1/trend_candidates?id=in.(${idFilter})`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: action, reviewed_at: new Date().toISOString() }),
    });

    return json({ updated: ids.length, productsCreated, action, configured: true });
  } catch (error) {
    return json({ error: error.message }, { status: 500 });
  }
};

export const config = {
  path: "/api/admin/trends/bulk",
};
