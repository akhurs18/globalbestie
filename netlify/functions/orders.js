import { getOrders, getSettings, hasSupabase, json, makeOrderId, supabase, uploadTransferProof } from "./_shared/supabase.js";
import { canonPhone, isValidPkMobile, formatPkDisplay } from "./_shared/phone.js";
import { sendWhatsappMessage, interpolate } from "./_shared/whatsapp.js";
import { currentCustomer } from "./_shared/auth.js";

// Default body used when the whatsapp_templates table is empty / unreachable.
// Mirrors `tmpl-advance` in supabase/schema.sql so a fresh deployment without
// migrations still sends the right message.
const DEFAULT_ADVANCE_TEMPLATE =
  "Hi {{name}}, thank you for your Global Bestie order {{order_id}}. Please transfer the 50% advance of PKR {{advance}} to confirm — bank details on the order page. Reply once sent so we can match it. ETA: {{eta}}";

const DEFAULT_INSTOCK_TEMPLATE =
  "Hi {{name}}, thank you for your Global Bestie order {{order_id}}. Your item is in stock — please transfer PKR {{advance}} to confirm and we'll dispatch within 1–2 working days. Reply with your transfer reference so we can match it.";

// Picks a template by category, falling back to the inline default. Best-
// effort: never throws — a Maychats outage must not block order creation.
async function loadAutoTemplate(category) {
  if (!hasSupabase()) {
    return category === "in_stock_confirmation" ? DEFAULT_INSTOCK_TEMPLATE : DEFAULT_ADVANCE_TEMPLATE;
  }
  try {
    const rows = await supabase(
      `/rest/v1/whatsapp_templates?category=eq.${encodeURIComponent(category)}&is_active=eq.true&select=body&limit=1`,
    );
    if (rows?.[0]?.body) return rows[0].body;
  } catch {
    /* fall through */
  }
  return category === "in_stock_confirmation" ? DEFAULT_INSTOCK_TEMPLATE : DEFAULT_ADVANCE_TEMPLATE;
}

// Sends the welcome / advance-request WhatsApp right after order creation.
// Fully non-blocking: any failure is swallowed and the order is still
// returned to the customer successfully. We DO write a soft event to
// order_events when sending so the team can see "auto-message sent" in the
// timeline, and a "send_failed" event so silent drops are visible.
async function sendAutoAdvanceMessage({ order, hasPreorder }) {
  if (!order?.customer_phone) return;
  if (order.whatsapp_opt_in === false) return; // respect opt-out
  const category = hasPreorder ? "advance_request" : "in_stock_confirmation";
  const body = await loadAutoTemplate(category);
  const advanceLeft = Math.max(0, Number(order.advance_due_pkr || 0) - Number(order.advance_paid_pkr || 0));
  const text = interpolate(body, {
    name: (order.customer_name || "").split(" ")[0] || "there",
    full_name: order.customer_name || "",
    order_id: order.id,
    eta: order.eta || "to be confirmed",
    advance: advanceLeft.toLocaleString(),
    balance: Number(order.balance_due_pkr || 0).toLocaleString(),
    total: Number(order.total_pkr || 0).toLocaleString(),
    tracking: order.tracking_number || order.usa_tracking || "to be shared",
    city: order.city || "",
  });
  const result = await sendWhatsappMessage({ to: order.customer_phone, text });

  if (hasSupabase()) {
    try {
      await supabase("/rest/v1/order_events", {
        method: "POST",
        body: JSON.stringify({
          order_id: order.id,
          status: result.sent ? "auto_whatsapp_sent" : "auto_whatsapp_failed",
          note: result.sent
            ? `Auto WhatsApp sent (${category}).`
            : `Auto WhatsApp not sent: ${result.reason || result.status || "unknown"}.`,
          created_at: new Date().toISOString(),
        }),
      });
    } catch {
      /* timeline write is decoration only */
    }
    // Also stamp marketing_messages so the customer history panel and the
    // per-recipient daily cap see this send.
    if (result.sent) {
      try {
        await supabase("/rest/v1/marketing_messages", {
          method: "POST",
          body: JSON.stringify({
            lead_id: `order-${order.id}`,
            customer_phone: order.customer_phone,
            source: `Auto (${category})`,
            direction: "outbound",
            body: text,
            external_message_id: result.data?.message_id || result.data?.id || null,
            created_at: new Date().toISOString(),
          }),
        });
      } catch {
        /* audit row is best-effort */
      }
    }
  }
}

