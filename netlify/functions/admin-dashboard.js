import { getAllProducts, getOrders, getSettings, getShipmentBatches, getTrends, hasSupabase, json, requireAdmin, supabase } from "./_shared/supabase.js";

async function safeFetch(query, fallback = []) {
  if (!hasSupabase()) return fallback;
  try {
    return await supabase(query);
  } catch {
    return fallback;
  }
}

export default async (req) => {
  if (!requireAdmin(req)) return json({ error: "Unauthorized" }, { status: 401 });

  try {
    // Last 90 days of marketing_messages — used by the customer-history
    // panel and by per-recipient cap surfaces. Keep the window tight so
    // we don't bloat the dashboard payload.
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const [orders, products, trends, settings, shipmentBatches, customers, waTemplates, marketingMessages, broadcastCampaigns, scheduledBroadcasts, smartSegments, orderViews, teamMembers] = await Promise.all([
      getOrders(),
      getAllProducts(),
      getTrends(),
      getSettings(),
      getShipmentBatches(),
      safeFetch("/rest/v1/customers?select=*&order=last_seen.desc", []),
      safeFetch("/rest/v1/whatsapp_templates?select=*&order=category.asc", []),
      // Capped at 300 rows: the dashboard only needs recent inbox + last-7d
      // reply attribution. Older messages can be loaded on demand from a
      // dedicated endpoint if/when needed.
      safeFetch(`/rest/v1/marketing_messages?created_at=gte.${encodeURIComponent(since)}&select=*&order=created_at.desc&limit=300`, []),
      safeFetch(`/rest/v1/broadcast_campaigns?triggered_at=gte.${encodeURIComponent(since)}&select=*&order=triggered_at.desc&limit=200`, []),
      safeFetch(`/rest/v1/scheduled_broadcasts?status=in.(pending,running)&select=*&order=send_at.asc&limit=50`, []),
      safeFetch("/rest/v1/smart_segments?select=*&order=pinned.desc,updated_at.desc&limit=50", []),
      safeFetch("/rest/v1/order_views?select=*&order=pinned.desc,updated_at.desc&limit=50", []),
      safeFetch("/rest/v1/team_members?select=*&order=created_at.asc", []),
    ]);
    return json({
      orders,
      products,
      trends,
      settings,
      shipmentBatches,
      customers,
      waTemplates,
      marketingMessages,
      broadcastCampaigns,
      scheduledBroadcasts,
      smartSegments,
      orderViews,
      teamMembers,
      configured: hasSupabase(),
    });
  } catch (error) {
    return json({ error: error.message }, { status: 500 });
  }
};

export const config = {
  path: "/api/admin/dashboard",
};
