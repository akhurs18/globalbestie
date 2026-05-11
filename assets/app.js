const PKR = new Intl.NumberFormat("en-PK", {
  style: "currency",
  currency: "PKR",
  maximumFractionDigits: 0,
});

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const ORDER_STEPS = [
  ["pending_review", "Deposit under review"],
  ["accepted", "Order accepted"],
  ["sourcing", "Sourced in USA"],
  ["in_transit", "International transit"],
  ["pakistan_processing", "Pakistan arrived, balance due"],
  ["delivered", "Delivered"],
];

const PAYMENT_STATES = [
  ["awaiting_advance", "Awaiting advance"],
  ["advance_uploaded", "Advance uploaded"],
  ["advance_confirmed", "Advance confirmed"],
  ["balance_due", "Balance due"],
  ["balance_uploaded", "Balance uploaded"],
  ["paid_in_full", "Paid in full"],
  ["payment_rejected", "Payment rejected"],
  ["awaiting_confirmation", "Awaiting confirmation"],
  ["confirmation_uploaded", "Confirmation uploaded"],
  ["deposit_confirmed", "Advance confirmed"],
];

const sampleSettings = {
  bank_name: "Meezan Bank",
  account_title: "Global Bestie Imports",
  account_number: "0210-0000-000000",
  iban: "PK00MEZN0000000000000000",
  markup_rate: 0.25,
  fx_rate: 282,
  preorder_weeks: 4,
  next_shipment_date: "2026-06-02",
  shipment_notice: "Next USA batch is being consolidated. Dates can shift slightly based on brand dispatch and customs clearance.",
  business_hours: "11 AM - 9 PM PKT",
  response_sla_minutes: 15,
  city_delivery_fees: "Karachi 450, Lahore 550, Islamabad/Rawalpindi 650, other cities quoted",
  shipping_rules: "Handbags 12k-18k, shoes 9k-13k, makeup 3.5k-6k, fragrance quoted by weight.",
  balance_reminder_template: "Hi {name}, your Global Bestie preorder has arrived in Pakistan. Remaining balance: {balance}. Please transfer before local dispatch.",
  support_whatsapp: "+923001234567",
};

const sampleProducts = [
  {
    id: "bag-coach-tabby-blush",
    title: "Coach Tabby Shoulder Bag 26",
    brand: "Coach",
    category: "handbags",
    description: "A polished blush shoulder bag with dust bag and authenticity-first packaging.",
    usa_price_usd: 395,
    shipping_pkr: 14500,
    fx_rate: 282,
    markup_rate: 0.25,
    stock_mode: "preorder",
    inventory: 0,
    image_url: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=900&q=84",
    gallery_urls: [
      "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=900&q=84",
      "https://images.unsplash.com/photo-1594223274512-ad4803739b7c?auto=format&fit=crop&w=900&q=84",
    ],
    source_url: "https://www.coach.com/",
    variants: "Blush, black, chalk. Size 26.",
    authenticity_note: "Source from Coach USA or authorized department store. Receipt can be attached after sourcing.",
    receipt_url: "",
    supplier_cost_pkr: 125890,
    product_status: "active",
    social_proof: "Most requested handbag preorder this week.",
    featured: true,
    preorder_weeks: 4,
  },
  {
    id: "shoe-nike-v2k-pink",
    title: "Nike V2K Run Pink Foam",
    brand: "Nike",
    category: "shoes",
    description: "Soft pink performance-inspired sneaker for everyday outfits, available by USA preorder.",
    usa_price_usd: 120,
    shipping_pkr: 10500,
    fx_rate: 282,
    markup_rate: 0.25,
    stock_mode: "preorder",
    inventory: 0,
    image_url: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=84",
    gallery_urls: ["https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=84"],
    source_url: "https://www.nike.com/",
    variants: "US women 6-10, pink foam.",
    authenticity_note: "Source from Nike USA or authorized retailer only.",
    receipt_url: "",
    supplier_cost_pkr: 43320,
    product_status: "active",
    social_proof: "Strong repeat DM demand for pink sneakers.",
    featured: true,
    preorder_weeks: 4,
  },
  {
    id: "makeup-rare-beauty-set",
    title: "Rare Beauty Soft Pinch Set",
    brand: "Rare Beauty",
    category: "makeup",
    description: "Curated blush and lip shade set for the customer who wants shade confirmation before sourcing.",
    usa_price_usd: 64,
    shipping_pkr: 5200,
    fx_rate: 282,
    markup_rate: 0.25,
    stock_mode: "in_stock",
    inventory: 5,
    image_url: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=900&q=84",
    gallery_urls: ["https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=900&q=84"],
    source_url: "https://www.rarebeauty.com/",
    variants: "Shade confirmation required before dispatch.",
    authenticity_note: "In-stock inventory is checked before confirmation.",
    receipt_url: "",
    supplier_cost_pkr: 21400,
    product_status: "active",
    social_proof: "Fast-moving beauty item for gift orders.",
    featured: true,
    preorder_weeks: 0,
  },
  {
    id: "bag-marc-jacobs-tote",
    title: "Marc Jacobs Mini Tote",
    brand: "Marc Jacobs",
    category: "handbags",
    description: "Structured mini tote in a premium neutral tone, requested often through Instagram DMs.",
    usa_price_usd: 195,
    shipping_pkr: 12800,
    fx_rate: 282,
    markup_rate: 0.25,
    stock_mode: "preorder",
    inventory: 0,
    image_url: "https://images.unsplash.com/photo-1594223274512-ad4803739b7c?auto=format&fit=crop&w=900&q=84",
    gallery_urls: ["https://images.unsplash.com/photo-1594223274512-ad4803739b7c?auto=format&fit=crop&w=900&q=84"],
    source_url: "https://www.marcjacobs.com/",
    variants: "Black, argan oil, slate green.",
    authenticity_note: "Source from Marc Jacobs USA or official retail partners.",
    receipt_url: "",
    supplier_cost_pkr: 67200,
    product_status: "active",
    social_proof: "Frequently requested through Instagram DMs.",
    featured: false,
    preorder_weeks: 4,
  },
  {
    id: "makeup-dior-glow",
    title: "Dior Lip Glow Oil",
    brand: "Dior",
    category: "makeup",
    description: "High-demand lip oil with shade notes handled in the checkout notes field.",
    usa_price_usd: 40,
    shipping_pkr: 3900,
    fx_rate: 282,
    markup_rate: 0.25,
    stock_mode: "in_stock",
    inventory: 9,
    image_url: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=900&q=84",
    gallery_urls: ["https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=900&q=84"],
    source_url: "https://www.dior.com/",
    variants: "Popular shades: 001, 012, 015. Confirm shade in notes.",
    authenticity_note: "Shade and sealed packaging checked before dispatch.",
    receipt_url: "",
    supplier_cost_pkr: 13900,
    product_status: "active",
    social_proof: "Beauty repeat-buyer favorite.",
    featured: false,
    preorder_weeks: 0,
  },
  {
    id: "fragrance-valentino-born",
    title: "Valentino Born in Roma",
    brand: "Valentino",
    category: "fragrance",
    description: "Luxury fragrance preorder with box-protection notes for international transit.",
    usa_price_usd: 165,
    shipping_pkr: 8800,
    fx_rate: 282,
    markup_rate: 0.25,
    stock_mode: "preorder",
    inventory: 0,
    image_url: "https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=900&q=84",
    gallery_urls: ["https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=900&q=84"],
    source_url: "https://www.valentino-beauty.com/",
    variants: "Donna Born in Roma 50ml / 100ml quoted by availability.",
    authenticity_note: "Fragrance preorders are packed with extra box protection.",
    receipt_url: "",
    supplier_cost_pkr: 55200,
    product_status: "active",
    social_proof: "Premium fragrance preorder for gifting.",
    featured: false,
    preorder_weeks: 4,
  },
];

const sampleOrders = [
  {
    id: "GB-2026-1001",
    customer_name: "Ayesha Khan",
    customer_phone: "03001234567",
    customer_email: "ayesha@example.com",
    customer_instagram: "@ayeshakhan",
    city: "Lahore",
    address: "Gulberg III, Lahore",
    channel: "Instagram DM",
    owner: "Mariam",
    priority: "VIP",
    status: "sourcing",
    payment_status: "advance_confirmed",
    total_pkr: 153738,
    advance_due_pkr: 76869,
    balance_due_pkr: 76869,
    advance_paid_pkr: 76869,
    balance_paid_pkr: 0,
    cost_pkr: 139390,
    margin_pkr: 14348,
    proof_url: "Transfer screenshot on file",
    transfer_sender: "Ayesha Khan HBL",
    source_retailer: "Coach USA",
    source_url: "https://www.coach.com/",
    source_purchase_id: "COACH-US-88312",
    usa_tracking: "UPS 1ZGB88312",
    local_courier: "TCS",
    tracking_number: "",
    eta: "Arrives Pakistan around June 2, 2026",
    next_action: "Confirm USA purchase receipt and upload product sourcing proof.",
    internal_notes: "VIP customer. Keep tone warm; she wants black as backup if blush sells out.",
    created_at: "2026-05-04T10:30:00Z",
    transfer_reference: "IBFT-78321",
    items: [{
      product_id: "bag-coach-tabby-blush",
      title: "Coach Tabby Shoulder Bag 26",
      quantity: 1,
      unit_price_pkr: 153738,
      stock_mode: "preorder",
      image_url: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=900&q=84",
      variant: "Blush, size 26",
      source_url: "https://www.coach.com/",
      source_status: "USA purchase in progress",
    }],
    messages: [
      { source: "Instagram DM", direction: "inbound", body: "Can you source the blush Coach Tabby?", created_at: "2026-05-04T09:50:00Z" },
      { source: "WhatsApp", direction: "outbound", body: "Yes bestie, the PKR price is Rs 153,738. Once accepted, 50% advance is Rs 76,869. Current batch ETA is June 2, 2026.", created_at: "2026-05-04T10:05:00Z" },
    ],
    events: [
      { status: "pending_review", note: "Transfer confirmation uploaded.", created_at: "2026-05-04T10:30:00Z" },
      { status: "accepted", note: "Team accepted order and locked pricing.", created_at: "2026-05-04T13:15:00Z" },
      { status: "sourcing", note: "USA purchase in progress.", created_at: "2026-05-05T18:20:00Z" },
    ],
  },
  {
    id: "GB-2026-1002",
    customer_name: "Sara Shah",
    customer_phone: "03115554444",
    customer_email: "sara@example.com",
    customer_instagram: "@sarashah",
    city: "Karachi",
    address: "DHA Phase 6, Karachi",
    channel: "WhatsApp",
    owner: "Sara",
    priority: "Standard",
    status: "pending_review",
    payment_status: "awaiting_advance",
    total_pkr: 26550,
    advance_due_pkr: 26550,
    balance_due_pkr: 0,
    advance_paid_pkr: 0,
    balance_paid_pkr: 0,
    cost_pkr: 21400,
    margin_pkr: 5150,
    proof_url: "",
    transfer_sender: "",
    source_retailer: "In-stock shelf",
    source_url: "https://www.dior.com/",
    source_purchase_id: "GB-STOCK-104",
    usa_tracking: "",
    local_courier: "Leopards",
    tracking_number: "",
    eta: "Ready after payment confirmation",
    next_action: "Request transfer confirmation for full in-stock amount.",
    internal_notes: "Needs shade confirmation before packing.",
    created_at: "2026-05-06T09:12:00Z",
    transfer_reference: "",
    items: [{
      product_id: "makeup-dior-glow",
      title: "Dior Lip Glow Oil",
      quantity: 2,
      unit_price_pkr: 13275,
      stock_mode: "in_stock",
      image_url: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=900&q=84",
      variant: "Shade 012",
      source_url: "https://www.dior.com/",
      source_status: "In stock",
    }],
    messages: [
      { source: "WhatsApp", direction: "inbound", body: "Need shade 012. Is it in stock?", created_at: "2026-05-06T09:00:00Z" },
    ],
    events: [{ status: "pending_review", note: "Order created. Waiting for admin review.", created_at: "2026-05-06T09:12:00Z" }],
  },
];

