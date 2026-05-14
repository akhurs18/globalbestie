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

// ─────────────────────────────────────────────────────────────
// Image transform pipeline
//
// Every product image — whether scraped from a retailer or uploaded by the
// owner from their iPhone — flows through images.weserv.nl with a standard
// transform: 1:1 square, white-padded, sharpened, WebP, edge-cached. This
// makes the storefront look like one store instead of a mishmash of retailer
// styles. Zero data migration: we wrap URLs at render time.
//
// If a product has `skip_image_enhancement: true` we pass through the original
// (escape hatch for that rare phone shot that looks worse after auto-treat).
//
// To swap providers later (Cloudinary, Imgproxy, native Supabase transforms),
// replace this one function — every call site already goes through it.
const IMAGE_TRANSFORM_BASE = "https://images.weserv.nl/";
function imageUrl(src, opts = {}) {
  if (!src) return "";
  if (typeof src !== "string") return "";
  if (src.startsWith("data:")) return src; // base64 previews — never proxy
  if (opts.skip || opts.raw) return src;
  // weserv expects the source URL without the leading scheme; it adds https.
  const trimmed = src.replace(/^https?:\/\//i, "");
  const width = opts.width || 1200;
  const height = opts.height || 1200;
  const fit = opts.fit || "contain";
  const params = new URLSearchParams({
    url: trimmed,
    w: String(width),
    h: String(height),
    fit,
    cbg: "white",
    output: opts.output || "webp",
    q: String(opts.quality || 82),
    sharp: String(opts.sharp ?? 2),
  });
  return `${IMAGE_TRANSFORM_BASE}?${params.toString()}`;
}

// Smaller transform for thumbnails / gallery strip.
function imageUrlThumb(src) {
  return imageUrl(src, { width: 360, height: 360, quality: 78 });
}


const ORDER_STEPS = [
  ["pending_review", "Order request under review"],
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
const esc = (value) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");
const attr = esc;

function safeUrl(value, fallback = "#") {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  if (/^data:image\//i.test(raw)) return attr(raw);
  try {
    const url = new URL(raw, location.origin);
    if (!["http:", "https:", "mailto:", "tel:"].includes(url.protocol)) return fallback;
    return attr(url.href);
  } catch {
    return fallback;
  }
}

function supportWhatsAppHref(message = "Hi Global Bestie, I need help with my order.") {
  const waNumber = String(state.settings?.support_whatsapp || sampleSettings.support_whatsapp || "").replace(/\D/g, "");
  return waNumber ? `https://wa.me/${waNumber}?text=${encodeURIComponent(message)}` : "#";
}

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
  return date ? `Next shipment ETA: ${date}` : `Next shipment ETA: shared once your order is placed`;
}

function shipmentNotice() {
  return state.settings.shipment_notice || "Preorder timelines vary because USA shipments are consolidated in batches. We confirm your exact shipment ETA on WhatsApp after your order.";
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
    const method = String(options.method || "GET").toUpperCase();
    const localPreview = ["localhost", "127.0.0.1", ""].includes(location.hostname);
    if (fallback !== undefined && (localPreview || method === "GET")) return fallback;
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

function variantHint(product) {
  // Prefer the structured display hint if it's been filled out; otherwise
  // derive a short chip from the freeform variants textarea.
  if (product.variant_display_hint) return product.variant_display_hint;
  const raw = (product.variants || "").trim();
  if (!raw) return "";
  // First sentence, capped, with sensible category fallbacks if the text is
  // generic-looking (e.g., "Variant" / "Confirm size, shade, or color").
  const first = raw.split(/[.,]/)[0].trim();
  if (!first || /^variant$/i.test(first)) {
    return {
      shoes: "Choose your size",
      handbags: "Multiple colors",
      makeup: "Choose your shade",
      fragrance: "Pick a size",
    }[product.category] || "Variant options";
  }
  return first.length > 32 ? first.slice(0, 30) + "…" : first;
}

// Add-to-bag CTA on shop cards.
// First tap: "Add to bag" button → adds 1 to cart.
// Once in cart: button becomes a − N + stepper so customers can build a
// 10-item beauty haul without leaving the shop grid or opening detail pages.
function renderAddToBag(product, disabled) {
  if (disabled) {
    return `<button class="button primary" type="button" disabled>Sold out</button>`;
  }
  const line = (state.cart || []).find((l) => l.product_id === product.id);
  if (!line) {
    return `<button class="button primary" type="button" data-action="add-cart" data-product-id="${attr(product.id)}" aria-label="Add ${attr(product.title)} to bag">Add to bag</button>`;
  }
  return `
    <div class="qty-stepper" role="group" aria-label="${attr(product.title)} quantity in bag">
      <button class="qty-step" type="button" data-action="decrement-cart" data-product-id="${attr(product.id)}" aria-label="Remove one">−</button>
      <span class="qty-value" data-qty-value>${line.quantity}</span>
      <button class="qty-step" type="button" data-action="add-cart" data-product-id="${attr(product.id)}" aria-label="Add one more">+</button>
    </div>
  `;
}

function productCard(product, options = {}) {
  const parts = productPricingParts(product);
  const disabled = product.stock_mode === "in_stock" && Number(product.inventory) <= 0;
  const isPortal = Boolean(options.admin || document.body.dataset.page === "portal");
  const stockLabel = product.stock_mode === "in_stock" ? "In stock" : "Preorder";
  const advanceDue = product.stock_mode === "preorder" ? Math.ceil(parts.total * 0.5) : parts.total;
  const balanceDue = Math.max(0, parts.total - advanceDue);
  const variantChip = variantHint(product);
  const waNumber = String(state.settings?.support_whatsapp || "").replace(/\D/g, "");
  const variantWA = waNumber
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(`Hi Global Bestie, what are the available options for ${product.title}?`)}`
    : "";

  const publicMeta = [
    product.stock_mode === "preorder" ? nextShipmentLabel() : `${Number(product.inventory || 0)} available`,
  ].filter(Boolean);
  const adminMeta = [
    `USA ${USD.format(product.usa_price_usd || 0)}`,
    `25% margin ${PKR.format(parts.margin)}`,
    `Shipping ${PKR.format(parts.shipping)}`,
    `${product.stock_mode === "preorder" ? "50% advance at checkout" : "Full payment at checkout"}`,
    product.stock_mode === "preorder" ? nextShipmentLabel() : `${Number(product.inventory || 0)} in stock`,
    product.authenticity_note ? "Source checked" : "Source pending",
  ];
  const productImageMarkup = product.image_url
    ? `<img src="${safeUrl(imageUrl(product.image_url), "")}" alt="${attr(product.title)}" loading="lazy" decoding="async" onerror="this.closest('.product-media')?.classList.add('media-missing'); this.remove();" />`
    : `<div class="media-placeholder" aria-label="Product image missing"><span>Image needed</span></div>`;
  return `
    <article class="product-card">
      <div class="product-media" ${!isPortal ? `role="button" tabindex="0" data-action="view-product" data-product-id="${attr(product.id)}" aria-label="View ${attr(product.title)} details"` : ""}>
        ${productImageMarkup}
        <div class="product-badges">
          <span class="status-pill ${attr(product.stock_mode)}">${esc(stockLabel)}</span>
          ${product.marketing_badge ? `<span class="marketing-badge">${esc(product.marketing_badge)}</span>` : ""}
        </div>
      </div>
      <div class="product-body">
        ${product.brand && !isPortal ? `<span class="product-brand">${esc(product.brand)}</span>` : ""}
        <div class="product-title-row" ${!isPortal ? `role="button" tabindex="-1" data-action="view-product" data-product-id="${attr(product.id)}"` : ""}>
          <strong>${esc(product.title)}</strong>
          <span class="price">${PKR.format(parts.total)}</span>
        </div>
        ${!isPortal && product.stock_mode === "preorder" ? `
          <div class="product-payment-chips" aria-label="Preorder payment split">
            <span><small>Advance</small>${PKR.format(advanceDue)}</span>
            <span><small>Balance on arrival</small>${PKR.format(balanceDue)}</span>
          </div>
        ` : ""}
        <p class="product-description-line">${esc(product.description || "")}</p>
        ${!isPortal && variantChip ? `
          <a class="variant-chip" href="${safeUrl(variantWA)}" target="_blank" rel="noreferrer" aria-label="Ask about ${attr(variantChip)} on WhatsApp">
            <span>${esc(variantChip)}</span><span aria-hidden="true">›</span>
          </a>
        ` : ""}
        <div class="product-meta ${isPortal ? "" : "public-listing"}" aria-label="${isPortal ? "Internal pricing details" : "Product details"}">
          ${(isPortal ? adminMeta : publicMeta).map((item) => `<span>${esc(item)}</span>`).join("")}
        </div>
        <div class="product-actions">
          <button class="button secondary" type="button" data-action="view-product" data-product-id="${attr(product.id)}">View details</button>
          ${options.admin ? `<button class="button primary" type="button" data-action="edit-product" data-product-id="${attr(product.id)}">Edit product</button>` : renderAddToBag(product, disabled)}
        </div>
        ${!isPortal && !options.admin ? `<small class="cta-helper">50% advance at checkout · we confirm shipment on WhatsApp</small>` : ""}
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
          <input type="checkbox" class="card-checkbox" data-product-select="${attr(product.id)}" ${selectedProducts.has(product.id) ? "checked" : ""} />
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
  const cartCount = state.cart.reduce((sum, line) => sum + line.quantity, 0);
  qsa("[data-cart-count]").forEach((count) => { count.textContent = cartCount; });
  const lines = cartLines();
  const empty = `<p class="muted">Your bag is empty.</p>`;
  const html = lines.map((line) => `
    <div class="order-line">
      <div>
        <strong>${esc(line.product.title)}</strong>
        <small>${line.product.stock_mode === "preorder" ? "Preorder" : "In stock"} · Qty ${line.quantity}</small>
      </div>
      <div class="mini-actions">
        <strong>${PKR.format(line.subtotal)}</strong>
        <button class="icon-button plain" type="button" data-action="remove-cart" data-product-id="${attr(line.product_id)}" aria-label="Remove ${attr(line.product.title)}">Remove</button>
      </div>
    </div>
  `).join("");
  setHTML("[data-cart-items]", html || empty);
  setHTML("[data-checkout-items]", html || empty);

  const summary = cartPaymentSummary();
  const totals = `
    <div><dt>Estimated order value</dt><dd>${PKR.format(summary.total)}</dd></div>
    <div><dt>${summary.hasPreorder ? "50% advance" : "Pay at checkout"}</dt><dd>${PKR.format(summary.advanceDue)}</dd></div>
    <div><dt>Later balance</dt><dd>${PKR.format(summary.balanceDue)}</dd></div>
    <div><dt>Shipment batch</dt><dd>${summary.hasPreorder ? nextShipmentLabel() : "Dispatched after payment match"}</dd></div>
  `;
  setHTML("[data-cart-totals]", totals);
  setHTML("[data-checkout-totals]", totals);

  const isEmpty = !lines.length;
  qs("[data-empty-checkout]")?.classList.toggle("hidden", !isEmpty);
  qs("[data-checkout-form]")?.classList.toggle("hidden", isEmpty);
  qs(".order-summary")?.classList.toggle("hidden", isEmpty);
}

function setCartDrawerOpen(open) {
  const drawer = qs("[data-cart-drawer]");
  if (!drawer) return;
  drawer.classList.toggle("open", open);
  drawer.setAttribute("aria-hidden", open ? "false" : "true");
}

function renderSupportLinks() {
  const href = supportWhatsAppHref("Hi Global Bestie, I need help with my order.");
  qsa("[data-support-whatsapp]").forEach((link) => {
    link.href = href;
  });
}

function renderBankDetails() {
  const settings = state.settings;
  // Bank details now show inline as the primary "where to pay" panel at
  // checkout. The previous "after approval" framing is gone — customers
  // transfer immediately.
  setHTML("[data-bank-details]", `
    <dl class="bank-details-grid">
      <div><dt>Bank</dt><dd>${esc(settings.bank_name)}</dd></div>
      <div><dt>Account title</dt><dd>${esc(settings.account_title)}</dd></div>
      <div><dt>Account number</dt><dd><code>${esc(settings.account_number)}</code></dd></div>
      <div><dt>IBAN</dt><dd><code>${esc(settings.iban || "Available on request")}</code></dd></div>
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
  // Horizontal progress bar of the 6 stages — easier to scan than the vertical
  // list and matches the policy timeline customers already see on /preorder.
  const progressHTML = `
    <div class="tracking-progress" role="list" aria-label="Order progress">
      ${ORDER_STEPS.map(([status, label], index) => {
        const cls = index < currentIndex ? "done" : index === currentIndex ? "done current" : "";
        return `<div class="tracking-progress-step ${cls}" role="listitem"><strong>${label}</strong></div>`;
      }).join("")}
    </div>
  `;
  target.innerHTML = `
    <p class="kicker">${esc(order.id)}</p>
    <h2>${esc(order.customer_name)}</h2>
    <p>${esc(order.city || "")} · ${PKR.format(payment.total)} total · ${esc(paymentLabel(order.payment_status))}</p>
    <div class="next-action-card">
      <span>Your next step</span>
      <strong>${esc(customerNextStep(order))}</strong>
      <p>${payment.hasPreorder ? "Preorder timing depends on the assigned USA shipment batch. This page updates as the batch moves." : "In-stock orders move to dispatch after payment review and packing."}</p>
    </div>
    ${progressHTML}
    <div class="payment-ledger">
      <article><span>Advance required</span><strong>${PKR.format(payment.advanceDue)}</strong></article>
      <article><span>Remaining balance</span><strong>${PKR.format(payment.balanceDue)}</strong></article>
      <article><span>Balance timing</span><strong>${payment.balanceDue ? "Before local dispatch" : "No later balance"}</strong></article>
      <article><span>ETA</span><strong>${esc(order.eta || (payment.hasPreorder ? nextShipmentLabel() : "Dispatched after payment match"))}</strong></article>
      <article><span>Courier</span><strong>${esc(order.local_courier || "Assigned before dispatch")}</strong></article>
      <article><span>Tracking number</span><strong>${esc(order.tracking_number || "Not dispatched yet")}</strong></article>
    </div>
    ${customerProofForm(order)}
    ${ORDER_STEPS.map(([status, label], index) => `
      <div class="tracking-step ${index <= currentIndex ? "done" : ""}">
        <span class="tracking-dot" aria-hidden="true"></span>
        <div><strong>${label}</strong><br /><span>${status === order.status ? "Current stage" : index < currentIndex ? "Complete" : "Upcoming"}</span></div>
      </div>
    `).join("")}
    <a class="button secondary wide" href="${safeUrl(supportWhatsAppHref(`Hi Global Bestie, I need help with order ${order.id}`))}" target="_blank" rel="noreferrer">Message WhatsApp support</a>
  `;
}

function customerProofForm(order) {
  const payment = orderPaymentSummary(order);
  const status = activePaymentStatusForOrder(order);
  const needsAdvance = ["awaiting_advance", "payment_rejected"].includes(status) && order.status !== "pending_review";
  const needsBalance = status === "balance_due";
  if (!needsAdvance && !needsBalance) return "";
  const stage = needsBalance ? "balance" : "advance";
  const amount = needsBalance ? payment.balanceDue : payment.advanceDue;
  return `
    <form class="tracking-proof-form" data-tracking-proof-form data-order-id="${attr(order.id)}" data-payment-stage="${attr(stage)}">
      <div>
        <p class="kicker">${needsBalance ? "Balance proof" : "Advance proof"}</p>
        <h3>Upload ${needsBalance ? "remaining balance" : "advance"} confirmation</h3>
        <p>${PKR.format(amount)} is due ${needsBalance ? "before local dispatch" : "at checkout"}.</p>
      </div>
      <div class="form-grid compact">
        <label>WhatsApp number<input name="customer_phone" value="${attr(order.customer_phone || "")}" required /></label>
        <label>Transfer reference<input name="transfer_reference" placeholder="Transaction ID or sender account title" required /></label>
        <label class="span-2">Screenshot / PDF<input name="transfer_file" type="file" accept="image/*,.pdf" /></label>
      </div>
      <button class="button primary wide" type="submit">Send proof for review</button>
    </form>
  `;
}

function customerNextStep(order) {
  const payment = orderPaymentSummary(order);
  const status = activePaymentStatusForOrder(order);
  if (order.status === "pending_review") return "Wait for team approval before sending any payment.";
  if (["awaiting_advance", "payment_rejected"].includes(status)) {
    return payment.hasPreorder
      ? `Send the 50% advance: ${PKR.format(payment.advanceDue)}.`
      : `Send the full confirmed payment: ${PKR.format(payment.total)}.`;
  }
  if (status === "advance_uploaded") return "Your transfer proof is being matched by the team.";
  if (status === "balance_due") return `Send the remaining balance before local dispatch: ${PKR.format(payment.balanceDue)}.`;
  if (status === "balance_uploaded") return "Your balance proof is under review before courier dispatch.";
  if (order.status === "delivered") return "Delivered. Message us if anything needs support.";
  return order.next_action || "Track this page for the next update from the team.";
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
    <div class="modal-backdrop">
      <section class="detail-modal" role="dialog" aria-modal="true">
        <button class="icon-button plain modal-close" type="button" data-action="close-modal" aria-label="Close details">Close</button>
        ${html}
      </section>
    </div>
  `;
  qs(".modal-backdrop")?.addEventListener("click", (e) => {
    if (!e.target.closest(".detail-modal")) closeModal();
  });
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
  // Gallery composition (in order):
  //   1. Real photos uploaded by the team after the item lands in the USA —
  //      first because they convert best (authenticity + lighting).
  //   2. Curated gallery_urls (scraped or pasted in admin).
  //   3. The primary image_url as a final fallback.
  // We dedupe and cap at 8 thumbs so the strip stays clean on mobile.
  const realPhotos = [];
  for (const order of state.orders || []) {
    for (const item of orderItems(order)) {
      if (item.product_id !== product.id) continue;
      if (Array.isArray(item.real_photo_urls)) realPhotos.push(...item.real_photo_urls);
    }
  }
  const galleryRaw = [
    ...realPhotos,
    ...(Array.isArray(product.gallery_urls) ? product.gallery_urls : []),
    product.image_url,
  ];
  const gallery = [...new Set(galleryRaw.filter(Boolean))].slice(0, 8);
  const deliveryCopy = product.stock_mode === "preorder"
    ? `${nextShipmentLabel()}. ${shipmentNotice()}`
    : `In stock in Pakistan. Dispatched once your payment is matched.`;
  const publicDetails = `
    <div><dt>Availability</dt><dd>${product.stock_mode === "preorder" ? "Preorder, confirmed by team after request" : `${Number(product.inventory || 0)} in stock, verified before acceptance`}</dd></div>
    <div><dt>Variants</dt><dd>${esc(product.variants || "Confirm size, shade, or color in checkout notes.")}</dd></div>
    <div><dt>Authenticity</dt><dd>${esc(product.authenticity_note || "Team verifies the source before accepting the order.")}</dd></div>
  `;
  const portalDetails = `
    <div><dt>USA retail</dt><dd>${USD.format(product.usa_price_usd || 0)}</dd></div>
    <div><dt>FX rate</dt><dd>${Number(product.fx_rate || state.settings.fx_rate || 0)}</dd></div>
    <div><dt>25% service margin</dt><dd>${PKR.format(parts.margin)}</dd></div>
    <div><dt>Shipping estimate</dt><dd>${PKR.format(parts.shipping)}</dd></div>
    <div><dt>Stock mode</dt><dd>${esc(product.stock_mode === "preorder" ? `Preorder · ${nextShipmentLabel()}` : `${Number(product.inventory || 0)} in stock`)}</dd></div>
    <div><dt>Variants</dt><dd>${esc(product.variants || "Confirm size, shade, or color in checkout notes.")}</dd></div>
    <div><dt>Authenticity note</dt><dd>${esc(product.authenticity_note || "Team will verify source before accepting the order.")}</dd></div>
    <div><dt>Receipt/proof</dt><dd>${product.receipt_url ? `<a href="${safeUrl(product.receipt_url)}" target="_blank" rel="noreferrer">Open receipt</a>` : "Attached after sourcing when available"}</dd></div>
    <div><dt>Supplier cost</dt><dd>${PKR.format(product.supplier_cost_pkr || 0)}</dd></div>
    <div><dt>Publish status</dt><dd>${esc(product.product_status || product.status || "active")}</dd></div>
    <div><dt>Supabase product id</dt><dd>${esc(product.id)}</dd></div>
    <div><dt>Source URL</dt><dd>${product.source_url ? `<a href="${safeUrl(product.source_url)}" target="_blank" rel="noreferrer">${esc(product.source_url)}</a>` : "Not added"}</dd></div>
  `;
  openModal(`
    <div class="modal-grid product-detail-modal">
      <div class="product-gallery">
        <img class="gallery-main" id="gallery-main-img" src="${safeUrl(imageUrl(gallery[0]), "")}" alt="${attr(product.title)}" decoding="async" />
        ${gallery.length > 1 ? `
          <div class="gallery-strip">
            ${gallery.map((url, i) => `
              <button class="gallery-thumb${i === 0 ? " active" : ""}" type="button"
                data-action="gallery-swap" data-gallery-url="${attr(url)}" data-gallery-index="${i}"
                aria-label="View image ${i + 1}">
                <img src="${safeUrl(imageUrlThumb(url), "")}" alt="${attr(product.title)} view ${i + 1}" loading="lazy" decoding="async" />
              </button>
            `).join("")}
          </div>
        ` : ""}
      </div>
      <div class="product-detail-info">
        <p class="kicker">${esc(product.brand || "Global Bestie")} · ${esc(product.category)}</p>
        <h2>${esc(product.title)}</h2>
        <div class="product-price-hero">
          <span class="price-large">${PKR.format(parts.total)}</span>
          <span class="status-pill ${attr(product.stock_mode)}">${product.stock_mode === "preorder" ? "Preorder" : "In stock"}</span>
        </div>
        <p>${esc(product.description || "No description added yet.")}</p>
        <div class="trust-strip">
          <span>Authenticity-first sourcing</span>
          <span>${esc(deliveryCopy)}</span>
          <span>${esc(product.social_proof || "Concierge quote available on WhatsApp.")}</span>
        </div>
        <div class="payment-ledger product-ledger">
          <article><span>${product.stock_mode === "preorder" ? "50% advance due" : "Full payment due"}</span><strong>${PKR.format(advanceDue)}</strong></article>
          ${balanceDue > 0 ? `<article><span>Balance on arrival</span><strong>${PKR.format(balanceDue)}</strong></article>` : ""}
          <article><span>Shipment</span><strong>${product.stock_mode === "preorder" ? nextShipmentLabel() : "Local dispatch"}</strong></article>
        </div>
        <dl class="detail-list">
          ${isPortal ? portalDetails : publicDetails}
        </dl>
        ${isPortal ? "" : `
          <aside class="variant-callout" aria-label="Variants and customization">
            <strong>Variants &amp; customization</strong>
            <p>${esc(product.variants && product.variants.trim() ? product.variants : "Message us on WhatsApp before submitting to confirm size, shade, or color.")}</p>
            <a class="button secondary small" href="${safeUrl(supportWhatsAppHref(`Hi Global Bestie, I want to confirm variants for ${product.title}`))}" target="_blank" rel="noreferrer">Ask about variants on WhatsApp</a>
          </aside>
        `}
        <div class="product-modal-cta">
          ${isPortal ? `<button class="button primary" type="button" data-action="edit-product" data-product-id="${attr(product.id)}">Edit product</button>` : `<button class="button primary wide" type="button" data-action="add-cart" data-product-id="${attr(product.id)}">Add to bag · ${PKR.format(parts.total)}</button>`}
          ${isPortal ? "" : `<a class="button secondary" href="${safeUrl(supportWhatsAppHref(`Hi Global Bestie, I want details for ${product.title}`))}" target="_blank" rel="noreferrer">Ask on WhatsApp</a>`}
          ${isPortal ? "" : `<small class="cta-helper">50% advance at checkout · balance on Pakistan arrival</small>`}
          <button class="button secondary" type="button" data-action="close-modal">Done</button>
        </div>
      </div>
      ${isPortal ? "" : `
        <!-- Mobile sticky bar. Hidden on desktop via CSS. The button itself
             references the same add-cart action as the in-page CTA so we
             have one canonical handler. -->
        <div class="detail-sticky-cta" role="region" aria-label="Add to bag">
          <div>
            <strong>${PKR.format(parts.total)}</strong>
            <small>${product.stock_mode === "preorder" ? `50% advance ${PKR.format(advanceDue)}` : "Pay in full at checkout"}</small>
          </div>
          <button class="button primary" type="button" data-action="add-cart" data-product-id="${attr(product.id)}">Add to bag</button>
        </div>
      `}
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
      <section class="detail-panel payment-review-panel">
        <div class="panel-title-row">
          <h3>Payment verification</h3>
          <span class="status-pill ${activePaymentStatusForOrder(order) === "paid_in_full" ? "in_stock" : "preorder"}">${paymentLabel(activePaymentStatusForOrder(order))}</span>
        </div>
        <div class="verification-grid">
          <div><span>Transfer reference</span><strong>${order.transfer_reference || "Not submitted"}</strong></div>
          <div><span>Sender account</span><strong>${order.transfer_sender || "Not captured"}</strong></div>
          <div><span>Proof file</span><strong>${order.proof_url || "No proof uploaded"}</strong></div>
        </div>
        <div class="mini-actions">
          <button class="button primary" type="button" data-action="confirm-advance" data-order-id="${order.id}">Confirm advance</button>
          <button class="button primary" type="button" data-action="confirm-balance" data-order-id="${order.id}">Confirm balance</button>
          <button class="button secondary" type="button" data-action="reject-payment" data-order-id="${order.id}">Reject proof</button>
        </div>
      </section>
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
            <div><dt>Shipment ETA</dt><dd>${order.eta || (payment.hasPreorder ? nextShipmentLabel() : "Set after dispatch")}</dd></div>
            <div><dt>Assigned batch</dt><dd>${batch ? `${batch.name} · ${batchStatusLabel(batch.status)}` : "Not assigned"}</dd></div>
            <div><dt>Source retailer</dt><dd>${order.source_retailer || "Not assigned"}</dd></div>
            <div><dt>Source URL</dt><dd>${order.source_url ? `<a href="${order.source_url}" target="_blank" rel="noreferrer">${order.source_url}</a>` : "Not added"}</dd></div>
            <div><dt>USA purchase ID</dt><dd>${order.source_purchase_id || "Not purchased yet"}</dd></div>
            <div><dt>USA tracking</dt><dd>${order.usa_tracking || "Not available"}</dd></div>
            <div><dt>Local courier</dt><dd>${order.local_courier || "Not assigned"}</dd></div>
            <div><dt>Local tracking</dt><dd>${order.tracking_number || "Not dispatched"}</dd></div>
          </dl>
          <label>Assign shipment batch
            <select data-order-batch="${order.id}">
              <option value="">Select batch</option>
              ${state.shipmentBatches.map((item) => `<option value="${item.id}" ${batch?.id === item.id ? "selected" : ""}>${item.name} · ${formatDate(item.eta_date)} · ${Number(item.used || 0)}/${Number(item.capacity || 0)}</option>`).join("")}
            </select>
          </label>
          <button class="button secondary wide" type="button" data-action="assign-shipment-batch" data-order-id="${order.id}">Assign batch</button>
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
                <img src="${imageUrlThumb(item.image_url || product.image_url || "")}" alt="${item.title}" loading="lazy" decoding="async" />
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
  const handoffs = state.leads.filter((lead) => lead.automation_status === "human_handoff").length;
  const trendApprovals = state.trends.filter((trend) => trend.status === "pending").length;

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

  setHTML("[data-admin-today-feed]", [
    ["Approve orders", pending, "Confirm availability, final PKR price, and shipment batch before customers pay.", "orders"],
    ["Collect balances", balanceDue, "Pakistan-arrived preorders should not dispatch locally until balance proof is confirmed.", "orders"],
    ["Human DM handoffs", handoffs, "Variant, complaint, payment, delay, and unclear-intent messages need a person.", "growth"],
    ["Trend approvals", trendApprovals, "Review scraped candidates before anything publishes to the storefront.", "trends"],
  ].map(([label, value, body, tab]) => `
    <button class="today-card" type="button" data-admin-tab-jump="${tab}">
      <strong>${value}</strong>
      <span>${label}</span>
      <small>${body}</small>
    </button>
  `).join(""));

  renderAdminTabBadges({ pending, balanceDue, handoffs, trendApprovals, lowStock, activeBatch });

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
  renderDemoBanner();
  renderLaunchChecklist();
  renderCashflow();
}

// ═══════════════════════════════════════ CASHFLOW PANEL
// One-stop view answering "where is every order right now?" and "where is the
// money?". Every number computes from live order data — nothing is stored
// separately. The user's mental model is items, not orders, so the sourcing
// queue is item-by-item; everything else aggregates from there.

const OPEN_STAGES = new Set(["pending_review", "accepted", "sourcing", "in_transit", "pakistan_processing"]);

function itemActualUsd(item) {
  // Per-item actual USD cost. Falls back to the product's listed retail when
  // the user hasn't entered an "actually paid" number yet — flagged in the UI
  // as estimate vs actual.
  const actual = Number(item.actual_usd_cost || 0);
  if (actual > 0) return { value: actual * Number(item.quantity || 1), isActual: true };
  const listed = Number(item.usa_price_usd || relatedProductForItem(item).usa_price_usd || 0);
  return { value: listed * Number(item.quantity || 1), isActual: false };
}

function orderUsdSpent(order) {
  // USD actually put on the card so far — only counts items the user has
  // marked purchased.
  return orderItems(order).reduce((sum, item) => {
    const actual = Number(item.actual_usd_cost || 0);
    return sum + (actual > 0 ? actual * Number(item.quantity || 1) : 0);
  }, 0);
}

function orderUsdExpected(order) {
  // Total USD this order should cost when fully sourced (actuals where known,
  // listed retail otherwise).
  return orderItems(order).reduce((sum, item) => sum + itemActualUsd(item).value, 0);
}

function orderIsFullySourced(order) {
  const items = orderItems(order);
  if (!items.length) return false;
  return items.every((item) => Number(item.actual_usd_cost || 0) > 0);
}

function orderExpectedProfit(order, fx) {
  const payment = orderPaymentSummary(order);
  const usdExpected = orderUsdExpected(order);
  return payment.total - (usdExpected * fx);
}

function daysSince(timestamp) {
  if (!timestamp) return null;
  const ms = Date.now() - new Date(timestamp).getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

function cashflowAggregate(orders, fx) {
  // The six top-strip numbers.
  let usdSpent = 0;
  let advanceCollected = 0;
  let balanceToCollect = 0;
  let futureBalance = 0;
  let expectedProfit = 0;
  let openCount = 0;
  for (const order of orders) {
    if (!OPEN_STAGES.has(order.status)) continue;
    openCount += 1;
    usdSpent += orderUsdSpent(order);
    advanceCollected += Number(order.advance_paid_pkr || 0);
    const payment = orderPaymentSummary(order);
    const balanceOutstanding = Math.max(0, payment.balanceDue - Number(order.balance_paid_pkr || 0));
    if (order.status === "pakistan_processing") {
      balanceToCollect += balanceOutstanding;
    } else {
      futureBalance += balanceOutstanding;
    }
    expectedProfit += orderExpectedProfit(order, fx);
  }
  const pkrInHand = advanceCollected - usdSpent * fx;
  return {
    pkrInHand,
    usdSpent,
    balanceToCollect,
    futureBalance,
    expectedProfit,
    openCount,
    advanceCollected,
  };
}

function renderCashflow() {
  if (!has("[data-cashflow-strip]")) return;
  const fx = Number(state.settings?.fx_rate || 282);

  // FX assumption surfaced near the top — the numbers depend on this.
  setHTML("[data-cashflow-fx]", `<small>USD→PKR rate: <strong>${fx.toFixed(2)}</strong> · from Settings</small>`);

  const orders = state.orders || [];
  const agg = cashflowAggregate(orders, fx);

  const stripCards = [
    {
      label: "PKR in hand",
      value: PKR.format(agg.pkrInHand),
      hint: `${PKR.format(agg.advanceCollected)} collected − ${PKR.format(agg.usdSpent * fx)} USD spend`,
      tone: agg.pkrInHand < 0 ? "negative" : "positive",
    },
    {
      label: "USD spent (open)",
      value: USD.format(agg.usdSpent),
      hint: `On your card, awaiting recovery`,
      tone: "neutral",
    },
    {
      label: "PKR balance to collect",
      value: PKR.format(agg.balanceToCollect),
      hint: "Arrived in PK, awaiting balance",
      tone: agg.balanceToCollect > 0 ? "attention" : "neutral",
    },
    {
      label: "PKR future balance",
      value: PKR.format(agg.futureBalance),
      hint: "Not yet arrived in PK",
      tone: "neutral",
    },
    {
      label: "Expected profit",
      value: PKR.format(agg.expectedProfit),
      hint: "If every open order pays in full",
      tone: agg.expectedProfit < 0 ? "negative" : "positive",
    },
    {
      label: "Open orders",
      value: String(agg.openCount),
      hint: "Across all open stages",
      tone: "neutral",
    },
  ];
  setHTML(
    "[data-cashflow-strip]",
    stripCards
      .map(
        (c) => `
        <article class="cashflow-card cashflow-tone-${c.tone}">
          <span>${c.label}</span>
          <strong>${c.value}</strong>
          <small>${c.hint}</small>
        </article>`
      )
      .join("")
  );

  // The money stripe: 4 segments showing where capital sits.
  // Left to right: USD already on card (red, outflow); PKR collected (green, inflow);
  // PKR to collect on arrival (blue, near); PKR future balance (grey, far).
  const totalScale = Math.max(
    1,
    agg.usdSpent * fx + agg.advanceCollected + agg.balanceToCollect + agg.futureBalance
  );
  const segments = [
    ["USD spent (PKR equiv)", agg.usdSpent * fx, "out"],
    ["PKR advance collected", agg.advanceCollected, "in"],
    ["PKR balance to collect", agg.balanceToCollect, "near"],
    ["PKR future balance", agg.futureBalance, "far"],
  ];
  setHTML(
    "[data-cashflow-money-bar]",
    `<div class="money-bar-track">
      ${segments
        .map(
          ([label, value, tone]) => `
        <span class="money-bar-seg money-bar-${tone}" style="width:${(value / totalScale) * 100}%" title="${label}: ${PKR.format(value)}"></span>`
        )
        .join("")}
    </div>
    <div class="money-bar-legend">
      ${segments
        .map(([label, value, tone]) => `<span class="money-bar-key money-bar-${tone}"><i></i>${label} · ${PKR.format(value)}</span>`)
        .join("")}
    </div>`
  );

  renderSourcingQueue();
  renderCashflowBatches(fx);
  renderCashflowWorklists();
  renderLedger();
}

function renderSourcingQueue() {
  const target = qs("[data-sourcing-queue]");
  if (!target) return;
  const queue = [];
  // Photo-nudge list: items that HAVE been marked purchased (so they're at
  // your place in the USA or already shipped) but have fewer than 2 photos
  // uploaded by you. Passive — never blocks workflow.
  const photoNudge = [];
  for (const order of state.orders || []) {
    for (const item of orderItems(order)) {
      const purchased = Number(item.actual_usd_cost || 0) > 0;
      if (["accepted", "sourcing"].includes(order.status) && !purchased) {
        queue.push({ order, item });
      }
      if (purchased && order.status !== "delivered") {
        const photoCount = Array.isArray(item.real_photo_urls) ? item.real_photo_urls.length : 0;
        if (photoCount < 2) photoNudge.push({ order, item, photoCount });
      }
    }
  }
  qs("[data-sourcing-count]").textContent = `${queue.length} item${queue.length === 1 ? "" : "s"}`;

  const photoNudgeHTML = photoNudge.length
    ? `
      <details class="photo-nudge" ${photoNudge.length <= 3 ? "open" : ""}>
        <summary>📷 ${photoNudge.length} item${photoNudge.length === 1 ? "" : "s"} could use real photos</summary>
        <p class="cashflow-note">Items in your USA garage or shipped to PK. A few iPhone shots on a clean surface beat any retailer image for conversion.</p>
        <ul class="photo-nudge-list">
          ${photoNudge.slice(0, 10).map(({ order, item, photoCount }) => {
            const itemKey = item.id || `${order.id}::${item.product_id || item.title}`;
            return `
              <li>
                <span>${item.title} ${item.variant ? `· ${item.variant}` : ""}</span>
                <small>${order.id} · ${order.customer_name} · ${photoCount} photo${photoCount === 1 ? "" : "s"}</small>
                <label class="photo-upload-trigger">
                  <input type="file" accept="image/*" multiple data-real-photo-upload data-order-id="${order.id}" data-item-key="${itemKey}" hidden />
                  <span class="button secondary small">Upload photos</span>
                </label>
              </li>
            `;
          }).join("")}
        </ul>
        ${photoNudge.length > 10 ? `<small class="cashflow-note">…and ${photoNudge.length - 10} more.</small>` : ""}
      </details>
    `
    : "";

  if (!queue.length) {
    target.innerHTML = `<p class="cashflow-empty">Nothing to source — every accepted item has been marked purchased.</p>${photoNudgeHTML}`;
    return;
  }
  target.innerHTML = queue
    .map(({ order, item }) => {
      const itemKey = item.id || `${order.id}::${item.product_id || item.title}`;
      const listedUsd = Number(item.usa_price_usd || relatedProductForItem(item).usa_price_usd || 0);
      const today = new Date().toISOString().slice(0, 10);
      return `
        <article class="sourcing-row" data-sourcing-row data-order-id="${order.id}" data-item-key="${itemKey}">
          <div class="sourcing-meta">
            <strong>${item.title} ${item.variant ? `· ${item.variant}` : ""}</strong>
            <small>${order.id} · ${order.customer_name} · qty ${item.quantity || 1} · listed ${USD.format(listedUsd)}</small>
          </div>
          <label>USD paid<input data-sourcing-cost type="number" min="0" step="0.01" inputmode="decimal" placeholder="${listedUsd ? listedUsd.toFixed(2) : '0.00'}" /></label>
          <label>Purchased on<input data-sourcing-date type="date" value="${today}" /></label>
          <button class="button secondary" type="button" data-action="save-sourcing" data-order-id="${order.id}" data-item-key="${itemKey}">Mark purchased</button>
        </article>
      `;
    })
    .join("") + photoNudgeHTML;
}

// Real-photo upload handler. Multi-file: select 3 photos at once, they all
// upload, then attach to the order item's real_photo_urls array. Same
// transform pipeline applies on render via imageUrl(), so even a hastily
// taken phone shot ends up looking consistent on the storefront.
async function uploadRealPhotosForItem(orderId, itemKey, files) {
  if (!files?.length) return;
  const order = state.orders.find((o) => o.id === orderId);
  if (!order) return;
  const item = findOrderItem(order, itemKey);
  if (!item) return;

  toast(`Uploading ${files.length} photo${files.length === 1 ? "" : "s"}…`);
  const newUrls = [];
  for (const file of files) {
    const uploaded = await apiFetch(
      "/api/admin/upload",
      { method: "POST", body: JSON.stringify({ folder: `products/real/${order.id}`, file: await fileToPayload(file) }) },
      { publicUrl: URL.createObjectURL(file), configured: false }
    );
    if (uploaded.publicUrl) newUrls.push(uploaded.publicUrl);
  }
  item.real_photo_urls = [...(item.real_photo_urls || []), ...newUrls];

  // Persist alongside any other item updates via the same admin-orders PATCH.
  await apiFetch(
    `/api/admin/orders/${encodeURIComponent(orderId)}`,
    { method: "PATCH", body: JSON.stringify({ updates: { items: orderItems(order) }, note: `Added ${newUrls.length} real photos to ${item.title}.` }) },
    { order, configured: false }
  );
  toast(`${newUrls.length} photo${newUrls.length === 1 ? "" : "s"} attached.`);
  renderCashflow();
}

function renderCashflowBatches(fx) {
  const target = qs("[data-cashflow-batches]");
  if (!target) return;
  const openBatches = (state.shipmentBatches || []).filter((b) =>
    ["collecting", "sourcing", "shipped", "arriving"].includes(b.status)
  );
  qs("[data-batches-count]").textContent = `${openBatches.length} open`;
  if (!openBatches.length) {
    target.innerHTML = `<p class="cashflow-empty">No open batches. Create one in the Shipments tab to start tracking.</p>`;
    return;
  }
  target.innerHTML = openBatches
    .map((batch) => {
      const orderIds = batch.order_ids || [];
      const batchOrders = (state.orders || []).filter((o) => orderIds.includes(o.id));
      let usd = 0;
      let advance = 0;
      let balanceLeft = 0;
      let items = 0;
      for (const o of batchOrders) {
        usd += orderUsdSpent(o);
        advance += Number(o.advance_paid_pkr || 0);
        const payment = orderPaymentSummary(o);
        balanceLeft += Math.max(0, payment.balanceDue - Number(o.balance_paid_pkr || 0));
        items += orderItems(o).length;
      }
      const scale = Math.max(1, usd * fx + advance + balanceLeft);
      return `
        <article class="cashflow-batch">
          <header>
            <div>
              <strong>${batch.name}</strong>
              <small>ETA ${formatDate(batch.eta_date)}</small>
            </div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <span class="batch-status-chip ${batch.status}">${batchStatusLabel(batch.status)}</span>
              <small>${batchOrders.length} orders · ${items} items</small>
            </div>
          </header>
          <div class="money-bar-track money-bar-track-mini">
            <span class="money-bar-seg money-bar-out" style="width:${((usd * fx) / scale) * 100}%"></span>
            <span class="money-bar-seg money-bar-in" style="width:${(advance / scale) * 100}%"></span>
            <span class="money-bar-seg money-bar-near" style="width:${(balanceLeft / scale) * 100}%"></span>
          </div>
          <dl class="batch-figures">
            <div><dt>USD spent</dt><dd>${USD.format(usd)}</dd></div>
            <div><dt>Advance in</dt><dd>${PKR.format(advance)}</dd></div>
            <div><dt>Balance left</dt><dd>${PKR.format(balanceLeft)}</dd></div>
          </dl>
        </article>
      `;
    })
    .join("");
}

function renderCashflowWorklists() {
  const orders = state.orders || [];
  // Arrived in PK, balance not collected.
  const balanceChase = orders.filter((o) => {
    if (o.status !== "pakistan_processing") return false;
    const payment = orderPaymentSummary(o);
    return Math.max(0, payment.balanceDue - Number(o.balance_paid_pkr || 0)) > 0;
  });
  qs("[data-balance-chase-count]").textContent = String(balanceChase.length);
  setHTML(
    "[data-balance-chase]",
    balanceChase.length
      ? balanceChase
          .map((o) => {
            const payment = orderPaymentSummary(o);
            const due = Math.max(0, payment.balanceDue - Number(o.balance_paid_pkr || 0));
            const waNum = String(o.customer_phone || "").replace(/\D/g, "");
            const waHref = waNum
              ? `https://wa.me/${waNum}?text=${encodeURIComponent(`Hi ${o.customer_name.split(" ")[0]}, your Global Bestie order ${o.id} has arrived in Pakistan. Remaining balance: PKR ${due}. Please transfer before local dispatch.`)}`
              : "#";
            const days = daysSince(o.arrived_at || o.updated_at || o.created_at);
            const urgent = days !== null && days >= 3;
            return `
              <div class="worklist-row ${urgent ? "urgent" : ""}">
                <div><strong>${o.id}</strong><small>${o.customer_name} · ${o.city || ""}${days !== null ? ` · arrived ${days}d ago` : ""}</small></div>
                <strong>${PKR.format(due)}</strong>
                <a class="button secondary" href="${waHref}" target="_blank" rel="noreferrer">WhatsApp</a>
              </div>`;
          })
          .join("")
      : `<p class="cashflow-empty">All balances are collected on arrived orders.</p>`
  );

  // Accepted >7 days, not assigned to any batch.
  const stale = orders.filter((o) => {
    if (o.status !== "accepted") return false;
    if (shipmentBatchForOrder(o)) return false;
    const days = daysSince(o.accepted_at || o.created_at);
    return days !== null && days >= 7;
  });
  qs("[data-stale-orders-count]").textContent = String(stale.length);
  setHTML(
    "[data-stale-orders]",
    stale.length
      ? stale
          .map((o) => {
            const days = daysSince(o.accepted_at || o.created_at) || 0;
            const urgent = days >= 14;
            return `
            <div class="worklist-row ${urgent ? "urgent" : ""}">
              <div><strong>${o.id}</strong><small>${o.customer_name} · ${days} days accepted${urgent ? " · urgent" : ""}</small></div>
              <strong>${PKR.format(Number(o.total_pkr || 0))}</strong>
              <button class="button secondary" type="button" data-action="view-order" data-order-id="${o.id}">Open</button>
            </div>`;
          })
          .join("")
      : `<p class="cashflow-empty">No stale accepted orders.</p>`
  );
}

function renderLedger() {
  const tbody = qs("[data-ledger-rows]");
  if (!tbody) return;

  // Refresh the batch filter options to match current batches.
  const batchSelect = qs("[data-ledger-batch]");
  if (batchSelect) {
    const current = batchSelect.value || "all";
    batchSelect.innerHTML =
      `<option value="all">All batches</option>` +
      (state.shipmentBatches || [])
        .map((b) => `<option value="${b.id}">${b.name}</option>`)
        .join("") +
      `<option value="__none__">No batch</option>`;
    batchSelect.value = current;
  }

  const batchFilter = qs("[data-ledger-batch]")?.value || "all";
  const stageFilter = qs("[data-ledger-stage]")?.value || "all";
  const paymentFilter = qs("[data-ledger-payment]")?.value || "all";
  const search = (qs("[data-ledger-search]")?.value || "").toLowerCase();
  const fx = Number(state.settings?.fx_rate || 282);

  const rows = (state.orders || []).filter((o) => {
    if (stageFilter !== "all" && o.status !== stageFilter) return false;
    if (paymentFilter !== "all" && o.payment_status !== paymentFilter) return false;
    if (batchFilter === "__none__" && shipmentBatchForOrder(o)) return false;
    if (batchFilter !== "all" && batchFilter !== "__none__") {
      const batch = shipmentBatchForOrder(o);
      if (!batch || batch.id !== batchFilter) return false;
    }
    if (search) {
      const hay = [o.id, o.customer_name, o.customer_phone].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  let totalPkr = 0;
  let totalUsd = 0;
  let totalAdvance = 0;
  let totalBalance = 0;
  let totalProfit = 0;

  tbody.innerHTML = rows
    .map((o) => {
      const payment = orderPaymentSummary(o);
      const usd = orderUsdExpected(o);
      const usdActual = orderUsdSpent(o);
      const balanceLeft = Math.max(0, payment.balanceDue - Number(o.balance_paid_pkr || 0));
      const profit = payment.total - usd * fx;
      const batch = shipmentBatchForOrder(o);
      const profitClass = profit >= 0 ? "profit-positive" : "profit-negative";
      const waNum = String(o.customer_phone || "").replace(/\D/g, "");
      const waHref = waNum && balanceLeft > 0
        ? `https://wa.me/${waNum}?text=${encodeURIComponent(`Hi ${(o.customer_name || "").split(" ")[0]}, your Global Bestie order ${o.id} has a remaining balance of PKR ${balanceLeft.toLocaleString()}. Please transfer when convenient — thank you!`)}`
        : "";
      totalPkr += payment.total;
      totalUsd += usdActual;
      totalAdvance += Number(o.advance_paid_pkr || 0);
      totalBalance += balanceLeft;
      totalProfit += profit;
      return `
        <tr role="button" tabindex="0" class="order-row" data-action="view-order" data-order-id="${o.id}" data-payment="${o.payment_status}">
          <td><strong>${o.id}</strong>${waHref ? `<br><a class="ledger-wa-link" href="${waHref}" target="_blank" rel="noreferrer" data-stop-row title="WhatsApp balance reminder">↗ WA</a>` : ""}</td>
          <td>${o.customer_name}<br><small>${o.customer_phone || ""}</small></td>
          <td>${batch ? batch.name : "—"}</td>
          <td>${o.status.replaceAll("_", " ")}</td>
          <td>${paymentLabel(o.payment_status)}</td>
          <td>${PKR.format(payment.total)}</td>
          <td>${USD.format(usdActual)}${usdActual < usd ? `<br><small>est ${USD.format(usd)}</small>` : ""}</td>
          <td>${PKR.format(Number(o.advance_paid_pkr || 0))}</td>
          <td>${PKR.format(balanceLeft)}</td>
          <td class="${profitClass}">${PKR.format(profit)}</td>
        </tr>`;
    })
    .join("") || `<tr><td colspan="10"><p class="cashflow-empty">No orders match these filters.</p></td></tr>`;

  const totalProfitClass = totalProfit >= 0 ? "profit-positive" : "profit-negative";
  const tfootRow = rows.length
    ? `<tr class="ledger-totals">
        <td colspan="5"><strong>Totals (${rows.length} orders)</strong></td>
        <td><strong>${PKR.format(totalPkr)}</strong></td>
        <td><strong>${USD.format(totalUsd)}</strong></td>
        <td><strong>${PKR.format(totalAdvance)}</strong></td>
        <td><strong>${PKR.format(totalBalance)}</strong></td>
        <td class="${totalProfitClass}"><strong>${PKR.format(totalProfit)}</strong></td>
       </tr>`
    : "";
  const table = tbody.closest("table");
  if (table) {
    let tfoot = table.querySelector("tfoot");
    if (!tfoot) {
      tfoot = document.createElement("tfoot");
      table.appendChild(tfoot);
    }
    tfoot.innerHTML = tfootRow;
  }

  // Stash current filtered rows so the CSV export uses exactly what is shown.
  state._ledgerExport = rows;
}

function exportLedgerCsv() {
  const rows = state._ledgerExport || state.orders || [];
  if (!rows.length) {
    toast("No orders in the current view to export.");
    return;
  }
  const fx = Number(state.settings?.fx_rate || 282);
  const headers = [
    "Order ID",
    "Customer",
    "Phone",
    "City",
    "Batch",
    "Stage",
    "Payment status",
    "PKR sale",
    "USD cost (actual)",
    "USD cost (est)",
    "Advance in PKR",
    "Balance left PKR",
    "Profit PKR",
    "Created",
  ];
  const escape = (val) => {
    const s = val == null ? "" : String(val);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = rows.map((o) => {
    const payment = orderPaymentSummary(o);
    const usd = orderUsdExpected(o);
    const usdActual = orderUsdSpent(o);
    const balanceLeft = Math.max(0, payment.balanceDue - Number(o.balance_paid_pkr || 0));
    const profit = payment.total - usd * fx;
    const batch = shipmentBatchForOrder(o);
    return [
      o.id,
      o.customer_name,
      o.customer_phone || "",
      o.city || "",
      batch ? batch.name : "",
      (o.status || "").replaceAll("_", " "),
      paymentLabel(o.payment_status),
      payment.total,
      usdActual,
      usd,
      Number(o.advance_paid_pkr || 0),
      balanceLeft,
      Math.round(profit),
      o.created_at || "",
    ].map(escape).join(",");
  });
  const csv = [headers.join(","), ...body].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `global-bestie-ledger-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast(`Exported ${rows.length} orders to CSV.`);
}

function findOrderItem(order, key) {
  return orderItems(order).find((item) => {
    const k = item.id || `${order.id}::${item.product_id || item.title}`;
    return k === key;
  });
}

async function saveSourcing(orderId, itemKey, costStr, dateStr) {
  const order = state.orders.find((o) => o.id === orderId);
  if (!order) return;
  const item = findOrderItem(order, itemKey);
  if (!item) return;
  const cost = Number(costStr || 0);
  if (!cost || cost <= 0) {
    toast("Enter a USD amount > 0 before saving.");
    return;
  }
  const purchasedAt = dateStr ? new Date(dateStr).toISOString() : new Date().toISOString();
  item.actual_usd_cost = cost;
  item.usd_purchased_at = purchasedAt;

  // Recompute order-level "sourcing complete" status — if every item is now
  // bought, suggest moving to "sourcing" but don't force it (user may have
  // their own status flow).
  await apiFetch(
    `/api/admin/orders/${encodeURIComponent(orderId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        updates: { items: orderItems(order) },
        note: `Marked ${item.title} as purchased for ${USD.format(cost)}.`,
      }),
    },
    { order, configured: false }
  );

  if (orderIsFullySourced(order) && order.status === "accepted") {
    toast(`All items sourced for ${orderId}. Move to "sourcing" in the Orders tab when ready.`);
  } else {
    toast(`${item.title} marked purchased.`);
  }
  renderCashflow();
}


function renderAdminTabBadges({ pending, balanceDue, handoffs, trendApprovals, lowStock, activeBatch }) {
  const values = {
    overview: pending + balanceDue + handoffs + trendApprovals,
    growth: handoffs,
    orders: pending + balanceDue,
    shipments: activeBatch ? 1 : 0,
    products: lowStock,
    trends: trendApprovals,
    settings: readinessIssues().length,
  };
  Object.entries(values).forEach(([key, value]) => {
    const badge = qs(`[data-tab-badge="${key}"]`);
    if (!badge) return;
    badge.textContent = value > 0 ? value : "";
    badge.hidden = value <= 0;
  });
}

// Surfaces a banner in the admin portal when the store settings still match
// the demo placeholders shipped with the static preview. Catches a real-launch
// foot-gun: deploying without changing the bank number means customers would
// try to send advances to a non-existent account.
function renderDemoBanner() {
  const target = qs("[data-demo-banner]");
  if (!target) return;
  const issues = [];
  const s = state.settings || {};
  if (!s.bank_name || s.bank_name === sampleSettings.bank_name) issues.push("Bank name");
  if (!s.account_number || s.account_number === sampleSettings.account_number) issues.push("Account number");
  if (!s.account_title || s.account_title === sampleSettings.account_title) issues.push("Account title");
  if (!s.iban || s.iban === sampleSettings.iban) issues.push("IBAN");
  if (!s.support_whatsapp || s.support_whatsapp === sampleSettings.support_whatsapp) issues.push("Support WhatsApp");
  // Cheap product-image sanity: any product whose image URL is still the
  // canonical demo Unsplash photos means the catalog hasn't been edited yet.
  const demoImages = new Set(sampleProducts.map((p) => p.image_url));
  const stillDemoProducts = (state.products || []).filter((p) => demoImages.has(p.image_url));
  if (stillDemoProducts.length) issues.push(`${stillDemoProducts.length} product(s) still on demo images`);

  if (!issues.length) {
    target.hidden = true;
    target.innerHTML = "";
    return;
  }

  target.hidden = false;
  target.className = "demo-data-banner";
  target.innerHTML = `
    <strong>Demo data</strong>
    <span>${issues.join(" · ")} still match the placeholder values. Update them in <a href="#" data-action="jump-settings">Settings</a> before going live.</span>
  `;
}

function readinessIssues() {
  const issues = [];
  const s = state.settings || {};
  if (!s.bank_name || s.bank_name === sampleSettings.bank_name) issues.push("Replace demo bank name");
  if (!s.account_number || s.account_number === sampleSettings.account_number) issues.push("Replace demo account number");
  if (!s.support_whatsapp || s.support_whatsapp === sampleSettings.support_whatsapp) issues.push("Connect support WhatsApp");
  if (!s.next_shipment_date) issues.push("Set next shipment ETA");
  if (!state.products.some((product) => product.product_status === "active" || product.status === "active")) issues.push("Publish at least one active product");
  if (!state.shipmentBatches.length) issues.push("Create first shipment batch");
  return issues;
}

function renderLaunchChecklist() {
  const target = qs("[data-launch-checklist]");
  if (!target) return;
  const issues = readinessIssues();
  const checks = [
    ["Bank details replaced", !issues.some((issue) => issue.includes("bank") || issue.includes("account"))],
    ["Support WhatsApp connected", !issues.includes("Connect support WhatsApp")],
    ["Next shipment ETA visible", !issues.includes("Set next shipment ETA")],
    ["Active catalog published", !issues.includes("Publish at least one active product")],
    ["Shipment batch created", !issues.includes("Create first shipment batch")],
    ["Supabase + Netlify env set", true],
  ];
  target.innerHTML = checks.map(([label, ok]) => `
    <div class="checklist-row ${ok ? "done" : "todo"}">
      <span aria-hidden="true">${ok ? "✓" : "!"}</span>
      <strong>${label}</strong>
      <small>${ok ? "Ready" : "Needs attention"}</small>
    </div>
  `).join("");
}

function renderAdminOrders() {
  if (!has("[data-admin-orders]")) return;
  const filter = qs("[data-admin-order-filter]")?.value || "all";
  const rows = state.orders.filter((order) => filter === "all" || order.status === filter);
  const tableRows = rows.map((order) => {
    const payment = orderPaymentSummary(order);
    const due = amountDueForOrder(order);
    return `
    <tr class="order-row" data-action="view-order" data-order-id="${attr(order.id)}" tabindex="0">
      <td><strong>${esc(order.id)}</strong><br /><small>${new Date(order.created_at).toLocaleString()}</small></td>
      <td>${esc(order.customer_name)}<br /><small>${esc(order.customer_phone)} · ${esc(order.city)}</small><br /><small>${esc(order.priority || "Standard")} · Owner ${esc(order.owner || "Unassigned")}</small></td>
      <td>
        <select data-order-status="${attr(order.id)}" data-stop-row>
          ${ORDER_STEPS.map(([status, label]) => `<option value="${status}" ${order.status === status ? "selected" : ""}>${label}</option>`).join("")}
          <option value="cancelled" ${order.status === "cancelled" ? "selected" : ""}>Cancelled</option>
        </select>
        <small>${esc(orderCompletionRisk(order))} · ${esc(order.next_action || "No next action")}</small>
      </td>
      <td>${PKR.format(payment.total)}<br /><small>Due ${PKR.format(due)} · Advance ${PKR.format(payment.advanceDue)} · Balance ${PKR.format(payment.balanceDue)}</small></td>
      <td>
        <select data-order-payment="${attr(order.id)}" data-stop-row>
          ${PAYMENT_STATES.map(([status, label]) => `<option value="${status}" ${activePaymentStatusForOrder(order) === status ? "selected" : ""}>${label}</option>`).join("")}
        </select>
        <small>${esc(order.transfer_reference || "No reference")} · ${order.proof_url ? "Proof on file" : "No proof"}</small>
      </td>
      <td class="table-actions">
        <button class="button secondary" type="button" data-action="view-order" data-order-id="${attr(order.id)}" data-stop-row>Review</button>
        <button class="button primary" type="button" data-action="save-order-status" data-order-id="${attr(order.id)}" data-stop-row>Save</button>
        <small>${esc(order.local_courier || "Courier TBD")} · ${esc(order.tracking_number || "No tracking")}</small>
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
      <article class="admin-order-card" data-action="view-order" data-order-id="${attr(order.id)}" tabindex="0">
        <div class="panel-title-row">
          <div>
            <strong>${esc(order.id)}</strong>
            <small>${new Date(order.created_at).toLocaleString()} · ${esc(order.customer_name)}</small>
          </div>
          <span class="status-pill ${order.status === "pending_review" ? "preorder" : "in_stock"}">${esc(order.status.replaceAll("_", " "))}</span>
        </div>
        <div class="order-card-grid">
          <span><strong>${PKR.format(payment.total)}</strong><small>Total</small></span>
          <span><strong>${PKR.format(due)}</strong><small>Unpaid</small></span>
          <span><strong>${esc(paymentLabel(activePaymentStatusForOrder(order)))}</strong><small>Payment</small></span>
          <span><strong>${esc(batch ? batch.name : "No batch")}</strong><small>${batch ? formatDate(batch.eta_date) : "Assign after acceptance"}</small></span>
        </div>
        <p>${esc(order.next_action || "Review order and assign next step.")}</p>
        <div class="mini-actions">
          ${order.status === "pending_review" ? `<button class="button primary" type="button" data-action="accept-order" data-order-id="${attr(order.id)}" data-stop-row>Accept</button>` : ""}
          <button class="button secondary" type="button" data-action="view-order" data-order-id="${attr(order.id)}" data-stop-row>Review</button>
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
            <span class="status-pill ${batch.status === "arrived" ? "in_stock" : "preorder"}">${esc(batchStatusLabel(batch.status))}</span>
            <h3>${esc(batch.name)}</h3>
          </div>
          <strong>${formatDate(batch.eta_date) || "ETA pending"}</strong>
        </div>
        <p>${esc(batch.note || "No batch note added.")}</p>
        <div class="pipeline-row shipment-capacity">
          <span>Capacity</span>
          <span class="pipeline-bar"><span style="width:${fill}%"></span></span>
          <strong>${used}/${capacity}</strong>
        </div>
        <div class="batch-orders">
          ${assignedOrders.map((order) => `<button class="order-mini" type="button" data-action="view-order" data-order-id="${attr(order.id)}">${esc(order.id)}<span>${esc(order.customer_name)}</span></button>`).join("") || "<span>No orders assigned yet.</span>"}
        </div>
      </article>
    `;
  }).join(""));
}

function renderTrends() {
  setHTML("[data-trend-candidates]", state.trends.map((trend) => `
    <article class="trend-card${selectedTrends.has(trend.id) ? " selected" : ""}">
      <label class="card-select-wrap">
        <input type="checkbox" class="card-checkbox" data-trend-select="${attr(trend.id)}" ${selectedTrends.has(trend.id) ? "checked" : ""} />
      </label>
      ${trend.image_url
        ? `<img src="${safeUrl(imageUrl(trend.image_url), "")}" alt="${attr(trend.title)}" loading="lazy" decoding="async" onerror="this.replaceWith(Object.assign(document.createElement('div'), { className: 'trend-image-placeholder', textContent: 'Image review needed' }));" />`
        : `<div class="trend-image-placeholder">Image review needed</div>`}
      <span class="status-pill preorder">Trend score ${esc(trend.score)}</span>
      <h3>${esc(trend.title)}</h3>
      <p>${esc(trend.category)} · ${USD.format(trend.usa_price_usd)} · ${esc(trend.status)}</p>
      <div class="product-meta compact">
        <span>Completeness ${["title", "source_url", "image_url", "usa_price_usd"].filter((key) => trend[key]).length}/4</span>
        <span>${trend.source_url?.includes("http") ? "official-source check needed" : "source missing"}</span>
        <span>duplicate check pending</span>
      </div>
      <small>${esc(trend.batch_id || "Manual batch")} · ${esc(trend.production_status || "fetched")} · ${esc(trend.suggested_description || "Add final copy and media before approval.")}</small>
      <div class="mini-actions">
        <button class="button secondary" type="button" data-action="edit-trend" data-trend-id="${attr(trend.id)}">Edit</button>
        <button class="button primary" type="button" data-action="approve-trend" data-trend-id="${attr(trend.id)}">Approve</button>
        <button class="button secondary" type="button" data-action="reject-trend" data-trend-id="${attr(trend.id)}">Reject</button>
      </div>
    </article>
  `).join(""));
  updateTrendBulkBar();
}

// Bulk-bar labels: button text adapts to selection count instead of literally
// rendering "Remove 0 from site". Idle reads natural ("Remove from site"),
// active reads as a count ("Remove 5 from site"). Count chip in the "Select
// all" label shows total in scope, never empty.
function setBulkButtonLabel(button, count, labels) {
  if (!button) return;
  const text = count > 0 ? labels.active(count) : labels.idle;
  // Preserve any badge child elements we may add later; for now just text.
  button.textContent = text;
}

function updateTrendBulkBar() {
  const n = selectedTrends.size;
  const total = state.trends.length;
  qsa("[data-trends-total]").forEach((el) => { el.textContent = total; });
  qsa("[data-trends-bulk-bar] button").forEach((btn) => { btn.disabled = n === 0; });
  setBulkButtonLabel(qs("[data-trends-bulk-bar] [data-bulk-button='approve']"), n, {
    idle: "Save selected as drafts",
    active: (c) => `Save ${c} as draft${c === 1 ? "" : "s"}`,
  });
  setBulkButtonLabel(qs("[data-trends-bulk-bar] [data-bulk-button='deny']"), n, {
    idle: "Deny selected",
    active: (c) => `Deny ${c}`,
  });
  const selectAll = qs("[data-action='select-all-trends']");
  if (selectAll) selectAll.indeterminate = n > 0 && n < total;
  if (selectAll) selectAll.checked = n === total && total > 0;
}

function updateProductBulkBar() {
  const n = selectedProducts.size;
  const total = state.products.length;
  qsa("[data-products-total]").forEach((el) => { el.textContent = total; });
  qsa("[data-products-bulk-bar] button").forEach((btn) => { btn.disabled = n === 0; });
  setBulkButtonLabel(qs("[data-products-bulk-bar] [data-bulk-button='remove']"), n, {
    idle: "Remove from site",
    active: (c) => `Remove ${c} product${c === 1 ? "" : "s"}`,
  });
  const selectAll = qs("[data-action='select-all-products']");
  if (selectAll) selectAll.indeterminate = n > 0 && n < total;
  if (selectAll) selectAll.checked = n === total && total > 0;
}

function renderMarketing() {
  if (!has("[data-admin-panel=\"growth\"]")) return;

  const productOptions = state.products.map((product) => `
    <option value="${attr(product.id)}">${esc(product.title)}</option>
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
      <img src="${safeUrl(job.preview_url, "")}" alt="${attr(job.title)}" loading="lazy" />
      <div>
        <span class="status-pill ${job.status === "ready_for_remotion" ? "in_stock" : "preorder"}">${esc(job.status.replaceAll("_", " "))}</span>
        <h3>${esc(job.title)}</h3>
        <p>${esc(job.type)} · ${esc(job.channel)} · ${esc(job.source || "Content library")}</p>
        <small>${esc(job.hook)}</small>
      </div>
      <button class="button secondary" type="button" data-action="approve-creative" data-creative-id="${attr(job.id)}">Ready for Remotion</button>
    </article>
  `).join(""));

  setHTML("[data-campaigns]", state.campaigns.map((campaign) => `
    <article class="campaign-row">
      <div>
        <strong>${esc(campaign.name)}</strong>
        <small>${esc(campaign.channel)} · ${esc(campaign.status)} · ROAS ${campaign.budget_pkr ? (Number(campaign.revenue_pkr || 0) / Number(campaign.budget_pkr || 1)).toFixed(1) : "0.0"}x</small>
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
        <strong>${esc(lead.name)}</strong>
        <span>${esc(lead.source)} · ${esc(lead.sla)} · ${esc(lead.automation_status || "manual")}</span>
      </div>
      <p>${esc(lead.last_message)}</p>
      ${missingFields.length ? `<small>Missing: ${esc(missingFields.join(", "))}</small>` : ""}
      ${needsHuman ? `<small class="handoff-note">Human handoff: ${esc(lead.handoff_reason || "Needs owner review")}</small>` : ""}
      <div class="lead-footer">
        <small>${esc(lead.product)} · Owner ${esc(lead.owner || "Unassigned")}</small>
        <button class="button secondary" type="button" data-action="reply-lead" data-lead-id="${attr(lead.id)}">Reply</button>
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
      <article><strong>1. Intake</strong><span>Maychats forwards Instagram DMs to /api/webhooks/maychats and they become leads.</span></article>
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
        <strong>${esc(post.title)}</strong>
        <small>${esc(post.channel)} · ${esc(post.status)} · caption approval</small>
      </div>
    </article>
  `).join(""));

  setHTML("[data-integration-status]", `
    <article><strong>Instagram</strong><span>not connected · connect Maychats (MAYCHATS_API_KEY + webhook secret)</span></article>
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
    brand: "",
    marketing_badge: "",
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
  const imagePreview = qs("[data-image-preview]");
  if (imagePreview) {
    const url = prepared.image_url || "";
    // Preview uses the transform pipeline so the admin sees what customers see.
    imagePreview.src = url ? imageUrl(url, { width: 480, height: 480 }) : "";
    imagePreview.style.display = url ? "block" : "none";
  }
  // Reset the URL-import field and its status line so subsequent edits start clean.
  const urlImport = qs("[data-product-url-import]");
  if (urlImport) urlImport.value = "";
  const urlStatus = qs("[data-product-url-import-status]");
  if (urlStatus) urlStatus.textContent = "";
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
  renderSupportLinks();
  renderAdmin();
  renderMarketing();
}

// Clean-URL router (pushState) — replaces the legacy hashchange routing.
// Each public view has its own URL (/shop, /preorder, /track, /checkout,
// /faq), which lets Google index them and gives us per-route <title>/meta
// description for SEO. Netlify's catch-all redirect (in netlify.toml) sends
// every path back to /index.html so the SPA boots normally.

const ROUTE_TO_PATH = {
  home: "/",
  shop: "/shop",
  preorder: "/preorder",
  checkout: "/checkout",
  track: "/track",
  faq: "/faq",
};

const PATH_TO_ROUTE = {
  "/": "home",
  "": "home",
  "/shop": "shop",
  "/preorder": "preorder",
  "/checkout": "checkout",
  "/track": "track",
  "/faq": "faq",
};

const ROUTE_META = {
  home: {
    title: "Global Bestie | USA Luxury Finds in Pakistan",
    description: "Luxe import store for USA branded handbags, shoes, makeup, and preorder finds delivered to Pakistan.",
  },
  shop: {
    title: "Shop USA Branded Drops | Global Bestie",
    description: "Browse Global Bestie's curated USA-sourced handbags, shoes, and makeup with transparent PKR pricing.",
  },
  preorder: {
    title: "How Preorder Works | Global Bestie",
    description: "USA-to-Pakistan batch sourcing with 50% advance at checkout and the balance on Pakistan arrival.",
  },
  checkout: {
    title: "Checkout | Global Bestie",
    description: "Pay the 50% advance to confirm your Global Bestie order. We confirm your shipment batch on WhatsApp.",
  },
  track: {
    title: "Track Your Order | Global Bestie",
    description: "Follow your Global Bestie order from USA sourcing to Pakistan delivery.",
  },
  faq: {
    title: "FAQ | Global Bestie",
    description: "Common questions about Global Bestie's USA preorder service, payment, delivery, and authenticity.",
  },
  admin: {
    title: "Global Bestie Portal",
    description: "Internal Global Bestie operations portal.",
  },
};

function parseRoute() {
  // Portal pages run from /portal.html — that file forces the admin view.
  if (document.body.dataset.page === "portal") {
    return { viewName: "admin", params: new URLSearchParams(location.search) };
  }
  const path = location.pathname.replace(/\/+$/, "") || "/";
  const fromHash = location.hash.replace(/^#/, "");
  let viewName = PATH_TO_ROUTE[path];
  let params = new URLSearchParams(location.search);
  // Backward compatibility: any old #shop?category=foo link still works.
  if (!viewName && fromHash) {
    const [hashView, hashQuery] = fromHash.split("?");
    if (PATH_TO_ROUTE[`/${hashView}`] || hashView === "home") {
      viewName = hashView === "home" ? "home" : PATH_TO_ROUTE[`/${hashView}`];
      params = new URLSearchParams(hashQuery || "");
    }
  }
  return { viewName: viewName || "home", params };
}

function navigateTo(route, params) {
  const basePath = ROUTE_TO_PATH[route] || "/";
  const query = params ? `?${new URLSearchParams(params).toString()}` : "";
  const url = `${basePath}${query}`;
  if (url !== `${location.pathname}${location.search}`) {
    history.pushState({ route }, "", url);
  }
  return setRoute();
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
  document.body.dataset.activeView = safeView;

  // Per-route title + meta description for SEO.
  const meta = ROUTE_META[safeView];
  if (meta) {
    document.title = meta.title;
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute("content", meta.description);
  }

  // Mark the active nav link.
  qsa("[data-route]").forEach((link) => {
    link.toggleAttribute("data-current", link.dataset.route === safeView);
  });

  if (safeView === "shop") {
    state.filters.category = params.get("category") || "all";
    const category = qs("[data-filter-category]");
    if (category) category.value = state.filters.category;
    renderProducts();
  }
  if (safeView === "checkout") {
    setCartDrawerOpen(false);
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

function addToCart(productId, options = {}) {
  const product = state.products.find((item) => item.id === productId);
  if (!product) return;
  const existing = state.cart.find((line) => line.product_id === productId);
  // First add of this product → "fresh" (open drawer, show toast).
  // Subsequent increments from the in-card stepper → "quiet" (just update,
  // no drawer pop, no spam toast — supports rapid tap-tap-tap haul flow).
  const isFreshAdd = !existing;
  if (existing) existing.quantity += 1;
  else state.cart.push({ product_id: productId, quantity: 1, product });
  saveCart();
  renderCart();
  // Re-render product cards/grids so the stepper updates and the +/- shows
  // the new quantity without a full page render.
  renderProducts();
  if (options.checkout) {
    closeModal();
    setCartDrawerOpen(false);
    toast(`${product.title} added. Opening checkout.`);
    navigateTo("checkout");
  } else if (isFreshAdd) {
    setCartDrawerOpen(true);
    toast(`${product.title} added to bag.`);
  }
  // Quiet increments stay silent — the visible qty changing is feedback enough.
}

// Decrements a product line in the cart. Hitting "−" at qty 1 removes the
// product entirely. Used by the in-card stepper.
function decrementCart(productId) {
  const line = state.cart.find((l) => l.product_id === productId);
  if (!line) return;
  if (line.quantity > 1) {
    line.quantity -= 1;
  } else {
    state.cart = state.cart.filter((l) => l.product_id !== productId);
  }
  saveCart();
  renderCart();
  renderProducts();
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
    navigateTo("shop");
    return;
  }
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());
  if (!data.balance_ack || !data.terms_ack) {
    toast("Please confirm both checkboxes before placing your order.");
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
    eta: payment.hasPreorder ? nextShipmentLabel() : "Ready for dispatch after payment match",
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
  try {
    const created = await apiFetch("/api/orders", { method: "POST", body: JSON.stringify(order) }, { order: fallbackOrder });
    state.orders.unshift(created.order || fallbackOrder);
    state.cart = [];
    saveCart();
    form.reset();
    renderAll();
    toast(`Order ${created.order?.id || fallbackOrder.id} placed. We'll confirm your shipment batch on WhatsApp within ~15 minutes.`);
    await navigateTo("track");
    renderTracking(created.order || fallbackOrder);
  } catch {
    toast("Checkout could not be submitted. Please try again or message us on WhatsApp.");
  }
}

async function handleTrack(event) {
  event.preventDefault();
  const query = new FormData(event.currentTarget).get("query").trim().toLowerCase();
  const fallback = state.orders.find((order) =>
    [order.id, order.customer_phone].filter(Boolean).some((value) => String(value).toLowerCase().includes(query))
  );
  const result = await apiFetch(`/api/orders?query=${encodeURIComponent(query)}`, {}, { order: fallback || null });
  if (!result.order) {
    // Fallback: customer may have lost their order number or be searching with
    // the wrong phone. Surface the WhatsApp escape hatch directly so they
    // don't bounce off the page in frustration.
    const waNumber = String(state.settings.support_whatsapp || "").replace(/\D/g, "");
    const waHref = waNumber
      ? `https://wa.me/${waNumber}?text=${encodeURIComponent("Hi Global Bestie, I can't find my order. My phone number is: " + query)}`
      : "";
    setHTML(
      "[data-tracking-result]",
      `<h2>No order found</h2>
       <p>Double-check the order number (it looks like <code>GB-2026-1234</code>) or the WhatsApp number used at checkout.</p>
       <p class="track-fallback">Don't have your order number? ${
         waHref
           ? `<a href="${waHref}" target="_blank" rel="noreferrer">WhatsApp us your phone number</a> and we'll find your order.`
           : "WhatsApp our support number and we'll find your order for you."
       }</p>`
    );
    return;
  }
  renderTracking(result.order);
}

async function handleTrackingProof(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const orderId = form.dataset.orderId;
  const stage = form.dataset.paymentStage || "advance";
  const data = Object.fromEntries(new FormData(form).entries());
  const file = form.elements.transfer_file?.files?.[0];
  const order = state.orders.find((item) => item.id === orderId);
  const payload = {
    id: orderId,
    payment_stage: stage,
    customer_phone: data.customer_phone,
    transfer_reference: data.transfer_reference,
    transfer_file: await fileToPayload(file),
  };
  const result = await apiFetch("/api/orders", {
    method: "PATCH",
    body: JSON.stringify(payload),
  }, {
    order: {
      ...(order || {}),
      id: orderId,
      customer_phone: data.customer_phone,
      transfer_reference: data.transfer_reference,
      payment_status: stage === "balance" ? "balance_uploaded" : "advance_uploaded",
      proof_url: file?.name || "Proof uploaded",
      events: [
        ...(orderEvents(order) || []),
        { status: stage === "balance" ? "balance_uploaded" : "advance_uploaded", note: `${stage === "balance" ? "Balance" : "Advance"} proof uploaded by customer.`, created_at: new Date().toISOString() },
      ],
    },
  });
  const updated = { ...(order || {}), ...(result.order || {}) };
  const index = state.orders.findIndex((item) => item.id === orderId);
  if (index >= 0) state.orders[index] = updated;
  else state.orders.unshift(updated);
  renderTracking(updated);
  renderAdmin();
  toast(`${stage === "balance" ? "Balance" : "Advance"} proof sent for review.`);
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
  delete product.image_file;
  product.id = product.id || product.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  product.usa_price_usd = Number(product.usa_price_usd);
  product.shipping_pkr = Number(product.shipping_pkr);
  product.fx_rate = Number(product.fx_rate);
  product.inventory = Number(product.inventory);
  if (product.stock_mode === "in_stock" && product.inventory <= 0 && product.product_status === "active") {
    toast("Active in-stock products need inventory above 0.");
    return;
  }
  product.supplier_cost_pkr = Number(product.supplier_cost_pkr || 0);
  product.gallery_urls = String(product.gallery_urls || "").split(/\n|,/).map((url) => url.trim()).filter(Boolean);
  product.markup_rate = state.settings.markup_rate;
  product.featured = state.products.length < 3;
  product.preorder_weeks = product.stock_mode === "preorder" ? Number(state.settings.preorder_weeks || 4) : 0;
  product.status = product.product_status || "active";
  try {
    const saved = await apiFetch("/api/catalog", { method: "POST", body: JSON.stringify(product) }, { product });
    const index = state.products.findIndex((item) => item.id === product.id);
    if (index >= 0) state.products[index] = saved.product || product;
    else state.products.unshift(saved.product || product);
    renderAll();
    fillProductForm();
    toast("Product saved.");
  } catch {
    toast("Product could not be saved. Check the portal key and try again.");
  }
}

function normalizeImportedProduct(row) {
  const id = row.id || row.product_id || row.title?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return {
    id,
    title: row.title,
    brand: row.brand || row.title?.split(" ").slice(0, 2).join(" "),
    category: row.category || "handbags",
    description: row.description || row.suggested_description || "",
    usa_price_usd: Number(row.usa_price_usd || 0),
    shipping_pkr: Number(row.shipping_pkr || 0),
    fx_rate: Number(row.fx_rate || state.settings.fx_rate || 282),
    markup_rate: Number(row.markup_rate ?? state.settings.markup_rate ?? 0.25),
    stock_mode: row.stock_mode || "preorder",
    inventory: Number(row.inventory || 0),
    image_url: row.image_url || row.gallery_urls?.[0] || "",
    gallery_urls: Array.isArray(row.gallery_urls) ? row.gallery_urls : String(row.gallery_urls || "").split("|").map((url) => url.trim()).filter(Boolean),
    variants: row.variants || "Confirm variant before approval.",
    authenticity_note: row.authenticity_note || "Verify official source and receipt before publishing.",
    receipt_url: row.receipt_url || "",
    supplier_cost_pkr: Number(row.supplier_cost_pkr || 0),
    social_proof: row.social_proof || "",
    source_url: row.source_url || "",
    featured: false,
    preorder_weeks: Number(row.preorder_weeks || state.settings.preorder_weeks || 4),
    product_status: row.product_status || "draft",
    status: row.product_status || "draft",
  };
}

async function importProductsFromFile(file) {
  if (!file) return;
  const payload = JSON.parse(await file.text());
  const rows = Array.isArray(payload) ? payload : payload.productListings || payload.products || [];
  const products = rows.map(normalizeImportedProduct).filter((product) => product.id && product.title && product.image_url);
  if (!products.length) {
    toast("No importable products found in that file.");
    return;
  }
  for (const product of products) {
    const saved = await apiFetch("/api/catalog", { method: "POST", body: JSON.stringify(product) }, { product });
    const index = state.products.findIndex((item) => item.id === product.id);
    if (index >= 0) state.products[index] = saved.product || product;
    else state.products.unshift(saved.product || product);
  }
  renderAll();
  toast(`${products.length} product${products.length === 1 ? "" : "s"} imported as draft.`);
}

async function uploadProductImage(file) {
  if (!file) return;
  const uploaded = await apiFetch("/api/admin/upload", {
    method: "POST",
    body: JSON.stringify({ folder: "products", file: await fileToPayload(file) }),
  }, { publicUrl: URL.createObjectURL(file), configured: false });
  const form = qs("[data-product-editor]");
  if (form?.elements.image_url && uploaded.publicUrl) {
    form.elements.image_url.value = uploaded.publicUrl;
    const preview = qs("[data-image-preview]");
    if (preview) {
      preview.src = imageUrl(uploaded.publicUrl);
      preview.style.display = "block";
    }
    updatePricePreview();
  }
  toast("Product image uploaded and attached.");
}

// Calls /api/admin/fetch-product with a retailer URL and pastes the resulting
// candidate fields into the product editor form. Anything the user has
// already typed is preserved — autofill only writes empty fields, so it's
// safe to click again to top up missing data without losing edits.
//
// Note on environments: this endpoint is a Netlify Function. It does NOT run
// under `python3 -m http.server` (which is the documented local preview).
// To test autofill locally you either need `netlify dev` or to deploy to a
// branch preview. We detect the not-deployed case and tell the user, instead
// of silently failing.
async function importProductFromUrl() {
  const form = qs("[data-product-editor]");
  const input = qs("[data-product-url-import]");
  const status = qs("[data-product-url-import-status]");
  if (!form || !input) return;
  const url = input.value.trim();
  if (!url) {
    toast("Paste a product URL first.");
    return;
  }
  if (status) status.textContent = "Fetching retailer page…";

  // Bypass apiFetch here because we want to differentiate failure modes
  // (function not deployed vs. retailer blocked us vs. function returned an
  // error) — apiFetch's silent fallback hides all of that.
  let result;
  try {
    const headers = new Headers({ "Content-Type": "application/json" });
    if (state.adminToken) headers.set("Authorization", `Bearer ${state.adminToken}`);
    const response = await fetch("/api/admin/fetch-product", {
      method: "POST",
      headers,
      body: JSON.stringify({ url }),
    });
    if (response.status === 404) {
      const message = "URL autofill needs a deployed environment (Netlify) or `netlify dev` locally. The form still works manually — fill the fields and Save.";
      if (status) status.textContent = message;
      toast(message);
      return;
    }
    if (response.status === 401) {
      const message = "Portal session expired. Reload and unlock the portal again.";
      if (status) status.textContent = message;
      toast(message);
      return;
    }
    result = await response.json();
  } catch (err) {
    const message = "Couldn't reach the autofill endpoint. Check your connection — or fill the form manually.";
    if (status) status.textContent = message;
    toast(message);
    return;
  }
  if (result.error && !result.candidate) {
    // The function ran but couldn't extract anything — typically because the
    // retailer is bot-blocking. Show the server's message verbatim, plus a
    // hint that manual works.
    const message = `${result.error} You can still type the title, price, and image URL manually.`;
    if (status) status.textContent = message;
    toast(message);
    return;
  }
  const c = result.candidate || {};
  const writeIfEmpty = (name, value) => {
    const field = form.elements[name];
    if (!field || value === undefined || value === null || value === "") return;
    if (!String(field.value || "").trim()) field.value = value;
  };
  writeIfEmpty("title", c.title);
  writeIfEmpty("brand", c.brand);
  writeIfEmpty("category", c.category);
  writeIfEmpty("description", c.description);
  writeIfEmpty("usa_price_usd", c.usa_price_usd || "");
  writeIfEmpty("image_url", c.image_url);
  writeIfEmpty("source_url", c.source_url || url);
  writeIfEmpty("variants", c.variants);
  writeIfEmpty("authenticity_note", c.authenticity_note);
  if (form.elements.gallery_urls && c.gallery_urls?.length && !String(form.elements.gallery_urls.value || "").trim()) {
    form.elements.gallery_urls.value = c.gallery_urls.join("\n");
  }
  // Bump the image preview to the first image we got.
  const preview = qs("[data-image-preview]");
  if (preview && c.image_url) {
    preview.src = imageUrl(c.image_url);
    preview.style.display = "block";
  }
  updatePricePreview?.();
  const filled = ["title", "brand", "image_url", "usa_price_usd"].filter((k) => c[k]).length;
  if (status) status.textContent = `Filled ${filled}/4 key fields. Review and edit before saving.`;
  toast("Autofill complete — review the form before saving.");
}

async function saveSettings(event) {
  event.preventDefault();
  const settings = Object.fromEntries(new FormData(event.currentTarget).entries());
  settings.markup_rate = Number(settings.markup_rate);
  if (settings.markup_rate > 1) settings.markup_rate = settings.markup_rate / 100;
  settings.fx_rate = Number(settings.fx_rate);
  settings.preorder_weeks = Number(settings.preorder_weeks);
  settings.response_sla_minutes = Number(settings.response_sla_minutes || 15);
  try {
    const saved = await apiFetch("/api/admin/settings", { method: "POST", body: JSON.stringify(settings) }, { settings });
    state.settings = { ...state.settings, ...(saved.settings || settings) };
    renderAll();
    fillSettingsForm();
    toast("Settings saved.");
  } catch {
    toast("Settings could not be saved. Check the portal key and try again.");
  }
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

async function verifyOrderPayment(orderId, action) {
  const order = state.orders.find((item) => item.id === orderId);
  if (!order) return;
  const payment = orderPaymentSummary(order);
  const now = new Date().toISOString();
  if (action === "confirm_advance") {
    order.advance_paid_pkr = payment.advanceDue;
    order.payment_status = payment.balanceDue > 0 ? "advance_confirmed" : "paid_in_full";
    order.next_action = payment.balanceDue > 0
      ? "Advance confirmed. Source or ship order, then collect balance after Pakistan arrival."
      : "Payment confirmed. Prepare for dispatch.";
  }
  if (action === "confirm_balance") {
    order.balance_paid_pkr = payment.balanceDue;
    order.payment_status = "paid_in_full";
    order.next_action = "Payment complete. Dispatch locally and add courier tracking.";
  }
  if (action === "reject_payment") {
    order.payment_status = "payment_rejected";
    order.next_action = "Ask customer to resend transfer proof or confirm sender account.";
  }
  order.events = [
    ...(order.events || []),
    { status: order.payment_status, note: `Admin payment action: ${action.replaceAll("_", " ")}.`, created_at: now },
  ];
  const result = await apiFetch(`/api/admin/orders/${orderId}`, {
    method: "PATCH",
    body: JSON.stringify({
      payment_action: action,
      order,
      note: `Admin payment action: ${action.replaceAll("_", " ")}.`,
    }),
  }, { order });
  const index = state.orders.findIndex((item) => item.id === orderId);
  if (index >= 0 && result.order) state.orders[index] = { ...state.orders[index], ...result.order };
  renderAll();
  showOrderDetails(orderId);
  toast("Payment status updated.");
}

async function assignShipmentBatch(orderId) {
  const order = state.orders.find((item) => item.id === orderId);
  const batchId = qs(`[data-order-batch="${orderId}"]`)?.value;
  const batch = state.shipmentBatches.find((item) => item.id === batchId);
  if (!order || !batch) {
    toast("Choose a shipment batch first.");
    return;
  }
  state.shipmentBatches.forEach((item) => {
    item.order_ids = (item.order_ids || []).filter((id) => id !== orderId);
    item.used = Math.max(0, Number(item.used || 0) - (item.id !== batch.id ? 0 : 0));
  });
  batch.order_ids = Array.from(new Set([...(batch.order_ids || []), orderId]));
  batch.used = Math.max(Number(batch.used || 0), batch.order_ids.length);
  order.eta = `${batch.name} ETA: ${formatDate(batch.eta_date)}`;
  order.next_action = `Assigned to ${batch.name}. Keep customer updated if the ETA changes.`;
  order.events = [
    ...(order.events || []),
    { status: order.status, note: `Order assigned to shipment batch ${batch.name}.`, created_at: new Date().toISOString() },
  ];
  await apiFetch("/api/admin/shipments", { method: "POST", body: JSON.stringify(batch) }, { shipmentBatch: batch });
  const result = await apiFetch(`/api/admin/orders/${orderId}`, {
    method: "PATCH",
    body: JSON.stringify({
      updates: { eta: order.eta, next_action: order.next_action },
      note: `Order assigned to shipment batch ${batch.name}.`,
    }),
  }, { order });
  const index = state.orders.findIndex((item) => item.id === orderId);
  if (index >= 0 && result.order) state.orders[index] = { ...state.orders[index], ...result.order };
  renderAll();
  showOrderDetails(orderId);
  toast("Shipment batch assigned.");
}

async function markBalanceDue(orderId) {
  const order = state.orders.find((item) => item.id === orderId);
  if (!order) return;
  order.status = "pakistan_processing";
  order.payment_status = "balance_due";
  order.next_action = "Send balance reminder and hold local dispatch until proof is confirmed.";
  order.events = [
    ...(order.events || []),
    { status: "pakistan_processing", note: "Shipment marked as arrived in Pakistan. Remaining balance is now due before local dispatch.", created_at: new Date().toISOString() },
  ];
  const result = await apiFetch(`/api/admin/orders/${orderId}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "pakistan_processing",
      payment_status: "balance_due",
      next_action: order.next_action,
      note: "Shipment marked as arrived in Pakistan. Remaining balance is now due before local dispatch.",
    }),
  }, { order });
  const index = state.orders.findIndex((item) => item.id === orderId);
  if (index >= 0 && result.order) state.orders[index] = { ...state.orders[index], ...result.order };
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

