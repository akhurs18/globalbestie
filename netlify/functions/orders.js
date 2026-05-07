import { getOrders, getSettings, hasSupabase, json, makeOrderId, supabase, uploadTransferProof } from "./_shared/supabase.js";

function splitPayment(items = [], total = 0) {
  const preorderTotal = items.reduce((sum, item) => item.stock_mode === "preorder" ? sum + Number(item.unit_price_pkr || 0) * Number(item.quantity || 1) : sum, 0);
  const inStockTotal = items.reduce((sum, item) => item.stock_mode === "in_stock" ? sum + Number(item.unit_price_pkr || 0) * Number(item.quantity || 1) : sum, 0);
  const computedTotal = Math.ceil(preorderTotal + inStockTotal) || Number(total || 0);
  const advanceDue = Math.ceil(inStockTotal + preorderTotal * 0.5) || Number(total || 0);
  return {
    total: computedTotal,
    advanceDue,
    balanceDue: Math.max(0, computedTotal - advanceDue),
  };
}

export default async (req) => {
  try {
    if (req.method === "GET") {
      const url = new URL(req.url);
      const query = url.searchParams.get("query") || "";
      const orders = await getOrders(query);
      return json({ order: orders[0] || null, orders, configured: hasSupabase() });
    }

    if (req.method === "POST") {
      const payload = await req.json();
      if (!payload.customer_name || !payload.customer_phone || !payload.items?.length) {
        return json({ error: "Customer name, phone, and order items are required." }, { status: 400 });
      }

      const id = makeOrderId();
      const now = new Date().toISOString();
      const payment = splitPayment(payload.items, payload.total_pkr);
      const settings = await getSettings();
      const hasPreorder = payload.items.some((item) => item.stock_mode === "preorder") || payment.balanceDue > 0;
      const shipmentEta = payload.eta || (hasPreorder && settings.next_shipment_date
        ? `Next shipment ETA: ${new Date(`${settings.next_shipment_date}T12:00:00`).toLocaleDateString("en-PK", { month: "long", day: "numeric", year: "numeric" })}`
        : hasPreorder ? "Shipment ETA confirmed after approval" : "Ready after team approval");
      const order = {
        id,
        customer_name: payload.customer_name,
        customer_phone: payload.customer_phone,
        customer_email: payload.customer_email || "",
        customer_instagram: payload.customer_instagram || "",
        city: payload.city,
        address: payload.address,
        notes: payload.notes || "",
        channel: "storefront",
        owner: "",
        priority: "Standard",
        status: "pending_review",
        payment_status: payload.transfer_reference || payload.transfer_file ? "advance_uploaded" : "awaiting_advance",
        transfer_reference: payload.transfer_reference || "",
        total_pkr: Number(payload.total_pkr || payment.total || 0),
        advance_due_pkr: Number(payload.advance_due_pkr || payment.advanceDue || 0),
        balance_due_pkr: Number(payload.balance_due_pkr || payment.balanceDue || 0),
        advance_paid_pkr: 0,
        balance_paid_pkr: 0,
        eta: shipmentEta,
        next_action: payload.next_action || "Review product availability, source price, and shipment batch before accepting.",
        local_courier: payload.delivery_method || "standard_courier",
        created_at: now,
        updated_at: now,
      };

      if (!hasSupabase()) {
        return json({
          order: {
            ...order,
            items: payload.items,
            events: [{ status: "pending_review", note: `Order request created. Team must confirm availability before payment is accepted. Estimated order value: PKR ${order.total_pkr}.`, created_at: now }],
          },
          configured: false,
        });
      }

      const proofPath = await uploadTransferProof(id, payload.transfer_file);
      const [createdOrder] = await supabase("/rest/v1/orders", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(order),
      });

      const items = payload.items.map((item) => ({
        order_id: id,
        product_id: item.product_id,
        title: item.title,
        quantity: Number(item.quantity || 1),
        unit_price_pkr: Number(item.unit_price_pkr || 0),
        stock_mode: item.stock_mode || "preorder",
        image_url: item.image_url || "",
        variant: item.variant || "",
        source_url: item.source_url || "",
        source_status: item.source_status || "",
      }));
      await supabase("/rest/v1/order_items", { method: "POST", body: JSON.stringify(items) });

      await supabase("/rest/v1/order_events", {
        method: "POST",
        body: JSON.stringify({
          order_id: id,
          status: "pending_review",
          note: `Order request created. Team must confirm availability before payment is accepted. Estimated order value: PKR ${order.total_pkr}.`,
          created_at: now,
        }),
      });

      if (payload.transfer_reference || proofPath) {
        await supabase("/rest/v1/transfer_confirmations", {
          method: "POST",
          body: JSON.stringify({
            order_id: id,
            transfer_reference: payload.transfer_reference || "",
            proof_path: proofPath,
            status: "uploaded",
            created_at: now,
          }),
        });
      }

      return json({
        order: { ...createdOrder, items, events: [{ status: "pending_review", note: `Order request created. Team must confirm availability before payment is accepted. Estimated order value: PKR ${order.total_pkr}.`, created_at: now }] },
        configured: true,
      });
    }

    return json({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    return json({ error: error.message }, { status: 500 });
  }
};

export const config = {
  path: "/api/orders",
};