const sampleTrends = [
  {
    id: "trend-1",
    title: "Alo Yoga Accolade Hoodie",
    category: "accessories",
    source_url: "https://www.aloyoga.com/",
    usa_price_usd: 118,
    shipping_pkr: 9600,
    score: 94,
    status: "pending",
    image_url: "https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=900&q=84",
  },
  {
    id: "trend-2",
    title: "Tory Burch Fleming Mini",
    category: "handbags",
    source_url: "https://www.toryburch.com/",
    usa_price_usd: 398,
    shipping_pkr: 15000,
    score: 91,
    status: "pending",
    image_url: "https://images.unsplash.com/photo-1566150905458-1bf1fc113f0d?auto=format&fit=crop&w=900&q=84",
  },
  {
    id: "trend-3",
    title: "Charlotte Tilbury Pillow Talk",
    category: "makeup",
    source_url: "https://www.charlottetilbury.com/",
    usa_price_usd: 35,
    shipping_pkr: 4200,
    score: 89,
    status: "pending",
    image_url: "https://images.unsplash.com/photo-1631214540242-3cd8c30f9f60?auto=format&fit=crop&w=900&q=84",
  },
];

const sampleCreativeJobs = [
  {
    id: "content-001",
    title: "Coach Tabby preorder footage",
    type: "Video clip",
    status: "ready_for_remotion",
    channel: "Instagram",
    product: "Coach Tabby Shoulder Bag 26",
    hook: "Use for a 9:16 preorder Reel. Show product first, then 4-week sourcing timeline.",
    source: "Product shoot",
    preview_url: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=900&q=84",
  },
  {
    id: "content-002",
    title: "Rare Beauty story references",
    type: "Story asset",
    status: "needs_review",
    channel: "Instagram + WhatsApp",
    product: "Rare Beauty Soft Pinch Set",
    hook: "Shade-first beauty concierge with in-stock availability. Needs caption polish.",
    source: "Instagram save",
    preview_url: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=900&q=84",
  },
];

const sampleCampaigns = [
  {
    id: "camp-001",
    name: "Pink Friday USA Drop",
    channel: "Instagram",
    status: "live",
    budget_pkr: 65000,
    leads: 43,
    revenue_pkr: 486000,
  },
  {
    id: "camp-002",
    name: "WhatsApp VIP Preorder List",
    channel: "WhatsApp",
    status: "draft",
    budget_pkr: 12000,
    leads: 18,
    revenue_pkr: 0,
  },
];

const sampleLeads = [
  {
    id: "lead-001",
    name: "Hania R.",
    source: "Instagram DM",
    stage: "quote_sent",
    product: "Marc Jacobs Mini Tote",
    value_pkr: 81538,
    last_message: "Can you confirm if this comes in black?",
    owner: "Ayesha",
    sla: "12m",
    automation_status: "human_handoff",
    missing_fields: [],
    handoff_reason: "Customer asked a variant-specific availability question.",
  },
  {
    id: "lead-002",
    name: "Noor K.",
    source: "WhatsApp",
    stage: "new",
    product: "Dior Lip Glow Oil",
    value_pkr: 28900,
    last_message: "Need shade 012. Is it in stock?",
    owner: "Unassigned",
    sla: "4m",
    automation_status: "needs_info",
    missing_fields: ["phone", "city"],
    handoff_reason: "",
  },
  {
    id: "lead-003",
    name: "Maham S.",
    source: "Instagram comment",
    stage: "order_ready",
    product: "Nike V2K Run Pink Foam",
    value_pkr: 52800,
    last_message: "Price please",
    owner: "Sara",
    sla: "29m",
    automation_status: "auto_replied",
    missing_fields: ["variant", "city", "phone"],
    handoff_reason: "",
  },
];

const sampleCalendar = [
  { id: "post-001", date: "Today 8:30 PM", channel: "Instagram Reel", title: "Coach Tabby preorder reveal", status: "Needs caption" },
  { id: "post-002", date: "Tomorrow 2:00 PM", channel: "Story set", title: "Rare Beauty shade poll", status: "Ready" },
  { id: "post-003", date: "Friday 7:00 PM", channel: "WhatsApp broadcast", title: "VIP handbag preorder list", status: "Draft" },
];

const sampleShipmentBatches = [
  {
    id: "batch-june-2026",
    name: "June USA Batch",
    eta_date: "2026-06-02",
    status: "sourcing",
    capacity: 42,
    used: 18,
    note: "Handbags and shoes are consolidating. Dates can shift slightly by retailer dispatch and customs clearance.",
    order_ids: ["GB-2026-1001"],
  },
  {
    id: "batch-mid-june-2026",
    name: "Mid-June Beauty Batch",
    eta_date: "2026-06-18",
    status: "collecting",
    capacity: 30,
    used: 7,
    note: "Best for makeup, fragrance, and smaller accessories. Confirm shades before accepting orders.",
    order_ids: [],
  },
];

const growthPlays = [
  ["VIP WhatsApp list", "Segment customers by handbags, shoes, beauty, and send early preorder windows."],
  ["Creator seeding", "Track micro-influencer gifts, story deliverables, coupon codes, and UGC rights."],
  ["Referral credits", "Reward customers for bringing buyers into high-ticket preorder drops."],
  ["Retargeting loop", "Run Meta campaigns for viewed product, abandoned checkout, and DM-but-no-order leads."],
  ["SEO drop pages", "Create searchable pages for USA brand + Pakistan intent, then route to preorder."],
];

const state = {
  products: [...sampleProducts],
  orders: [...sampleOrders],
  trends: [...sampleTrends],
  creativeJobs: [...sampleCreativeJobs],
  campaigns: [...sampleCampaigns],
  leads: [...sampleLeads],
  calendar: [...sampleCalendar],
  shipmentBatches: [...sampleShipmentBatches],
  settings: { ...sampleSettings },
  cart: loadJSON("mm_cart", []),
  adminToken: localStorage.getItem("mm_admin_token") || "",
  filters: {
    search: "",
    category: "all",
    stock: "all",
    sort: "featured",
  },
};

const selectedTrends = new Set();
const selectedProducts = new Set();

const qs = (selector, root = document) => root.querySelector(selector);
const qsa = (selector, root = document) => [...root.querySelectorAll(selector)];
const has = (selector) => Boolean(qs(selector));

function setHTML(selector, html) {
  const node = qs(selector);
  if (node) node.innerHTML = html;
}

function loadJSON(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}

function saveCart() {
  localStorage.setItem("mm_cart", JSON.stringify(state.cart));
}

function toast(message) {
  const region = qs("[data-toast-region]");
  if (!region) return;
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  region.append(node);
  setTimeout(() => node.remove(), 3600);
}

function calculatePrice(product) {
  if (Number(product.customer_price_pkr || product.price_pkr || 0) > 0) {
    return Math.ceil(Number(product.customer_price_pkr || product.price_pkr));
  }
  const fx = Number(product.fx_rate || state.settings.fx_rate || 282);
  const markup = Number(product.markup_rate ?? state.settings.markup_rate ?? 0.25);
  const retailPkr = Number(product.usa_price_usd || 0) * fx;
  const serviceMargin = retailPkr * markup;
  const shipping = Number(product.shipping_pkr || 0);
  return Math.ceil(retailPkr + serviceMargin + shipping);
}

function productPricingParts(product) {
  if (Number(product.customer_price_pkr || product.price_pkr || 0) > 0 && !Number(product.usa_price_usd || 0)) {
    return {
      retailPkr: 0,
      margin: 0,
      shipping: 0,
      total: calculatePrice(product),
    };
  }
  const fx = Number(product.fx_rate || state.settings.fx_rate || 282);
  const retailPkr = Number(product.usa_price_usd || 0) * fx;
  const margin = retailPkr * Number(product.markup_rate ?? state.settings.markup_rate ?? 0.25);
  return {
    retailPkr,
    margin,
    shipping: Number(product.shipping_pkr || 0),
    total: calculatePrice(product),
  };
}

function paymentLabel(status = "") {
  return PAYMENT_STATES.find(([value]) => value === status)?.[1] || status.replaceAll("_", " ") || "Payment pending";
}

function itemSubtotal(item) {
  return Number(item.unit_price_pkr || item.unit_price || 0) * Number(item.quantity || 1);
}

function orderItems(order) {
  return order?.items || order?.order_items || [];
}

function orderEvents(order) {
  return order?.events || order?.order_events || [];
}

function orderMessages(order) {
  return order?.messages || order?.marketing_messages || [];
}

function relatedProductForItem(item) {
  return state.products.find((product) => product.id === item.product_id || product.title === item.title) || {};
}

function orderCompletionRisk(order) {
  const payment = orderPaymentSummary(order);
  if (order.status === "pakistan_processing" && payment.balanceDue > Number(order.balance_paid_pkr || 0)) return "Balance collection";
  if (order.status === "pending_review") return "Availability review";
  if (!order.owner) return "Unassigned";
  if (!order.tracking_number && ["pakistan_processing", "delivered"].includes(order.status)) return "Local tracking";
  return order.priority || "Normal";
}

function splitPaymentFromLines(lines) {
  const preorderTotal = lines.reduce((sum, line) => line.product?.stock_mode === "preorder" || line.stock_mode === "preorder" ? sum + Number(line.subtotal ?? itemSubtotal(line)) : sum, 0);
  const inStockTotal = lines.reduce((sum, line) => line.product?.stock_mode === "in_stock" || line.stock_mode === "in_stock" ? sum + Number(line.subtotal ?? itemSubtotal(line)) : sum, 0);
  const total = Math.ceil(preorderTotal + inStockTotal);
  const advanceDue = Math.ceil(inStockTotal + preorderTotal * 0.5);
  return {
    total,
    preorderTotal,
    inStockTotal,
    advanceDue,
    balanceDue: Math.max(0, total - advanceDue),
    hasPreorder: preorderTotal > 0,
  };
}

function orderPaymentSummary(order) {
  const items = orderItems(order);
  const fromItems = splitPaymentFromLines(items);
  const total = Number(order?.total_pkr || fromItems.total || 0);
  const storedAdvance = Number(order?.advance_due_pkr ?? order?.deposit_due_pkr ?? order?.amount_due_now_pkr ?? 0);
  const storedBalance = Number(order?.balance_due_pkr ?? 0);
  const hasStoredSplit = storedAdvance > 0 || storedBalance > 0;
  const hasPreorder = items.some((item) => item.stock_mode === "preorder") || storedBalance > 0;
  const advanceDue = hasStoredSplit ? storedAdvance : (fromItems.advanceDue || (hasPreorder ? Math.ceil(total * 0.5) : total));
  const balanceDue = hasStoredSplit ? storedBalance : Math.max(0, total - advanceDue);
  return {
    total,
    advanceDue,
    balanceDue,
    hasPreorder,
  };
}

function amountDueForOrder(order) {
  const payment = orderPaymentSummary(order);
  const advancePaid = Number(order?.advance_paid_pkr || 0);
  const balancePaid = Number(order?.balance_paid_pkr || 0);
  return Math.max(0, payment.advanceDue - advancePaid) + Math.max(0, payment.balanceDue - balancePaid);
}

function batchStatusLabel(status = "") {
  return {
    collecting: "Collecting orders",
    sourcing: "Sourcing",
    shipped: "Shipped from USA",
    arriving: "Arriving Pakistan",
    arrived: "Arrived Pakistan",
  }[status] || status.replaceAll("_", " ") || "Planning";
}

function shipmentBatchForOrder(order) {
  return state.shipmentBatches.find((batch) => (batch.order_ids || []).includes(order.id));
}

