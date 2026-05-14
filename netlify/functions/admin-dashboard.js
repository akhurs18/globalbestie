import { getAllProducts, getOrders, getSettings, getShipmentBatches, getTrends, hasSupabase, json, requireAdmin } from "./_shared/supabase.js";

export default async (req) => {
  if (!requireAdmin(req)) return json({ error: "Unauthorized" }, { status: 401 });

  try {
    const [orders, products, trends, settings, shipmentBatches] = await Promise.all([
      getOrders(),
      getAllProducts(),
      getTrends(),
      getSettings(),
      getShipmentBatches(),
    ]);
    return json({ orders, products, trends, settings, shipmentBatches, configured: hasSupabase() });
  } catch (error) {
    return json({ error: error.message }, { status: 500 });
  }
};

export const config = {
  path: "/api/admin/dashboard",
};
