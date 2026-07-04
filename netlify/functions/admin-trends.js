import { hasSupabase, json, requireAdmin, supabase, upsertProduct } from "./_shared/supabase.js";

export default async (req, context) => {
  if (!(await requireAdmin(req))) return json({ error: "Unauthorized" }, { status: 401 });
  if (req.method !== "PATCH") return json({ error: "Method not allowed" }, { status: 405 });

  try {
    const { id } = context.params;
    const payload = await req.json();
    const status = payload.status || "approved";

    if (!hasSupabase()) {
      return json({ trend: { id, status }, product: payload.product || null, configured: false });
    }

    let product = null;
    if (status === "approved" && payload.product) {
      product = await upsertProduct(payload.product);
    }

    const [trend] = await supabase(`/rest/v1/trend_candidates?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ status, reviewed_at: new Date().toISOString() }),
    });

    return json({ trend, product, configured: true });
  } catch (error) {
    return json({ error: error.message }, { status: 500 });
  }
};

export const config = {
  path: "/api/admin/trends/:id",
};