function activePaymentStatusForOrder(order, nextStatus = order?.status) {
  const current = order?.payment_status || "";
  if (nextStatus === "pakistan_processing" && orderPaymentSummary(order).balanceDue > 0 && !["balance_uploaded", "paid_in_full"].includes(current)) {
    return "balance_due";
  }
  if (nextStatus === "delivered") return "paid_in_full";
  if (current === "awaiting_confirmation") return "awaiting_advance";
  if (current === "confirmation_uploaded") return "advance_uploaded";
  if (current === "deposit_confirmed") return "advance_confirmed";
  return current || "awaiting_advance";
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-PK", { month: "long", day: "numeric", year: "numeric" });
}

function nextShipmentLabel() {
  const date = formatDate(state.settings.next_shipment_date);
  const activeBatch = state.shipmentBatches.find((batch) => ["collecting", "sourcing", "shipped", "arriving"].includes(batch.status));
  const batchDate = formatDate(activeBatch?.eta_date);
  if (activeBatch && batchDate) return `${activeBatch.name} ETA: ${batchDate}`;
  return date ? `Next shipment ETA: ${date}` : `Next shipment ETA: shared after team approval`;
}

function shipmentNotice() {
  return state.settings.shipment_notice || "Preorder timelines vary because USA shipments are consolidated in batches. Your exact shipment ETA is shared after team approval.";
}

async function apiFetch(path, options = {}, fallback) {
  try {
    const headers = new Headers(options.headers || {});
    if (!headers.has("Content-Type") && options.body) headers.set("Content-Type", "application/json");
    if (state.adminToken) headers.set("Authorization", `Bearer ${state.adminToken}`);
    const response = await fetch(path, { ...options, headers });
    if (!response.ok) throw new Error(await response.text());
    return await response.json();
  } catch (error) {
    if (fallback !== undefined) return fallback;
    throw error;
  }
}

async function loadRemoteData() {
  const catalog = await apiFetch("/api/catalog", {}, {
    products: sampleProducts,
    settings: sampleSettings,
  });
  state.products = catalog.products?.length ? catalog.products : sampleProducts;
  state.settings = { ...sampleSettings, ...(catalog.settings || {}) };
  renderAll();
}

function productCard(product, options = {}) {
  const parts = productPricingParts(product);
  const disabled = product.stock_mode === "in_stock" && Number(product.inventory) <= 0;
  const isPortal = Boolean(options.admin || document.body.dataset.page === "portal");
  const stockLabel = product.stock_mode === "in_stock" ? "In stock" : "Preorder";
  const publicMeta = [
    product.category,
    product.stock_mode === "preorder" ? nextShipmentLabel() : `${Number(product.inventory || 0)} available`,
    product.variants ? product.variants.split(".")[0] : "",
    "Team approval before payment",
  ].filter(Boolean);
  const adminMeta = [
    `USA ${USD.format(product.usa_price_usd || 0)}`,
    `25% margin ${PKR.format(parts.margin)}`,
    `Shipping ${PKR.format(parts.shipping)}`,
    `${product.stock_mode === "preorder" ? "50% advance after approval" : "Full payment after approval"}`,
    product.stock_mode === "preorder" ? nextShipmentLabel() : `${Number(product.inventory || 0)} in stock`,
    product.authenticity_note ? "Source checked" : "Source pending",
  ];
  return `
    <article class="product-card">
      <div class="product-media">
        <img src="${product.image_url}" alt="${product.title}" loading="lazy" />
        <div class="product-badges">
          <span class="status-pill ${product.stock_mode}">${stockLabel}</span>
          <span class="price-chip">${product.category}</span>
        </div>
      </div>
      <div class="product-body">
        <div class="product-title-row">
          <strong>${product.title}</strong>
          <span class="price">${PKR.format(parts.total)}</span>
        </div>
        <p>${product.description || ""}</p>
        <div class="product-meta ${isPortal ? "" : "public-listing"}" aria-label="${isPortal ? "Internal pricing details" : "Product details"}">
          ${(isPortal ? adminMeta : publicMeta).map((item) => `<span>${item}</span>`).join("")}
        </div>
        <div class="product-actions">
          <button class="button secondary" type="button" data-action="view-product" data-product-id="${product.id}">View details</button>
          ${options.admin ? "" : `
            <button class="button primary" type="button" data-action="add-cart" data-product-id="${product.id}" ${disabled ? "disabled" : ""}>
              ${disabled ? "Sold out" : "Add to bag"}
            </button>
          `}
          ${options.admin ? `<button class="button primary" type="button" data-action="edit-product" data-product-id="${product.id}">Edit product</button>` : ""}
        </div>
      </div>
    </article>
  `;
}

function filteredProducts() {
  let products = [...state.products];
  const { search, category, stock, sort } = state.filters;
  if (search) {
    const needle = search.toLowerCase();
    products = products.filter((product) =>
      [product.title, product.brand, product.category, product.description].join(" ").toLowerCase().includes(needle)
    );
  }
  if (category !== "all") products = products.filter((product) => product.category === category);
  if (stock !== "all") products = products.filter((product) => product.stock_mode === stock);
  products.sort((a, b) => {
    if (sort === "price_asc") return calculatePrice(a) - calculatePrice(b);
    if (sort === "price_desc") return calculatePrice(b) - calculatePrice(a);
    if (sort === "margin") return productPricingParts(b).margin - productPricingParts(a).margin;
    return Number(b.featured) - Number(a.featured);
  });
  return products;
}

function renderProducts() {
  const featured = state.products.filter((product) => product.featured).slice(0, 3);
  setHTML("[data-featured-products]", featured.map((product) => productCard(product)).join(""));
  setHTML("[data-shop-products]", filteredProducts().map((product) => productCard(product)).join(""));
  const adminGrid = qs("[data-admin-products]");
  if (adminGrid) {
    adminGrid.innerHTML = state.products.map((product) => `
      <div class="admin-product-wrap${selectedProducts.has(product.id) ? " selected" : ""}">
        <label class="card-select-wrap">
          <input type="checkbox" class="card-checkbox" data-product-select="${product.id}" ${selectedProducts.has(product.id) ? "checked" : ""} />
        </label>
        ${productCard(product, { admin: true })}
      </div>
    `).join("");
    updateProductBulkBar();
  }
}

function cartLines() {
  return state.cart.map((line) => {
    const product = state.products.find((item) => item.id === line.product_id) || line.product;
    const subtotal = calculatePrice(product) * line.quantity;
    return { ...line, product, subtotal };
  });
}

function cartTotal() {
  return cartLines().reduce((sum, line) => sum + line.subtotal, 0);
}

function cartPaymentSummary() {
  return splitPaymentFromLines(cartLines());
}

function renderCart() {
  const count = qs("[data-cart-count]");
  if (count) count.textContent = state.cart.reduce((sum, line) => sum + line.quantity, 0);
  const lines = cartLines();
  const empty = `<p class="muted">Your bag is empty.</p>`;
  const html = lines.map((line) => `
    <div class="order-line">
      <div>
        <strong>${line.product.title}</strong>
        <small>${line.product.stock_mode === "preorder" ? "Preorder · approval first" : "In stock · approval first"} · Qty ${line.quantity}</small>
      </div>
      <div class="mini-actions">
        <strong>${PKR.format(line.subtotal)}</strong>
        <button class="icon-button plain" type="button" data-action="remove-cart" data-product-id="${line.product_id}" aria-label="Remove ${line.product.title}">Remove</button>
      </div>
    </div>
  `).join("");
  setHTML("[data-cart-items]", html || empty);
  setHTML("[data-checkout-items]", html || empty);

  const summary = cartPaymentSummary();
  const totals = `
    <div><dt>Estimated order value</dt><dd>${PKR.format(summary.total)}</dd></div>
    <div><dt>Payment after approval</dt><dd>${PKR.format(summary.advanceDue)} ${summary.hasPreorder ? "advance" : "due"}</dd></div>
    <div><dt>Later balance</dt><dd>${PKR.format(summary.balanceDue)}</dd></div>
    <div><dt>Review status</dt><dd>Team confirms availability before payment is accepted</dd></div>
    <div><dt>Shipment batch</dt><dd>${summary.hasPreorder ? nextShipmentLabel() : "Dispatch after approval"}</dd></div>
  `;
  setHTML("[data-cart-totals]", totals);
  setHTML("[data-checkout-totals]", totals);

  const isEmpty = !lines.length;
  qs("[data-empty-checkout]")?.classList.toggle("hidden", !isEmpty);
  qs("[data-checkout-form]")?.classList.toggle("hidden", isEmpty);
  qs(".order-summary")?.classList.toggle("hidden", isEmpty);
}

function renderBankDetails() {
  const settings = state.settings;
  setHTML("[data-bank-details]", `
    <p class="payment-note">Bank details are used after the team accepts availability and confirms the shipment batch.</p>
    <dl>
      <div><dt>Bank</dt><dd>${settings.bank_name}</dd></div>
      <div><dt>Account title</dt><dd>${settings.account_title}</dd></div>
      <div><dt>Account number</dt><dd>${settings.account_number}</dd></div>
      <div><dt>IBAN</dt><dd>${settings.iban || "Available on request"}</dd></div>
    </dl>
  `);
}

function renderTracking(order) {
  const target = qs("[data-tracking-result]");
  if (!target) return;
  if (!order) {
    target.innerHTML = "";
    return;
  }
  const currentIndex = ORDER_STEPS.findIndex(([status]) => status === order.status);
  const payment = orderPaymentSummary(order);
  target.innerHTML = `
    <p class="kicker">${order.id}</p>
    <h2>${order.customer_name}</h2>
    <p>${order.city || ""} · ${PKR.format(payment.total)} total · ${paymentLabel(order.payment_status)}</p>
    <div class="payment-ledger">
      <article><span>Advance required</span><strong>${PKR.format(payment.advanceDue)}</strong></article>
      <article><span>Remaining balance</span><strong>${PKR.format(payment.balanceDue)}</strong></article>
      <article><span>Balance timing</span><strong>${payment.balanceDue ? "Before local dispatch" : "No later balance"}</strong></article>
      <article><span>ETA</span><strong>${order.eta || (payment.hasPreorder ? nextShipmentLabel() : "Dispatch after approval")}</strong></article>
      <article><span>Courier</span><strong>${order.local_courier || "Assigned before dispatch"}</strong></article>
      <article><span>Tracking number</span><strong>${order.tracking_number || "Not dispatched yet"}</strong></article>
    </div>
    ${ORDER_STEPS.map(([status, label], index) => `
      <div class="tracking-step ${index <= currentIndex ? "done" : ""}">
        <span class="tracking-dot" aria-hidden="true"></span>
        <div><strong>${label}</strong><br /><span>${status === order.status ? "Current stage" : index < currentIndex ? "Complete" : "Upcoming"}</span></div>
      </div>
    `).join("")}
    <a class="button secondary wide" href="https://wa.me/${String(state.settings.support_whatsapp || "").replace(/\D/g, "")}?text=${encodeURIComponent(`Hi Global Bestie, I need help with order ${order.id}`)}" target="_blank" rel="noreferrer">Message WhatsApp support</a>
  `;
}

function ensureModalRoot() {
  let root = qs("[data-modal-root]");
  if (!root) {
    root = document.createElement("div");
    root.dataset.modalRoot = "";
    document.body.append(root);
  }
  return root;
}

function openModal(html) {
  const root = ensureModalRoot();
  root.innerHTML = `
    <div class="modal-backdrop" data-action="close-modal">
      <section class="detail-modal" role="dialog" aria-modal="true" onclick="event.stopPropagation()">
        <button class="icon-button plain modal-close" type="button" data-action="close-modal" aria-label="Close details">Close</button>
        ${html}
      </section>
    </div>
  `;
  qs(".detail-modal")?.focus();
}

function closeModal() {
  const root = qs("[data-modal-root]");
  if (root) root.innerHTML = "";
}

