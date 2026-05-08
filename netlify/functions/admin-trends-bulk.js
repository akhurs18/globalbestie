import { hasSupabase, json, requireAdmin, supabase, upsertProduct } from "./_shared/supabase.js";

export default async (req) => {
  if (!requireAdmin(req)) return json({ error: "Unauthorized" }, { status: 401 });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

  try {
    const { ids, action } = await req.json();
    if (!Array.isArray(ids) || !ids.length) return json({ error: "ids array required" }, { status: 400 });
    if (!["approved", "rejected"].includes(action)) return json({ error: "action must be approved or rejected" }, { status: 400 });

    if (!hasSupabase()) {
      return json({ updated: ids.length, productsCreated: 0, action, configured: false });
    }

    let productsCreated = 0;

    if (action === "approved") {
      const idList = ids.map((id) => encodeURIComponent(`"${id}"`)).join(",");
      const trends = await supabase(`/rest/v1/trend_candidates?id=in.(${ids.map(encodeURIComponent).join(",")})&select=*`);

      for (const trend of (trends || [])) {
        const product = {
          id: trend.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
          title: trend.title,
          brand: trend.brand || trend.title.split(" ").slice(0, 2).join(" "),
          category: trend.category,
          description: trend.suggested_description || `Trend-approved product imported from ${trend.source_url}.`,
          usa_price_usd: Number(trend.usa_price_usd),
          shipping_pkr: Number(trend.shipping_pkr),
          stock_mode: "preorder",
          inventory: 0,
          image_url: (trend.asset_urls && trend.asset_urls[0]) || trend.image_url,
          source_url: trend.source_url,
          featured: false,
          status: "active",
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