// Re-prices an order from canonical product rows so the customer can't ship
// stale prices (e.g., they had the tab open while FX moved). If a product
// id can't be resolved we trust the client's unit_price_pkr as a fallback,
// but log the divergence on the order via `pricing_note`.
async function repriceItems(items) {
  if (!items?.length) return { items: [], notes: [] };
  if (!hasSupabase()) {
    return { items: items.map((i) => ({ ...i })), notes: [] };
  }
  const ids = [...new Set(items.map((i) => i.product_id).filter(Boolean))];
  if (!ids.length) return { items: items.map((i) => ({ ...i })), notes: [] };
  const inList = ids.map((id) => `"${encodeURIComponent(id)}"`).join(",");
  let products = [];
  try {
    products = await supabase(`/rest/v1/products?id=in.(${inList})&select=id,title,usa_price_usd,shipping_pkr,markup_rate,fx_rate,customer_price_pkr,delivery_days_min,delivery_days_max,stock_mode,inventory,status,image_url,source_url`);
  } catch {
    products = [];
  }
  const byId = new Map(products.map((p) => [p.id, p]));
  const notes = [];
  const repriced = items.map((item) => {
    const product = byId.get(item.product_id);
    if (!product) {
      notes.push(`Product ${item.product_id} not found — used client price.`);
      return { ...item };
    }
    if (product.status && product.status !== "active") {
      notes.push(`Product ${item.title} is no longer active.`);
    }
    const fx = Number(product.fx_rate || 282);
    const margin = Number(product.markup_rate || 0.25);
    const shipping = Number(product.shipping_pkr || 0);
    const usd = Number(product.usa_price_usd || 0);
    const directPkr = Number(product.customer_price_pkr || 0);
    // In-stock items priced directly in PKR skip the USD/FX/markup math.
    const canonical = directPkr > 0
      ? Math.ceil(directPkr)
      : Math.ceil(usd * fx * (1 + margin) + shipping);
    const clientPrice = Number(item.unit_price_pkr || 0);
    // Allow ±1% drift to absorb rounding. Anything else, server price wins.
    const drift = clientPrice > 0 ? Math.abs(canonical - clientPrice) / canonical : 1;
    if (drift > 0.01) {
      notes.push(`${product.title}: requoted ₨${canonical.toLocaleString()} (client had ₨${clientPrice.toLocaleString()}).`);
    }
    return {
      ...item,
      product_id: product.id,
      title: product.title,
      stock_mode: product.stock_mode || item.stock_mode,
      image_url: product.image_url || item.image_url,
      source_url: product.source_url || item.source_url || "",
      unit_price_pkr: canonical,
    };
  });
  return { items: repriced, notes };
}

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