function showProductDetails(productId) {
  const product = state.products.find((item) => item.id === productId);
  if (!product) return;
  const parts = productPricingParts(product);
  const advanceDue = product.stock_mode === "preorder" ? Math.ceil(parts.total * 0.5) : parts.total;
  const balanceDue = Math.max(0, parts.total - advanceDue);
  const isPortal = document.body.dataset.page === "portal";
  const gallery = (Array.isArray(product.gallery_urls) && product.gallery_urls.length ? product.gallery_urls : [product.image_url]).filter(Boolean);
  const deliveryCopy = product.stock_mode === "preorder"
    ? `${nextShipmentLabel()}. ${shipmentNotice()}`
    : `In stock in Pakistan. Dispatch after team approval and payment confirmation.`;
  const publicDetails = `
    <div><dt>Availability</dt><dd>${product.stock_mode === "preorder" ? "Preorder, confirmed by team after request" : `${Number(product.inventory || 0)} in stock, verified before acceptance`}</dd></div>
    <div><dt>Variants</dt><dd>${product.variants || "Confirm size, shade, or color in checkout notes."}</dd></div>
    <div><dt>Authenticity</dt><dd>${product.authenticity_note || "Team verifies the source before accepting the order."}</dd></div>
  `;
  const portalDetails = `
    <div><dt>USA retail</dt><dd>${USD.format(product.usa_price_usd || 0)}</dd></div>
    <div><dt>FX rate</dt><dd>${Number(product.fx_rate || state.settings.fx_rate || 0)}</dd></div>
    <div><dt>25% service margin</dt><dd>${PKR.format(parts.margin)}</dd></div>
    <div><dt>Shipping estimate</dt><dd>${PKR.format(parts.shipping)}</dd></div>
    <div><dt>Stock mode</dt><dd>${product.stock_mode === "preorder" ? `Preorder · ${nextShipmentLabel()}` : `${Number(product.inventory || 0)} in stock`}</dd></div>
    <div><dt>Variants</dt><dd>${product.variants || "Confirm size, shade, or color in checkout notes."}</dd></div>
    <div><dt>Authenticity note</dt><dd>${product.authenticity_note || "Team will verify source before accepting the order."}</dd></div>
    <div><dt>Receipt/proof</dt><dd>${product.receipt_url ? `<a href="${product.receipt_url}" target="_blank" rel="noreferrer">Open receipt</a>` : "Attached after sourcing when available"}</dd></div>
    <div><dt>Supplier cost</dt><dd>${PKR.format(product.supplier_cost_pkr || 0)}</dd></div>
    <div><dt>Publish status</dt><dd>${product.product_status || product.status || "active"}</dd></div>
    <div><dt>Supabase product id</dt><dd>${product.id}</dd></div>
    <div><dt>Source URL</dt><dd>${product.source_url ? `<a href="${product.source_url}" target="_blank" rel="noreferrer">${product.source_url}</a>` : "Not added"}</dd></div>
  `;
  openModal(`
    <div class="modal-grid product-detail-modal">
      <div class="product-gallery">
        <img src="${gallery[0]}" alt="${product.title}" />
        <div class="gallery-strip">
          ${gallery.slice(0, 4).map((url) => `<img src="${url}" alt="${product.title} reference" />`).join("")}
        </div>
      </div>
      <div>
        <p class="kicker">${product.brand || "Global Bestie"} · ${product.category}</p>
        <h2>${product.title}</h2>
        <p>${product.description || "No description added yet."}</p>
        <div class="trust-strip">
          <span>Authenticity-first sourcing</span>
          <span>${deliveryCopy}</span>
          <span>${product.social_proof || "Concierge quote available on WhatsApp."}</span>
        </div>
        <div class="payment-ledger product-ledger">
          <article><span>PKR price</span><strong>${PKR.format(parts.total)}</strong></article>
          <article><span>Order gate</span><strong>Team approval first</strong></article>
          <article><span>Shipment</span><strong>${product.stock_mode === "preorder" ? nextShipmentLabel() : "Local dispatch"}</strong></article>
        </div>
        <dl class="detail-list">
          ${isPortal ? portalDetails : publicDetails}
        </dl>
        <div class="mini-actions product-modal-actions">
          ${isPortal ? `<button class="button primary" type="button" data-action="edit-product" data-product-id="${product.id}">Edit product</button>` : `<button class="button primary" type="button" data-action="add-cart" data-product-id="${product.id}">Add to bag</button>`}
          ${isPortal ? "" : `<a class="button secondary" href="https://wa.me/${String(state.settings.support_whatsapp || "").replace(/\\D/g, "")}?text=${encodeURIComponent(`Hi Global Bestie, I want details for ${product.title}`)}" target="_blank" rel="noreferrer">Ask on WhatsApp</a>`}
          <button class="button secondary" type="button" data-action="close-modal">Done</button>
        </div>
      </div>
    </div>
  `);
}

function showOrderDetails(orderId) {
  const order = state.orders.find((item) => item.id === orderId);
  if (!order) return;
  const payment = orderPaymentSummary(order);
  const items = orderItems(order);
  const events = orderEvents(order);
  const messages = orderMessages(order);
  const advancePaid = Number(order.advance_paid_pkr || 0);
  const balancePaid = Number(order.balance_paid_pkr || 0);
  const outstanding = amountDueForOrder(order);
  const batch = shipmentBatchForOrder(order);
  const margin = Number(order.margin_pkr ?? (payment.total - Number(order.cost_pkr || 0)));
  openModal(`
    <div class="order-detail-modal">
      <div class="drawer-hero">
        <div>
          <p class="kicker">Order command drawer</p>
          <h2>${order.id}</h2>
          <p>${order.customer_name} · ${order.channel || "Storefront"} · ${order.priority || "Standard"} · Owner ${order.owner || "Unassigned"}</p>
        </div>
        <div class="drawer-actions">
          ${order.status === "pending_review" ? `<button class="button primary" type="button" data-action="accept-order" data-order-id="${order.id}">Accept order</button>` : ""}
          <button class="button primary" type="button" data-action="mark-balance-due" data-order-id="${order.id}">Mark balance due</button>
          <button class="button secondary" type="button" data-action="send-balance-reminder" data-order-id="${order.id}">Balance reminder</button>
        </div>
      </div>
      <div class="payment-ledger">
        <article><span>Total order value</span><strong>${PKR.format(payment.total)}</strong></article>
        <article><span>Advance due / paid</span><strong>${PKR.format(payment.advanceDue)} / ${PKR.format(advancePaid)}</strong></article>
        <article><span>Balance due / paid</span><strong>${PKR.format(payment.balanceDue)} / ${PKR.format(balancePaid)}</strong></article>
        <article><span>Outstanding</span><strong>${PKR.format(outstanding)}</strong></article>
        <article><span>Payment status</span><strong>${paymentLabel(order.payment_status)}</strong></article>
        <article><span>Risk / next gate</span><strong>${orderCompletionRisk(order)}</strong></article>
      </div>
      <div class="detail-columns tri">
        <section class="detail-panel">
          <h3>Customer</h3>
          <dl class="detail-list">
            <div><dt>Name</dt><dd>${order.customer_name}</dd></div>
            <div><dt>WhatsApp</dt><dd>${order.customer_phone}</dd></div>
            <div><dt>Instagram</dt><dd>${order.customer_instagram || "Not linked"}</dd></div>
            <div><dt>Email</dt><dd>${order.customer_email || "Not added"}</dd></div>
            <div><dt>City</dt><dd>${order.city || "Not added"}</dd></div>
            <div><dt>Address</dt><dd>${order.address || "Not added"}</dd></div>
            <div><dt>Notes</dt><dd>${order.notes || "No notes"}</dd></div>
            <div><dt>Transfer reference</dt><dd>${order.transfer_reference || "No reference yet"}</dd></div>
            <div><dt>Sender account</dt><dd>${order.transfer_sender || "Not captured"}</dd></div>
            <div><dt>Proof preview</dt><dd>${order.proof_url || "No screenshot uploaded yet"}</dd></div>
          </dl>
        </section>
        <section class="detail-panel">
          <h3>Fulfillment</h3>
          <dl class="detail-list">
            <div><dt>Status</dt><dd>${order.status.replaceAll("_", " ")}</dd></div>
            <div><dt>Shipment ETA</dt><dd>${order.eta || (payment.hasPreorder ? nextShipmentLabel() : "Set after approval")}</dd></div>
            <div><dt>Assigned batch</dt><dd>${batch ? `${batch.name} · ${batchStatusLabel(batch.status)}` : "Not assigned"}</dd></div>
            <div><dt>Source retailer</dt><dd>${order.source_retailer || "Not assigned"}</dd></div>
            <div><dt>Source URL</dt><dd>${order.source_url ? `<a href="${order.source_url}" target="_blank" rel="noreferrer">${order.source_url}</a>` : "Not added"}</dd></div>
            <div><dt>USA purchase ID</dt><dd>${order.source_purchase_id || "Not purchased yet"}</dd></div>
            <div><dt>USA tracking</dt><dd>${order.usa_tracking || "Not available"}</dd></div>
            <div><dt>Local courier</dt><dd>${order.local_courier || "Not assigned"}</dd></div>
            <div><dt>Local tracking</dt><dd>${order.tracking_number || "Not dispatched"}</dd></div>
          </dl>
        </section>
        <section class="detail-panel">
          <h3>Ops ledger</h3>
          <dl class="detail-list">
            <div><dt>Cost / COGS</dt><dd>${PKR.format(order.cost_pkr || 0)}</dd></div>
            <div><dt>Margin</dt><dd>${PKR.format(margin)}</dd></div>
            <div><dt>Owner</dt><dd>${order.owner || "Unassigned"}</dd></div>
            <div><dt>Priority</dt><dd>${order.priority || "Standard"}</dd></div>
            <div><dt>Next action</dt><dd>${order.next_action || "Review order and assign next step."}</dd></div>
          </dl>
          <label>Internal note<textarea data-order-note="${order.id}" rows="5">${order.internal_notes || ""}</textarea></label>
          <button class="button secondary wide" type="button" data-action="save-order-note" data-order-id="${order.id}">Save internal note</button>
        </section>
      </div>
      <section class="detail-panel">
        <h3>Order list</h3>
        <div class="detail-lines item-lines">
          ${items.map((item) => {
            const product = relatedProductForItem(item);
            return `
              <div class="order-item-line">
                <img src="${item.image_url || product.image_url || ""}" alt="${item.title}" />
                <div>
                  <strong>${item.title}</strong>
                  <small>${item.stock_mode === "preorder" ? "Preorder" : "In stock"} · Qty ${item.quantity || 1} · ${item.variant || product.variants || "Variant not set"}</small>
                  <small>${item.source_status || "Source status pending"} · ${item.source_url || product.source_url || "No source URL"}</small>
                </div>
                <strong>${PKR.format(itemSubtotal(item))}</strong>
              </div>
            `;
          }).join("") || "<p>No line items found.</p>"}
        </div>
      </section>
      <div class="detail-columns">
        <section class="detail-panel">
          <h3>Message history</h3>
          <div class="message-thread">
            ${messages.map((message) => `
              <article class="${message.direction === "outbound" ? "outbound" : "inbound"}">
                <strong>${message.source} · ${message.direction}</strong>
                <p>${message.body}</p>
                <small>${new Date(message.created_at).toLocaleString()}</small>
              </article>
            `).join("") || "<p>No messages synced yet.</p>"}
          </div>
        </section>
        <section class="detail-panel">
          <h3>Timeline</h3>
          <div class="detail-lines">
            ${events.map((event) => `
              <div class="tracking-step done">
                <span class="tracking-dot" aria-hidden="true"></span>
                <div><strong>${event.status.replaceAll("_", " ")}</strong><br /><span>${event.note} · ${new Date(event.created_at).toLocaleString()}</span></div>
              </div>
            `).join("") || "<p>No events recorded yet.</p>"}
          </div>
        </section>
      </div>
    </div>
  `);
}

