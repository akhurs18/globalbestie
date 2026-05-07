import { getProducts, getSettings, hasSupabase, json, requireAdmin, upsertProduct } from "./_shared/supabase.js";

function customerPrice(product, settings) {
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
    stock_mode: product.stock_mode,
    inventory: product.inventory,
    image_url: product.image_url,
    gallery_urls: product.gallery_urls || [],
    variants: product.variants,
    authenticity_note: product.authenticity_note,
    social_proof: product.social_proof,
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
      const product = await req.json();
      if (!product.title || !product.id) return json({ error: "Product id and title are required." }, { status: 400 });
      if (!hasSupabase()) return json({ product, configured: false });
      const saved = await upsertProduct(product);
      return json({ product: saved, configured: true });
    }

    return json({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    return json({ error: error.message }, { status: 500 });
  }
};

export const config = {
  path: "/api/catalog",
};