// Per-IP rate limit on /api/orders POST. Public endpoint; without this
// anyone could mash submit and fill the customers + orders tables with
// junk. 10 successful POSTs per IP per hour is plenty for any legitimate
// customer. The map evicts old entries when it grows past 5 min.
const ipPostHistory = new Map(); // ip → [timestamps]
const IP_RATE_LIMIT = 10;
const IP_RATE_WINDOW_MS = 60 * 60 * 1000;
function clientIp(req) {
  return (
    req.headers.get("x-nf-client-connection-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "anon"
  );
}
function checkIpRate(req) {
  const ip = clientIp(req);
  const now = Date.now();
  const hist = (ipPostHistory.get(ip) || []).filter((t) => now - t < IP_RATE_WINDOW_MS);
  if (hist.length >= IP_RATE_LIMIT) {
    return { ok: false, ip, retry_after_minutes: Math.ceil((IP_RATE_WINDOW_MS - (now - hist[0])) / 60_000) };
  }
  return { ok: true, ip, recordHit: () => {
    hist.push(now);
    ipPostHistory.set(ip, hist);
  } };
}

// Idempotency: simple in-memory map (per function instance). Good enough to
// catch a double-tap within seconds; a longer window needs a DB-backed
// dedupe key. Keyed by `${canonPhone}:${idempotency_key}`.
const recentSubmissions = new Map();
function rememberSubmission(key, orderId) {
  recentSubmissions.set(key, { orderId, at: Date.now() });
  // Best-effort eviction of anything older than 5 min.
  for (const [k, v] of recentSubmissions) {
    if (Date.now() - v.at > 5 * 60_000) recentSubmissions.delete(k);
  }
}

// Fallback dedupe — even when the client forgets to send (or mishandles)
// the idempotency_key, the same phone + same total within 60 s is almost
// certainly a double-click. Returns the existing orderId so the server
// never inserts the same order twice. Distinct from the keyed map above
// so a sniped retry across function instances still gets caught.
const recentByPhoneTotal = new Map();
function dedupeByPhoneTotal(phone, total) {
  if (!phone || !total) return null;
  const key = `${phone}:${total}`;
  const prev = recentByPhoneTotal.get(key);
  if (prev && Date.now() - prev.at < 60_000) {
    return prev.orderId;
  }
  return null;
}
function rememberPhoneTotal(phone, total, orderId) {
  if (!phone || !total) return;
  recentByPhoneTotal.set(`${phone}:${total}`, { orderId, at: Date.now() });
  for (const [k, v] of recentByPhoneTotal) {
    if (Date.now() - v.at > 5 * 60_000) recentByPhoneTotal.delete(k);
  }
}

// Upsert into the `customers` table keyed by canonical phone. Idempotent and
// safe to call on every successful order. Increments totals at the same time.
async function upsertCustomer({ phone, name, email, city, address, orderValue }) {
  if (!hasSupabase() || !phone) return;
  try {
    // Fetch existing first so we can increment counters server-side.
    const existing = await supabase(`/rest/v1/customers?phone=eq.${encodeURIComponent(phone)}&select=*`);
    const now = new Date().toISOString();
    if (!existing?.length) {
      await supabase("/rest/v1/customers", {
        method: "POST",
        body: JSON.stringify({
          phone,
          name: name || "",
          email: email || "",
          city: city || "",
          default_address: address || "",
          total_orders: 1,
          total_revenue_pkr: Number(orderValue || 0),
          first_seen: now,
          last_seen: now,
        }),
      });
    } else {
      const c = existing[0];
      await supabase(`/rest/v1/customers?phone=eq.${encodeURIComponent(phone)}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: c.name || name || "",
          email: c.email || email || "",
          city: city || c.city || "",
          default_address: address || c.default_address || "",
          total_orders: Number(c.total_orders || 0) + 1,
          total_revenue_pkr: Number(c.total_revenue_pkr || 0) + Number(orderValue || 0),
          last_seen: now,
        }),
      });
    }
  } catch {
    // Customers table is a nice-to-have. Never block order creation if the
    // upsert fails (e.g. table not yet migrated in this environment).
  }
}

function missingColumnFromSupabaseError(error) {
  const text = String(error?.message || error || "");
  const match = text.match(/Could not find the '([^']+)' column/i);
  return match?.[1] || "";
}

function stripColumn(payload, column) {
  if (!column) return false;
  let stripped = false;
  const stripOne = (row) => {
    if (row && Object.prototype.hasOwnProperty.call(row, column)) {
      delete row[column];
      stripped = true;
    }
  };
  if (Array.isArray(payload)) payload.forEach(stripOne);
  else stripOne(payload);
  return stripped;
}

async function insertStrippingMissingColumns(path, rows, options = {}) {
  const payload = Array.isArray(rows)
    ? rows.map((row) => ({ ...row }))
    : { ...rows };

  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      return await supabase(path, {
        ...options,
        method: options.method || "POST",
        body: JSON.stringify(payload),
      });
    } catch (error) {
      const column = missingColumnFromSupabaseError(error);
      if (!stripColumn(payload, column)) throw error;
    }
  }
  throw new Error("Could not insert row because the live database schema is missing too many expected columns.");
}

export default async (req) => {
  try {
    if (req.method === "GET") {
      const url = new URL(req.url);
      const query = url.searchParams.get("query") || "";
      // If the query looks like a phone number, canonicalize and exact-match
      // on customer_phone instead of doing a substring search. Stops the
      // "type 300 to find anything containing 300" leak.
      const canon = canonPhone(query);
      const lookingForPhone = isValidPkMobile(canon);
      let orders;
      if (lookingForPhone) {
        orders = await getOrders("");
        orders = orders.filter((o) => canonPhone(o.customer_phone) === canon);
      } else {
        orders = await getOrders(query);
      }
      return json({
        order: orders[0] || null,
        orders,
        configured: hasSupabase(),
        canon_phone: lookingForPhone ? canon : "",
      });
    }

    if (req.method === "POST") {
      const rate = checkIpRate(req);
      if (!rate.ok) {
        return json({
          error: "Too many orders from this network in the last hour. Please WhatsApp us if this is a mistake.",
          retry_after_minutes: rate.retry_after_minutes,
        }, { status: 429 });
      }
      const payload = await req.json();
      if (!payload.customer_name || !payload.customer_phone || !payload.items?.length) {
        return json({ error: "Customer name, phone, and order items are required." }, { status: 400 });
      }
      rate.recordHit();

      // === Canonicalize and validate the phone first thing ===
      // If the customer is logged in, the session's phone takes precedence
      // over whatever the form submitted — prevents a logged-in user from
      // accidentally (or deliberately) placing an order against a
      // different identity.
      const session = await currentCustomer(req).catch(() => null);
      const submittedCanon = canonPhone(payload.customer_phone);
      const canon = session?.phone || submittedCanon;
      if (!isValidPkMobile(canon)) {
        return json({
          error: "Please enter a valid Pakistani mobile number (e.g. 0300 1234567).",
          field: "customer_phone",
        }, { status: 400 });
      }

      // === Idempotency: reject duplicate submits within 5 min ===
      const idemKey = String(payload.idempotency_key || "").slice(0, 64);
      if (idemKey) {
        const seen = recentSubmissions.get(`${canon}:${idemKey}`);
        if (seen) {
          return json({
            order: { id: seen.orderId, duplicate: true },
            duplicate: true,
            message: "This order was already submitted. We're processing it.",
          });
        }
      }

      // === Server-trusted pricing: re-price from product rows ===
      const { items: pricedItems, notes: pricingNotes } = await repriceItems(payload.items);
      const payment = splitPayment(pricedItems, payload.total_pkr);

      // === Fallback dedupe: same phone + same total within 60 s ===
      // Catches the case where the client forgets the idempotency key or
      // a network retry re-uses an expired one. Returns the original
      // orderId instead of inserting another row.
      const dupeId = dedupeByPhoneTotal(canon, payment.total);
      if (dupeId) {
        return json({
          order: { id: dupeId, duplicate: true },
          duplicate: true,
          message: "Same order was just submitted — using the existing one.",
        });
      }

      const id = makeOrderId();
      const now = new Date().toISOString();
      const settings = await getSettings();
      const hasPreorder = pricedItems.some((item) => item.stock_mode === "preorder") || payment.balanceDue > 0;
      const shipmentEta = payload.eta || (hasPreorder && settings.next_shipment_date
        ? `Next shipment ETA: ${new Date(`${settings.next_shipment_date}T12:00:00`).toLocaleDateString("en-PK", { month: "long", day: "numeric", year: "numeric" })}`
        : hasPreorder ? "Shipment ETA confirmed after approval" : "Ready after team approval");

      const order = {
        id,
        customer_name: String(payload.customer_name || "").trim(),
        customer_phone: canon,
        customer_phone_display: formatPkDisplay(canon),
        customer_email: payload.customer_email || "",
        customer_instagram: payload.customer_instagram || "",
        city: String(payload.city || "").trim(),
        address: String(payload.address || "").trim(),
        notes: payload.notes || "",
        channel: "storefront",
        owner: "",
        priority: "Standard",
        status: "pending_review",
        payment_status: payload.transfer_reference || payload.transfer_file ? "advance_uploaded" : "awaiting_advance",
        transfer_reference: payload.transfer_reference || "",
        total_pkr: payment.total,
        advance_due_pkr: payment.advanceDue,
        balance_due_pkr: payment.balanceDue,
        advance_paid_pkr: 0,
        balance_paid_pkr: 0,
        eta: shipmentEta,
        next_action: payload.next_action || "Review product availability, source price, and shipment batch before accepting.",
        local_courier: payload.delivery_method || "standard_courier",
        whatsapp_opt_in: payload.whatsapp_opt_in !== false,
        pricing_note: pricingNotes.length ? pricingNotes.join(" ") : "",
        idempotency_key: idemKey || null,
        created_at: now,
        updated_at: now,
      };

      if (!hasSupabase()) {
        if (idemKey) rememberSubmission(`${canon}:${idemKey}`, id);
        rememberPhoneTotal(canon, payment.total, id);
        // Best-effort auto WhatsApp even in offline-preview mode (lets local
        // smoke tests verify Maychats credentials when set).
        sendAutoAdvanceMessage({ order, hasPreorder }).catch(() => {});
        return json({
          order: {
            ...order,
            items: pricedItems,
            events: [{ status: "pending_review", note: `Order request created. Estimated value: PKR ${order.total_pkr}.${pricingNotes.length ? " " + pricingNotes.join(" ") : ""}`, created_at: now }],
          },
          configured: false,
          pricing_notes: pricingNotes,
        });
      }

      const proofPath = await uploadTransferProof(id, payload.transfer_file);
      const [createdOrder] = await insertStrippingMissingColumns("/rest/v1/orders", order, {
        headers: { Prefer: "return=representation" },
      });

      const items = pricedItems.map((item) => ({
        order_id: id,
        product_id: item.product_id,
        title: item.title,
        quantity: Number(item.quantity || 1),
        unit_price_pkr: Number(item.unit_price_pkr || 0),
        stock_mode: item.stock_mode || "preorder",
        image_url: item.image_url || "",
        variant: item.variant || "",
        customer_variant_input: item.customer_variant_input || "",
        source_url: item.source_url || "",
        source_status: item.source_status || "",
      }));
      await insertStrippingMissingColumns("/rest/v1/order_items", items);

      await supabase("/rest/v1/order_events", {
        method: "POST",
        body: JSON.stringify({
          order_id: id,
          status: "pending_review",
          note: `Order request created. Estimated value: PKR ${order.total_pkr}.${pricingNotes.length ? " " + pricingNotes.join(" ") : ""}`,
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

      // Upgrade the (possibly already-existing) customer row with this order.
      await upsertCustomer({
        phone: canon,
        name: order.customer_name,
        email: order.customer_email,
        city: order.city,
        address: order.address,
        orderValue: order.total_pkr,
      });

      if (idemKey) rememberSubmission(`${canon}:${idemKey}`, id);
      rememberPhoneTotal(canon, payment.total, id);

      // Fire-and-forget Maychats notification — the customer gets a
      // WhatsApp confirmation seconds after submit. Failures land as an
      // event in the order timeline; they never block the response.
      sendAutoAdvanceMessage({ order: createdOrder || order, hasPreorder }).catch(() => {});

      return json({
        order: { ...createdOrder, items, events: [{ status: "pending_review", note: `Order request created. Estimated value: PKR ${order.total_pkr}.`, created_at: now }] },
        configured: true,
        pricing_notes: pricingNotes,
      });
    }

    if (req.method === "PATCH") {
      const payload = await req.json();
      const id = String(payload.id || "").trim();
      const canon = canonPhone(payload.customer_phone);
      const stage = payload.payment_stage === "balance" ? "balance" : "advance";
      if (!id || !isValidPkMobile(canon)) {
        return json({ error: "Order number and a valid phone are required." }, { status: 400 });
      }

      const now = new Date().toISOString();
      const nextPaymentStatus = stage === "balance" ? "balance_uploaded" : "advance_uploaded";
      const fallbackOrder = {
        id,
        customer_phone: canon,
        payment_status: nextPaymentStatus,
        transfer_reference: payload.transfer_reference || "",
        proof_url: payload.transfer_file?.name || "",
        events: [{
          status: nextPaymentStatus,
          note: `${stage === "balance" ? "Balance" : "Advance"} transfer proof uploaded by customer.`,
          created_at: now,
        }],
      };

      if (!hasSupabase()) return json({ order: fallbackOrder, configured: false });

      // === Exact match on canon phone — no more ilike substring ===
      const matches = await supabase(`/rest/v1/orders?id=eq.${encodeURIComponent(id)}&customer_phone=eq.${encodeURIComponent(canon)}&select=*`);
      const order = matches[0];
      if (!order) return json({ error: "No matching order found for this order number and phone." }, { status: 404 });

      const proofPath = await uploadTransferProof(id, payload.transfer_file);
      const updates = {
        payment_status: nextPaymentStatus,
        transfer_reference: payload.transfer_reference || order.transfer_reference || "",
        proof_url: proofPath || order.proof_url || "",
        next_action: stage === "balance"
          ? "Review remaining balance proof before local dispatch."
          : "Review advance proof before sourcing.",
        updated_at: now,
      };

      const [updated] = await supabase(`/rest/v1/orders?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(updates),
      });

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

      await supabase("/rest/v1/order_events", {
        method: "POST",
        body: JSON.stringify({
          order_id: id,
          status: nextPaymentStatus,
          note: `${stage === "balance" ? "Balance" : "Advance"} transfer proof uploaded by customer.`,
          created_at: now,
        }),
      });

      return json({ order: updated, configured: true });
    }

    return json({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    return json({ error: error.message }, { status: 500 });
  }
};

export const config = {
  path: "/api/orders",
};