function renderAdmin() {
  if (!has("[data-admin-content]")) return;
  const orders = state.orders;
  const revenue = orders.reduce((sum, order) => sum + Number(order.total_pkr || 0), 0);
  const pending = orders.filter((order) => order.status === "pending_review").length;
  const preorder = state.products.filter((product) => product.stock_mode === "preorder").length;
  const inStock = state.products.filter((product) => product.stock_mode === "in_stock").length;
  const balanceDue = orders.filter((order) => activePaymentStatusForOrder(order) === "balance_due" || (order.status === "pakistan_processing" && orderPaymentSummary(order).balanceDue > Number(order.balance_paid_pkr || 0))).length;
  const lowStock = state.products.filter((product) => product.stock_mode === "in_stock" && Number(product.inventory || 0) <= 2).length;
  const unassigned = orders.filter((order) => !order.owner || order.owner === "Unassigned").length;
  const activeBatch = state.shipmentBatches.find((batch) => ["collecting", "sourcing", "shipped", "arriving"].includes(batch.status));

  setHTML("[data-admin-metrics]", [
    ["Revenue in board", PKR.format(revenue)],
    ["Pending review", pending],
    ["Balance due orders", balanceDue],
    ["Active batch", activeBatch ? formatDate(activeBatch.eta_date) : "None"],
    ["Late / unassigned", unassigned],
    ["Low stock alerts", lowStock],
    ["Preorder SKUs", preorder],
    ["In-stock SKUs", inStock],
  ].map(([label, value]) => `<article class="metric-card"><span>${label}</span><strong>${value}</strong></article>`).join(""));

  setHTML("[data-admin-action-orders]", orders
    .filter((order) => ["pending_review", "accepted", "sourcing"].includes(order.status))
    .map((order) => {
      const payment = orderPaymentSummary(order);
      const due = amountDueForOrder(order);
      return `
      <div class="order-line" role="button" tabindex="0" data-action="view-order" data-order-id="${order.id}">
        <div><strong>${order.id}</strong><small>${order.customer_name} · ${order.owner || "Unassigned"} · ${orderCompletionRisk(order)}</small></div>
        <strong>${PKR.format(due || payment.total)} ${due ? "due" : "review"}</strong>
      </div>
    `;
    }).join("") || "<p>No urgent orders.</p>");

  const counts = ORDER_STEPS.map(([status, label]) => [label, orders.filter((order) => order.status === status).length]);
  const max = Math.max(1, ...counts.map(([, count]) => count));
  setHTML("[data-admin-pipeline]", counts.map(([label, count]) => `
    <div class="pipeline-row">
      <span>${label}</span>
      <span class="pipeline-bar"><span style="width:${(count / max) * 100}%"></span></span>
      <strong>${count}</strong>
    </div>
  `).join(""));

  renderAdminOrders();
  renderShipmentBatches();
  renderTrends();
  fillSettingsForm();
}

function renderAdminOrders() {
  if (!has("[data-admin-orders]")) return;
  const filter = qs("[data-admin-order-filter]")?.value || "all";
  const rows = state.orders.filter((order) => filter === "all" || order.status === filter);
  const tableRows = rows.map((order) => {
    const payment = orderPaymentSummary(order);
    const due = amountDueForOrder(order);
    return `
    <tr class="order-row" data-action="view-order" data-order-id="${order.id}" tabindex="0">
      <td><strong>${order.id}</strong><br /><small>${new Date(order.created_at).toLocaleString()}</small></td>
      <td>${order.customer_name}<br /><small>${order.customer_phone} · ${order.city}</small><br /><small>${order.priority || "Standard"} · Owner ${order.owner || "Unassigned"}</small></td>
      <td>
        <select data-order-status="${order.id}" data-stop-row>
          ${ORDER_STEPS.map(([status, label]) => `<option value="${status}" ${order.status === status ? "selected" : ""}>${label}</option>`).join("")}
          <option value="cancelled" ${order.status === "cancelled" ? "selected" : ""}>Cancelled</option>
        </select>
        <small>${orderCompletionRisk(order)} · ${order.next_action || "No next action"}</small>
      </td>
      <td>${PKR.format(payment.total)}<br /><small>Due ${PKR.format(due)} · Advance ${PKR.format(payment.advanceDue)} · Balance ${PKR.format(payment.balanceDue)}</small></td>
      <td>
        <select data-order-payment="${order.id}" data-stop-row>
          ${PAYMENT_STATES.map(([status, label]) => `<option value="${status}" ${activePaymentStatusForOrder(order) === status ? "selected" : ""}>${label}</option>`).join("")}
        </select>
        <small>${order.transfer_reference || "No reference"} · ${order.proof_url ? "Proof on file" : "No proof"}</small>
      </td>
      <td class="table-actions">
        <button class="button secondary" type="button" data-action="view-order" data-order-id="${order.id}" data-stop-row>Details</button>
        <button class="button primary" type="button" data-action="save-order-status" data-order-id="${order.id}" data-stop-row>Save</button>
        <small>${order.local_courier || "Courier TBD"} · ${order.tracking_number || "No tracking"}</small>
      </td>
    </tr>
  `;
  });
  setHTML("[data-admin-orders]", tableRows.join(""));
  setHTML("[data-admin-order-cards]", rows.map((order) => {
    const payment = orderPaymentSummary(order);
    const due = amountDueForOrder(order);
    const batch = shipmentBatchForOrder(order);
    return `
      <article class="admin-order-card" data-action="view-order" data-order-id="${order.id}" tabindex="0">
        <div class="panel-title-row">
          <div>
            <strong>${order.id}</strong>
            <small>${new Date(order.created_at).toLocaleString()} · ${order.customer_name}</small>
          </div>
          <span class="status-pill ${order.status === "pending_review" ? "preorder" : "in_stock"}">${order.status.replaceAll("_", " ")}</span>
        </div>
        <div class="order-card-grid">
          <span><strong>${PKR.format(payment.total)}</strong><small>Total</small></span>
          <span><strong>${PKR.format(due)}</strong><small>Unpaid</small></span>
          <span><strong>${paymentLabel(activePaymentStatusForOrder(order))}</strong><small>Payment</small></span>
          <span><strong>${batch ? batch.name : "No batch"}</strong><small>${batch ? formatDate(batch.eta_date) : "Assign after acceptance"}</small></span>
        </div>
        <p>${order.next_action || "Review order and assign next step."}</p>
        <div class="mini-actions">
          ${order.status === "pending_review" ? `<button class="button primary" type="button" data-action="accept-order" data-order-id="${order.id}" data-stop-row>Accept</button>` : ""}
          <button class="button secondary" type="button" data-action="view-order" data-order-id="${order.id}" data-stop-row>Details</button>
        </div>
      </article>
    `;
  }).join("") || "<p>No orders match this filter.</p>");
}

function renderShipmentBatches() {
  if (!has("[data-shipment-batches]")) return;
  setHTML("[data-shipment-batches]", state.shipmentBatches.map((batch) => {
    const assignedOrders = state.orders.filter((order) => (batch.order_ids || []).includes(order.id));
    const used = Number(batch.used ?? assignedOrders.length);
    const capacity = Number(batch.capacity || Math.max(used, 1));
    const fill = Math.min(100, Math.round((used / capacity) * 100));
    return `
      <article class="shipment-card">
        <div class="panel-title-row">
          <div>
            <span class="status-pill ${batch.status === "arrived" ? "in_stock" : "preorder"}">${batchStatusLabel(batch.status)}</span>
            <h3>${batch.name}</h3>
          </div>
          <strong>${formatDate(batch.eta_date) || "ETA pending"}</strong>
        </div>
        <p>${batch.note || "No batch note added."}</p>
        <div class="pipeline-row shipment-capacity">
          <span>Capacity</span>
          <span class="pipeline-bar"><span style="width:${fill}%"></span></span>
          <strong>${used}/${capacity}</strong>
        </div>
        <div class="batch-orders">
          ${assignedOrders.map((order) => `<button class="order-mini" type="button" data-action="view-order" data-order-id="${order.id}">${order.id}<span>${order.customer_name}</span></button>`).join("") || "<span>No orders assigned yet.</span>"}
        </div>
      </article>
    `;
  }).join(""));
}

function renderTrends() {
  setHTML("[data-trend-candidates]", state.trends.map((trend) => `
    <article class="trend-card${selectedTrends.has(trend.id) ? " selected" : ""}">
      <label class="card-select-wrap">
        <input type="checkbox" class="card-checkbox" data-trend-select="${trend.id}" ${selectedTrends.has(trend.id) ? "checked" : ""} />
      </label>
      <img src="${trend.image_url}" alt="${trend.title}" loading="lazy" />
      <span class="status-pill preorder">Trend score ${trend.score}</span>
      <h3>${trend.title}</h3>
      <p>${trend.category} · ${USD.format(trend.usa_price_usd)} · ${trend.status}</p>
      <div class="product-meta compact">
        <span>Completeness ${["title", "source_url", "image_url", "usa_price_usd"].filter((key) => trend[key]).length}/4</span>
        <span>${trend.source_url?.includes("http") ? "official-source check needed" : "source missing"}</span>
        <span>duplicate check pending</span>
      </div>
      <small>${trend.batch_id || "Manual batch"} · ${trend.production_status || "fetched"} · ${trend.suggested_description || "Add final copy and media before approval."}</small>
      <div class="mini-actions">
        <button class="button secondary" type="button" data-action="edit-trend" data-trend-id="${trend.id}">Edit</button>
        <button class="button primary" type="button" data-action="approve-trend" data-trend-id="${trend.id}">Approve</button>
        <button class="button secondary" type="button" data-action="reject-trend" data-trend-id="${trend.id}">Reject</button>
      </div>
    </article>
  `).join(""));
  updateTrendBulkBar();
}

function updateTrendBulkBar() {
  const n = selectedTrends.size;
  qsa("[data-trends-sel-count]").forEach((el) => { el.textContent = n; });
  qsa("[data-trends-total]").forEach((el) => { el.textContent = state.trends.length; });
  qsa("[data-trends-bulk-bar] button").forEach((btn) => { btn.disabled = n === 0; });
  const selectAll = qs("[data-action='select-all-trends']");
  if (selectAll) selectAll.indeterminate = n > 0 && n < state.trends.length;
  if (selectAll) selectAll.checked = n === state.trends.length && state.trends.length > 0;
}

function updateProductBulkBar() {
  const n = selectedProducts.size;
  qsa("[data-products-sel-count]").forEach((el) => { el.textContent = n; });
  qsa("[data-products-total]").forEach((el) => { el.textContent = state.products.length; });
  qsa("[data-products-bulk-bar] button").forEach((btn) => { btn.disabled = n === 0; });
  const selectAll = qs("[data-action='select-all-products']");
  if (selectAll) selectAll.indeterminate = n > 0 && n < state.products.length;
  if (selectAll) selectAll.checked = n === state.products.length && state.products.length > 0;
}