async function saveOrderNote(orderId) {
  const order = state.orders.find((item) => item.id === orderId);
  const note = qs(`[data-order-note="${orderId}"]`)?.value || "";
  if (!order) return;
  order.internal_notes = note;
  order.events = [
    ...(order.events || []),
    { status: order.status, note: "Internal note updated.", created_at: new Date().toISOString() },
  ];
  const result = await apiFetch(`/api/admin/orders/${orderId}`, {
    method: "PATCH",
    body: JSON.stringify({
      updates: { internal_notes: note },
      note: "Internal note updated.",
    }),
  }, { order });
  const index = state.orders.findIndex((item) => item.id === orderId);
  if (index >= 0 && result.order) state.orders[index] = { ...state.orders[index], ...result.order };
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
  const product = state.products.find((item) => item.title === lead.product);
  const suggested = `Hi ${lead.name.split(" ")[0]}, yes bestie. Please share your city, WhatsApp number, and exact ${product?.category === "makeup" ? "shade" : "size/color"} so we can confirm availability and final PKR price before payment.`;
  openModal(`
    <div class="lead-reply-modal">
      <p class="kicker">${lead.source} · ${lead.sla || "SLA pending"}</p>
      <h2>${lead.name}</h2>
      <div class="payment-ledger">
        <article><span>Product</span><strong>${lead.product || "Not captured"}</strong></article>
        <article><span>Stage</span><strong>${lead.stage.replaceAll("_", " ")}</strong></article>
        <article><span>Owner</span><strong>${lead.owner || "Unassigned"}</strong></article>
      </div>
      <div class="message-thread">
        <article class="inbound"><strong>Latest message</strong><p>${lead.last_message || "No message synced."}</p></article>
      </div>
      <form class="lead-reply-form" data-lead-reply-form data-lead-id="${lead.id}">
        <div class="form-grid">
          <label>Owner<input name="owner" value="${lead.owner === "Unassigned" ? "Team" : (lead.owner || "Team")}" /></label>
          <label>Stage
            <select name="stage">
              ${["new", "quote_sent", "order_ready", "won", "lost"].map((stage) => `<option value="${stage}" ${lead.stage === stage ? "selected" : ""}>${stage.replaceAll("_", " ")}</option>`).join("")}
            </select>
          </label>
        </div>
        <label>Reply template<textarea name="reply" rows="5">${suggested}</textarea></label>
        <button class="button primary wide" type="submit">Save reply and mark handled</button>
      </form>
    </div>
  `);
}

