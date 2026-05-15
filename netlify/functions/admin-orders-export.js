// CSV export of orders, filterable by ?date=yesterday|today|7d|30d|month|prev_month
// or ?from=YYYY-MM-DD&to=YYYY-MM-DD. Same column layout as the in-portal
// CSV export so accounting handoffs stay consistent.

import { getOrders, json, requireAdmin } from "./_shared/supabase.js";
import { canonPhone, isValidPkMobile, formatPkDisplay } from "./_shared/phone.js";

function rangeFromQuery(url) {
  const q = url.searchParams.get("date") || "";
  const now = new Date();
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
  if (q === "today") return { from: startOfDay.getTime(), to: Infinity, label: "today" };
  if (q === "yesterday") {
    const start = new Date(startOfDay.getTime() - 86_400_000);
    return { from: start.getTime(), to: startOfDay.getTime(), label: "yesterday" };
  }
  if (q === "7d") return { from: now.getTime() - 7 * 86_400_000, to: Infinity, label: "7d" };
  if (q === "30d") return { from: now.getTime() - 30 * 86_400_000, to: Infinity, label: "30d" };
  if (q === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: start.getTime(), to: Infinity, label: "month" };
  }
  if (q === "prev_month") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: start.getTime(), to: end.getTime(), label: "prev_month" };
  }
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  return {
    from: from ? new Date(from).getTime() : -Infinity,
    to: to ? new Date(`${to}T23:59:59`).getTime() : Infinity,
    label: from && to ? `${from}_to_${to}` : "all",
  };
}

function csvEsc(v) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default async (req) => {
  if (!requireAdmin(req)) return json({ error: "Unauthorized" }, { status: 401 });
  try {
    const url = new URL(req.url);
    const range = rangeFromQuery(url);
    const orders = await getOrders();
    const filtered = (orders || []).filter((o) => {
      const t = new Date(o.created_at || 0).getTime();
      return !Number.isNaN(t) && t >= range.from && t < range.to;
    });
    const headers = [
      "Order ID", "Created", "Customer", "Phone", "City", "Address",
      "Status", "Payment status", "Total PKR", "Advance due", "Advance paid",
      "Balance due", "Balance paid", "Tracking", "Courier", "Items",
    ];
    const body = filtered.map((o) => {
      const items = Array.isArray(o.order_items) ? o.order_items : (Array.isArray(o.items) ? o.items : []);
      const itemSummary = items.map((i) => {
        const v = i.variant ? ` ${i.variant}` : "";
        return `${i.title || ""}${v} ×${i.quantity || 1}`;
      }).join(" | ");
      return [
        o.id, o.created_at || "", o.customer_name || "",
        isValidPkMobile(canonPhone(o.customer_phone)) ? formatPkDisplay(canonPhone(o.customer_phone)) : (o.customer_phone || ""),
        o.city || "", (o.address || "").replace(/\n/g, " "),
        (o.status || "").replaceAll("_", " "),
        (o.payment_status || "").replaceAll("_", " "),
        Number(o.total_pkr || 0), Number(o.advance_due_pkr || 0),
        Number(o.advance_paid_pkr || 0), Number(o.balance_due_pkr || 0),
        Number(o.balance_paid_pkr || 0),
        o.tracking_number || o.usa_tracking || "",
        o.courier_name || o.local_courier || "",
        itemSummary,
      ].map(csvEsc).join(",");
    });

    // Second section: one row per line item so accounting gets full detail.
    // Separated by a blank line and a new header so a single CSV opens
    // cleanly in Excel/Sheets as two stacked tables.
    const itemHeaders = [
      "", "Order ID", "Item title", "Variant", "Quantity",
      "Unit PKR", "Line PKR", "Stock mode", "Source URL",
    ];
    const itemRows = [];
    for (const o of filtered) {
      const items = Array.isArray(o.order_items) ? o.order_items : (Array.isArray(o.items) ? o.items : []);
      for (const i of items) {
        const unit = Number(i.unit_price_pkr || 0);
        const qty = Number(i.quantity || 1);
        itemRows.push([
          "LINE", o.id, i.title || "", i.variant || "", qty,
          unit, unit * qty,
          i.stock_mode || "",
          i.source_url || "",
        ].map(csvEsc).join(","));
      }
    }
    const csv = [
      "# ORDERS",
      headers.join(","),
      ...body,
      "",
      "# LINE ITEMS",
      itemHeaders.join(","),
      ...itemRows,
    ].join("\n");
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv;charset=utf-8",
        "Content-Disposition": `attachment; filename="global-bestie-orders-${range.label}-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return json({ error: error.message }, { status: 500 });
  }
};

export const config = { path: "/api/admin/orders/export" };