function renderMarketing() {
  if (!has("[data-admin-panel=\"growth\"]")) return;

  const productOptions = state.products.map((product) => `
    <option value="${product.id}">${product.title}</option>
  `).join("");
  setHTML("[data-creative-product]", productOptions);

  setHTML("[data-growth-plays]", growthPlays.map(([title, body]) => `
    <article class="growth-play">
      <strong>${title}</strong>
      <span>${body}</span>
    </article>
  `).join(""));

  setHTML("[data-creative-jobs]", state.creativeJobs.map((job) => `
    <article class="creative-job">
      <img src="${job.preview_url}" alt="${job.title}" loading="lazy" />
      <div>
        <span class="status-pill ${job.status === "ready_for_remotion" ? "in_stock" : "preorder"}">${job.status.replaceAll("_", " ")}</span>
        <h3>${job.title}</h3>
        <p>${job.type} · ${job.channel} · ${job.source || "Content library"}</p>
        <small>${job.hook}</small>
      </div>
      <button class="button secondary" type="button" data-action="approve-creative" data-creative-id="${job.id}">Ready for Remotion</button>
    </article>
  `).join(""));

  setHTML("[data-campaigns]", state.campaigns.map((campaign) => `
    <article class="campaign-row">
      <div>
        <strong>${campaign.name}</strong>
        <small>${campaign.channel} · ${campaign.status} · ROAS ${campaign.budget_pkr ? (Number(campaign.revenue_pkr || 0) / Number(campaign.budget_pkr || 1)).toFixed(1) : "0.0"}x</small>
      </div>
      <div>
        <strong>${campaign.leads} leads</strong>
        <small>${PKR.format(campaign.revenue_pkr || 0)} revenue · CPA ${campaign.leads ? PKR.format(Number(campaign.budget_pkr || 0) / Number(campaign.leads || 1)) : PKR.format(0)}</small>
      </div>
      <span>${PKR.format(campaign.budget_pkr || 0)}</span>
    </article>
  `).join(""));

  setHTML("[data-lead-inbox]", state.leads.map((lead) => {
    const missingFields = Array.isArray(lead.missing_fields) ? lead.missing_fields : [];
    const needsHuman = lead.automation_status === "human_handoff";
    return `
    <article class="lead-card">
      <div>
        <strong>${lead.name}</strong>
        <span>${lead.source} · ${lead.sla} · ${lead.automation_status || "manual"}</span>
      </div>
      <p>${lead.last_message}</p>
      ${missingFields.length ? `<small>Missing: ${missingFields.join(", ")}</small>` : ""}
      ${needsHuman ? `<small class="handoff-note">Human handoff: ${lead.handoff_reason || "Needs owner review"}</small>` : ""}
      <div class="lead-footer">
        <small>${lead.product} · Owner ${lead.owner || "Unassigned"}</small>
        <button class="button secondary" type="button" data-action="reply-lead" data-lead-id="${lead.id}">Reply</button>
      </div>
    </article>
  `;
  }).join(""));

  const autoReplied = state.leads.filter((lead) => lead.automation_status === "auto_replied").length;
  const needsInfo = state.leads.filter((lead) => lead.automation_status === "needs_info").length;
  const handoffs = state.leads.filter((lead) => lead.automation_status === "human_handoff").length;
  setHTML("[data-automation-desk]", `
    <div class="automation-grid">
      <article><strong>${autoReplied}</strong><span>Auto replies sent</span></article>
      <article><strong>${needsInfo}</strong><span>Waiting for info</span></article>
      <article><strong>${handoffs}</strong><span>Owner handoffs</span></article>
    </div>
    <div class="automation-flow">
      <article><strong>1. Intake</strong><span>Instagram DMs hit /api/webhooks/instagram and become leads.</span></article>
      <article><strong>2. Qualify</strong><span>Bot checks product, variant, city, and WhatsApp number.</span></article>
      <article><strong>3. Reply</strong><span>Simple questions get an instant luxury concierge response.</span></article>
      <article><strong>4. Handoff</strong><span>Payment, complaint, delay, refund, or unclear intent routes to you.</span></article>
    </div>
  `);

  const stages = [
    ["new", "New"],
    ["quote_sent", "Quote sent"],
    ["order_ready", "Order ready"],
    ["won", "Won"],
  ];
  const max = Math.max(1, ...stages.map(([stage]) => state.leads.filter((lead) => lead.stage === stage).length));
  setHTML("[data-lead-pipeline]", stages.map(([stage, label]) => {
    const count = state.leads.filter((lead) => lead.stage === stage).length;
    return `
      <div class="pipeline-row">
        <span>${label}</span>
        <span class="pipeline-bar"><span style="width:${(count / max) * 100}%"></span></span>
        <strong>${count}</strong>
      </div>
    `;
  }).join(""));

  setHTML("[data-content-calendar]", state.calendar.map((post) => `
    <article class="calendar-row">
      <span>${post.date}</span>
      <div>
        <strong>${post.title}</strong>
        <small>${post.channel} · ${post.status} · caption approval</small>
      </div>
    </article>
  `).join(""));

  setHTML("[data-integration-status]", `
    <article><strong>Instagram</strong><span>not connected · connect Meta Business API</span></article>
    <article><strong>WhatsApp</strong><span>not connected · connect WhatsApp Cloud API</span></article>
    <article><strong>Remotion desk</strong><span>manual handoff active · final URLs returned to Supabase</span></article>
  `);
}

function fillSettingsForm() {
  const form = qs("[data-settings-form]");
  if (!form) return;
  Object.entries(state.settings).forEach(([key, value]) => {
    if (form.elements[key]) form.elements[key].value = value;
  });
}

function fillProductForm(product = {}) {
  const form = qs("[data-product-editor]");
  if (!form) return;
  const defaults = {
    id: "",
    title: "",
    category: "handbags",
    usa_price_usd: "",
    shipping_pkr: "",
    fx_rate: state.settings.fx_rate,
    stock_mode: "preorder",
    inventory: 0,
    product_status: "active",
    supplier_cost_pkr: "",
    image_url: "",
    source_url: "",
    gallery_urls: "",
    variants: "",
    authenticity_note: "",
    receipt_url: "",
    social_proof: "",
    description: "",
  };
  const prepared = {
    ...defaults,
    ...product,
    gallery_urls: Array.isArray(product.gallery_urls) ? product.gallery_urls.join("\n") : product.gallery_urls || "",
  };
  Object.entries(prepared).forEach(([key, value]) => {
    if (form.elements[key]) form.elements[key].value = value;
  });
  updatePricePreview();
}

function updatePricePreview() {
  const form = qs("[data-product-editor]");
  if (!form) return;
  const product = Object.fromEntries(new FormData(form).entries());
  const total = calculatePrice(product);
  const preview = qs("[data-price-preview]");
  if (preview) preview.textContent = `Customer price preview: ${PKR.format(total)}`;
}

function renderAll() {
  renderProducts();
  renderCart();
  renderBankDetails();
  renderAdmin();
  renderMarketing();
}

function parseRoute() {
  const hash = location.hash.replace("#", "") || "home";
  const [viewName, queryString] = hash.split("?");
  const params = new URLSearchParams(queryString || "");
  return { viewName, params };
}

let _transitioning = false;
let _firstLoad = true;

async function setRoute() {
  if (_transitioning) return;
  _transitioning = true;
  closeModal();
  const { viewName, params } = parseRoute();
  const fallbackView = document.body.dataset.page === "portal" ? "admin" : "home";
  const safeView = qs(`[data-view="${viewName}"]`) ? viewName : fallbackView;

  const curtain = qs("#page-curtain");

  if (!_firstLoad && curtain) {
    curtain.style.transition = "transform 420ms cubic-bezier(0.76, 0, 0.24, 1)";
    curtain.style.transform = "translateX(0%)";
    await new Promise((r) => setTimeout(r, 440));
  }
  _firstLoad = false;

  qsa(".view").forEach((view) => view.classList.toggle("active", view.dataset.view === safeView));

  if (safeView === "shop" && params.get("category")) {
    state.filters.category = params.get("category");
    const category = qs("[data-filter-category]");
    if (category) category.value = state.filters.category;
    renderProducts();
  }
  if (safeView === "checkout") {
    qs("[data-cart-drawer]")?.classList.remove("open");
  }
  window.scrollTo({ top: 0 });

  if (curtain) {
    await new Promise((r) => setTimeout(r, 16));
    curtain.style.transition = "transform 420ms cubic-bezier(0.76, 0, 0.24, 1)";
    curtain.style.transform = "translateX(101%)";
    await new Promise((r) => setTimeout(r, 440));
    curtain.style.transition = "none";
    curtain.style.transform = "translateX(-101%)";
  }

  _transitioning = false;
}

function addToCart(productId) {
  const product = state.products.find((item) => item.id === productId);
  if (!product) return;
  const existing = state.cart.find((line) => line.product_id === productId);
  if (existing) existing.quantity += 1;
  else state.cart.push({ product_id: productId, quantity: 1, product });
  saveCart();
  renderCart();
  qs("[data-cart-drawer]")?.classList.add("open");
  toast(`${product.title} added to bag.`);
}

function removeFromCart(productId) {
  state.cart = state.cart.filter((line) => line.product_id !== productId);
  saveCart();
  renderCart();
}

async function fileToPayload(file) {
  if (!file) return null;
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  return {
    name: file.name,
    type: file.type,
    data_url: dataUrl,
  };
}