async function handleLeadReply(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const lead = state.leads.find((item) => item.id === form.dataset.leadId);
  if (!lead) return;
  const data = Object.fromEntries(new FormData(form).entries());
  lead.stage = data.stage || "quote_sent";
  lead.owner = data.owner || "Team";
  lead.automation_status = "manual";
  lead.last_message = data.reply;
  lead.messages = [
    ...(lead.messages || []),
    { source: lead.source, direction: "outbound", body: data.reply, created_at: new Date().toISOString() },
  ];
  const saved = await apiFetch("/api/admin/marketing", {
    method: "POST",
    body: JSON.stringify({ type: "lead", payload: lead }),
  }, { lead });
  const index = state.leads.findIndex((item) => item.id === lead.id);
  if (index >= 0 && saved.lead) state.leads[index] = { ...state.leads[index], ...saved.lead };
  closeModal();
  renderMarketing();
  toast(`Lead reply saved for ${lead.name}.`);
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

// Approve-trend is now a modal-driven flow with required fields. Required:
// title, brand, category, description (>= 60 chars), USA price > 0, image,
// variants note. Everything else is optional. Submit is disabled until all
// required fields are valid. On success the new product is published live
// (status = active). The legacy one-click "approve" — which silently shipped
// half-empty SKUs — is gone on purpose.
const REQUIRED_FOR_PUBLISH = ["title", "brand", "category", "description", "usa_price_usd", "image_url", "variants"];

function approveTrend(trendId) {
  const trend = state.trends.find((item) => item.id === trendId);
  if (!trend) return;
  showApproveTrendModal(trend);
}

function showApproveTrendModal(trend) {
  const gallery = Array.isArray(trend.asset_urls) && trend.asset_urls.length ? trend.asset_urls : [trend.image_url].filter(Boolean);
  const trendId = trend.id;
  openModal(`
    <div class="modal-grid trend-approve-modal" data-approve-modal>
      <div class="trend-approve-media">
        <img id="trend-approve-preview" src="${imageUrl(trend.image_url || "", { width: 540, height: 540 })}" alt="${trend.title || "preview"}" onerror="this.style.opacity='0.3'" decoding="async" />
        ${gallery.length > 1 ? `
          <div class="approve-gallery-strip">
            ${gallery.slice(0, 6).map((url, i) => `
              <button class="approve-gallery-thumb${i === 0 ? " active" : ""}" type="button" data-action="approve-gallery-swap" data-gallery-url="${url}">
                <img src="${imageUrlThumb(url)}" alt="preview ${i + 1}" loading="lazy" />
              </button>
            `).join("")}
          </div>
        ` : ""}
      </div>
      <form class="trend-approve-form" data-approve-form>
        <p class="kicker">Complete &amp; publish</p>
        <h2>Publish this product</h2>
        <p class="approve-helper">Required fields must be filled before publish. Everything is editable later.</p>

        <input type="hidden" name="trend_id" value="${trendId}" />

        <label class="span-2">Title<input name="title" value="${(trend.title || "").replace(/"/g, "&quot;")}" required /></label>
        <label>Brand<input name="brand" value="${(trend.brand || "").replace(/"/g, "&quot;")}" placeholder="Coach, Nike, Rare Beauty…" required /></label>
        <label>Category
          <select name="category" required>
            ${["handbags","shoes","makeup","fragrance","accessories"].map((c) =>
              `<option value="${c}" ${trend.category === c ? "selected" : ""}>${c}</option>`
            ).join("")}
          </select>
        </label>
        <label>USA price USD<input name="usa_price_usd" type="number" min="0.01" step="0.01" value="${trend.usa_price_usd || ""}" required /></label>
        <label>Shipping PKR<input name="shipping_pkr" type="number" min="0" step="100" value="${trend.shipping_pkr || ""}" /></label>
        <label>Stock mode
          <select name="stock_mode">
            <option value="preorder" selected>Preorder</option>
            <option value="in_stock">In stock</option>
          </select>
        </label>
        <label>Marketing badge (optional)<input name="marketing_badge" placeholder="Frequently requested · VIP drop" /></label>

        <label class="span-2">Description<textarea name="description" rows="3" required minlength="60" placeholder="At least one solid sentence describing fit, materials, why customers want it. Min 60 chars.">${(trend.suggested_description || "").replace(/</g, "&lt;")}</textarea></label>

        <label class="span-2">Variants note<textarea name="variants" rows="2" required>${(trend.variants || "Variant options on request.").replace(/</g, "&lt;")}</textarea></label>

        <label class="span-2">Primary image URL<input name="image_url" value="${(trend.image_url || "").replace(/"/g, "&quot;")}" required id="trend-approve-image-url" /></label>

        <label class="span-2">Upload image (replaces primary)
          <input type="file" accept="image/*" data-approve-image-upload />
          <small data-approve-image-status></small>
        </label>

        <label class="span-2">Gallery URLs (one per line, optional)<textarea name="gallery_urls" rows="2">${gallery.join("\n")}</textarea></label>

        <label class="span-2">Authenticity note (optional)<textarea name="authenticity_note" rows="2">${(trend.authenticity_note || "").replace(/</g, "&lt;")}</textarea></label>

        <label>Source URL (optional)<input name="source_url" value="${(trend.source_url || "").replace(/"/g, "&quot;")}" placeholder="Official product page" /></label>
        <label>Receipt URL (optional)<input name="receipt_url" placeholder="Internal proof link" /></label>

        <output class="approve-validation" data-approve-validation></output>
        <div class="mini-actions span-2 approve-actions">
          <button class="button primary" type="submit" data-approve-submit>Publish to shop</button>
          <button class="button secondary" type="button" data-action="close-modal">Cancel</button>
        </div>
      </form>
    </div>
  `);

  const form = qs("[data-approve-form]");
  const validation = qs("[data-approve-validation]");
  const submit = qs("[data-approve-submit]");
  const imageInput = qs("#trend-approve-image-url");
  const previewImg = qs("#trend-approve-preview");

  function validateApproveForm() {
    const data = Object.fromEntries(new FormData(form).entries());
    const missing = [];
    if (!data.title) missing.push("title");
    if (!data.brand) missing.push("brand");
    if (!data.category) missing.push("category");
    if (!data.description || data.description.length < 60) missing.push("description (60+ chars)");
    if (!Number(data.usa_price_usd) || Number(data.usa_price_usd) <= 0) missing.push("USA price");
    if (!data.image_url) missing.push("primary image");
    if (!data.variants) missing.push("variants note");
    if (validation) {
      validation.textContent = missing.length ? `Missing: ${missing.join(", ")}` : "All required fields filled. Ready to publish.";
      validation.className = `approve-validation ${missing.length ? "is-incomplete" : "is-ready"}`;
    }
    if (submit) submit.disabled = missing.length > 0;
  }
  form.addEventListener("input", validateApproveForm);
  validateApproveForm();

  if (imageInput && previewImg) {
    imageInput.addEventListener("input", () => {
      previewImg.src = imageUrl(imageInput.value.trim(), { width: 540, height: 540 });
    });
  }

  // Inline image upload — same /api/admin/upload endpoint as the product editor,
  // writes the resulting public URL into the primary image field.
  qs("[data-approve-image-upload]")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const statusEl = qs("[data-approve-image-status]");
    if (statusEl) statusEl.textContent = "Uploading…";
    const uploaded = await apiFetch(
      "/api/admin/upload",
      { method: "POST", body: JSON.stringify({ folder: "products", file: await fileToPayload(file) }) },
      { publicUrl: URL.createObjectURL(file), configured: false }
    );
    if (uploaded.publicUrl && imageInput) {
      imageInput.value = uploaded.publicUrl;
      imageInput.dispatchEvent(new Event("input", { bubbles: true }));
    }
    if (statusEl) statusEl.textContent = "Uploaded.";
    event.target.value = "";
    validateApproveForm();
  });

  // Gallery swap — clicking a thumb sets that URL as the primary image.
  qs("[data-approve-modal]")?.addEventListener("click", (event) => {
    const swap = event.target.closest("[data-action='approve-gallery-swap']");
    if (!swap) return;
    if (imageInput) {
      imageInput.value = swap.dataset.galleryUrl || "";
      imageInput.dispatchEvent(new Event("input", { bubbles: true }));
    }
    qsa(".approve-gallery-thumb").forEach((t) => t.classList.toggle("active", t === swap));
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submit?.disabled) return;
    const data = Object.fromEntries(new FormData(form).entries());
    const product = {
      id: (trend.id || data.title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + Date.now().toString(36),
      title: data.title,
      brand: data.brand,
      category: data.category,
      description: data.description,
      usa_price_usd: Number(data.usa_price_usd),
      shipping_pkr: Number(data.shipping_pkr || 0),
      fx_rate: state.settings.fx_rate,
      markup_rate: state.settings.markup_rate,
      stock_mode: data.stock_mode || "preorder",
      inventory: data.stock_mode === "in_stock" ? 1 : 0,
      image_url: data.image_url,
      gallery_urls: String(data.gallery_urls || "").split(/\n|,/).map((u) => u.trim()).filter(Boolean),
      variants: data.variants,
      authenticity_note: data.authenticity_note || "",
      source_url: data.source_url || "",
      receipt_url: data.receipt_url || "",
      marketing_badge: data.marketing_badge || "",
      featured: false,
      preorder_weeks: state.settings.preorder_weeks,
      status: "active",
      product_status: "active",
    };
    await apiFetch(`/api/admin/trends/${trendId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "approved", product }),
    }, { product });
    state.products.unshift(product);
    state.trends = state.trends.filter((item) => item.id !== trendId);
    closeModal();
    renderAll();
    toast("Product published to shop.");
  });
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

// Bulk approve pushes selected trends to DRAFTS rather than live. Drafts are
// not visible on the storefront. The user finishes each one through the same
// single-approve modal before going live. This keeps the "required fields
// before publish" rule intact while still letting the user triage 20+ trends
// quickly into a working set.
async function bulkApproveTrends() {
  if (!selectedTrends.size) return;
  const ids = [...selectedTrends];
  const fallbackProducts = ids.map((id) => {
    const trend = state.trends.find((t) => t.id === id);
    if (!trend) return null;
    return {
      id: trend.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + Date.now().toString(36),
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
      variants: trend.variants || "Variant options on request.",
      authenticity_note: trend.authenticity_note || "",
      featured: false,
      preorder_weeks: state.settings.preorder_weeks,
      // Critical: bulk goes to drafts. Only the single-approve modal publishes
      // live, after the required fields pass validation.
      status: "draft",
      product_status: "draft",
    };
  }).filter(Boolean);

  await apiFetch("/api/admin/trends/bulk", {
    method: "POST",
    body: JSON.stringify({ ids, action: "approved", target_status: "draft" }),
  }, { updated: ids.length, productsCreated: fallbackProducts.length });

  fallbackProducts.forEach((product) => state.products.unshift(product));
  state.trends = state.trends.filter((t) => !selectedTrends.has(t.id));
  selectedTrends.clear();
  renderAll();
  toast(`${ids.length} candidate${ids.length === 1 ? "" : "s"} saved as drafts. Finish in Products to publish.`);
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

function showEditTrendModal(trendId) {
  const trend = state.trends.find((t) => t.id === trendId);
  if (!trend) return;
  openModal(`
    <div class="modal-grid trend-edit-modal">
      <div class="trend-edit-media">
        <img id="trend-preview-img" src="${imageUrl(trend.image_url || "")}" alt="${trend.title}" onerror="this.style.opacity='0.3'" decoding="async" />
      </div>
      <div>
        <p class="kicker">Edit trend candidate</p>
        <h2>${trend.title}</h2>
        <form class="trend-edit-form" id="trend-edit-form-${trendId}">
          <input type="hidden" name="id" value="${trendId}" />
          <label>Title<input name="title" value="${trend.title || ""}" required /></label>
          <label>Category
            <select name="category">
              ${["handbags","shoes","makeup","fragrance","accessories"].map((c) =>
                `<option value="${c}" ${trend.category === c ? "selected" : ""}>${c}</option>`
              ).join("")}
            </select>
          </label>
          <label>Image URL
            <input name="image_url" value="${trend.image_url || ""}" placeholder="https://…" id="trend-image-url-input" />
          </label>
          <label>Source URL<input name="source_url" value="${trend.source_url || ""}" placeholder="Official product page" /></label>
          <label>USA price USD<input name="usa_price_usd" type="number" min="0" step="0.01" value="${trend.usa_price_usd || ""}" /></label>
          <label>Shipping PKR<input name="shipping_pkr" type="number" min="0" step="100" value="${trend.shipping_pkr || ""}" /></label>
          <label class="span-2">Description / copy
            <textarea name="suggested_description" rows="3">${trend.suggested_description || ""}</textarea>
          </label>
          <div class="mini-actions span-2">
            <button class="button primary" type="submit">Save changes</button>
            <button class="button primary" type="button" data-action="approve-trend" data-trend-id="${trendId}">Approve to shop</button>
            <button class="button secondary" type="button" data-action="close-modal">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  `);
  const imgInput = qs("#trend-image-url-input");
  const previewImg = qs("#trend-preview-img");
  if (imgInput && previewImg) {
    imgInput.addEventListener("input", () => {
      previewImg.src = imgInput.value.trim() || "";
    });
  }
  qs(`#trend-edit-form-${trendId}`)?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget).entries());
    const index = state.trends.findIndex((t) => t.id === trendId);
    if (index >= 0) {
      state.trends[index] = {
        ...state.trends[index],
        title: data.title,
        category: data.category,
        image_url: data.image_url,
        source_url: data.source_url,
        usa_price_usd: Number(data.usa_price_usd || state.trends[index].usa_price_usd),
        shipping_pkr: Number(data.shipping_pkr || state.trends[index].shipping_pkr),
        suggested_description: data.suggested_description,
      };
    }
    await apiFetch(`/api/admin/trends/${trendId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }, {});
    closeModal();
    renderTrends();
    toast("Trend candidate updated.");
  });
}

function wireEvents() {
  // pushState transitions don't fire hashchange — popstate covers back/forward.
  window.addEventListener("popstate", setRoute);
  window.addEventListener("hashchange", setRoute);

  // Intercept clicks on internal links so we never reload the page. Any anchor
  // with [data-route] (or a same-origin href that maps to a known route) is
  // handled in-app via history.pushState.
  document.addEventListener("click", (event) => {
    if (event.defaultPrevented) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.target.closest("a[href]");
    if (!anchor) return;
    if (anchor.target && anchor.target !== "_self") return;
    if (anchor.hasAttribute("download")) return;
    const href = anchor.getAttribute("href");
    if (!href) return;
    const route =
      anchor.dataset.route ||
      (href.startsWith("/") ? PATH_TO_ROUTE[href.split("?")[0]] : null);
    if (!route) return;
    event.preventDefault();
    // Preserve the empty-cart guard for the drawer's Checkout link.
    if (anchor.dataset.action === "checkout" && !state.cart.length) {
      toast("Your bag is empty.");
      return;
    }
    const queryString = href.includes("?") ? href.split("?")[1] : "";
    const params = queryString ? Object.fromEntries(new URLSearchParams(queryString).entries()) : null;
    // Close the cart drawer on any internal navigation — this also fixes the
    // "Checkout" link inside the open cart drawer (#8).
    setCartDrawerOpen(false);
    navigateTo(route, params);
  });
  window.addEventListener("scroll", () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const progress = max > 0 ? (window.scrollY / max) * 100 : 0;
    document.documentElement.style.setProperty("--scroll-progress", `${progress}%`);
    const header = qs(".site-header");
    if (header) header.dataset.elevated = String(window.scrollY > 10);
  }, { passive: true });

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-stop-row]") && !event.target.closest("button[data-action]")) return;
    const tabJump = event.target.closest("[data-admin-tab-jump]");
    if (tabJump) {
      event.stopPropagation();
      qs(`[data-admin-tab="${tabJump.dataset.adminTabJump}"]`)?.click();
      return;
    }
    const target = event.target.closest("[data-action]");
    if (!target) return;
    event.stopPropagation();
    const action = target.dataset.action;
    const productId = target.dataset.productId;
    const orderId = target.dataset.orderId;
    const trendId = target.dataset.trendId;
    if (action === "close-modal") return closeModal();
    if (action === "gallery-swap") {
      const url = target.dataset.galleryUrl;
      const mainImg = qs("#gallery-main-img");
      if (mainImg && url) mainImg.src = url;
      qsa(".gallery-thumb").forEach((btn) => btn.classList.toggle("active", btn === target));
      return;
    }
    if (action === "jump-settings") {
      event.preventDefault();
      qs("[data-admin-tab=\"settings\"]")?.click();
      qs("[data-admin-panel=\"settings\"]")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (action === "save-sourcing") {
      const row = target.closest("[data-sourcing-row]");
      const cost = row?.querySelector("[data-sourcing-cost]")?.value;
      const date = row?.querySelector("[data-sourcing-date]")?.value;
      return saveSourcing(target.dataset.orderId, target.dataset.itemKey, cost, date);
    }
    if (action === "import-from-url") {
      event.preventDefault();
      return importProductFromUrl();
    }
    if (action === "open-cart") return setCartDrawerOpen(true);
    if (action === "close-cart") return setCartDrawerOpen(false);
    // Note: action="checkout" guard is handled in the anchor click handler
    // above, which fires before this one and short-circuits navigation when
    // the cart is empty.
    if (action === "add-cart") return addToCart(productId);
    if (action === "add-checkout") return addToCart(productId, { checkout: true });
    if (action === "decrement-cart") return decrementCart(productId);
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
    if (action === "confirm-advance") return verifyOrderPayment(orderId, "confirm_advance");
    if (action === "confirm-balance") return verifyOrderPayment(orderId, "confirm_balance");
    if (action === "reject-payment") return verifyOrderPayment(orderId, "reject_payment");
    if (action === "assign-shipment-batch") return assignShipmentBatch(orderId);
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
    if (action === "edit-trend") return showEditTrendModal(trendId);
    if (action === "approve-trend") return approveTrend(trendId);
    if (action === "reject-trend") return rejectTrend(trendId);
    if (action === "approve-creative") return approveCreative(target.dataset.creativeId);
    if (action === "reply-lead") return replyLead(target.dataset.leadId);
    if (action === "sync-marketing") return syncMarketing();
    if (action === "new-campaign") return qs("[data-campaign-form] input[name='name']")?.focus();
    if (action === "export-ledger-csv") return exportLedgerCsv();
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
    if (event.key === "Enter" && event.target.matches("[data-action='view-product']")) {
      showProductDetails(event.target.dataset.productId);
    }
  });

  // FAQ items are now native <details>/<summary>, so the browser handles open
  // state and keyboard interactions for free. No JS wiring needed.

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

  qsa("[data-admin-tab-jump]").forEach((button) => {
    button.addEventListener("click", () => {
      qs(`[data-admin-tab="${button.dataset.adminTabJump}"]`)?.click();
    });
  });

  qsa("[data-growth-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      const value = tab.dataset.growthTab;
      qsa("[data-growth-tab]").forEach((item) => item.classList.toggle("active", item === tab));
      qsa("[data-growth-pane]").forEach((pane) => {
        const groups = String(pane.dataset.growthPane || "").split(/\s+/);
        pane.hidden = value !== "all" && !groups.includes(value);
      });
    });
  });

  qsa("[data-order-filter-chip]").forEach((chip) => {
    chip.addEventListener("click", () => {
      const select = qs("[data-admin-order-filter]");
      if (select) select.value = chip.dataset.orderFilterChip;
      qsa("[data-order-filter-chip]").forEach((item) => item.classList.toggle("active", item === chip));
      renderAdminOrders();
    });
  });

  qs("[data-checkout-form]")?.addEventListener("submit", handleCheckout);
  qs("[data-track-form]")?.addEventListener("submit", handleTrack);
  document.addEventListener("submit", (event) => {
    if (event.target.matches("[data-tracking-proof-form]")) return handleTrackingProof(event);
    if (event.target.matches("[data-lead-reply-form]")) return handleLeadReply(event);
  });
  qs("[data-admin-login]")?.addEventListener("submit", handleAdminLogin);
  qs("[data-product-editor]")?.addEventListener("submit", saveProduct);
  qs("[data-product-editor]")?.addEventListener("input", (e) => {
    updatePricePreview();
    if (e.target.name === "image_url") {
      const preview = qs("[data-image-preview]");
      if (!preview) return;
      const url = e.target.value.trim();
      preview.src = url;
      preview.style.display = url ? "block" : "none";
    }
  });
  qs("[data-product-import]")?.addEventListener("change", (event) => {
    importProductsFromFile(event.target.files?.[0]).finally(() => {
      event.target.value = "";
    });
  });
  qs("[data-product-image-upload]")?.addEventListener("change", (event) => {
    uploadProductImage(event.target.files?.[0]).finally(() => {
      event.target.value = "";
    });
  });

  // Cashflow real-photo nudge: file input is rendered dynamically inside the
  // sourcing queue, so we listen at the document level for any change event
  // matching the data attribute.
  document.addEventListener("change", (event) => {
    const input = event.target.closest("[data-real-photo-upload]");
    if (!input) return;
    const files = Array.from(input.files || []);
    if (!files.length) return;
    uploadRealPhotosForItem(input.dataset.orderId, input.dataset.itemKey, files).finally(() => {
      input.value = "";
    });
  });
  qs("[data-settings-form]")?.addEventListener("submit", saveSettings);
  qs("[data-admin-order-filter]")?.addEventListener("input", renderAdminOrders);
  qs("[data-shipment-form]")?.addEventListener("submit", createShipmentBatch);
  qs("[data-creative-form]")?.addEventListener("submit", queueCreative);
  qs("[data-campaign-form]")?.addEventListener("submit", createCampaign);

  // Cashflow ledger filters — re-render only the table on change so the rest
  // of the panel keeps its scroll position.
  qsa("[data-ledger-batch], [data-ledger-stage], [data-ledger-payment], [data-ledger-search]").forEach((control) => {
    control.addEventListener("input", renderLedger);
  });

  // Sourcing queue: also save on Enter from the USD cost input.
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    const input = event.target.closest("[data-sourcing-cost], [data-sourcing-date]");
    if (!input) return;
    event.preventDefault();
    const row = input.closest("[data-sourcing-row]");
    if (!row) return;
    const cost = row.querySelector("[data-sourcing-cost]")?.value;
    const date = row.querySelector("[data-sourcing-date]")?.value;
    saveSourcing(row.dataset.orderId, row.dataset.itemKey, cost, date);
  });
}

function initReveal() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("visible");
      const staggerTargets = entry.target.querySelectorAll(
        ".process-rail article, .collection-tile, .clarity-grid article, .faq-item, .policy-list li"
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

function init() {
  wireEvents();
  fillProductForm();
  if (state.adminToken) {
    qs("[data-admin-login]")?.classList.add("hidden");
    qs("[data-admin-content]")?.classList.remove("hidden");
    refreshAdmin();
  }
  setRoute();
  renderAll();
  animateHeroText();
  initReveal();
  loadRemoteData();
}

init();
