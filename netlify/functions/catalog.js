import { getProducts, getSettings, hasSupabase, json, requireAdmin, supabase, upsertProduct } from "./_shared/supabase.js";

function customerPrice(product, settings) {
  // In-stock items priced directly in PKR — no FX or USD math.
  const direct = Number(product.customer_price_pkr || 0);
  if (direct > 0) return Math.ceil(direct);
  const fx = Number(product.fx_rate || settings.fx_rate || 282);
  const markup = Number(product.markup_rate ?? settings.markup_rate ?? 0.25);
  const retailPkr = Number(product.usa_price_usd || 0) * fx;
  return Math.ceil(retailPkr + retailPkr * markup + Number(product.shipping_pkr || 0));
}

function publicProduct(product, settings) {
  return {
    id: product.id,
    title: product.title,
    brand: product.brand,
    category: product.category,
    description: product.description,
    customer_price_pkr: customerPrice(product, settings),
    // Public response intentionally omits usa_price_usd / fx_rate /
    // markup_rate / shipping_pkr. The customer sees the final all-inclusive
    // PKR figure only — never our cost-construction inputs.
    stock_mode: product.stock_mode,
    inventory: product.inventory,
    delivery_days_min: product.delivery_days_min || 0,
    delivery_days_max: product.delivery_days_max || 0,
    image_url: product.image_url,
    gallery_urls: product.gallery_urls || [],
    variants: product.variants,
    authenticity_note: product.authenticity_note,
    social_proof: product.social_proof,
    // Customer-facing new fields — without these the card badge + variant
    // chip never render on the storefront, only in the admin preview.
    marketing_badge: product.marketing_badge,
    variant_display_hint: product.variant_display_hint,
    featured: product.featured,
    preorder_weeks: product.preorder_weeks,
    status: product.status,
  };
}

export default async (req) => {
  try {
    if (req.method === "GET") {
      const [products, settings] = await Promise.all([getProducts(), getSettings()]);
      const isAdmin = requireAdmin(req);
      const publicSettings = {
        preorder_weeks: settings.preorder_weeks,
        next_shipment_date: settings.next_shipment_date,
        shipment_notice: settings.shipment_notice,
        business_hours: settings.business_hours,
        response_sla_minutes: settings.response_sla_minutes,
        city_delivery_fees: settings.city_delivery_fees,
        support_whatsapp: settings.support_whatsapp,
        bank_name: settings.bank_name,
        account_title: settings.account_title,
        account_number: settings.account_number,
        iban: settings.iban,
      };
      return json({
        products: isAdmin ? products : products.map((product) => publicProduct(product, settings)),
        settings: isAdmin ? settings : publicSettings,
        configured: hasSupabase(),
      });
    }

    if (req.method === "POST") {
      if (!requireAdmin(req)) return json({ error: "Unauthorized" }, { status: 401 });
      const body = await req.json();

      // Single-product path (legacy + form save). Returns { product, configured }.
      const saveOne = async (product) => {
        if (!product.title || !product.id) {
          return { error: "Product id and title are required." };
        }
        delete product.pricing_mode;
        const hasDirectPrice = Number(product.customer_price_pkr || 0) > 0;
        const hasUsdPrice = Number(product.usa_price_usd || 0) > 0;
        if (!hasDirectPrice && !hasUsdPrice) {
          return { error: "Set either a USD retail price (preorder) or a PKR customer price (in-stock)." };
        }
        if (!hasSupabase()) return { product };
        try {
          const saved = await upsertProduct(product);
          return { product: saved };
        } catch (err) {
          return { error: `Save failed: ${err.message}` };
        }
      };

      // Bulk path — array of products. Returns { results: [...], saved, failed }.
      if (Array.isArray(body.products)) {
        const items = body.products.slice(0, 50);
        const results = [];
        let saved = 0;
        let failed = 0;
        for (const product of items) {
          const r = await saveOne(product);
          if (r.error) { failed++; results.push({ id: product.id, ok: false, error: r.error }); }
          else { saved++; results.push({ id: r.product?.id || product.id, ok: true, product: r.product }); }
        }
        return json({ results, saved, failed, configured: hasSupabase() });
      }

      // Single product (legacy shape)
      const r = await saveOne(body);
      if (r.error) return json({ error: r.error }, { status: 400 });
      return json({ product: r.product, configured: hasSupabase() });
    }

    if (req.method === "DELETE") {
      if (!requireAdmin(req)) return json({ error: "Unauthorized" }, { status: 401 });
      const { ids } = await req.json();
      if (!Array.isArray(ids) || !ids.length) return json({ error: "ids array required" }, { status: 400 });
      if (!hasSupabase()) return json({ removed: ids.length, configured: false });
      const idFilter = ids.map(encodeURIComponent).join(",");
      await supabase(`/rest/v1/products?id=in.(${idFilter})`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ status: "archived", updated_at: new Date().toISOString() }),
      });
      return json({ removed: ids.length, configured: true });
    }

    return json({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    return json({ error: error.message }, { status: 500 });
  }
};

export const config = {
  path: "/api/catalog",
};