async function handleCheckout(event) {
  event.preventDefault();
  if (!state.cart.length) {
    toast("Add at least one product before checkout.");
    location.hash = "#shop";
    return;
  }
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());
  if (!data.balance_ack || !data.terms_ack) {
    toast("Please confirm the approval and payment acknowledgements.");
    return;
  }
  const file = form.elements.transfer_file.files[0];
  const payment = cartPaymentSummary();
  const order = {
    ...data,
    transfer_file: await fileToPayload(file),
    items: cartLines().map((line) => ({
      product_id: line.product_id,
      title: line.product.title,
      quantity: line.quantity,
      unit_price_pkr: calculatePrice(line.product),
      stock_mode: line.product.stock_mode,
      image_url: line.product.image_url,
      variant: line.product.variants || "",
      source_url: line.product.source_url || "",
      source_status: line.product.stock_mode === "preorder" ? "Pending USA sourcing" : "In-stock verification",
    })),
    total_pkr: payment.total,
    advance_due_pkr: payment.advanceDue,
    balance_due_pkr: payment.balanceDue,
    eta: payment.hasPreorder ? nextShipmentLabel() : "Ready after team approval",
    next_action: "Review product availability, source price, and shipment batch before accepting.",
  };
  const fallbackOrder = {
    id: `GB-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
    ...order,
    status: "pending_review",
    payment_status: data.transfer_reference || file ? "advance_uploaded" : "awaiting_advance",
    created_at: new Date().toISOString(),
    advance_paid_pkr: 0,
    balance_paid_pkr: 0,
    next_action: order.next_action,
    eta: order.eta,
    events: [{ status: "pending_review", note: `Order request created. Team must confirm availability before payment is accepted. Estimated order value: ${PKR.format(payment.total)}.`, created_at: new Date().toISOString() }],
  };
  const created = await apiFetch("/api/orders", { method: "POST", body: JSON.stringify(order) }, { order: fallbackOrder });
  state.orders.unshift(created.order || fallbackOrder);
  state.cart = [];
  saveCart();
  form.reset();
  renderAll();
  toast(`Order ${created.order?.id || fallbackOrder.id} sent for approval. We will confirm availability before payment.`);
  location.hash = "#track";
  renderTracking(created.order || fallbackOrder);
}

async function handleTrack(event) {
  event.preventDefault();
  const query = new FormData(event.currentTarget).get("query").trim().toLowerCase();
  const fallback = state.orders.find((order) =>
    [order.id, order.customer_phone].filter(Boolean).some((value) => String(value).toLowerCase().includes(query))
  );
  const result = await apiFetch(`/api/orders?query=${encodeURIComponent(query)}`, {}, { order: fallback || null });
  if (!result.order) {
    setHTML("[data-tracking-result]", "<h2>No order found</h2><p>Check the order number or phone and try again.</p>");
    return;
  }
  renderTracking(result.order);
}

function handleAdminLogin(event) {
  event.preventDefault();
  state.adminToken = new FormData(event.currentTarget).get("secret").trim();
  localStorage.setItem("mm_admin_token", state.adminToken);
  qs("[data-admin-login]")?.classList.add("hidden");
  qs("[data-admin-content]")?.classList.remove("hidden");
  toast("Internal portal unlocked.");
  refreshAdmin();
}

async function refreshAdmin() {
  const fallback = { orders: state.orders, products: state.products, trends: state.trends, settings: state.settings, shipmentBatches: state.shipmentBatches };
  const data = await apiFetch("/api/admin/dashboard", {}, fallback);
  state.orders = data.orders || state.orders;
  state.products = data.products || state.products;
  state.trends = data.trends || state.trends;
  state.shipmentBatches = data.shipmentBatches || data.shipment_batches || state.shipmentBatches;
  state.settings = { ...state.settings, ...(data.settings || {}) };
  renderAll();
}

async function saveProduct(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const product = Object.fromEntries(new FormData(form).entries());
  product.id = product.id || product.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  product.usa_price_usd = Number(product.usa_price_usd);
  product.shipping_pkr = Number(product.shipping_pkr);
  product.fx_rate = Number(product.fx_rate);
  product.inventory = Number(product.inventory);
  product.supplier_cost_pkr = Number(product.supplier_cost_pkr || 0);
  product.gallery_urls = String(product.gallery_urls || "").split(/\n|,/).map((url) => url.trim()).filter(Boolean);
  product.markup_rate = state.settings.markup_rate;
  product.featured = state.products.length < 3;
  product.preorder_weeks = product.stock_mode === "preorder" ? Number(state.settings.preorder_weeks || 4) : 0;
  product.status = product.product_status || "active";
  const saved = await apiFetch("/api/catalog", { method: "POST", body: JSON.stringify(product) }, { product });
  const index = state.products.findIndex((item) => item.id === product.id);
  if (index >= 0) state.products[index] = saved.product || product;
  else state.products.unshift(saved.product || product);
  renderAll();
  fillProductForm();
  toast("Product saved.");
}

async function saveSettings(event) {
  event.preventDefault();
  const settings = Object.fromEntries(new FormData(event.currentTarget).entries());
  settings.markup_rate = Number(settings.markup_rate);
  settings.fx_rate = Number(settings.fx_rate);
  settings.preorder_weeks = Number(settings.preorder_weeks);
  settings.response_sla_minutes = Number(settings.response_sla_minutes || 15);
  const saved = await apiFetch("/api/admin/settings", { method: "POST", body: JSON.stringify(settings) }, { settings });
  state.settings = { ...state.settings, ...(saved.settings || settings) };
  renderAll();
  toast("Settings saved.");
}

async function acceptOrder(orderId) {
  const order = state.orders.find((item) => item.id === orderId);
  if (!order) return;
  const payment = orderPaymentSummary(order);
  const activeBatch = state.shipmentBatches.find((batch) => ["collecting", "sourcing"].includes(batch.status));
  const eta = payment.hasPreorder && activeBatch
    ? `${activeBatch.name} ETA: ${formatDate(activeBatch.eta_date)}`
    : (payment.hasPreorder ? (order.eta || nextShipmentLabel()) : "Ready after payment confirmation");
  order.status = "accepted";
  order.payment_status = activePaymentStatusForOrder(order, "accepted");
  order.eta = eta;
  if (payment.hasPreorder && activeBatch) {
    activeBatch.order_ids = Array.from(new Set([...(activeBatch.order_ids || []), order.id]));
    activeBatch.used = Math.min(Number(activeBatch.capacity || activeBatch.used || 0), Number(activeBatch.used || 0) + 1);
  }
  order.next_action = payment.hasPreorder
    ? `Send advance request for ${PKR.format(payment.advanceDue)} and confirm shipment batch.`
    : `Send full payment request for ${PKR.format(payment.total)} before dispatch.`;
  order.accepted_at = new Date().toISOString();
  order.events = [
    ...(order.events || []),
    { status: "accepted", note: `Team accepted availability. Payment request can now be sent. Shipment ETA: ${eta}.`, created_at: new Date().toISOString() },
  ];
  const result = await apiFetch(`/api/admin/orders/${orderId}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "accepted",
      payment_status: order.payment_status,
      eta,
      next_action: order.next_action,
      note: `Team accepted availability. Payment request can now be sent. Shipment ETA: ${eta}.`,
    }),
  }, { order });
  if (payment.hasPreorder && activeBatch) {
    await apiFetch("/api/admin/shipments", { method: "POST", body: JSON.stringify(activeBatch) }, { shipmentBatch: activeBatch });
  }
  const index = state.orders.findIndex((item) => item.id === orderId);
  if (index >= 0 && result.order) state.orders[index] = { ...state.orders[index], ...result.order };
  renderAll();
  showOrderDetails(orderId);
  toast("Order accepted. Customer payment request is ready.");
}

async function saveOrderStatus(orderId) {
  const status = qs(`[data-order-status="${orderId}"]`).value;
  const paymentStatus = qs(`[data-order-payment="${orderId}"]`)?.value;
  const fallbackOrder = state.orders.find((order) => order.id === orderId);
  if (fallbackOrder) {
    fallbackOrder.status = status;
    fallbackOrder.payment_status = paymentStatus || activePaymentStatusForOrder(fallbackOrder, status);
    fallbackOrder.events = [
      ...(fallbackOrder.events || []),
      { status, note: `Team moved order to ${status.replaceAll("_", " ")} with payment marked ${paymentLabel(fallbackOrder.payment_status)}.`, created_at: new Date().toISOString() },
    ];
  }
  const result = await apiFetch(`/api/admin/orders/${orderId}`, {
    method: "PATCH",
    body: JSON.stringify({ status, payment_status: paymentStatus }),
  }, { order: fallbackOrder });
  const index = state.orders.findIndex((order) => order.id === orderId);
  if (index >= 0 && result.order) state.orders[index] = { ...state.orders[index], ...result.order };
  renderAdmin();
  toast("Order updated.");
}

function markBalanceDue(orderId) {
  const order = state.orders.find((item) => item.id === orderId);
  if (!order) return;
  order.status = "pakistan_processing";
  order.payment_status = "balance_due";
  order.next_action = "Send balance reminder and hold local dispatch until proof is confirmed.";
  order.events = [
    ...(order.events || []),
    { status: "pakistan_processing", note: "Shipment marked as arrived in Pakistan. Remaining balance is now due before local dispatch.", created_at: new Date().toISOString() },
  ];
  renderAll();
  showOrderDetails(orderId);
  toast("Balance due workflow opened.");
}

function sendBalanceReminder(orderId) {
  const order = state.orders.find((item) => item.id === orderId);
  if (!order) return;
  const payment = orderPaymentSummary(order);
  const balance = PKR.format(Math.max(0, payment.balanceDue - Number(order.balance_paid_pkr || 0)));
  const template = state.settings.balance_reminder_template || "Hi {name}, your Global Bestie preorder has arrived in Pakistan. Remaining balance: {balance}. Please transfer before local dispatch.";
  const message = template.replace("{name}", order.customer_name).replace("{balance}", balance);
  order.messages = [
    ...(order.messages || []),
    { source: "WhatsApp", direction: "outbound", body: message, created_at: new Date().toISOString() },
  ];
  order.events = [
    ...(order.events || []),
    { status: order.status, note: "Balance reminder prepared for WhatsApp.", created_at: new Date().toISOString() },
  ];
  showOrderDetails(orderId);
  toast("Balance reminder added to the message thread.");
}

function saveOrderNote(orderId) {
  const order = state.orders.find((item) => item.id === orderId);
  const note = qs(`[data-order-note="${orderId}"]`)?.value || "";
  if (!order) return;
  order.internal_notes = note;
  order.events = [
    ...(order.events || []),
    { status: order.status, note: "Internal note updated.", created_at: new Date().toISOString() },
  ];
  renderAdmin();
  showOrderDetails(orderId);
  toast("Internal note saved.");
}

async function createShipmentBatch(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget).entries());
  const batch = {
    id: `batch-${Date.now()}`,
    name: data.name,
    eta_date: data.eta_date,
    status: data.status || "collecting",
    capacity: Number(data.capacity || 1),
    used: 0,
    note: data.note || shipmentNotice(),
    order_ids: [],
  };
  const saved = await apiFetch("/api/admin/shipments", { method: "POST", body: JSON.stringify(batch) }, { shipmentBatch: batch });
  state.shipmentBatches.unshift(saved.shipmentBatch || batch);
  state.settings.next_shipment_date = batch.eta_date;
  state.settings.shipment_notice = batch.note;
  event.currentTarget.reset();
  renderAll();
  toast("Shipment batch created and set as the current ETA.");
}

async function runScraper() {
  const batchId = `batch-${new Date().toISOString().slice(0, 10)}`;
  const result = await apiFetch("/api/scraper", {
    method: "POST",
    body: JSON.stringify({ target_count: 200, batch_id: batchId }),
  }, { trends: sampleTrends, batch: { id: batchId, target_count: 200, fetched_count: sampleTrends.length } });
  state.trends = result.trends || state.trends;
  renderTrends();
  toast(`Daily product batch queued: ${result.batch?.fetched_count || state.trends.length} candidates.`);
}

async function queueCreative(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const data = Object.fromEntries(formData.entries());
  const product = state.products.find((item) => item.id === data.product_id) || state.products[0];
  const file = formData.get("asset_file");
  const hasFile = file && typeof file === "object" && file.name;
  const job = {
    id: `content-${Date.now()}`,
    title: hasFile ? file.name : `${product?.title || "Global Bestie"} ${data.asset_type}`,
    type: data.asset_type,
    status: "collected",
    channel: data.asset_type === "whatsapp" ? "WhatsApp" : "Instagram",
    product: product?.title || "Global Bestie",
    hook: data.brief || "Content added to the library. Add caption and Remotion notes before handoff.",
    source: data.source || "Manual upload",
    preview_url: hasFile && file.type?.startsWith("image/") ? URL.createObjectURL(file) : product?.image_url || "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=900&q=84",
  };
  const saved = await apiFetch("/api/admin/marketing", {
    method: "POST",
    body: JSON.stringify({ type: "creative_job", payload: job }),
  }, { creativeJob: job });
  state.creativeJobs.unshift(saved.creativeJob || job);
  event.currentTarget.reset();
  renderMarketing();
  toast("Content added to the library.");
}

async function createCampaign(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget).entries());
  const campaign = {
    id: `camp-${Date.now()}`,
    name: data.name,
    channel: data.channel,
    status: "draft",
    budget_pkr: Number(data.budget_pkr || 0),
    leads: 0,
    revenue_pkr: 0,
  };
  const saved = await apiFetch("/api/admin/marketing", {
    method: "POST",
    body: JSON.stringify({ type: "campaign", payload: campaign }),
  }, { campaign });
  state.campaigns.unshift(saved.campaign || campaign);
  event.currentTarget.reset();
  renderMarketing();
  toast("Campaign created in draft.");
}

function approveCreative(creativeId) {
  const job = state.creativeJobs.find((item) => item.id === creativeId);
  if (!job) return;
  job.status = "ready_for_remotion";
  renderMarketing();
  toast("Marked ready for manual Remotion handoff.");
}

function replyLead(leadId) {
  const lead = state.leads.find((item) => item.id === leadId);
  if (!lead) return;
  lead.stage = lead.stage === "new" ? "quote_sent" : lead.stage;
  lead.owner = lead.owner === "Unassigned" ? "Team" : lead.owner;
  renderMarketing();
  toast(`Reply workspace opened for ${lead.name}.`);
}

async function syncMarketing() {
  const data = await apiFetch("/api/admin/marketing", {}, {
    creativeJobs: state.creativeJobs,
    campaigns: state.campaigns,
    leads: state.leads,
    calendar: state.calendar,
  });
  state.creativeJobs = data.creativeJobs || state.creativeJobs;
  state.campaigns = data.campaigns || state.campaigns;
  state.leads = data.leads || state.leads;
  state.calendar = data.calendar || state.calendar;
  renderMarketing();
  toast("Marketing channels synced.");
}

async function approveTrend(trendId) {
  const trend = state.trends.find((item) => item.id === trendId);
  if (!trend) return;
  const product = {
    id: trend.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    title: trend.title,
    brand: trend.title.split(" ").slice(0, 2).join(" "),
    category: trend.category,
    description: trend.suggested_description || `Trend-approved product imported from ${trend.source_url}.`,
    usa_price_usd: Number(trend.usa_price_usd),
    shipping_pkr: Number(trend.shipping_pkr),
    fx_rate: state.settings.fx_rate,
    markup_rate: state.settings.markup_rate,
    stock_mode: "preorder",
    inventory: 0,
    image_url: trend.asset_urls?.[0] || trend.image_url,
    source_url: trend.source_url,
    featured: false,
    preorder_weeks: state.settings.preorder_weeks,
  };
  await apiFetch(`/api/admin/trends/${trendId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "approved", product }),
  }, { product });
  state.products.unshift(product);
  state.trends = state.trends.filter((item) => item.id !== trendId);
  renderAll();
  toast("Trend approved and published to shop.");
}

async function rejectTrend(trendId) {
  await apiFetch(`/api/admin/trends/${trendId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "rejected" }),
  }, { trend: { id: trendId, status: "rejected" } });
  state.trends = state.trends.filter((item) => item.id !== trendId);
  selectedTrends.delete(trendId);
  renderTrends();
  toast("Trend rejected.");
}

async function bulkApproveTrends() {
  if (!selectedTrends.size) return;
  const ids = [...selectedTrends];
  const fallbackProducts = ids.map((id) => {
    const trend = state.trends.find((t) => t.id === id);
    if (!trend) return null;
    return {
      id: trend.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      title: trend.title,
      brand: trend.brand || trend.title.split(" ").slice(0, 2).join(" "),
      category: trend.category,
      description: trend.suggested_description || `Trend-approved product imported from ${trend.source_url}.`,
      usa_price_usd: Number(trend.usa_price_usd),
      shipping_pkr: Number(trend.shipping_pkr),
      fx_rate: state.settings.fx_rate,
      markup_rate: state.settings.markup_rate,
      stock_mode: "preorder",
      inventory: 0,
      image_url: trend.asset_urls?.[0] || trend.image_url,
      source_url: trend.source_url,
      featured: false,
      preorder_weeks: state.settings.preorder_weeks,
    };
  }).filter(Boolean);

  await apiFetch("/api/admin/trends/bulk", {
    method: "POST",
    body: JSON.stringify({ ids, action: "approved" }),
  }, { updated: ids.length, productsCreated: fallbackProducts.length });

  fallbackProducts.forEach((product) => state.products.unshift(product));
  state.trends = state.trends.filter((t) => !selectedTrends.has(t.id));
  selectedTrends.clear();
  renderAll();
  toast(`${ids.length} trend${ids.length === 1 ? "" : "s"} approved and published to shop.`);
}

async function bulkDenyTrends() {
  if (!selectedTrends.size) return;
  const ids = [...selectedTrends];

  await apiFetch("/api/admin/trends/bulk", {
    method: "POST",
    body: JSON.stringify({ ids, action: "rejected" }),
  }, { updated: ids.length });

  state.trends = state.trends.filter((t) => !selectedTrends.has(t.id));
  selectedTrends.clear();
  renderTrends();
  toast(`${ids.length} trend${ids.length === 1 ? "" : "s"} rejected.`);
}

async function bulkRemoveProducts() {
  if (!selectedProducts.size) return;
  const ids = [...selectedProducts];

  await apiFetch("/api/catalog", {
    method: "DELETE",
    body: JSON.stringify({ ids }),
  }, { removed: ids.length });

  state.products = state.products.filter((p) => !selectedProducts.has(p.id));
  selectedProducts.clear();
  renderProducts();
  toast(`${ids.length} product${ids.length === 1 ? "" : "s"} removed from site.`);
}

function wireEvents() {
  window.addEventListener("hashchange", setRoute);
  window.addEventListener("scroll", () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const progress = max > 0 ? (window.scrollY / max) * 100 : 0;
    document.documentElement.style.setProperty("--scroll-progress", `${progress}%`);
    const header = qs(".site-header");
    if (header) header.dataset.elevated = String(window.scrollY > 10);
  }, { passive: true });

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-stop-row]") && !event.target.closest("button[data-action]")) return;
    const target = event.target.closest("[data-action]");
    if (!target) return;
    event.stopPropagation();
    const action = target.dataset.action;
    const productId = target.dataset.productId;
    const orderId = target.dataset.orderId;
    const trendId = target.dataset.trendId;
    if (action === "close-modal") return closeModal();
    if (action === "open-cart") return qs("[data-cart-drawer]")?.classList.add("open");
    if (action === "close-cart") return qs("[data-cart-drawer]")?.classList.remove("open");
    if (action === "checkout" && !state.cart.length) {
      event.preventDefault();
      return toast("Your bag is empty.");
    }
    if (action === "add-cart") return addToCart(productId);
    if (action === "remove-cart") return removeFromCart(productId);
    if (action === "view-product") return showProductDetails(productId);
    if (action === "view-order") return showOrderDetails(orderId);
    if (action === "refresh-admin") return refreshAdmin();
    if (action === "new-product") return fillProductForm();
    if (action === "edit-product") {
      fillProductForm(state.products.find((item) => item.id === productId));
      closeModal();
      qs("[data-admin-tab=\"products\"]")?.click();
      return;
    }
    if (action === "save-order-status") return saveOrderStatus(orderId);
    if (action === "accept-order") return acceptOrder(orderId);
    if (action === "mark-balance-due") return markBalanceDue(orderId);
    if (action === "send-balance-reminder") return sendBalanceReminder(orderId);
    if (action === "save-order-note") return saveOrderNote(orderId);
    if (action === "run-scraper") return runScraper();
    if (action === "new-shipment-batch") return qs("[data-shipment-form] input[name='name']")?.focus();
    if (action === "select-all-trends") {
      if (target.checked) state.trends.forEach((t) => selectedTrends.add(t.id));
      else selectedTrends.clear();
      renderTrends();
      return;
    }
    if (action === "select-all-products") {
      if (target.checked) state.products.forEach((p) => selectedProducts.add(p.id));
      else selectedProducts.clear();
      renderProducts();
      return;
    }
    if (action === "bulk-approve-trends") return bulkApproveTrends();
    if (action === "bulk-deny-trends") return bulkDenyTrends();
    if (action === "bulk-remove-products") return bulkRemoveProducts();
    if (action === "edit-trend") return toast("Candidate editing should open the product editor with source, media, description, and Remotion fields.");
    if (action === "approve-trend") return approveTrend(trendId);
    if (action === "reject-trend") return rejectTrend(trendId);
    if (action === "approve-creative") return approveCreative(target.dataset.creativeId);
    if (action === "reply-lead") return replyLead(target.dataset.leadId);
    if (action === "sync-marketing") return syncMarketing();
    if (action === "new-campaign") return qs("[data-campaign-form] input[name='name']")?.focus();
  });

  document.addEventListener("change", (event) => {
    const trendSelect = event.target.dataset.trendSelect;
    if (trendSelect) {
      if (event.target.checked) selectedTrends.add(trendSelect);
      else selectedTrends.delete(trendSelect);
      event.target.closest(".trend-card")?.classList.toggle("selected", event.target.checked);
      updateTrendBulkBar();
      return;
    }
    const productSelect = event.target.dataset.productSelect;
    if (productSelect) {
      if (event.target.checked) selectedProducts.add(productSelect);
      else selectedProducts.delete(productSelect);
      event.target.closest(".admin-product-wrap")?.classList.toggle("selected", event.target.checked);
      updateProductBulkBar();
      return;
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModal();
    if (event.key === "Enter" && event.target.matches("[data-action='view-order']")) {
      showOrderDetails(event.target.dataset.orderId);
    }
  });

  qsa(".faq-question").forEach((button) => {
    button.addEventListener("click", () => {
      const item = button.closest(".faq-item");
      const isOpen = item.classList.toggle("open");
      button.setAttribute("aria-expanded", String(isOpen));
      button.querySelector("span:last-child").textContent = isOpen ? "−" : "+";
    });
  });

  qsa("[data-filter-search], [data-filter-category], [data-filter-stock], [data-filter-sort]").forEach((control) => {
    control.addEventListener("input", () => {
      state.filters.search = qs("[data-filter-search]")?.value || "";
      state.filters.category = qs("[data-filter-category]")?.value || "all";
      state.filters.stock = qs("[data-filter-stock]")?.value || "all";
      state.filters.sort = qs("[data-filter-sort]")?.value || "featured";
      renderProducts();
    });
  });

  qsa("[data-admin-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      qsa("[data-admin-tab]").forEach((item) => item.classList.toggle("active", item === tab));
      qsa("[data-admin-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.adminPanel === tab.dataset.adminTab));
    });
  });

  qs("[data-checkout-form]")?.addEventListener("submit", handleCheckout);
  qs("[data-track-form]")?.addEventListener("submit", handleTrack);
  qs("[data-admin-login]")?.addEventListener("submit", handleAdminLogin);
  qs("[data-product-editor]")?.addEventListener("submit", saveProduct);
  qs("[data-product-editor]")?.addEventListener("input", updatePricePreview);
  qs("[data-settings-form]")?.addEventListener("submit", saveSettings);
  qs("[data-admin-order-filter]")?.addEventListener("input", renderAdminOrders);
  qs("[data-shipment-form]")?.addEventListener("submit", createShipmentBatch);
  qs("[data-creative-form]")?.addEventListener("submit", queueCreative);
  qs("[data-campaign-form]")?.addEventListener("submit", createCampaign);
}

function initReveal() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("visible");
      const staggerTargets = entry.target.querySelectorAll(
        ".process-rail article, .collection-tile, .faq-item, .policy-list li"
      );
      staggerTargets.forEach((child, i) => {
        child.style.animationDelay = `${i * 85}ms`;
        child.classList.add("stagger-child");
      });
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.08 });
  qsa(".reveal").forEach((node) => observer.observe(node));
}

function animateHeroText() {
  const h1 = qs(".hero-copy h1");
  if (!h1 || h1.dataset.split) return;
  h1.dataset.split = "1";
  const text = h1.textContent.trim();
  h1.innerHTML = text.split(/\s+/).map((word, i) =>
    `<span class="hero-word" style="--wi:${i}">${word}</span>`
  ).join(" ");
}

function initCursor() {
  const dot = qs("#cursor-dot");
  const ring = qs("#cursor-ring");
  if (!dot || !ring || window.matchMedia("(hover: none)").matches) return;

  let ringX = 0, ringY = 0, dotX = 0, dotY = 0;
  let visible = false;

  document.addEventListener("mousemove", (e) => {
    dotX = e.clientX;
    dotY = e.clientY;
    dot.style.transform = `translate(${dotX}px, ${dotY}px) translate(-50%, -50%)`;
    if (!visible) {
      visible = true;
      dot.style.opacity = "1";
      ring.style.opacity = "1";
    }
  });

  document.addEventListener("mouseleave", () => {
    visible = false;
    dot.style.opacity = "0";
    ring.style.opacity = "0";
  });

  document.addEventListener("mouseenter", () => {
    if (dotX || dotY) {
      visible = true;
      dot.style.opacity = "1";
      ring.style.opacity = "1";
    }
  });

  document.addEventListener("mouseover", (e) => {
    if (e.target.closest("a, button, [role='button'], input, select, textarea")) {
      ring.classList.add("expanded");
    } else {
      ring.classList.remove("expanded");
    }
  });

  (function animateRing() {
    ringX += (dotX - ringX) * 0.1;
    ringY += (dotY - ringY) * 0.1;
    ring.style.transform = `translate(${ringX}px, ${ringY}px) translate(-50%, -50%)`;
    requestAnimationFrame(animateRing);
  })();
}

function init() {
  wireEvents();
  fillProductForm();
  if (state.adminToken) {
    qs("[data-admin-login]")?.classList.add("hidden");
    qs("[data-admin-content]")?.classList.remove("hidden");
  }
  setRoute();
  renderAll();
  animateHeroText();
  initReveal();
  initCursor();
  loadRemoteData();
}

init();
