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

// Compact stage labels for dense table chips / the Advance button.
const ORDER_STAGE_SHORT = {
  pending_review: "Received",
  accepted: "Accepted",
  sourcing: "Sourcing",
  in_transit: "In transit",
  pakistan_processing: "Arrived PK",
  delivered: "Delivered",
};

// The next forward stage for an order, or null at the end (delivered/cancelled).
function nextOrderStage(status) {
  const i = ORDER_STEPS.findIndex(([s]) => s === status);
  if (i < 0 || i >= ORDER_STEPS.length - 1) return null;
  return ORDER_STEPS[i + 1][0];
}

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

// IMPORTANT: the bank values below are PLACEHOLDERS — the all-zeros
// account number and IBAN must be replaced (in the Supabase `settings`
// row that drives production) BEFORE the checkout flow can accept real
// transfers. The renderBankDetails() function below logs a console.warn
// while these defaults are still in play, so we notice during QA.
const sampleSettings = {
  bank_name: "Meezan Bank",
  account_title: "Global Bestie Imports",
  account_number: "0210-0000-000000", // TODO: replace with real account before going live
  iban: "PK00MEZN0000000000000000",   // TODO: replace with real IBAN before going live
  markup_rate: 0.25,
  fx_rate: 282,
  preorder_weeks: 4,
  next_shipment_date: "2026-06-02",
  shipment_notice: "Next USA batch is being consolidated. Dates can shift slightly based on brand dispatch and customs clearance.",
  // Customer-visible announcement ribbon. `batch_doorstep_window` is the
  // human label ("May 25-27") and `batch_doorstep_until` is the last day
  // the label is still relevant — once today > that date, the doorstep
  // line auto-hides so we never show a stale promise. Both are settings
  // so the admin can rotate them without a deploy.
  batch_doorstep_window: "May 25-27",
  batch_doorstep_until: "2026-05-27",
  business_hours: "11 AM - 9 PM PKT",
  response_sla_minutes: 15,
  city_delivery_fees: "Karachi 450, Lahore 550, Islamabad/Rawalpindi 650, other cities quoted",
  shipping_rules: "Handbags 12k-18k, shoes 9k-13k, makeup 3.5k-6k, fragrance quoted by weight.",
  balance_reminder_template: "Hi {name}, your Global Bestie preorder has arrived in Pakistan. Remaining balance: {balance}. Please transfer before local dispatch.",
  support_whatsapp: "+13362556023",
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
    id: "GB-2026-0998",
    customer_name: "Hina Raza",
    customer_phone: "03008887777",
    customer_email: "hina@example.com",
    customer_instagram: "@hinaraza",
    city: "Lahore",
    address: "Gulberg III, Lahore",
    channel: "WhatsApp",
    owner: "Sara",
    priority: "Standard",
    status: "cancelled",
    payment_status: "advance_confirmed",
    total_pkr: 48000,
    advance_due_pkr: 24000,
    balance_due_pkr: 24000,
    advance_paid_pkr: 24000,
    balance_paid_pkr: 0,
    cost_pkr: 38000,
    margin_pkr: 10000,
    cancel_reason: "item_unavailable",
    cancelled_at: "2026-05-29T12:00:00Z",
    refund_due_pkr: 24000,
    refund_paid_pkr: 0,
    refund_status: "due",
    proof_url: "advance-hina.jpg",
    transfer_reference: "IBFT-55120",
    transfer_sender: "Hina Raza",
    source_retailer: "Sephora US",
    source_url: "https://www.sephora.com/",
    source_purchase_id: "",
    usa_tracking: "",
    local_courier: "",
    tracking_number: "",
    eta: "",
    next_action: "Refund Rs 24,000 to the customer, then mark it sent.",
    internal_notes: "Item went out of stock at Sephora before we purchased.",
    created_at: "2026-05-22T15:30:00Z",
    items: [{
      product_id: "makeup-rare-blush",
      title: "Rare Beauty Soft Pinch Blush",
      quantity: 2,
      unit_price_pkr: 24000,
      stock_mode: "preorder",
      image_url: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=900&q=84",
      variant: "Joy + Hope",
      source_url: "https://www.sephora.com/",
      source_status: "Cancelled before purchase",
    }],
    events: [
      { status: "pending_review", note: "Order created. Waiting for admin review.", created_at: "2026-05-22T15:30:00Z" },
      { status: "accepted", note: "Team accepted order and locked pricing.", created_at: "2026-05-22T17:00:00Z" },
      { status: "advance_confirmed", note: "Advance Rs 24,000 confirmed.", created_at: "2026-05-23T09:00:00Z" },
      { status: "cancelled", note: "Order cancelled — Item unavailable at source · refund Rs 24,000 owed.", created_at: "2026-05-29T12:00:00Z" },
    ],
  },
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
    priority: "Top",
    status: "sourcing",
    payment_status: "advance_confirmed",
    total_pkr: 153800,
    advance_due_pkr: 76900,
    balance_due_pkr: 76900,
    advance_paid_pkr: 76900,
    balance_paid_pkr: 0,
    cost_pkr: 139390,
    margin_pkr: 14410,
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
    internal_notes: "Top customer. Keep tone warm; she wants black as backup if blush sells out.",
    created_at: "2026-05-04T10:30:00Z",
    transfer_reference: "IBFT-78321",
    items: [{
      product_id: "bag-coach-tabby-blush",
      title: "Coach Tabby Shoulder Bag 26",
      quantity: 1,
      unit_price_pkr: 153800,
      stock_mode: "preorder",
      image_url: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=900&q=84",
      variant: "Blush, size 26",
      source_url: "https://www.coach.com/",
      source_status: "USA purchase in progress",
    }],
    messages: [
      { source: "Instagram DM", direction: "inbound", body: "Can you source the blush Coach Tabby?", created_at: "2026-05-04T09:50:00Z" },
      { source: "WhatsApp", direction: "outbound", body: "Yes bestie, the PKR price is Rs 153,800. Once accepted, 50% advance is Rs 76,900. Current batch ETA is June 2, 2026.", created_at: "2026-05-04T10:05:00Z" },
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
    name: "WhatsApp Preorder List",
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
  { id: "post-003", date: "Friday 7:00 PM", channel: "WhatsApp broadcast", title: "Handbag preorder list", status: "Draft" },
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
  ["WhatsApp preorder list", "Segment customers by handbags, shoes, beauty, and send early preorder windows."],
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
  inventoryLog: loadJSON("gb_inventory_log", []),
  customers: [],
  waTemplates: [],
  marketingMessages: [],
  broadcastCampaigns: [],
  scheduledBroadcasts: [],
  smartSegments: [],
  orderViews: [],
  teamMembers: [],
  customerFilters: { search: "", city: "all", sort: "revenue" },
  orderFilters: { dateRange: "all", batch: "all", customStart: "", customEnd: "" },
  messageFilter: "all",
  dispatchQueue: [],
  selectedOrders: new Set(),
  watchedOrders: new Set(JSON.parse(localStorage.getItem("gb_watched_orders") || "[]")),
  ordersView: localStorage.getItem("gb_orders_view") || "list",
  customerColumns: JSON.parse(localStorage.getItem("gb_customer_columns") || "{\"last_wa\":false,\"trend\":false}"),
  me: null, // populated by checkSession() — { phone, name, ... } when logged in
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

// Toast with an "Undo" button. Stays for 10 seconds. On tap, runs `onUndo`
// and removes itself immediately. Used for reversible Kanban moves so an
// accidental drag-to-delivered doesn't require a trip into the order modal.
function showUndoToast(message, onUndo) {
  const region = qs("[data-toast-region]");
  if (!region) return;
  const node = document.createElement("div");
  node.className = "toast toast-undo";
  const msg = document.createElement("span");
  msg.textContent = message;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = "Undo";
  btn.className = "toast-undo-btn";
  btn.addEventListener("click", () => {
    node.remove();
    try { onUndo(); } catch {}
  });
  node.append(msg, btn);
  region.append(node);
  setTimeout(() => node.remove(), 10_000);
}

// Luxury price rounding — computed preorder prices land on ugly figures like
// Rs 153,738, which read as algorithmic and undercut the premium feel. Round
// UP to the nearest 100 (never undercharge; the few rupees become service
// buffer) so prices look intentional: Rs 153,800. Rounding up to 100 also
// makes the 50/50 split land clean (153,800 → 76,900 + 76,900).
function roundLuxuryPrice(amount) {
  const n = Number(amount) || 0;
  if (n <= 0) return 0;
  return Math.ceil(n / 100) * 100;
}

function calculatePrice(product) {
  // In-stock items use the team's directly-entered PKR price verbatim — they
  // set these by hand and we respect that exact control (no auto-rounding).
  if (Number(product.customer_price_pkr || product.price_pkr || 0) > 0) {
    return Math.ceil(Number(product.customer_price_pkr || product.price_pkr));
  }
  const fx = Number(product.fx_rate || state.settings.fx_rate || 282);
  const markup = Number(product.markup_rate ?? state.settings.markup_rate ?? 0.25);
  const retailPkr = Number(product.usa_price_usd || 0) * fx;
  const serviceMargin = retailPkr * markup;
  const shipping = Number(product.shipping_pkr || 0);
  // Computed preorder total → round to a clean luxury figure.
  return roundLuxuryPrice(retailPkr + serviceMargin + shipping);
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
  const base = order?.events || order?.order_events || [];
  if (!order?.customer_phone) return base;
  // Merge in any inbound WhatsApp messages from this customer that arrived
  // after the order was created — they're almost always replies to our
  // order-related outbounds and belong in the timeline.
  const canon = canonPhone(order.customer_phone);
  const since = new Date(order.created_at || 0).getTime();
  const inbound = (state.marketingMessages || []).filter((m) => {
    if (m.direction !== "inbound") return false;
    if (canonPhone(m.customer_phone) !== canon) return false;
    const t = new Date(m.created_at || 0).getTime();
    return !Number.isNaN(t) && t >= since;
  }).map((m) => ({
    status: "customer_reply",
    note: m.body || "(empty reply)",
    created_at: m.created_at,
    _is_reply: true,
  }));
  return [...base, ...inbound];
}

// ─── Order timeline rendering ───
// Each event status maps to (a) a friendly label, (b) a color class, and
// (c) an icon glyph. The mapping covers every status the backend writes
// today; unknown statuses fall back to a neutral pink dot with the raw
// status text underscored-to-spaced.
const TIMELINE_STATUS_MAP = {
  pending_review:        { label: "Order received",           tone: "info",    glyph: "•" },
  accepted:              { label: "Team accepted",            tone: "ok",      glyph: "✓" },
  sourcing:              { label: "Sourcing in USA",          tone: "info",    glyph: "→" },
  in_transit:            { label: "In international transit", tone: "info",    glyph: "✈" },
  pakistan_processing:   { label: "Arrived in Pakistan",      tone: "ok",      glyph: "⌂" },
  delivered:             { label: "Delivered",                tone: "ok",      glyph: "✓" },
  cancelled:             { label: "Cancelled",                tone: "danger",  glyph: "×" },
  advance_uploaded:      { label: "Advance proof uploaded",   tone: "info",    glyph: "₨" },
  advance_confirmed:     { label: "Advance confirmed",        tone: "ok",      glyph: "₨" },
  balance_due:           { label: "Balance now due",          tone: "warn",    glyph: "₨" },
  balance_uploaded:      { label: "Balance proof uploaded",   tone: "info",    glyph: "₨" },
  paid_in_full:          { label: "Paid in full",             tone: "ok",      glyph: "✓" },
  payment_rejected:      { label: "Payment rejected",         tone: "danger",  glyph: "×" },
  auto_whatsapp_sent:    { label: "WhatsApp message sent",    tone: "ok",      glyph: "💬" },
  auto_whatsapp_failed:  { label: "WhatsApp send failed",     tone: "danger",  glyph: "!" },
  customer_reply:        { label: "Customer replied",         tone: "ok",      glyph: "↩" },
};

function timelineMeta(status) {
  return TIMELINE_STATUS_MAP[status] || {
    label: String(status || "event").replaceAll("_", " "),
    tone: "info",
    glyph: "•",
  };
}

// "2 hours ago" / "3 days ago" / "just now" — keeps the timeline scannable
// without forcing a date parser into your eyes. Falls back to the full
// timestamp once the event is older than a week.
function relativeTime(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} hours ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} days ago`;
  return new Date(iso).toLocaleDateString("en-PK", { month: "short", day: "numeric", year: "numeric" });
}

function renderOrderTimeline(events) {
  if (!events?.length) return "";
  // Newest first so the latest event lands at the top of the panel.
  const sorted = [...events].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  return sorted.map((event) => {
    const meta = timelineMeta(event.status);
    const absolute = event.created_at ? new Date(event.created_at).toLocaleString("en-PK") : "";
    return `
      <div class="timeline-event tone-${meta.tone}">
        <span class="timeline-glyph" aria-hidden="true">${meta.glyph}</span>
        <div class="timeline-body">
          <div class="timeline-headline">
            <strong>${esc(meta.label)}</strong>
            <span class="timeline-time" title="${esc(absolute)}">${esc(relativeTime(event.created_at))}</span>
          </div>
          ${event.note ? `<p>${esc(event.note)}</p>` : ""}
        </div>
      </div>
    `;
  }).join("");
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

// Total PKR actually received from the customer so far (advance + balance).
function orderCollectedPkr(order) {
  return Number(order?.advance_paid_pkr || 0) + Number(order?.balance_paid_pkr || 0);
}

// Refund still owed back to the customer on a cancelled order. Zero once the
// refund is marked paid, or when nothing was collected before cancelling.
function orderRefundOutstanding(order) {
  if (!order || order.refund_status === "refunded") return 0;
  return Math.max(0, Number(order.refund_due_pkr || 0) - Number(order.refund_paid_pkr || 0));
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
  // Drive off the configured next_shipment_date so the announcement
  // doesn't go stale when batches move.
  const settings = state.settings || sampleSettings;
  const iso = settings.next_shipment_date;
  if (iso) {
    const dt = new Date(`${iso}T12:00:00`);
    if (!Number.isNaN(dt.getTime())) {
      const month = dt.toLocaleDateString("en-PK", { month: "long" });
      const day = dt.getDate();
      const period = day <= 10 ? "early" : day <= 20 ? "mid" : "late";
      return `New orders estimated around ${period}-${month}`;
    }
  }
  return "New orders estimated based on the next USA batch";
}

// Find the next open shipment batch and return a customer-facing arrival
// label like "Arrives June 5" or "Arrives June 5 (June USA Batch)". Used
// on the public PDP so the estimate tracks the actual batch ETA the team
// is managing, not a hand-entered store_settings date that goes stale.
//
// Selection: the soonest open batch (status in collecting / sourcing /
// in_transit / arriving) whose eta_date is today or later. Falls back to
// nextShipmentLabel() when no batches are loaded yet.
function nextBatchArrivalLabel({ includeBatchName = false } = {}) {
  const batches = Array.isArray(state.shipmentBatches) ? state.shipmentBatches : [];
  const OPEN = new Set(["collecting", "sourcing", "in_transit", "arriving"]);
  const todayMs = Date.now() - 86_400_000; // include today in case of TZ slack
  const candidates = batches
    .filter((b) => b && b.eta_date && OPEN.has(b.status))
    .map((b) => ({ b, ts: new Date(`${b.eta_date}T12:00:00`).getTime() }))
    .filter((x) => !Number.isNaN(x.ts) && x.ts >= todayMs)
    .sort((a, b) => a.ts - b.ts);
  if (!candidates.length) return nextShipmentLabel();
  const { b, ts } = candidates[0];
  const dt = new Date(ts);
  const pretty = dt.toLocaleDateString("en-PK", { month: "long", day: "numeric" });
  return includeBatchName && b.name ? `Arrives ${pretty} (${b.name})` : `Arrives ${pretty}`;
}

function currentDoorstepWindow() {
  // Only return the window string if it's set AND the end date hasn't
  // already passed — stops us from claiming "doorstep delivery May 25-27"
  // on June 5th.
  const settings = state.settings || sampleSettings;
  const window = settings.batch_doorstep_window;
  const until = settings.batch_doorstep_until;
  if (!window) return "";
  if (until) {
    const end = new Date(`${until}T23:59:59`);
    if (!Number.isNaN(end.getTime()) && Date.now() > end.getTime()) return "";
  }
  return window;
}

function shipmentNotice() {
  const window = currentDoorstepWindow();
  if (window) {
    return `Current batch doorstep delivery is expected ${window}. Preorder timing can vary slightly because USA shipments move in batches.`;
  }
  return "Preorder timing can vary slightly because USA shipments move in batches — we'll confirm the exact ETA on WhatsApp after your order.";
}

async function apiFetch(path, options = {}, fallback) {
  try {
    const headers = new Headers(options.headers || {});
    if (!headers.has("Content-Type") && options.body) headers.set("Content-Type", "application/json");
    // Only attach the admin bearer to endpoints that actually require it.
    // Stops the token from leaking onto customer-facing POSTs (/api/orders,
    // /api/leads, /api/public/*) when an operator browses the storefront
    // in the same tab they're logged into the portal with.
    //
    // /api/catalog and /api/settings have a public GET but admin-only
    // POST/DELETE/PATCH — gate the token on write methods only.
    const method = String(options.method || "GET").toUpperCase();
    const isWrite = method !== "GET" && method !== "HEAD";
    const needsAdmin =
      path.startsWith("/api/admin/") ||
      path === "/api/scraper" ||
      (isWrite && (path === "/api/catalog" || path === "/api/settings"));
    if (state.adminToken && needsAdmin) headers.set("Authorization", `Bearer ${state.adminToken}`);
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
  state._productsLoading = true;
  if (document.body.dataset.page !== "portal") renderProducts(); // paint skeletons
  const catalog = await apiFetch("/api/catalog", {}, {
    products: sampleProducts,
    settings: sampleSettings,
    shipmentBatches: sampleShipmentBatches,
  });
  state._productsLoading = false;
  state.products = catalog.products?.length ? catalog.products : sampleProducts;
  state.settings = { ...sampleSettings, ...(catalog.settings || {}) };
  if (Array.isArray(catalog.shipmentBatches) && catalog.shipmentBatches.length) {
    state.shipmentBatches = catalog.shipmentBatches;
  }
  renderAll();

  // Storefront-only live surfaces. Fire-and-forget; each leaves its static
  // fallback in place on failure. The announce bar is global (every page),
  // the UGC rail is on home — both hydrate once on load.
  if (document.body.dataset.page !== "portal") {
    loadAnnounceBar();
    renderUgcRail();
  }
}

// Fetch the batch feed once and hydrate the global announce ribbon. Shares
// the same cached endpoint renderBatchesPage uses (max-age 300), so visiting
// /batches afterward is essentially free.
async function loadAnnounceBar() {
  try {
    const data = await apiFetch("/api/public/batches", {}, null);
    if (data?.announce) hydrateAnnounceBar(data.announce);
  } catch {
    // Static announce-bar markup stays — non-fatal.
  }
}

// What to call the variant field for a given product. Shoes get "size",
// makeup gets "shade", fragrance gets "size", everything else "option".
// Reads the source URL on a product and returns a clean retailer label for
// the "Sourced from" badge on PDP. Maps a handful of known luxury USA
// retailers; otherwise returns the bare hostname (no www.).
function retailerFromUrl(url) {
  if (!url) return "";
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const map = {
      "coach.com": "Coach USA",
      "michaelkors.com": "Michael Kors USA",
      "katespade.com": "Kate Spade USA",
      "nordstrom.com": "Nordstrom",
      "sephora.com": "Sephora USA",
      "ulta.com": "Ulta Beauty",
      "charlottetilbury.com": "Charlotte Tilbury",
      "rarebeauty.com": "Rare Beauty",
      "fentybeauty.com": "Fenty Beauty",
      "nike.com": "Nike USA",
      "adidas.com": "Adidas USA",
      "amazon.com": "Amazon US",
    };
    return map[host] || host;
  } catch {
    return "";
  }
}

function variantLabel(product) {
  return {
    shoes: "size",
    makeup: "shade",
    fragrance: "size",
    handbags: "color",
    accessories: "color",
  }[product?.category] || "option";
}

function variantPlaceholder(product) {
  return {
    shoes: "e.g. US 7.5 / EU 38",
    makeup: "e.g. Pillow Talk Medium",
    fragrance: "e.g. 50ml",
    handbags: "e.g. Blush pink",
    accessories: "e.g. Gold",
  }[product?.category] || "Tell us your preference";
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
    // Sold-out items get a "Notify me when restocked" CTA instead of
    // a dead disabled button. Click opens a small inline form that
    // posts a lead via /api/leads with the product reference.
    return `
      <button class="button primary" type="button" data-action="restock-notify" data-product-id="${attr(product.id)}" aria-label="Notify me when ${attr(product.title)} is back in stock">
        Notify me when restocked
      </button>
    `;
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

  const dMin = Number(product.delivery_days_min || 0);
  const dMax = Number(product.delivery_days_max || 0);
  const inStockDeliveryLabel = dMin && dMax
    ? `Delivered in ${dMin}-${dMax} days`
    : (dMax ? `Delivered in ${dMax} days` : "Delivered in 3-5 days");
  const publicMeta = [
    product.stock_mode === "preorder"
      ? nextBatchArrivalLabel()
      : `${Number(product.inventory || 0)} available · ${inStockDeliveryLabel}`,
  ].filter(Boolean);
  const adminMeta = [
    `USA ${USD.format(product.usa_price_usd || 0)}`,
    `25% margin ${PKR.format(parts.margin)}`,
    `Shipping ${PKR.format(parts.shipping)}`,
    `${product.stock_mode === "preorder" ? "50% advance at checkout" : "Full payment at checkout"}`,
    product.stock_mode === "preorder" ? nextShipmentLabel() : `${Number(product.inventory || 0)} in stock`,
    product.authenticity_note ? "Source checked" : "Source pending",
  ];
  const imgUrl = product.image_url ? imageUrl(product.image_url) : "";
  // Responsive srcset — weserv re-rendering at three widths so 2g phones
  // don't pull the desktop hero JPG. Falls back to a single source when
  // the URL can't be transformed.
  const buildSrcset = (url) => {
    if (!url) return "";
    try {
      const tx = (w) => imageUrl(product.image_url, { width: w });
      return `${tx(320)} 320w, ${tx(540)} 540w, ${tx(720)} 720w`;
    } catch { return ""; }
  };
  const srcset = imgUrl ? buildSrcset(product.image_url) : "";
  const productImageMarkup = imgUrl
    ? `<img src="${safeUrl(imgUrl, "")}" ${srcset ? `srcset="${attr(srcset)}" sizes="(max-width:640px) 48vw, (max-width:1100px) 32vw, 360px"` : ""} alt="${attr(product.title)}" loading="lazy" decoding="async" onerror="this.closest('.product-media')?.classList.add('media-missing'); this.remove();" />`
    : `<div class="media-placeholder" aria-label="Product image missing"><span>Image needed</span></div>`;
  // "New" badge for products created in the last 14 days
  const createdAt = new Date(product.created_at || 0).getTime();
  const isNew = createdAt && (Date.now() - createdAt < 14 * 86_400_000);
  const isWished = isWishlisted(product.id);
  const soldoutClass = disabled ? " is-soldout" : "";
  return `
    <article class="product-card${soldoutClass}">
      <div class="product-media" ${!isPortal ? `role="button" tabindex="0" data-action="view-product" data-product-id="${attr(product.id)}" aria-label="View ${attr(product.title)} details"` : ""}>
        ${productImageMarkup}
        <div class="product-badges">
          <span class="status-pill ${attr(product.stock_mode)}">${esc(stockLabel)}</span>
          ${product.stock_mode === "in_stock" && Number(product.inventory || 0) > 0 && Number(product.inventory || 0) <= Number(product.low_stock_threshold ?? 2) ? `<span class="low-stock-chip">Only ${Number(product.inventory)} left</span>` : ""}
          ${isNew && !isPortal ? `<span class="new-arrival-badge">New</span>` : ""}
          ${product.marketing_badge ? `<span class="marketing-badge">${esc(product.marketing_badge)}</span>` : ""}
        </div>
        ${!isPortal ? `
          <button class="wishlist-heart ${isWished ? "is-wished" : ""}" type="button" data-action="toggle-wishlist" data-product-id="${attr(product.id)}" data-stop-row aria-label="${isWished ? "Remove from wishlist" : "Save to wishlist"}" title="${isWished ? "Saved" : "Save for later"}">${isWished ? "♥" : "♡"}</button>
          ${!disabled ? `<button class="quick-add-btn" type="button" data-action="quick-add-cart" data-product-id="${attr(product.id)}" data-stop-row aria-label="Quick add ${attr(product.title)} to bag" title="Add to bag">+</button>` : ""}
          ${disabled ? `<span class="soldout-overlay">Sold out</span>` : ""}
        ` : ""}
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
        ${isPortal ? `<p class="product-description-line">${esc(product.description || "")}</p>` : ""}
        <div class="product-meta ${isPortal ? "" : "public-listing"}" aria-label="${isPortal ? "Internal pricing details" : "Product details"}">
          ${(isPortal ? adminMeta : publicMeta).map((item) => `<span>${esc(item)}</span>`).join("")}
        </div>
        ${isPortal && options.admin ? renderProductSparkline(product.id) : ""}
        <div class="product-actions">
          ${isPortal ? `<button class="button secondary" type="button" data-action="view-product" data-product-id="${attr(product.id)}">View details</button>` : ""}
          ${options.admin ? `<button class="button primary" type="button" data-action="edit-product" data-product-id="${attr(product.id)}">Edit product</button>` : renderAddToBag(product, disabled)}
        </div>
        ${!isPortal && !options.admin ? `
          <button class="ask-about-link" type="button" data-action="ask-about-product" data-product-id="${attr(product.id)}" aria-label="Ask about ${attr(product.title)} on WhatsApp">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" width="14" height="14"><path d="M12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413A11.815 11.815 0 0012.05 0z"/></svg>
            Ask about this
          </button>
        ` : ""}
      </div>
    </article>
  `;
}

function filteredProducts() {
  let products = [...state.products];
  const { search, category, stock, sort, wishlistOnly } = state.filters;
  if (search) {
    const needle = search.toLowerCase();
    products = products.filter((product) =>
      [product.title, product.brand, product.category, product.description].join(" ").toLowerCase().includes(needle)
    );
  }
  if (category !== "all") products = products.filter((product) => product.category === category);
  if (stock !== "all") products = products.filter((product) => product.stock_mode === stock);
  if (wishlistOnly) {
    const wished = state._wishlist || (state._wishlist = loadWishlist());
    products = products.filter((product) => wished.has(product.id));
  }
  products.sort((a, b) => {
    if (sort === "price_asc") return calculatePrice(a) - calculatePrice(b);
    if (sort === "price_desc") return calculatePrice(b) - calculatePrice(a);
    if (sort === "newest") return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    if (sort === "margin") return productPricingParts(b).margin - productPricingParts(a).margin;
    return Number(b.featured) - Number(a.featured);
  });
  return products;
}

// Skeleton card — renders a soft pulsing placeholder while products load.
// Used on first paint (state.products empty AND loading flag set) and
// when filters change to give immediate feedback.
function productSkeleton() {
  return `
    <article class="product-card skeleton" aria-hidden="true">
      <div class="product-media skeleton-block"></div>
      <div class="product-body">
        <div class="skeleton-line skeleton-line-1"></div>
        <div class="skeleton-line skeleton-line-2"></div>
        <div class="skeleton-line skeleton-line-3"></div>
      </div>
    </article>
  `;
}

function productEmptyState() {
  const query = state.filters.search?.trim();
  const waNumber = String(state.settings?.support_whatsapp || "").replace(/\D/g, "");
  const waHref = waNumber
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(query
      ? `Hi Global Bestie, can you source ${query} from the USA?`
      : "Hi Global Bestie, I need help finding a USA product.")}`
    : "";
  return `
    <div class="product-empty-state">
      <p class="kicker">Concierge search</p>
      <h2>No matching drops yet.</h2>
      <p>${query ? `We do not have “${esc(query)}” listed right now, but we can still source it from the USA.` : "Try a different category, or send us the exact product you want sourced."}</p>
      <div class="empty-state-actions">
        <a class="button primary" href="/quote" data-route="quote">Create a custom quote</a>
        ${waHref ? `<a class="button secondary" href="${safeUrl(waHref)}" target="_blank" rel="noreferrer">DM us the product</a>` : ""}
      </div>
    </div>
  `;
}

function isCustomQuoteProduct(product) {
  return product?.id?.startsWith("quote-") || product?.brand === "Customer request";
}

// ════════════════════════════════════════════════════════════════════════
// LIVE-DATA SURFACES — /batches, /this-week, UGC rail, announce bar.
// Each renderer fetches its public endpoint and swaps the static fallback
// markup for live content. On any failure the static markup is left intact,
// so the page never breaks — it just shows the seed content.
// ════════════════════════════════════════════════════════════════════════

// Render the 5-stage rail markup for a given active stage index.
function batchRailHTML(stages, activeIndex, large) {
  const cls = large ? "batch-rail batch-rail-lg" : "batch-rail";
  const dots = stages.map((label, i) => {
    const state = i < activeIndex ? "is-done" : i === activeIndex ? "is-active" : "";
    return `<li class="batch-stage ${state}"><span class="batch-dot" aria-hidden="true"></span><span class="batch-label">${esc(label)}</span></li>`;
  }).join("");
  return `<ol class="${cls}" aria-label="Batch stages">${dots}</ol>`;
}

// Hydrate the top-of-page announce ribbon from the active/announce batch.
function hydrateAnnounceBar(announce) {
  if (!announce) return;
  const heading = qs("[data-announce-heading]");
  const rail = qs("[data-announce-rail]");
  const eta = qs("[data-announce-eta]");
  if (heading) heading.innerHTML = `<strong>${esc(announce.name || "Current batch")}</strong> · USA → Pakistan`;
  if (rail) {
    rail.outerHTML = batchRailHTML(announce.stages || [], announce.stageIndex ?? 0, false)
      .replace("<ol ", '<ol data-announce-rail ');
  }
  if (eta && announce.etaWindow) eta.innerHTML = `Doorstep <strong>${esc(announce.etaWindow)}</strong>`;
}

// One batch card for /batches (active or open variant).
function batchCardHTML(b, variant) {
  const isOpen = variant === "open";
  const kicker = isOpen ? "Open · collecting orders" : "Active batch";
  const cardCls = isOpen ? "batch-card" : "batch-card batch-card-active";
  const fill = isOpen && b.capacity > 0
    ? `<div class="batch-fill-track" role="presentation" aria-hidden="true"><span class="batch-fill" style="--fill: ${b.fillPct}%"></span></div>`
    : "";
  const meta = isOpen
    ? `${b.used} / ${b.capacity} spots filled${b.closesOn ? ` · closes ${esc(b.closesOn)}` : ""}`
    : `${b.used} orders en route`;
  const foot = isOpen
    ? `<p>Order before it fills to ride this batch. Pay the 50% advance to lock your spot.</p><a class="button primary" href="/shop" data-route="shop">Shop this batch →</a>`
    : `<p>This batch is ${esc(b.stageKey || "in transit").toLowerCase()}. We confirm each stage on WhatsApp as it moves.</p><a class="button ghost" href="/track" data-route="track">Track my order →</a>`;
  return `
    <article class="${cardCls}" data-batch-id="${attr(b.id)}">
      <header class="batch-card-head">
        <div>
          <p class="kicker">${esc(kicker)}</p>
          <h2>${esc(b.name)}</h2>
          <small>${esc(meta)}</small>
        </div>
        <div class="batch-card-eta">
          <span>Doorstep PK</span>
          <strong>${esc(b.etaWindow || "TBC")}</strong>
        </div>
      </header>
      ${batchRailHTML(b.stages || [], b.stageIndex ?? 0, true)}
      ${fill}
      <footer class="batch-card-foot">${foot}</footer>
    </article>`;
}

async function renderBatchesPage() {
  const feed = qs("[data-batches-feed]");
  if (!feed) return;
  const data = await apiFetch("/api/public/batches", {}, null);
  if (!data) return; // keep static fallback
  hydrateAnnounceBar(data.announce);

  const cards = [
    ...(data.active || []).map((b) => batchCardHTML(b, "active")),
    ...(data.open || []).map((b) => batchCardHTML(b, "open")),
  ].join("");
  if (cards) feed.innerHTML = cards;

  // History list
  const history = qs("[data-batches-history]");
  if (history && data.delivered?.length) {
    history.innerHTML = data.delivered.map((b) => `
      <li class="batch-history-row">
        <div>
          <strong>${esc(b.name)}</strong>
          <small>${b.used} orders${b.etaWindow ? ` · doorstep ${esc(b.etaWindow)}` : ""}</small>
        </div>
        <span class="batch-history-chip is-done">Delivered</span>
      </li>`).join("");
  }

  // Hero stats
  const inFlight = (data.active?.length || 0);
  const stat = qs("[data-batches-stats]") || qs(".batches-stats");
  if (stat && (data.active || data.open)) {
    const shipping = (data.active || []).reduce((s, b) => s + (b.used || 0), 0);
    stat.innerHTML = `
      <span><strong>${inFlight + (data.open?.length || 0)}</strong> batches in flight</span>
      <span><strong>${shipping}</strong> orders shipping now</span>
      <span><strong>~4 wk</strong> avg sourcing → doorstep</span>`;
  }
}

async function renderThisWeek() {
  const grid = qs("[data-thisweek-grid]");
  if (!grid) return;
  const data = await apiFetch("/api/public/this-week", {}, null);
  if (!data || !data.items?.length) return; // keep static fallback

  grid.innerHTML = data.items.map((item) => {
    const img = item.image_url
      ? `<img src="${safeUrl(item.image_url, "")}" alt="${attr(item.title)}" loading="lazy" decoding="async" onerror="this.closest('.thisweek-media')?.classList.add('media-missing'); this.remove();" />`
      : `<div class="media-placeholder"><span>Image soon</span></div>`;
    const batchName = data.batch?.name ? esc(data.batch.name) : "this batch";
    return `
      <article class="thisweek-card">
        <div class="thisweek-media">${img}</div>
        <div class="thisweek-body">
          ${item.brand ? `<small class="thisweek-brand">${esc(item.brand)}</small>` : ""}
          <strong>${esc(item.title)}</strong>
          <span class="thisweek-price">${PKR.format(item.price_pkr)}</span>
          <a class="button primary" href="/quote" data-route="quote">Lock in for ${batchName}</a>
        </div>
      </article>`;
  }).join("");

  // Hero meta + fill
  if (data.batch) {
    const meta = qs("[data-thisweek-meta]");
    if (meta) {
      meta.innerHTML = `
        <span><strong>${esc(data.batch.name)}</strong>${data.batch.closesOn ? ` · closes <strong>${esc(data.batch.closesOn)}</strong>` : ""}</span>
        ${typeof data.batch.spotsLeft === "number" ? `<span><strong>${data.batch.spotsLeft}</strong> spots left</span>` : ""}
        ${data.batch.etaWindow ? `<span><strong>Doorstep</strong> ${esc(data.batch.etaWindow)}</span>` : ""}`;
    }
  }
}

async function renderUgcRail() {
  const rail = qs("[data-ugc-rail]");
  if (!rail) return;
  const data = await apiFetch("/api/public/ugc", {}, null);
  if (!data || !data.items?.length) return; // keep static fallback

  rail.innerHTML = data.items.map((p) => {
    const waBase = "https://wa.me/13362556023?text=Hi%20Global%20Bestie";
    const img = p.image_url
      ? `<img src="${safeUrl(p.image_url, "")}" alt="Customer photo — ${attr(p.handle)}${p.city ? ` in ${attr(p.city)}` : ""}" loading="lazy" decoding="async" onerror="this.closest('.ugc-media')?.classList.add('media-missing'); this.remove();" />`
      : `<div class="media-placeholder"><span>${esc(p.handle)}</span></div>`;
    return `
      <article class="ugc-card">
        <a class="ugc-media" href="${waBase}" target="_blank" rel="noopener noreferrer">
          ${img}
          <span class="ugc-source">${esc(p.handle)}</span>
        </a>
        <div class="ugc-body">
          <p>${esc(p.quote)}</p>
          ${p.city ? `<small>${esc(p.city)}</small>` : ""}
          <a class="ugc-cta" href="${safeUrl(p.cta_href || "/quote")}" data-route="quote">${esc(p.cta_text || "Order this look →")}</a>
        </div>
      </article>`;
  }).join("");
}

function renderProducts() {
  // Initial-load skeleton — show 4 placeholders while the catalog fetches
  if (state._productsLoading && !state.products.length) {
    setHTML("[data-featured-products]", new Array(3).fill(productSkeleton()).join(""));
    setHTML("[data-shop-products]", new Array(6).fill(productSkeleton()).join(""));
    return;
  }
  if (typeof renderWishlistChip === "function") renderWishlistChip();
  const featured = state.products.filter((product) => product.featured).slice(0, 3);
  const visibleProducts = filteredProducts();
  setHTML("[data-featured-products]", featured.map((product) => productCard(product)).join(""));
  setHTML("[data-shop-products]", visibleProducts.length
    ? visibleProducts.map((product) => productCard(product)).join("")
    : productEmptyState());
  if (qs("[data-admin-products]")) renderAdminProductsTable();
}

// ════════════════════════════════════════════════════════════════════════
// PRODUCTS MANAGEMENT TABLE — the team's "manage listings" surface.
// A scannable table with inline price / stock / status / featured controls so
// common edits don't need the click→modal→form→scroll round-trip. Search /
// filter / sort live in static portal.html controls; bulk publish/draft/feature
// act on the shared selectedProducts set. Stock steppers reuse the inventory
// path (setInventory) so changes log + persist + stay in sync with the board.
// ════════════════════════════════════════════════════════════════════════
function productAdminFilters() {
  return state._productAdmin || (state._productAdmin = { search: "", mode: "all", status: "all", category: "all", sort: "newest" });
}
function productIsDraft(p) { return (p.status || p.product_status) === "draft"; }
function productIsArchived(p) { return (p.status || p.product_status) === "archived"; }
function filteredAdminProducts() {
  const f = productAdminFilters();
  let items = (state.products || []).slice();
  // Archived products are "removed from site" — keep them out of the Live/Draft
  // views so what's live vs draft is unambiguous. They stay reachable via the
  // dedicated "Archived" filter chip.
  if (f.status !== "archived") items = items.filter((p) => !productIsArchived(p));
  const q = (f.search || "").trim().toLowerCase();
  if (q) items = items.filter((p) => `${p.title} ${p.brand} ${p.category}`.toLowerCase().includes(q));
  if (f.mode !== "all") items = items.filter((p) => (p.stock_mode || "preorder") === f.mode);
  if (f.status === "active") items = items.filter((p) => !productIsDraft(p));
  else if (f.status === "draft") items = items.filter(productIsDraft);
  else if (f.status === "archived") items = items.filter(productIsArchived);
  else if (f.status === "featured") items = items.filter((p) => p.featured);
  else if (f.status === "low") items = items.filter((p) => p.stock_mode === "in_stock" && Number(p.inventory || 0) > 0 && Number(p.inventory || 0) <= Number(p.low_stock_threshold ?? 2));
  else if (f.status === "out") items = items.filter((p) => p.stock_mode === "in_stock" && Number(p.inventory || 0) <= 0);
  if (f.category !== "all") items = items.filter((p) => (p.category || "") === f.category);
  const sorters = {
    newest: (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0),
    name: (a, b) => String(a.title).localeCompare(String(b.title)),
    "price-desc": (a, b) => calculatePrice(b) - calculatePrice(a),
    "price-asc": (a, b) => calculatePrice(a) - calculatePrice(b),
    "stock-asc": (a, b) => Number(a.inventory || 0) - Number(b.inventory || 0),
  };
  items.sort(sorters[f.sort] || sorters.newest);
  return items;
}
function productAdminRowHTML(p) {
  const draft = productIsDraft(p);
  const archived = productIsArchived(p);
  const inStock = p.stock_mode === "in_stock";
  const qty = Math.max(0, Number(p.inventory || 0));
  const low = inStock && qty > 0 && qty <= Number(p.low_stock_threshold ?? 2);
  const out = inStock && qty <= 0;
  const price = calculatePrice(p);
  const img = p.image_url
    ? `<img src="${safeUrl(imageUrl(p.image_url, { width: 96 }), "")}" alt="${attr(p.title)}" loading="lazy" decoding="async" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'padmin-noimg',textContent:'—'}));" />`
    : `<div class="padmin-noimg">—</div>`;
  return `
    <article class="padmin-row${draft ? " is-draft" : ""}${selectedProducts.has(p.id) ? " selected" : ""}" data-product-row="${attr(p.id)}">
      <label class="padmin-select"><input type="checkbox" class="card-checkbox" data-product-select="${attr(p.id)}" ${selectedProducts.has(p.id) ? "checked" : ""} aria-label="Select ${attr(p.title)}" /></label>
      <div class="padmin-product">
        <div class="padmin-thumb">${img}</div>
        <div class="padmin-id"><strong>${esc(p.title)}</strong><small>${esc(p.brand || "—")}${p.category ? " · " + esc(p.category) : ""}</small></div>
      </div>
      <div class="padmin-meta">
        <span class="status-pill ${attr(p.stock_mode || "preorder")}">${inStock ? "In stock" : "Preorder"}</span>
        <label class="padmin-price"><span aria-hidden="true">Rs</span><input type="number" min="0" step="100" value="${price}" data-prod-price="${attr(p.id)}" aria-label="Customer price for ${attr(p.title)}" /></label>
      </div>
      <div class="padmin-controls">
        <div class="padmin-stock" data-product-stock-cell>
          ${inStock ? `
            <button class="inv-step" type="button" data-action="inv-dec" data-product-id="${attr(p.id)}" aria-label="Decrease stock"${qty <= 0 ? " disabled" : ""}>−</button>
            <input class="inv-qty" type="number" min="0" inputmode="numeric" value="${qty}" data-inv-input="${attr(p.id)}" aria-label="Stock for ${attr(p.title)}" />
            <button class="inv-step" type="button" data-action="inv-inc" data-product-id="${attr(p.id)}" aria-label="Increase stock">+</button>
            ${out ? `<span class="padmin-stock-flag out">out</span>` : low ? `<span class="padmin-stock-flag low">low</span>` : ""}
          ` : ""}
        </div>
        <button class="padmin-toggle ${archived ? "is-archived" : draft ? "" : "is-on"}" type="button" data-action="toggle-product-status" data-product-id="${attr(p.id)}" aria-pressed="${!draft && !archived}" title="${archived ? "Archived — click to restore as draft" : draft ? "Draft — click to publish" : "Live — click to move to draft"}">${archived ? "Archived" : draft ? "Draft" : "Live"}</button>
        <button class="padmin-star ${p.featured ? "is-on" : ""}" type="button" data-action="toggle-product-featured" data-product-id="${attr(p.id)}" aria-pressed="${!!p.featured}" aria-label="${p.featured ? "Unfeature" : "Feature"} ${attr(p.title)}" title="${p.featured ? "Featured on homepage" : "Feature on homepage"}">${p.featured ? "★" : "☆"}</button>
      </div>
      <div class="padmin-actions">
        <button class="button ghost padmin-edit" type="button" data-action="edit-product" data-product-id="${attr(p.id)}">Edit</button>
        <button class="padmin-remove" type="button" data-action="remove-one-product" data-product-id="${attr(p.id)}" aria-label="Remove ${attr(p.title)} from site" title="Remove from site">✕</button>
      </div>
    </article>
  `;
}
function renderAdminProductsTable() {
  const grid = qs("[data-admin-products]");
  if (!grid) return;
  const f = productAdminFilters();
  const items = filteredAdminProducts();
  // Count against the relevant universe: archived view counts archived; every
  // other view counts the live+draft catalog (archived are removed-from-site).
  const total = f.status === "archived"
    ? (state.products || []).filter(productIsArchived).length
    : (state.products || []).filter((p) => !productIsArchived(p)).length;
  qsa("[data-padmin-filter]").forEach((c) => c.classList.toggle("active", c.dataset.padminFilter === f.status));
  const countChip = qs("[data-padmin-count]");
  if (countChip) countChip.textContent = `${items.length}/${total}`;
  const sortSel = qs("[data-padmin-sort]");
  if (sortSel && sortSel.value !== f.sort) sortSel.value = f.sort;
  if (!total) {
    grid.innerHTML = `<div class="padmin-empty"><strong>No products yet.</strong><p>Use “Suggest 10 products”, paste a retailer URL, or import a JSON batch above to add your first listings.</p></div>`;
  } else if (!items.length) {
    grid.innerHTML = `<div class="padmin-empty"><strong>Nothing matches.</strong><p>Try a different search or filter.</p></div>`;
  } else {
    grid.innerHTML = `
      <div class="padmin-head" aria-hidden="true">
        <span></span><span>Product</span><span>Mode</span><span>Price</span><span>Stock</span><span>Status</span><span>Feat.</span><span></span>
      </div>
      ${items.map(productAdminRowHTML).join("")}
    `;
  }
  updateProductBulkBar();
}
// Repaint a single product row's stock flag after a stepper change (the row
// lives in the Products table; the Inventory board repaints separately).
function paintProductRow(productId) {
  const p = state.products.find((x) => x.id === productId);
  const row = qs(`[data-product-row="${productId}"]`);
  if (!p || !row) return;
  const qty = Math.max(0, Number(p.inventory || 0));
  const low = p.stock_mode === "in_stock" && qty > 0 && qty <= Number(p.low_stock_threshold ?? 2);
  const out = p.stock_mode === "in_stock" && qty <= 0;
  const dec = row.querySelector('[data-action="inv-dec"]');
  if (dec) dec.disabled = qty <= 0;
  const cell = row.querySelector("[data-product-stock-cell]");
  const oldFlag = cell?.querySelector(".padmin-stock-flag");
  if (oldFlag) oldFlag.remove();
  if (cell && (low || out)) {
    const flag = document.createElement("span");
    flag.className = `padmin-stock-flag ${out ? "out" : "low"}`;
    flag.textContent = out ? "out" : "low";
    cell.appendChild(flag);
  }
}
const _productSaveTimers = {};
function persistProductSoon(productId, immediate) {
  const product = state.products.find((p) => p.id === productId);
  if (!product) return;
  const run = async () => {
    try {
      const saved = await apiFetch("/api/catalog", { method: "POST", body: JSON.stringify(product) }, { product });
      const idx = state.products.findIndex((p) => p.id === productId);
      if (idx >= 0 && saved.product) state.products[idx] = { ...saved.product };
    } catch { toast("Couldn't save the product. Check the portal key and retry."); }
  };
  clearTimeout(_productSaveTimers[productId]);
  if (immediate) run();
  else _productSaveTimers[productId] = setTimeout(run, 600);
}
function toggleProductFeatured(productId) {
  const p = state.products.find((x) => x.id === productId);
  if (!p) return;
  p.featured = !p.featured;
  persistProductSoon(productId, true);
  renderProducts();
  toast(p.featured ? `${p.title} is now featured on the homepage.` : `${p.title} removed from featured.`);
}
function setProductPublishStatus(productId, status) {
  const p = state.products.find((x) => x.id === productId);
  if (!p) return;
  if (status === "active" && p.stock_mode === "in_stock" && Number(p.inventory || 0) <= 0) {
    toast("Add stock before publishing an in-stock product."); return;
  }
  p.status = status; p.product_status = status;
  persistProductSoon(productId, true);
  renderProducts();
  toast(status === "active" ? `${p.title} is now live.` : `${p.title} moved to draft.`);
}
function toggleProductStatus(productId) {
  const p = state.products.find((x) => x.id === productId);
  if (p) setProductPublishStatus(productId, productIsDraft(p) ? "active" : "draft");
}
function setProductPrice(productId, value) {
  const p = state.products.find((x) => x.id === productId);
  if (!p) return;
  p.customer_price_pkr = Math.max(0, Math.round(Number(value) || 0));
  persistProductSoon(productId, false);
}
async function removeOneProduct(productId) {
  const p = state.products.find((x) => x.id === productId);
  if (!p) return;
  if (!window.confirm(`Remove “${p.title}” from the site? This can't be undone here.`)) return;
  await apiFetch("/api/catalog", { method: "DELETE", body: JSON.stringify({ ids: [productId] }) }, { removed: 1 });
  state.products = state.products.filter((x) => x.id !== productId);
  selectedProducts.delete(productId);
  renderProducts();
  toast(`${p.title} removed from site.`);
}
function bulkSetProductStatus(status) {
  if (!selectedProducts.size) return;
  const ids = [...selectedProducts];
  let n = 0;
  ids.forEach((id) => {
    const p = state.products.find((x) => x.id === id);
    if (!p) return;
    if (status === "active" && p.stock_mode === "in_stock" && Number(p.inventory || 0) <= 0) return;
    p.status = status; p.product_status = status; n++;
    persistProductSoon(id, true);
  });
  renderProducts();
  toast(`${n} product${n === 1 ? "" : "s"} ${status === "active" ? "published" : "moved to draft"}.`);
}
function bulkSetFeatured(featured) {
  if (!selectedProducts.size) return;
  const ids = [...selectedProducts];
  ids.forEach((id) => {
    const p = state.products.find((x) => x.id === id);
    if (p) { p.featured = featured; persistProductSoon(id, true); }
  });
  renderProducts();
  toast(`${ids.length} product${ids.length === 1 ? "" : "s"} ${featured ? "featured" : "unfeatured"}.`);
}

function cartLines() {
  return state.cart
    .map((line) => {
      // Restored carts from localStorage may reference products that have
      // since been deleted/archived. Fall back to the snapshot stored on
      // the cart line itself; if neither resolves, the line is dropped to
      // prevent renderCart from crashing on .title / .stock_mode access.
      const product = state.products.find((item) => item.id === line.product_id) || line.product;
      if (!product || !product.title) return null;
      const subtotal = calculatePrice(product) * line.quantity;
      return { ...line, product, subtotal };
    })
    .filter(Boolean);
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
  const html = lines.map((line) => {
    // Two special line shapes coexist here:
    //   • sourcing_request  — added from the "Source any USA product" modal
    //     (customer pasted a retailer URL we don't carry yet).
    //   • custom_quote      — added from the /quote estimator page
    //     (customer played with USD + category to get a manual estimate).
    // Both surface the "team will confirm final price" promise but with
    // slightly different visual treatments.
    const isSourcing = line.kind === "sourcing_request" || line.product.is_sourcing_request;
    const isCustomQuote = isCustomQuoteProduct(line.product);
    const statusCopy = isSourcing
      ? `Sourcing request · Qty ${line.quantity}`
      : isCustomQuote
        ? `Custom quote · Qty ${line.quantity}`
        : `${line.product.stock_mode === "preorder" ? "Preorder" : "In stock"} · Qty ${line.quantity}${line.variant ? ` · ${esc(line.variant)}` : ""}`;
    const variantBlock = (isSourcing || isCustomQuote)
      ? (line.variant ? `<small>Variant: ${esc(line.variant)}</small>` : "")
      : `<label class="cart-variant-edit">
          <span>${esc(variantLabel(line.product))}</span>
          <input type="text" data-cart-variant data-product-id="${attr(line.product_id)}" value="${attr(line.variant || "")}" placeholder="${esc(variantPlaceholder(line.product))}" />
        </label>`;
    const sourceLine = isSourcing && line.product.source_url
      ? `<small><a href="${safeUrl(line.product.source_url)}" target="_blank" rel="noopener noreferrer">View source link →</a></small>`
      : "";
    const customQuoteNote = isCustomQuote
      ? `<small class="custom-quote-note">Final PKR price, source, and batch are confirmed by the team before sourcing.</small>`
      : "";
    // The .cart-swipe-shell wraps each line in a swipe-context. A static
    // red Remove zone sits behind the line; the foreground .cart-line
    // translates left via JS gesture (see wireCartLineSwipe in setCartDrawerOpen).
    // The Remove button inside .mini-actions still works on desktop.
    return `
    <div class="cart-swipe-shell" data-swipe-line data-product-id="${attr(line.product_id)}">
      <button class="cart-swipe-remove" type="button" data-action="remove-cart" data-product-id="${attr(line.product_id)}" aria-label="Remove ${attr(line.product.title)}" tabindex="-1">Remove</button>
      <div class="order-line cart-line" data-kind="${attr(line.kind || "product")}">
        <div>
          <strong>
            ${esc(line.product.title)}
            ${isSourcing ? `<span class="cart-estimate-chip">Estimate</span>` : ""}
            ${isCustomQuote ? `<span class="line-badge custom-quote-badge">Custom quote</span>` : ""}
          </strong>
          <small>${statusCopy}</small>
          ${sourceLine}
          ${customQuoteNote}
          ${variantBlock}
        </div>
        <div class="mini-actions">
          <strong>${PKR.format(line.subtotal)}</strong>
          <div class="qty-stepper" role="group" aria-label="Quantity for ${attr(line.product.title)}">
            <button class="qty-step" type="button" data-action="decrement-cart" data-product-id="${attr(line.product_id)}" aria-label="Decrease quantity">−</button>
            <span class="qty-value" aria-live="polite">${line.quantity}</span>
            <button class="qty-step" type="button" data-action="add-cart" data-product-id="${attr(line.product_id)}" aria-label="Increase quantity">+</button>
          </div>
          <button class="icon-button plain" type="button" data-action="remove-cart" data-product-id="${attr(line.product_id)}" aria-label="Remove ${attr(line.product.title)}">Remove</button>
        </div>
      </div>
    </div>
  `;
  }).join("");
  setHTML("[data-cart-items]", html || empty);
  setHTML("[data-checkout-items]", html || empty);
  wireCartLineSwipes();

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
  // Backdrop sibling — toggled together with the drawer so the page dims
  // behind it. Idempotent: created on first open if it doesn't exist.
  let backdrop = qs("[data-cart-backdrop]");
  if (!backdrop) {
    backdrop = document.createElement("div");
    backdrop.className = "cart-backdrop";
    backdrop.setAttribute("data-cart-backdrop", "");
    backdrop.setAttribute("aria-hidden", "true");
    backdrop.addEventListener("click", () => setCartDrawerOpen(false));
    document.body.appendChild(backdrop);
  }
  backdrop.classList.toggle("open", open);
  // Mount drag-to-dismiss exactly once
  if (open && !drawer.dataset.gesturesWired) {
    wireDrawerGestures(drawer);
    drawer.dataset.gesturesWired = "true";
  }
  // Reset any leftover drag transform when (re)opening
  if (open) drawer.style.transform = "";
}

// Cart-line swipe-to-remove. Each .cart-swipe-shell has a static Remove zone
// behind the foreground .cart-line; the line translates left under finger
// drag. Past 45% width OR velocity > 0.11 px/ms = remove. Snap back otherwise.
// Idempotent per element: gestures are mounted once and skipped after.
function wireCartLineSwipes() {
  const shells = qsa("[data-swipe-line]");
  shells.forEach((shell) => {
    if (shell.dataset.swipeWired === "true") return;
    shell.dataset.swipeWired = "true";
    const line = shell.querySelector(".cart-line");
    if (!line) return;
    // The Remove background is the only consumer of --swipe-progress, so we
    // write the variable on IT, not the shell. Writing a custom property on
    // the parent would recalc styles for the whole cart-line subtree every
    // pointermove (Emil); scoping it to the single consumer keeps the recalc
    // to one element.
    const removeZone = shell.querySelector(".cart-swipe-remove");
    const setProgress = (v) => removeZone && removeZone.style.setProperty("--swipe-progress", v);

    let startX = 0;
    let startTime = 0;
    let dx = 0;
    let dragging = false;
    let activePointerId = null;
    let lineWidth = 0;
    const REMOVE_THRESHOLD = 0.45;
    const VELOCITY_THRESHOLD = 0.11;

    const onDown = (event) => {
      if (event.isPrimary === false) return;
      if (dragging) return;
      // Don't steal pointer events on the inner controls (qty stepper, etc.)
      if (event.target.closest("button, input, textarea, select, a, label")) return;
      dragging = true;
      activePointerId = event.pointerId;
      startX = event.clientX;
      startTime = performance.now();
      dx = 0;
      lineWidth = line.getBoundingClientRect().width || 320;
      shell.setPointerCapture?.(event.pointerId);
      line.style.transition = "none";
    };
    const onMove = (event) => {
      if (!dragging || event.pointerId !== activePointerId) return;
      dx = event.clientX - startX;
      // Only allow left swipe (negative dx). Damp the right side.
      const translate = dx < 0 ? dx : dx * 0.2;
      line.style.transform = `translateX(${translate}px)`;
      // Brighten the Remove background as the swipe progresses
      const progress = Math.min(1, Math.abs(translate) / (lineWidth * REMOVE_THRESHOLD));
      setProgress(progress.toFixed(2));
    };
    const onUp = (event) => {
      if (!dragging || event.pointerId !== activePointerId) return;
      dragging = false;
      shell.releasePointerCapture?.(event.pointerId);
      line.style.transition = "";
      const elapsed = performance.now() - startTime;
      const velocity = elapsed > 0 ? Math.abs(dx) / elapsed : 0;
      const shouldRemove = dx < -lineWidth * REMOVE_THRESHOLD ||
                           (dx < -10 && velocity > VELOCITY_THRESHOLD);
      if (shouldRemove) {
        // Animate the line off-screen then trigger the existing remove action
        line.style.transform = `translateX(-${lineWidth + 60}px)`;
        line.style.opacity = "0";
        setProgress("1");
        setTimeout(() => {
          const productId = shell.dataset.productId;
          if (productId) removeFromCart(productId);
        }, 200);
      } else {
        // Snap back
        line.style.transform = "";
        setProgress("0");
      }
      activePointerId = null;
      dx = 0;
    };
    shell.addEventListener("pointerdown", onDown);
    shell.addEventListener("pointermove", onMove);
    shell.addEventListener("pointerup", onUp);
    shell.addEventListener("pointercancel", onUp);
  });
}

// One-shot batch-shipped reveal. Fires a full-screen overlay the first time
// a customer returns after their batch transitions to a celebration-worthy
// state. localStorage gate is keyed by (orderId × stage) so the reveal can
// fire once per transition (shipped, arrived) without repeating.
//
// Wiring this is two parts:
//   1. Visual layer (this fn) — shows the overlay, auto-dismisses after 6s
//   2. Trigger layer — calls maybeShowBatchReveal() when /api/auth/me or
//      the customer-orders fetch returns an order whose stage just changed
//      (the JS that owns those callbacks decides when to invoke this).
function maybeShowBatchReveal({ orderId, stage, headline, sub, eta } = {}) {
  if (!orderId || !stage) return;
  const root = qs("[data-batch-reveal]");
  if (!root) return;
  // Gate: localStorage flag per (order × stage) — fires once
  const gateKey = `gb_batch_reveal_${orderId}_${stage}`;
  try {
    if (localStorage.getItem(gateKey)) return;
    localStorage.setItem(gateKey, String(Date.now()));
  } catch {
    // localStorage may be blocked (private mode) — silently no-op so we
    // don't accidentally fire on every load. Better to show nothing than
    // every visit.
    return;
  }
  // Populate
  const headlineEl = qs("[data-batch-reveal-headline]");
  const subEl = qs("[data-batch-reveal-sub]");
  const orderEl = qs("[data-batch-reveal-order-id]");
  const etaEl = qs("[data-batch-reveal-eta]");
  if (headlineEl && headline) headlineEl.textContent = headline;
  if (subEl && sub) subEl.textContent = sub;
  if (orderEl && orderId) orderEl.textContent = orderId;
  if (etaEl && eta) etaEl.textContent = eta;
  // Show
  root.hidden = false;
  root.setAttribute("aria-hidden", "false");
  requestAnimationFrame(() => {
    root.dataset.open = "true";
  });
  // Auto-dismiss
  clearTimeout(maybeShowBatchReveal._timer);
  maybeShowBatchReveal._timer = setTimeout(() => hideBatchReveal(), 6000);
}

function hideBatchReveal() {
  const root = qs("[data-batch-reveal]");
  if (!root) return;
  root.dataset.open = "false";
  root.setAttribute("aria-hidden", "true");
  setTimeout(() => { root.hidden = true; }, 480);
  clearTimeout(maybeShowBatchReveal._timer);
}

// Swipe-to-dismiss handler for the cart drawer. Emil's drawer rules:
//   - velocity > 0.11 px/ms dismisses regardless of distance (a flick is
//     intent enough)
//   - distance past 35% of drawer width dismisses
//   - damping on the opposite axis so dragging left (past closed) feels like
//     hitting elastic, not a wall
//   - additional touch points after drag starts are ignored
//   - pointer capture ensures drag continues if the finger leaves the bounds
function wireDrawerGestures(drawer) {
  let startX = 0;
  let startTime = 0;
  let dx = 0;
  let dragging = false;
  let activePointerId = null;
  const DISMISS_THRESHOLD = 0.35;       // fraction of width
  const VELOCITY_THRESHOLD = 0.11;      // px / ms

  const onDown = (event) => {
    // Ignore non-primary buttons + multi-touch follow-ups
    if (event.isPrimary === false) return;
    if (dragging) return;
    // Don't intercept touches on form controls inside the drawer (qty steppers,
    // inputs, the remove button, etc.) — the user is interacting with them.
    if (event.target.closest("button, input, textarea, select, a, label")) return;
    dragging = true;
    activePointerId = event.pointerId;
    startX = event.clientX;
    startTime = performance.now();
    dx = 0;
    drawer.setPointerCapture?.(event.pointerId);
    // Disable the CSS transition during drag — we set transform directly
    drawer.style.transition = "none";
  };
  const onMove = (event) => {
    if (!dragging || event.pointerId !== activePointerId) return;
    dx = event.clientX - startX;
    let translate;
    if (dx > 0) {
      // Dragging right (toward dismiss) — full 1:1 motion
      translate = dx;
    } else {
      // Dragging left (past closed) — damp it 1:0.25 so it feels elastic
      translate = dx * 0.25;
    }
    drawer.style.transform = `translateX(${translate}px)`;
  };
  const onUp = (event) => {
    if (!dragging || event.pointerId !== activePointerId) return;
    dragging = false;
    drawer.releasePointerCapture?.(event.pointerId);
    drawer.style.transition = "";
    const elapsed = performance.now() - startTime;
    const velocity = elapsed > 0 ? dx / elapsed : 0;
    const width = drawer.getBoundingClientRect().width || 390;
    const shouldDismiss = dx > width * DISMISS_THRESHOLD || velocity > VELOCITY_THRESHOLD;
    if (shouldDismiss) {
      drawer.style.transform = "";
      setCartDrawerOpen(false);
    } else {
      // Snap back to fully open
      drawer.style.transform = "";
    }
    activePointerId = null;
    dx = 0;
  };
  drawer.addEventListener("pointerdown", onDown);
  drawer.addEventListener("pointermove", onMove);
  drawer.addEventListener("pointerup", onUp);
  drawer.addEventListener("pointercancel", onUp);
}

function renderSupportLinks() {
  const fallback = supportWhatsAppHref("Hi Global Bestie, I need help with my order.");
  qsa("[data-support-whatsapp]").forEach((link) => {
    // Optional per-link context (e.g. the former custom-quote / "order this
    // look" CTAs reroute here with their own prefilled message).
    const msg = link.getAttribute("data-wa-message");
    link.href = msg ? supportWhatsAppHref(msg) : fallback;
  });
}

function renderBankDetails() {
  const settings = state.settings;
  // Bank details now show inline as the primary "where to pay" panel at
  // checkout. The previous "after approval" framing is gone — customers
  // transfer immediately.
  //
  // Sanity-warn (dev tools only) if the production settings are still
  // shipping the all-zeros placeholders from sampleSettings — those are
  // not real and customers can't transfer to them.
  if (
    !renderBankDetails._placeholderWarned &&
    (settings.account_number === sampleSettings.account_number ||
      settings.iban === sampleSettings.iban ||
      /^0+$/.test(String(settings.account_number || "").replace(/\D/g, "").replace(/^0+/, "")) ||
      /^PK0+/.test(String(settings.iban || "")))
  ) {
    // Warn once per session — renderBankDetails runs on every re-render, so an
    // un-guarded warn floods the console (~48× on a single page load) and
    // buries it. A single line is enough of a go-live reminder.
    renderBankDetails._placeholderWarned = true;
    // eslint-disable-next-line no-console
    console.warn(
      "[Global Bestie] Bank account/IBAN is still a placeholder. " +
      "Update the `settings` row in Supabase before going live."
    );
  }
  const copyChip = (val, label) => val
    ? `<button class="copy-chip" type="button" data-action="copy-text" data-copy="${attr(val)}" data-copy-label="${attr(label)}" aria-label="Copy ${attr(label)}"><span>Copy</span></button>`
    : "";
  setHTML("[data-bank-details]", `
    <dl class="bank-details-grid">
      <div><dt>Bank</dt><dd>${esc(settings.bank_name)}</dd></div>
      <div><dt>Account title</dt><dd>${esc(settings.account_title)}${copyChip(settings.account_title, "account title")}</dd></div>
      <div><dt>Account number</dt><dd><code>${esc(settings.account_number)}</code>${copyChip(settings.account_number, "account number")}</dd></div>
      <div><dt>IBAN</dt><dd><code>${esc(settings.iban || "Available on request")}</code>${copyChip(settings.iban, "IBAN")}</dd></div>
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
  if (order.status === "pending_review") return "Your order and payment reference are being matched. We will confirm the batch ETA on WhatsApp.";
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
        <button class="icon-button plain modal-close" type="button" data-action="close-modal" aria-label="Close details"><span aria-hidden="true">×</span></button>
        ${html}
      </section>
    </div>
  `;
  // Hide the mobile action bar + WhatsApp FAB while a modal is open so
  // their fixed-positioning never overlaps the modal's CTA buttons on
  // small screens.
  document.body.classList.add("modal-open");
  qs(".modal-backdrop")?.addEventListener("click", (e) => {
    if (!e.target.closest(".detail-modal")) closeModal();
  });
  qs(".detail-modal")?.focus();
}

function closeModal() {
  const root = qs("[data-modal-root]");
  if (root) root.innerHTML = "";
  document.body.classList.remove("modal-open");
  // Strip the product JSON-LD if we injected one for an open PDP.
  document.getElementById("product-jsonld")?.remove();
}

// Restock-notify modal — opens when a customer taps "Notify me when
// restocked" on a sold-out card. Collects a Pakistani mobile and posts
// it as a typed lead so the team can ping them via WhatsApp when stock
// returns. Prefills the phone from a saved profile if we have one.
function openRestockNotifyModal(productId) {
  const product = state.products.find((p) => p.id === productId);
  if (!product) return;
  const last = (() => { try { return localStorage.getItem("gb_last_phone") || ""; } catch { return ""; } })();
  const prefilled = isValidPkMobile(last) ? formatPkDisplay(last) : "";
  openModal(`
    <div class="restock-modal">
      <p class="kicker">Restock alert</p>
      <h2>Notify me when ${esc(product.title)} is back.</h2>
      <p class="confirmation-sub">Drop your WhatsApp number — we'll message you when this item is back in stock or open for preorder. No spam.</p>
      <label class="auth-label">
        <span>Phone (Pakistani mobile)</span>
        <input type="tel" data-restock-phone value="${attr(prefilled)}" placeholder="0300 1234567" autocomplete="tel" autofocus />
      </label>
      <div class="confirmation-actions">
        <button class="button primary wide" type="button" data-action="restock-notify-submit" data-product-id="${attr(product.id)}">Notify me</button>
        <button class="button ghost" type="button" data-action="close-modal">Cancel</button>
      </div>
    </div>
  `);
}

async function submitRestockNotify(productId) {
  const product = state.products.find((p) => p.id === productId);
  const raw = qs("[data-restock-phone]")?.value || "";
  const canon = canonPhone(raw);
  if (!isValidPkMobile(canon)) {
    toast("Please enter a valid Pakistani mobile number.");
    qs("[data-restock-phone]")?.focus();
    return;
  }
  const submitBtn = qs("[data-action='restock-notify-submit']");
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Saving…"; }
  try {
    await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_phone: canon,
        customer_name: "",
        source: "restock_notify",
        product_id: productId,
        product_title: product?.title || "",
        note: `Restock-notify request for ${product?.title || productId}`,
      }),
    });
    try { localStorage.setItem("gb_last_phone", canon); } catch {}
    closeModal();
    toast(`We'll message you on WhatsApp when ${product?.title || "it"} is back in stock.`);
  } catch {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Notify me"; }
    toast("Couldn't save just now — please try again or message us on WhatsApp.");
  }
}

// Adds a <script type="application/ld+json"> for the open product so
// crawlers / Google rich results still see a Product offer even though
// the PDP is a modal (no per-product route in this iteration).
function injectProductJsonLd(product) {
  if (!product) return;
  try {
    document.getElementById("product-jsonld")?.remove();
    const parts = productPricingParts(product);
    const price = parts?.total || product.customer_price_pkr || 0;
    if (!price) return;
    const availability = product.stock_mode === "preorder"
      ? "https://schema.org/PreOrder"
      : (Number(product.inventory || 0) > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock");
    const data = {
      "@context": "https://schema.org",
      "@type": "Product",
      "name": product.title,
      "image": [product.image_url, ...(Array.isArray(product.gallery_urls) ? product.gallery_urls : [])].filter(Boolean).slice(0, 6),
      "description": product.description || "",
      "brand": product.brand ? { "@type": "Brand", "name": product.brand } : undefined,
      "sku": product.id,
      "category": product.category || undefined,
      "offers": {
        "@type": "Offer",
        "url": `${location.origin}/shop?product=${encodeURIComponent(product.id)}`,
        "priceCurrency": "PKR",
        "price": String(price),
        "availability": availability,
        "itemCondition": "https://schema.org/NewCondition",
        "seller": { "@type": "Organization", "name": "Global Bestie" },
      },
    };
    const tag = document.createElement("script");
    tag.id = "product-jsonld";
    tag.type = "application/ld+json";
    tag.textContent = JSON.stringify(data);
    document.head.appendChild(tag);
  } catch {
    // Schema injection failures shouldn't block the PDP from opening.
  }
}

// Truncate a long product description to the first ~220 characters,
// breaking at the nearest word boundary, so the public PDP doesn't drown
// the customer in copy before the price + CTA. The full text reveals via
// a "Read more" toggle. Returns the parts the modal template needs.
function truncateProductDescription(raw, maxLen = 220) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return { full: "", short: "", truncated: false };
  if (trimmed.length <= maxLen) return { full: trimmed, short: trimmed, truncated: false };
  let cut = trimmed.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > maxLen * 0.6) cut = cut.slice(0, lastSpace);
  return { full: trimmed, short: cut.replace(/[,;:.\s]+$/, "") + "…", truncated: true };
}

function showProductDetails(productId) {
  const product = state.products.find((item) => item.id === productId);
  if (!product) return;
  // Track this open in the storefront's recently-viewed list (no-op on portal)
  if (document.body.dataset.page !== "portal") {
    recordRecentlyViewed(productId);
    // Inject Product + Offer JSON-LD so Google can pick up rich results
    // even though PDP is a modal, not a route. Removed on modal close.
    injectProductJsonLd(product);
  }
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
  // In-stock speed + urgency cues for the PDP (the fast-delivery edge).
  const dMinPdp = Number(product.delivery_days_min || 0);
  const dMaxPdp = Number(product.delivery_days_max || 0);
  const inStockDeliveryLabel = dMinPdp && dMaxPdp
    ? `Delivered in ${dMinPdp}–${dMaxPdp} days`
    : (dMaxPdp ? `Delivered in ${dMaxPdp} days` : "Delivered in 3–5 days");
  const pdpStockQty = Number(product.inventory || 0);
  const pdpLowStock = product.stock_mode === "in_stock" && pdpStockQty > 0 && pdpStockQty <= Number(product.low_stock_threshold ?? 2);
  const publicDetails = `
    <div><dt>Availability</dt><dd>${product.stock_mode === "preorder" ? "Preorder, sourced through the next USA batch" : `${Number(product.inventory || 0)} in stock, ready after payment match`}</dd></div>
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
  const sourcedFrom = retailerFromUrl(product.source_url);
  // Public-facing price breakdown intentionally omitted — customers see the
  // final all-inclusive PKR figure only. Admin/portal still gets the full
  // breakdown via the admin meta panel above.
  const priceBreakdown = "";
  openModal(`
    <div class="modal-grid product-detail-modal">
      <div class="product-gallery">
        <div class="gallery-main-wrap" data-zoom>
          <img class="gallery-main" id="gallery-main-img" src="${safeUrl(imageUrl(gallery[0]), "")}" alt="${attr(product.title)}" decoding="async" />
          ${sourcedFrom ? `<span class="sourced-badge" aria-label="Sourced from ${attr(sourcedFrom)}">✦ Sourced from ${esc(sourcedFrom)}</span>` : ""}
        </div>
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
        ${!isPortal && product.stock_mode === "in_stock" && pdpStockQty > 0 ? `
          <div class="instock-speed-strip">
            <span class="instock-speed-badge">⚡ ${esc(inStockDeliveryLabel)}</span>
            ${pdpLowStock
              ? `<span class="instock-low-badge">Only ${pdpStockQty} left</span>`
              : `<span class="instock-ready-badge">In stock · ready to ship</span>`}
          </div>
        ` : ""}
        ${isPortal ? "" : priceBreakdown}
        ${(() => {
          // Public PDP: lean description with a "Read more" toggle so
          // long copy doesn't dominate the modal. The portal keeps the
          // full description visible (admins want full context).
          if (isPortal) return `<p>${esc(product.description || "No description added yet.")}</p>`;
          const d = truncateProductDescription(product.description);
          if (!d.full) return `<p class="product-description-empty">No description yet.</p>`;
          if (!d.truncated) return `<p class="product-description">${esc(d.full)}</p>`;
          return `
            <div class="product-description is-clampable">
              <p data-desc-short>${esc(d.short)}</p>
              <p data-desc-full hidden>${esc(d.full)}</p>
              <button class="description-toggle" type="button" data-action="toggle-description" aria-expanded="false">Read more</button>
            </div>
          `;
        })()}
        <div class="payment-ledger product-ledger">
          <article><span>${product.stock_mode === "preorder" ? "50% advance due" : "Full payment due"}</span><strong>${PKR.format(advanceDue)}</strong></article>
          ${balanceDue > 0 ? `<article><span>Balance on arrival</span><strong>${PKR.format(balanceDue)}</strong></article>` : ""}
          <article><span>Shipment</span><strong>${product.stock_mode === "preorder" ? esc(nextBatchArrivalLabel()) : esc(inStockDeliveryLabel)}</strong></article>
        </div>
        ${!isPortal && product.stock_mode === "preorder" ? `
          <div class="preorder-explainer" aria-label="How preorder works">
            <p class="preorder-explainer-head">How your preorder works</p>
            <ol class="preorder-steps">
              <li><span class="pe-num">1</span><span class="pe-label">Order + pay ${PKR.format(advanceDue)} advance</span></li>
              <li><span class="pe-num">2</span><span class="pe-label">We source it in the USA</span></li>
              <li><span class="pe-num">3</span><span class="pe-label">Batch arrives in Pakistan</span></li>
              <li><span class="pe-num">4</span><span class="pe-label">Pay ${PKR.format(balanceDue)} balance · doorstep delivery</span></li>
            </ol>
            <p class="preorder-explainer-note">The balance is due <strong>only</strong> once your parcel reaches Pakistan, before dispatch. Typically ~4 weeks — we keep you updated on WhatsApp the whole way.</p>
          </div>
        ` : ""}
        ${isPortal ? `<dl class="detail-list">${portalDetails}</dl>` : ""}
        ${isPortal ? "" : `
          <aside class="variant-callout" aria-label="Variants and customization">
            <strong>Choose your ${esc(variantLabel(product))}</strong>
            <p class="variant-hint">${product.variants && product.variants.trim()
              ? `Available: ${esc(product.variants.trim())}`
              : "Tell us your preferred size, shade, or colour below — we'll confirm availability on WhatsApp once your order's in."}</p>
            <label class="variant-input-label">
              <span>${esc(variantLabel(product))}</span>
              <input type="text" data-pdp-variant data-product-id="${attr(product.id)}" placeholder="${esc(variantPlaceholder(product))}" autocomplete="off" />
            </label>
          </aside>
        `}
        <div class="product-modal-cta">
          ${isPortal ? `<button class="button primary" type="button" data-action="edit-product" data-product-id="${attr(product.id)}">Edit product</button>` : `<button class="button primary wide" type="button" data-action="add-cart" data-product-id="${attr(product.id)}" data-add-from-pdp="1">Add to bag · ${PKR.format(parts.total)}</button>`}
          ${isPortal ? "" : `<a class="button secondary" href="${safeUrl(supportWhatsAppHref(`Hi Global Bestie, I want details for ${product.title}`))}" target="_blank" rel="noreferrer">Ask on WhatsApp</a>`}
          ${isPortal ? "" : `<small class="cta-helper">50% advance at checkout · balance on Pakistan arrival</small>`}
        </div>
      </div>
      ${!isPortal ? renderRecentlyViewedStrip(product.id) : ""}
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

  // Returning-customer banner. Find every other order under the same canonical
  // phone — if there's >1, this is a repeat customer. Surfaces their LTV and
  // prior city up top so the team treats them with the right attention.
  const canon = canonPhone(order.customer_phone);
  const samePhoneOrders = (state.orders || []).filter((o) => canonPhone(o.customer_phone) === canon);
  const customerRow = (state.customers || []).find((c) => c.phone === canon);
  const repeatCount = customerRow?.total_orders ?? samePhoneOrders.length;
  const ltv = customerRow?.total_revenue_pkr ?? samePhoneOrders.reduce((sum, o) => sum + Number(o.total_pkr || 0), 0);
  const isRepeat = repeatCount >= 2;
  const repeatBanner = isRepeat ? `
    <button class="repeat-customer-banner" type="button" data-action="open-customer" data-customer-phone="${attr(canon)}" aria-label="Open ${esc(order.customer_name || "")} customer profile">
      <strong>★ Returning customer · order ${repeatCount}</strong>
      <span>Lifetime spend ${PKR.format(ltv)} · ${customerRow?.city || order.city || ""} · last seen ${customerRow?.last_seen ? new Date(customerRow.last_seen).toLocaleDateString("en-PK", { month: "short", day: "numeric" }) : "this order"}</span>
      <span class="repeat-arrow" aria-hidden="true">›</span>
    </button>
  ` : "";
  // Full-screen takeover: capture the currently active admin tab so the
  // back button knows where to return, then render the order detail into
  // its own panel.
  if (!state._previousAdminPanel) {
    const current = qs(".admin-tab.active");
    state._previousAdminPanel = current?.dataset.adminTab || "overview";
  }
  state._currentOrderId = orderId;
  renderOrderFullscreen(`
    <div class="order-fs-grid">
      ${renderOrderProgressBar(order)}
      <div class="order-fs-hero">
        <div class="drawer-hero">
        <div>
          <p class="kicker">Order command drawer</p>
          <h2>${order.id}</h2>
          <p>${esc(order.customer_name || "")} · ${esc(formatPkDisplay(canon) || order.customer_phone || "")} · ${esc(order.channel || "Storefront")} · ${esc(order.priority || "Standard")} · Owner ${esc(order.owner || "Unassigned")}</p>
        </div>
        <div class="drawer-actions">
          ${(() => {
            // Exactly one filled primary — the single most likely next action
            // for this order's state. Everything else is secondary so the eye
            // doesn't have to weigh five equal-weight buttons.
            if (order.status === "pending_review") {
              return `<button class="button primary" type="button" data-action="accept-order" data-order-id="${attr(order.id)}">Accept order</button>`;
            }
            const next = nextOrderStage(order.status);
            if (next) {
              return `<button class="button primary" type="button" data-action="advance-order" data-order-id="${attr(order.id)}">Advance to ${esc(ORDER_STAGE_SHORT[next] || next)} →</button>`;
            }
            return "";
          })()}
          <button class="button secondary" type="button" data-action="mark-balance-due" data-order-id="${attr(order.id)}">Mark balance due</button>
          <button class="button secondary" type="button" data-action="send-balance-reminder" data-order-id="${attr(order.id)}">Balance reminder</button>
          <button class="button secondary" type="button" data-action="open-wa-templates" data-order-id="${attr(order.id)}">WhatsApp templates</button>
          ${!["cancelled", "delivered"].includes(order.status) ? `<button class="button ghost danger-ghost" type="button" data-action="cancel-order" data-order-id="${attr(order.id)}">Cancel order</button>` : ""}
        </div>
      </div>
      ${order.status === "cancelled" ? `
        <div class="cancelled-banner">
          <strong>✕ Order cancelled</strong>
          <span>${esc(cancelReasonLabel(order.cancel_reason))}${order.cancelled_at ? ` · ${formatDate(order.cancelled_at.slice(0, 10))}` : ""}</span>
        </div>` : ""}
      ${repeatBanner}
      ${(() => {
        // If the auto-WhatsApp on this order failed silently, surface it
        // here as a yellow banner so the operator can manually resend.
        const failed = events.find((e) => e.status === "auto_whatsapp_failed");
        const succeeded = events.find((e) => e.status === "auto_whatsapp_sent" && new Date(e.created_at) > new Date(failed?.created_at || 0));
        if (failed && !succeeded) {
          return `
            <div class="wa-failed-banner">
              <strong>⚠ Auto-WhatsApp didn't send</strong>
              <span>${esc(failed.note || "Maychats returned an error.")}</span>
              <button class="button secondary" type="button" data-action="open-wa-templates" data-order-id="${attr(order.id)}">Send manually</button>
            </div>
          `;
        }
        return "";
      })()}
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
      ${(order.status === "cancelled" && Number(order.refund_due_pkr || 0) > 0) ? (() => {
        const due = orderRefundOutstanding(order);
        const refunded = order.refund_status === "refunded" || due <= 0;
        return `
          <section class="detail-panel refund-review-panel">
            <div class="panel-title-row">
              <h3>Refund</h3>
              <span class="status-pill ${refunded ? "in_stock" : "preorder"}">${refunded ? "Refunded" : "Refund owed"}</span>
            </div>
            <div class="verification-grid">
              <div><span>Collected</span><strong>${PKR.format(orderCollectedPkr(order))}</strong></div>
              <div><span>Refund ${refunded ? "paid" : "owed"}</span><strong>${PKR.format(refunded ? Number(order.refund_paid_pkr || 0) : due)}</strong></div>
              <div><span>Reason</span><strong>${esc(cancelReasonLabel(order.cancel_reason))}</strong></div>
            </div>
            ${refunded
              ? `<p class="refund-done-note">↩ Refund sent${order.refunded_at ? ` on ${formatDate(order.refunded_at.slice(0, 10))}` : ""}${order.refund_reference ? ` · ref ${esc(order.refund_reference)}` : ""}.</p>`
              : `<label>Refund reference (optional)<input type="text" data-refund-reference="${attr(order.id)}" placeholder="Bank ref / transaction id" /></label>
                 <button class="button primary wide" type="button" data-action="mark-order-refunded" data-order-id="${attr(order.id)}">Mark ${PKR.format(due)} refunded</button>`}
          </section>`;
      })() : ""}
      <div class="detail-columns tri">
        <section class="detail-panel">
          <h3>Customer</h3>
          <dl class="detail-list">
            <div><dt>Name</dt><dd>${esc(order.customer_name || "")}</dd></div>
            <div><dt>WhatsApp</dt><dd>${esc(formatPkDisplay(canonPhone(order.customer_phone)) || order.customer_phone || "")}</dd></div>
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
            <div><dt>Assigned batch</dt><dd>${batch ? `${esc(batch.name)} · ${esc(batchStatusLabel(batch.status))}` : "Not assigned"}</dd></div>
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
              ${state.shipmentBatches.map((item) => `<option value="${attr(item.id)}" ${batch?.id === item.id ? "selected" : ""}>${esc(item.name)} · ${esc(formatDate(item.eta_date))} · ${Number(item.used || 0)}/${Number(item.capacity || 0)}</option>`).join("")}
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
                <img src="${safeUrl(imageUrlThumb(item.image_url || product.image_url || ""), "")}" alt="${attr(item.title || "")}" loading="lazy" decoding="async" />
                <div>
                  <strong>${esc(item.title || "")}</strong>
                  <small>${item.stock_mode === "preorder" ? "Preorder" : "In stock"} · Qty ${Number(item.quantity || 1)} · ${esc(item.variant || product.variants || "Variant not set")}</small>
                  <small>${esc(item.source_status || "Source status pending")} · ${esc(item.source_url || product.source_url || "No source URL")}</small>
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
                <strong>${esc(message.source || "")} · ${esc(message.direction || "")}</strong>
                <p>${esc(message.body || "")}</p>
                <small>${esc(new Date(message.created_at).toLocaleString())}</small>
              </article>
            `).join("") || "<p>No messages synced yet.</p>"}
          </div>
        </section>
        <section class="detail-panel">
          <h3>Timeline <span class="timeline-count">${events.length}</span></h3>
          <div class="detail-lines order-timeline">
            ${renderOrderTimeline(events) || "<p>No events recorded yet.</p>"}
          </div>
        </section>
      </div>
      </div>
    </div>
  `);
}

// Switches the admin panels so the dedicated order-detail full-screen panel
// is the only active one. The sidebar tab buttons get deactivated so the
// operator knows they're in a focused view; the toolbar's Back button
// restores whatever was active before.
function renderOrderFullscreen(html) {
  const slot = qs("[data-order-fs]");
  if (!slot) return;
  slot.innerHTML = html;
  qsa("[data-admin-tab]").forEach((t) => t.classList.remove("active"));
  qsa("[data-admin-panel]").forEach((p) => p.classList.toggle("active", p.dataset.adminPanel === "order-detail"));
  // Scroll to the top of the new panel so the user sees the order header.
  qs("[data-admin-panel='order-detail']")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// Horizontal stage tracker — six dots, current one pulsing. Renders above
// every order detail view so the team sees where the order is at a glance.
function renderOrderProgressBar(order) {
  const stages = [
    { key: "pending_review", label: "Received" },
    { key: "accepted", label: "Accepted" },
    { key: "sourcing", label: "Sourcing" },
    { key: "in_transit", label: "In transit" },
    { key: "pakistan_processing", label: "Arrived" },
    { key: "delivered", label: "Delivered" },
  ];
  const currentIdx = stages.findIndex((s) => s.key === order.status);
  const isCancelled = order.status === "cancelled";
  return `
    <div class="order-stage-bar ${isCancelled ? "is-cancelled" : ""}">
      ${stages.map((s, i) => {
        const state = i < currentIdx ? "done" : i === currentIdx ? "current" : "todo";
        return `
          <div class="stage-dot ${state}">
            <span class="stage-dot-circle">${i + 1}</span>
            <span class="stage-dot-label">${esc(s.label)}</span>
          </div>
        `;
      }).join("")}
      ${isCancelled ? `<div class="stage-cancelled-overlay">Cancelled</div>` : ""}
    </div>
  `;
}

// Triggered by the back button on the full-screen order view. Restores the
// previously-active admin tab.
function backFromOrderFullscreen() {
  const tab = state._previousAdminPanel || "overview";
  state._previousAdminPanel = null;
  state._currentOrderId = null;
  qs(`[data-admin-tab="${tab}"]`)?.click();
}

function renderAdmin({ skipOrdersSurfaces = false } = {}) {
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
    ["Human DM handoffs", handoffs, "Variant, complaint, payment, delay, and unclear-intent messages need a person.", "customers"],
  ].map(([label, value, body, tab]) => `
    <button class="today-card" type="button" data-admin-tab-jump="${tab}">
      <strong>${value}</strong>
      <span>${label}</span>
      <small>${body}</small>
    </button>
  `).join(""));

  renderAdminTabBadges({ pending, balanceDue, handoffs, trendApprovals, lowStock, activeBatch });
  updateInventoryBadge();

  setHTML("[data-admin-action-orders]", orders
    .filter((order) => ["pending_review", "accepted", "sourcing"].includes(order.status))
    .map((order) => {
      const payment = orderPaymentSummary(order);
      const due = amountDueForOrder(order);
      return `
      <div class="order-line" role="button" tabindex="0" data-action="view-order" data-order-id="${attr(order.id)}">
        <div><strong>${esc(order.id)}</strong><small>${esc(order.customer_name || "")} · ${esc(order.owner || "Unassigned")} · ${esc(orderCompletionRisk(order))}</small></div>
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

  // commitOrderStage skips this: it already patched the one row in place, and
  // re-swapping the tbody would destroy the focused row mid-keyboard-flow.
  if (!skipOrdersSurfaces) renderAdminOrders();
  renderShipmentBatches();
  renderTrends();
  fillSettingsForm();
  renderDemoBanner();
  renderFxBanner();
  renderLaunchChecklist();
  renderOperatorAlertsPanel();
  renderCashflow();
  renderCustomersTab();
  renderOverviewExtras();
  renderScheduledBroadcastsList();
  renderCampaignReplyRates();
  renderTemplatesEditor();
  renderTodayRibbon();
  renderWhatsappInbox();
  renderProductSalesSparklines();
  renderChurnAlerts();
}

// Renders the last 10 inbound WhatsApp/Instagram messages into the
// Growth Studio inbox pane. Each row offers a one-click WA template
// reply via the customer modal's WA helper.
function renderWhatsappInbox() {
  const slot = qs("[data-lead-inbox]");
  if (!slot) return;
  const inbound = (state.marketingMessages || [])
    .filter((m) => m.direction === "inbound" && m.body)
    .slice(0, 10);
  if (!inbound.length) {
    slot.innerHTML = `<p class="cashflow-empty">No inbound messages in the last 90 days.</p>`;
    return;
  }
  slot.innerHTML = inbound.map((m) => {
    const canon = canonPhone(m.customer_phone);
    const phoneLabel = isValidPkMobile(canon) ? formatPkDisplay(canon) : (m.customer_phone || "Unknown");
    const customer = (state.customers || []).find((c) => c.phone === canon);
    const name = customer?.name || "—";
    const isReply = !!m.replied_to_broadcast;
    return `
      <article class="inbox-row${isReply ? " is-reply" : ""}">
        <header>
          <strong>${esc(name)}</strong>
          <small>${esc(phoneLabel)} · ${esc(relativeTime(m.created_at))}${isReply ? " · reply to broadcast" : ""}</small>
        </header>
        <p>${esc((m.body || "").slice(0, 220))}${m.body?.length > 220 ? "…" : ""}</p>
        <div class="inbox-row-actions">
          ${canon ? `<a class="button secondary" href="https://wa.me/${canon}" target="_blank" rel="noreferrer">Reply on WhatsApp</a>` : ""}
          ${customer ? `<button class="button secondary" type="button" data-action="open-customer" data-customer-phone="${attr(canon)}">Open customer</button>` : ""}
        </div>
      </article>
    `;
  }).join("");
}

// Compact 8-week sales sparkline for an admin product card. Reads from the
// pre-computed state._productSalesByWeek bucket array. Returns empty string
// when the product has zero sales in the window so we don't show a flat
// "nothing happened" bar.
function renderProductSparkline(productId) {
  const buckets = state._productSalesByWeek;
  if (!Array.isArray(buckets) || !buckets.length) return "";
  const series = buckets.map((b) => b?.get?.(productId) || 0);
  const total = series.reduce((s, v) => s + v, 0);
  if (!total) return "";
  const max = Math.max(1, ...series);
  const w = 96, h = 18, gap = 1;
  const bw = (w - gap * 7) / 8;
  const bars = series.map((v, i) => {
    const bh = Math.max(1, (v / max) * (h - 2));
    const x = i * (bw + gap);
    const y = h - bh;
    const op = v > 0 ? (0.45 + (v / max) * 0.55) : 0.15;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="1" fill="var(--pink)" fill-opacity="${op.toFixed(2)}"/>`;
  }).join("");
  return `
    <div class="product-sparkline" title="${total} units sold in last 8 weeks">
      <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">${bars}</svg>
      <small>${total} sold · 8 wk</small>
    </div>
  `;
}

// Per-product sales sparkline column on the Products tab — 8-week velocity
// so the team can see what's selling at a glance.
function renderProductSalesSparklines() {
  // We compute the per-product weekly sales bucket once and stash on each
  // product card via state. The actual render is on the Products tab card
  // (productCard()), so this function just builds the lookup table.
  if (!has("[data-admin-products]") && !has("[data-shop-products]")) return;
  const weeks = new Array(8).fill(0).map(() => new Map());
  const startOfWeek = Date.now() - 7 * 86_400_000;
  for (const order of state.orders || []) {
    const t = new Date(order.created_at || 0).getTime();
    if (Number.isNaN(t)) continue;
    const weeksAgo = Math.floor((Date.now() - t) / (7 * 86_400_000));
    if (weeksAgo < 0 || weeksAgo > 7) continue;
    const bucketIdx = 7 - weeksAgo; // 0=oldest, 7=newest
    for (const item of orderItems(order)) {
      if (!item.product_id) continue;
      const bucket = weeks[bucketIdx];
      bucket.set(item.product_id, (bucket.get(item.product_id) || 0) + Number(item.quantity || 1));
    }
  }
  state._productSalesByWeek = weeks;
}

// Customer churn alert — surfaces a small banner on the Customers tab
// listing customers with ≥3 orders who haven't bought in 90+ days.
function renderChurnAlerts() {
  // The banner lives inside the Customers tab; render only if it's mounted.
  const customersTab = qs("[data-admin-panel='customers']");
  if (!customersTab) return;
  const ninetyDaysAgo = Date.now() - 90 * 86_400_000;
  const churning = (state.customers || []).filter((c) => {
    const orders = Number(c.total_orders || 0);
    if (orders < 3) return false;
    const last = c.last_seen ? new Date(c.last_seen).getTime() : 0;
    return last && last < ninetyDaysAgo;
  });
  let banner = qs("[data-churn-alert]");
  if (!banner) {
    banner = document.createElement("div");
    banner.dataset.churnAlert = "";
    banner.className = "churn-alert-banner hidden";
    const segmentBar = qs("[data-segment-bar]");
    if (segmentBar) segmentBar.parentNode.insertBefore(banner, segmentBar);
  }
  if (!churning.length) {
    banner.classList.add("hidden");
    return;
  }
  banner.classList.remove("hidden");
  banner.innerHTML = `
    <strong>${churning.length} repeat customer${churning.length === 1 ? "" : "s"} haven't bought in 90+ days</strong>
    <span>Win-back targets — broadcast a "we miss you" template to bring them back.</span>
    <button class="button secondary" type="button" data-action="apply-churn-segment">Open win-back list</button>
  `;
}

// Conversion funnel — orders over the last 30 days broken down into the
// four key states (received → accepted → paid → delivered) so the team
// can see the drop-off shape at a glance.
// 30-day order heatmap. GitHub-style grid; weekdays as rows, weeks as
// columns. Each cell intensity = number of orders that day, scaled to
// the busiest day in the window. Hover for "Mon 12 May · 3 orders".
function renderOrderHeatmap() {
  const slot = qs("[data-order-heatmap]");
  if (!slot) return;
  const days = 30;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  // Build a contiguous array of {date, count} for the last `days` days
  // (oldest first). Then group by calendar week starting from the cell's
  // weekday so the grid columns line up.
  const buckets = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today.getTime() - i * 86_400_000);
    const dayStart = date.getTime();
    const dayEnd = dayStart + 86_400_000;
    const count = (state.orders || []).filter((o) => {
      const t = new Date(o.created_at || 0).getTime();
      return t >= dayStart && t < dayEnd;
    }).length;
    buckets.push({ date, count });
  }
  const maxCount = Math.max(1, ...buckets.map((b) => b.count));

  // Group into week columns. Find the Monday of the oldest week to pad
  // leading empty cells.
  const firstDow = buckets[0].date.getDay(); // 0=Sun..6=Sat
  // Use Mon-as-start (offset = (dow + 6) % 7)
  const pad = (firstDow + 6) % 7;
  const cells = [];
  for (let i = 0; i < pad; i++) cells.push(null);
  for (const b of buckets) cells.push(b);

  // Build column-major grid: 7 rows (Mon..Sun), N weeks.
  const weeks = Math.ceil(cells.length / 7);
  const weekdayLabels = ["Mon", "", "Wed", "", "Fri", "", "Sun"];

  let html = `<div class="heatmap-grid" style="--weeks:${weeks}">`;
  html += `<div class="heatmap-weekdays">${weekdayLabels.map((l) => `<span>${l}</span>`).join("")}</div>`;
  html += `<div class="heatmap-cells">`;
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const idx = w * 7 + d;
      const cell = cells[idx];
      if (!cell) {
        html += `<span class="heatmap-cell heatmap-empty" aria-hidden="true"></span>`;
        continue;
      }
      const intensity = cell.count === 0 ? 0 : Math.ceil((cell.count / maxCount) * 4); // 0..4
      const label = `${cell.date.toLocaleDateString("en-PK", { weekday: "short", day: "numeric", month: "short" })} · ${cell.count} order${cell.count === 1 ? "" : "s"}`;
      html += `<span class="heatmap-cell heatmap-l${intensity}" title="${attr(label)}" aria-label="${attr(label)}"></span>`;
    }
  }
  html += `</div></div>`;
  // Legend.
  html += `<div class="heatmap-legend"><span>Quiet</span><span class="heatmap-cell heatmap-l0"></span><span class="heatmap-cell heatmap-l1"></span><span class="heatmap-cell heatmap-l2"></span><span class="heatmap-cell heatmap-l3"></span><span class="heatmap-cell heatmap-l4"></span><span>Busy</span></div>`;
  slot.innerHTML = html;
}

function renderConversionFunnel() {
  const slot = qs("[data-conversion-funnel]");
  if (!slot) return;
  const cutoff = Date.now() - 30 * 86_400_000;
  const window30 = (state.orders || []).filter((o) => new Date(o.created_at || 0).getTime() >= cutoff);
  const total = window30.length;
  const accepted = window30.filter((o) => !["pending_review", "cancelled"].includes(o.status)).length;
  const paid = window30.filter((o) => ["paid_in_full", "balance_uploaded", "advance_confirmed"].includes(o.payment_status) || o.status === "delivered").length;
  const delivered = window30.filter((o) => o.status === "delivered").length;

  // Previous 30-day window for comparison
  const prevCutoff = cutoff - 30 * 86_400_000;
  const prev30 = (state.orders || []).filter((o) => {
    const t = new Date(o.created_at || 0).getTime();
    return t >= prevCutoff && t < cutoff;
  });
  const prevDelivered = prev30.filter((o) => o.status === "delivered").length;
  const prevConvPct = prev30.length ? (prevDelivered / prev30.length) * 100 : 0;
  const currentConvPct = total ? (delivered / total) * 100 : 0;
  const trend = currentConvPct - prevConvPct;

  const stages = [
    { label: "Received", count: total, pct: 100, tone: "info" },
    { label: "Accepted", count: accepted, pct: total ? (accepted / total) * 100 : 0, tone: "info" },
    { label: "Paid", count: paid, pct: total ? (paid / total) * 100 : 0, tone: "info" },
    { label: "Delivered", count: delivered, pct: total ? (delivered / total) * 100 : 0, tone: "ok" },
  ];

  // True funnel SVG — each stage is a horizontal band with width
  // proportional to its volume vs received. Drop-off labels sit between
  // bands. Animated draw on first render so the eye follows top-to-bottom.
  const FUNNEL_W = 540;
  const FUNNEL_H = 220;
  const PADDING_X = 30;
  const BAND_GAP = 6;
  const bands = stages.length;
  const bandH = (FUNNEL_H - (bands - 1) * BAND_GAP) / bands;
  const maxWidth = FUNNEL_W - PADDING_X * 2;
  const dropOffs = stages.slice(1).map((s, i) => {
    const prev = stages[i].count;
    if (!prev) return null;
    const lost = prev - s.count;
    const lostPct = (lost / prev) * 100;
    return { from: stages[i].label, to: s.label, lost, lostPct };
  });

  const bandsSvg = stages.map((s, i) => {
    const widthPct = Math.max(2, s.pct); // floor so 0%/very-low still visible
    const width = (widthPct / 100) * maxWidth;
    const x = (FUNNEL_W - width) / 2;
    const y = i * (bandH + BAND_GAP);
    const fill = s.tone === "ok"
      ? "url(#funnelGradOk)"
      : "url(#funnelGradInfo)";
    return `<g class="funnel-band" style="--bi:${i}">
      <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${width.toFixed(1)}" height="${bandH.toFixed(1)}" rx="8" fill="${fill}" />
      <text x="${(FUNNEL_W / 2).toFixed(0)}" y="${(y + bandH / 2 + 5).toFixed(0)}" text-anchor="middle" class="funnel-band-label">
        ${esc(s.label)} · ${s.count} · ${s.pct.toFixed(0)}%
      </text>
    </g>`;
  }).join("");

  slot.innerHTML = `
    <div class="funnel-canvas">
      <svg viewBox="0 0 ${FUNNEL_W} ${FUNNEL_H}" class="funnel-svg" role="img" aria-label="Conversion funnel for the last 30 days">
        <defs>
          <linearGradient id="funnelGradInfo" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="var(--pink-2)" stop-opacity="0.85" />
            <stop offset="100%" stop-color="var(--pink-3)" stop-opacity="0.95" />
          </linearGradient>
          <linearGradient id="funnelGradOk" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="var(--ink)" stop-opacity="0.78" />
            <stop offset="100%" stop-color="var(--ink)" stop-opacity="0.95" />
          </linearGradient>
        </defs>
        ${bandsSvg}
      </svg>
      <div class="funnel-dropoffs">
        ${dropOffs.map((d) => d ? `
          <div class="funnel-drop"><span>${esc(d.from)} → ${esc(d.to)}</span><strong>−${d.lost} (${d.lostPct.toFixed(0)}%)</strong></div>
        ` : "").join("")}
      </div>
    </div>
    <p class="funnel-summary">
      ${total > 0
        ? `<strong>${currentConvPct.toFixed(1)}%</strong> received → delivered conversion ${prev30.length ? `· <span class="trend tone-${trend >= 0 ? "ok" : "warn"}">${trend >= 0 ? "↑" : "↓"} ${Math.abs(trend).toFixed(1)}pp vs prior 30 days</span>` : ""}`
        : "No orders in the last 30 days."}
    </p>
  `;
}

// SLA dashboard — for each stage, computes the average number of days an
// order spent in that stage over the last 30 days using order_events
// timestamps. Highlights bottlenecks (stages > average + slow ones get a
// warn tone). Falls back gracefully when events history is sparse.
function renderSlaDashboard() {
  const slot = qs("[data-sla-dashboard]");
  if (!slot) return;
  const stages = [
    { key: "pending_review", label: "Pending review", target: 0.02 }, // ≤30 min
    { key: "accepted", label: "Accepted → sourcing", target: 1 },
    { key: "sourcing", label: "Sourcing → in transit", target: 7 },
    { key: "in_transit", label: "In transit → PK", target: 14 },
    { key: "pakistan_processing", label: "Arrived → delivered", target: 2 },
  ];
  const cutoff = Date.now() - 30 * 86_400_000;
  const buckets = new Map(stages.map((s) => [s.key, []]));
  // For each order, walk events to compute time-in-each-stage. The duration
  // for stage X is (timestamp of next stage's event − this stage's event).
  for (const o of state.orders || []) {
    const events = orderEvents(o).filter((e) => e.created_at).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    for (let i = 0; i < events.length; i += 1) {
      const ev = events[i];
      if (!buckets.has(ev.status)) continue;
      const next = events.slice(i + 1).find((e) => buckets.has(e.status));
      if (!next) continue;
      const start = new Date(ev.created_at).getTime();
      if (start < cutoff) continue;
      const days = (new Date(next.created_at).getTime() - start) / 86_400_000;
      if (days >= 0) buckets.get(ev.status).push(days);
    }
  }
  const rows = stages.map((s) => {
    const samples = buckets.get(s.key);
    const avg = samples.length ? samples.reduce((sum, v) => sum + v, 0) / samples.length : null;
    const tone = avg === null ? "info" : avg > s.target * 1.5 ? "warn" : avg > s.target ? "info" : "ok";
    return { ...s, avg, samples: samples.length, tone };
  });
  slot.innerHTML = rows.map((r) => `
    <div class="sla-row tone-${r.tone}">
      <span class="sla-label">${esc(r.label)}</span>
      <span class="sla-value">${r.avg !== null ? `${r.avg.toFixed(r.avg < 1 ? 2 : 1)} d` : "—"}</span>
      <span class="sla-target">target ≤ ${r.target} d</span>
      <span class="sla-samples">${r.samples} orders</span>
    </div>
  `).join("");
}

// The sticky Today ribbon — a 4-stat heartbeat shown above every admin
// panel. Each stat is click-through to the relevant tab/filter so the team
// can drill into "what needs me now?" without scrolling for it.
function renderTodayRibbon() {
  const el = qs("[data-today-ribbon]");
  if (!el) return;
  const orders = state.orders || [];
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfDay.getTime() - 86_400_000);

  const pending = orders.filter((o) => o.status === "pending_review").length;
  const todayOrders = orders.filter((o) => new Date(o.created_at || 0) >= startOfDay);
  const yesterdayOrders = orders.filter((o) => {
    const t = new Date(o.created_at || 0).getTime();
    return t >= startOfYesterday.getTime() && t < startOfDay.getTime();
  });
  const revenueToday = todayOrders.reduce((s, o) => s + Number(o.total_pkr || 0), 0);
  const revenueYesterday = yesterdayOrders.reduce((s, o) => s + Number(o.total_pkr || 0), 0);
  const trend = revenueYesterday > 0
    ? Math.round(((revenueToday - revenueYesterday) / revenueYesterday) * 100)
    : (revenueToday > 0 ? 100 : 0);
  const trendArrow = trend > 0 ? "↑" : trend < 0 ? "↓" : "·";
  const trendTone = trend > 0 ? "ok" : trend < 0 ? "warn" : "info";

  const balanceOverdue = orders.filter((o) => {
    if (o.status !== "pakistan_processing") return false;
    const balance = Math.max(0, Number(o.balance_due_pkr || 0) - Number(o.balance_paid_pkr || 0));
    if (balance <= 0) return false;
    const arrivedAt = new Date(o.arrived_at || o.updated_at || o.created_at || 0).getTime();
    return (Date.now() - arrivedAt) >= 24 * 3_600_000;
  }).length;

  const oneWeek = Date.now() + 7 * 86_400_000;
  const arrivingSoon = (state.shipmentBatches || []).filter((b) => {
    if (b.status === "arrived") return false;
    const eta = new Date(b.eta_date || 0).getTime();
    return eta && eta <= oneWeek && eta >= Date.now() - 86_400_000;
  }).length;

  // "Day X of Y" progress for the next-arriving (open) batch. Anchors the
  // team to the current sourcing cycle — the bigger the number, the more
  // urgent it gets to nudge sourcing along.
  const nextBatch = (state.shipmentBatches || [])
    .filter((b) => b.status !== "arrived" && b.status !== "cancelled" && b.eta_date)
    .sort((a, b) => new Date(a.eta_date) - new Date(b.eta_date))[0];
  let batchProgress = null;
  if (nextBatch) {
    const eta = new Date(`${nextBatch.eta_date}T12:00:00`).getTime();
    const created = new Date(nextBatch.created_at || Date.now()).getTime();
    const totalDays = Math.max(1, Math.round((eta - created) / 86_400_000));
    const elapsedDays = Math.max(0, Math.min(totalDays, Math.round((Date.now() - created) / 86_400_000)));
    const pct = Math.round((elapsedDays / totalDays) * 100);
    batchProgress = {
      name: nextBatch.name || nextBatch.id,
      elapsedDays,
      totalDays,
      pct,
      capacity: Number(nextBatch.capacity || 0),
      used: Number(nextBatch.used || 0),
    };
  }

  el.innerHTML = `
    <button class="today-stat ${pending > 0 ? "tone-warn" : "tone-ok"}" type="button" data-action="jump-tab" data-action-filter="orders" title="Open Orders tab">
      <span class="today-label">Pending now</span>
      <strong>${pending}</strong>
      <small>${pending === 1 ? "order" : "orders"} awaiting approval</small>
    </button>
    <button class="today-stat tone-info" type="button" data-action="jump-tab" data-action-filter="orders" title="Today's orders">
      <span class="today-label">Revenue today</span>
      <strong>${shortPkr(revenueToday)}</strong>
      <small class="today-trend tone-${trendTone}">${trendArrow} ${Math.abs(trend)}% vs yesterday</small>
    </button>
    <button class="today-stat ${balanceOverdue > 0 ? "tone-warn" : "tone-ok"}" type="button" data-action="jump-tab" data-action-filter="cashflow" title="Open Cashflow">
      <span class="today-label">Balance overdue</span>
      <strong>${balanceOverdue}</strong>
      <small>${balanceOverdue === 1 ? "order" : "orders"} > 24h since arrival</small>
    </button>
    <button class="today-stat tone-info" type="button" data-action="jump-tab" data-action-filter="shipments" title="Open Shipments">
      <span class="today-label">Arriving this week</span>
      <strong>${arrivingSoon}</strong>
      <small>${arrivingSoon === 1 ? "batch" : "batches"} due</small>
    </button>
    ${batchProgress ? `
      <button class="today-stat today-batch-progress tone-info" type="button" data-action="jump-tab" data-action-filter="shipments" title="Open current batch in Shipments">
        <span class="today-label">${esc(batchProgress.name)}</span>
        <strong>Day ${batchProgress.elapsedDays} of ${batchProgress.totalDays}</strong>
        <div class="batch-progress-track" aria-hidden="true">
          <span class="batch-progress-fill" style="width:${batchProgress.pct}%"></span>
        </div>
        <small>${batchProgress.used}/${batchProgress.capacity || "?"} reserved · ${batchProgress.pct}% through</small>
      </button>
    ` : ""}
    <div class="today-freshness" data-today-freshness aria-live="polite" title="Data refresh status">
      <span class="freshness-dot" aria-hidden="true"></span>
      <span class="freshness-text" data-freshness-text>Updated just now</span>
    </div>
  `;
  // Remember when this render happened so the freshness ticker can read
  // it. Stamps every render — the ticker re-runs on a 5s interval.
  state._lastAdminRenderAt = Date.now();
}

// 5-second ticker that updates the "Updated Xs ago" label inside the
// today ribbon. Single global interval — restarts itself idempotently.
let _freshnessTickerId = null;
let _autoRefreshTickerId = null;
function startFreshnessTicker() {
  if (_freshnessTickerId) return;
  _freshnessTickerId = setInterval(() => {
    const target = qs("[data-freshness-text]");
    if (!target) return;
    const stampedAt = state._lastAdminRenderAt;
    if (!stampedAt) {
      target.textContent = "Waiting for data…";
      return;
    }
    const secs = Math.floor((Date.now() - stampedAt) / 1000);
    target.textContent =
      secs < 5  ? "Updated just now" :
      secs < 60 ? `Updated ${secs}s ago` :
      secs < 3600 ? `Updated ${Math.floor(secs / 60)}m ago` :
      `Updated ${Math.floor(secs / 3600)}h ago`;
    // Stale flag drops the dot's animation to red if it's been > 5 min
    // since last refresh — visual nudge to hit Refresh.
    const wrap = qs("[data-today-freshness]");
    if (wrap) {
      wrap.classList.toggle("is-stale", secs > 300);
    }
  }, 5_000);
}

// Soft SLA chime. Pure Web Audio so it ships with no asset weight and
// runs without permission. Triggered only when an order's SLA flips to
// danger between auto-refresh ticks AND the operator opted in.
const SLA_SOUND_KEY = "gb_sla_sound";

function slaSoundPreferred() {
  try { return localStorage.getItem(SLA_SOUND_KEY) === "on"; } catch { return false; }
}

let _slaAudioCtx = null;
function playSlaChime() {
  try {
    _slaAudioCtx = _slaAudioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const ctx = _slaAudioCtx;
    const now = ctx.currentTime;
    // Two-tone chirp — gentle E5 → A5 over 240ms. Not aggressive.
    [659.25, 880.00].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = now + i * 0.12;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.16, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.25);
    });
  } catch {
    /* AudioContext might be blocked until user gesture; silent fail */
  }
}

// Track which orders we've already chimed for so a sticky SLA breach
// doesn't replay the sound every tick.
const _chimedOrderIds = new Set();
function maybeFireSlaSound(newOrders) {
  if (!slaSoundPreferred()) return;
  for (const o of (state.orders || [])) {
    if (_chimedOrderIds.has(o.id)) continue;
    const sla = orderSlaBadge(o);
    if (sla && sla.level === "danger") {
      _chimedOrderIds.add(o.id);
      playSlaChime();
      // One chime per refresh — chain extras 400ms apart if multiple flipped
      break;
    }
  }
}

// Renders the Settings-tab "Operator alerts" panel — desktop notification
// toggle + SLA sound toggle. Surfaces the persisted preferences so the
// operator can see the current state.
function renderOperatorAlertsPanel() {
  const target = qs("[data-operator-alerts]");
  if (!target) return;
  const notifOn = desktopNotifPreferred();
  const soundOn = slaSoundPreferred();
  const permState = typeof Notification !== "undefined" ? Notification.permission : "unsupported";
  target.innerHTML = `
    <div class="alerts-row">
      <div>
        <strong>Desktop notifications</strong>
        <small>Get a system popup when new orders arrive — works even with the portal tab in the background.</small>
      </div>
      <button class="button ${notifOn ? "primary" : "secondary"}" type="button" data-action="toggle-desktop-notif">
        ${notifOn ? "On" : permState === "denied" ? "Blocked in browser" : "Turn on"}
      </button>
    </div>
    <div class="alerts-row">
      <div>
        <strong>SLA breach sound</strong>
        <small>Soft chime when an order's SLA flips to danger. One chime per breach, not per refresh.</small>
      </div>
      <button class="button ${soundOn ? "primary" : "secondary"}" type="button" data-action="toggle-sla-sound">
        ${soundOn ? "On" : "Turn on"}
      </button>
    </div>
  `;
}

// Print a packing slip / customer receipt for a single order. Opens a
// pop-up window with a clean A4 layout, triggers window.print(), then
// auto-closes once printing is dismissed. No server round-trip — the
// data is already in state.
function printOrderPackingSlip(orderId) {
  const order = (state.orders || []).find((o) => o.id === orderId);
  if (!order) {
    toast("Order not found.");
    return;
  }
  const items = (order.items || order.order_items || []).map((it) => `
    <tr>
      <td>${esc(it.title || "")}${it.variant ? `<br><small>${esc(it.variant)}</small>` : ""}</td>
      <td style="text-align:right">${Number(it.quantity || 1)}</td>
      <td style="text-align:right">${PKR.format(Number(it.unit_price_pkr || 0))}</td>
      <td style="text-align:right">${PKR.format(Number(it.unit_price_pkr || 0) * Number(it.quantity || 1))}</td>
    </tr>
  `).join("");
  const totalPkr = Number(order.total_pkr || 0);
  const advance = Number(order.advance_due_pkr || 0);
  const balance = Number(order.balance_due_pkr || 0);
  const html = `<!doctype html><html><head>
    <meta charset="utf-8" />
    <title>Packing slip · ${esc(order.id)}</title>
    <style>
      @page { size: A4; margin: 16mm; }
      * { box-sizing: border-box; }
      body { font-family: "Helvetica Neue", Arial, sans-serif; color: #1a1318; margin: 0; padding: 0; font-size: 13px; line-height: 1.55; }
      .ps-head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1a1318; padding-bottom: 14px; margin-bottom: 22px; }
      .ps-brand { font-size: 22px; font-weight: 700; letter-spacing: -0.01em; }
      .ps-brand small { display: block; font-size: 11px; font-weight: 400; color: #6b6168; margin-top: 2px; letter-spacing: 0.04em; text-transform: uppercase; }
      .ps-id { text-align: right; font-size: 11px; color: #6b6168; }
      .ps-id strong { display: block; font-size: 18px; color: #1a1318; letter-spacing: 0.02em; margin-bottom: 4px; }
      .ps-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px; }
      .ps-box { padding: 14px 16px; border: 1px solid #e1d9dc; border-radius: 6px; }
      .ps-box h4 { margin: 0 0 6px; font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #6b6168; }
      .ps-box p { margin: 0; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
      th { text-align: left; font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #6b6168; border-bottom: 2px solid #1a1318; padding: 8px 6px; }
      td { padding: 10px 6px; border-bottom: 1px solid #e1d9dc; vertical-align: top; }
      .ps-totals { width: 280px; margin-left: auto; }
      .ps-totals tr td { border: 0; padding: 4px 0; }
      .ps-totals tr.grand td { font-weight: 700; font-size: 16px; border-top: 2px solid #1a1318; padding-top: 10px; }
      .ps-footer { margin-top: 36px; padding-top: 14px; border-top: 1px solid #e1d9dc; font-size: 11px; color: #6b6168; text-align: center; }
      .ps-notes { margin-top: 18px; padding: 10px 14px; background: #f6f1f3; border-left: 3px solid #1a1318; font-size: 12px; }
    </style>
  </head><body>
    <div class="ps-head">
      <div class="ps-brand">Global Bestie<small>by kkR — USA to Pakistan</small></div>
      <div class="ps-id">
        <strong>${esc(order.id)}</strong>
        ${new Date(order.created_at).toLocaleString("en-PK")}
      </div>
    </div>

    <div class="ps-grid">
      <div class="ps-box">
        <h4>Deliver to</h4>
        <p><strong>${esc(order.customer_name)}</strong></p>
        <p>${esc(order.customer_phone)}${order.customer_email ? ` · ${esc(order.customer_email)}` : ""}</p>
        <p>${esc(order.address)}</p>
        <p>${esc(order.city)}</p>
      </div>
      <div class="ps-box">
        <h4>Order status</h4>
        <p><strong>${esc((order.status || "").replaceAll("_", " "))}</strong></p>
        <p>Payment: ${esc((order.payment_status || "").replaceAll("_", " "))}</p>
        <p>Channel: ${esc(order.channel || "Storefront")}</p>
        ${order.tracking_number ? `<p>Tracking: ${esc(order.tracking_number)}</p>` : ""}
      </div>
    </div>

    <table>
      <thead>
        <tr><th>Item</th><th style="text-align:right">Qty</th><th style="text-align:right">Unit</th><th style="text-align:right">Line total</th></tr>
      </thead>
      <tbody>${items || `<tr><td colspan="4">No items</td></tr>`}</tbody>
    </table>

    <table class="ps-totals">
      <tbody>
        <tr><td>Subtotal</td><td style="text-align:right">${PKR.format(totalPkr)}</td></tr>
        ${advance > 0 ? `<tr><td>50% advance</td><td style="text-align:right">${PKR.format(advance)}</td></tr>` : ""}
        ${balance > 0 ? `<tr><td>Balance on arrival</td><td style="text-align:right">${PKR.format(balance)}</td></tr>` : ""}
        <tr class="grand"><td>Total PKR</td><td style="text-align:right">${PKR.format(totalPkr)}</td></tr>
      </tbody>
    </table>

    ${order.notes ? `<div class="ps-notes"><strong>Order notes:</strong> ${esc(order.notes)}</div>` : ""}

    <div class="ps-footer">
      Thank you for shopping with Global Bestie. Questions? WhatsApp us — replies within 15 minutes during business hours.
    </div>

    <script>window.addEventListener("load", () => { setTimeout(() => window.print(), 200); });</script>
  </body></html>`;

  const win = window.open("", `gb-print-${order.id}`, "width=820,height=920");
  if (!win) {
    toast("Pop-up blocked — allow pop-ups for this site, then try again.");
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}

// Customer-level batch view — modal showing every order from this
// customer's phone. Quick path: from any order row, click the LTV chip
// or "N orders" badge to land here.
function openCustomerOrdersModal(phone, fallbackName) {
  if (!phone) return;
  const canon = canonPhone ? canonPhone(phone) : String(phone).replace(/\D/g, "");
  const orders = (state.orders || [])
    .filter((o) => (canonPhone ? canonPhone(o.customer_phone) : String(o.customer_phone || "").replace(/\D/g, "")) === canon)
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  if (!orders.length) {
    toast("No orders found for this customer.");
    return;
  }
  const name = orders[0].customer_name || fallbackName || "Customer";
  const total = orders.reduce((s, o) => s + Number(o.total_pkr || 0), 0);
  const delivered = orders.filter((o) => o.status === "delivered").length;
  const open = orders.filter((o) => !["delivered", "cancelled"].includes(o.status)).length;
  const balance = orders.reduce((s, o) => s + Math.max(0, Number(o.balance_due_pkr || 0) - Number(o.balance_paid_pkr || 0)), 0);
  const cities = [...new Set(orders.map((o) => o.city).filter(Boolean))];

  const rows = orders.map((o) => {
    const due = amountDueForOrder ? amountDueForOrder(o) : 0;
    return `
      <tr>
        <td><strong>${esc(o.id)}</strong><br><small>${new Date(o.created_at).toLocaleDateString()}</small></td>
        <td>${esc((o.status || "").replaceAll("_", " "))}<br><small>${esc((o.payment_status || "").replaceAll("_", " "))}</small></td>
        <td>${shortPkr(Number(o.total_pkr || 0))}<br><small>${due > 0 ? `Due ${shortPkr(due)}` : "Paid"}</small></td>
        <td>
          <button class="button secondary" type="button" data-action="view-order" data-order-id="${attr(o.id)}">Open</button>
        </td>
      </tr>
    `;
  }).join("");

  openModal(`
    <div class="customer-orders-modal">
      <header class="customer-orders-head">
        <div>
          ${ownerAvatar(name)}
          <h3>${esc(name)}</h3>
          <small>${esc(phone)}${cities.length ? ` · ${esc(cities.join(", "))}` : ""}</small>
        </div>
        <div class="customer-orders-stats">
          <div><span>Lifetime spend</span><strong>${PKR.format(total)}</strong></div>
          <div><span>Orders</span><strong>${orders.length}</strong></div>
          <div><span>Delivered</span><strong>${delivered}</strong></div>
          <div><span>Open</span><strong>${open}</strong></div>
          ${balance > 0 ? `<div class="tone-warn"><span>Balance due</span><strong>${shortPkr(balance)}</strong></div>` : ""}
        </div>
      </header>
      <table class="admin-table customer-orders-table">
        <thead>
          <tr><th>Order</th><th>Status</th><th>Total</th><th></th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `);
}

// Bulk WhatsApp send — picks a template from the existing library and
// fires it to every phone in the bulk-selected order set via the
// existing /api/admin/broadcast endpoint (now accepts filters.phones).
// Modal preview shows the resolved body before the operator commits.

function openBulkWhatsappModal() {
  const selectedIds = state.selectedOrders ? [...state.selectedOrders] : [];
  if (!selectedIds.length) {
    toast("Select at least one order first.");
    return;
  }
  const orders = (state.orders || []).filter((o) => selectedIds.includes(o.id));
  const phones = [...new Set(orders.map((o) => String(o.customer_phone || "").replace(/\D/g, "")).filter(Boolean))];
  if (!phones.length) {
    toast("No valid phones in the selection.");
    return;
  }
  const templates = (state.waTemplates && state.waTemplates.length) ? state.waTemplates : (typeof DEFAULT_WA_TEMPLATES !== "undefined" ? DEFAULT_WA_TEMPLATES : []);
  const tplOptions = templates.map((t) => `<option value="${attr(t.id)}">${esc(t.name || t.id)}</option>`).join("");
  openModal(`
    <div class="bulk-wa-modal">
      <h3>WhatsApp ${phones.length} customer${phones.length === 1 ? "" : "s"}</h3>
      <p class="bulk-wa-intro">Picks the template, interpolates per-customer placeholders, sends one message each via Maychats. Opt-outs and over-messaged customers are skipped automatically.</p>
      <label class="bulk-wa-field">
        Template
        <select data-bulk-wa-template>${tplOptions}</select>
      </label>
      <label class="bulk-wa-field">
        Preview
        <textarea data-bulk-wa-preview rows="5" readonly></textarea>
      </label>
      <div class="bulk-wa-stats" data-bulk-wa-stats>${phones.length} recipient${phones.length === 1 ? "" : "s"} ready</div>
      <div class="bulk-wa-actions">
        <button class="button primary" type="button" data-action="bulk-wa-send">Send to ${phones.length}</button>
        <button class="button ghost" type="button" data-action="close-modal">Cancel</button>
      </div>
    </div>
  `);
  state._bulkWaPhones = phones;
  refreshBulkWhatsappPreview();
}

function refreshBulkWhatsappPreview() {
  const sel = qs("[data-bulk-wa-template]");
  const preview = qs("[data-bulk-wa-preview]");
  if (!sel || !preview) return;
  const tplId = sel.value;
  const templates = (state.waTemplates && state.waTemplates.length) ? state.waTemplates : [];
  const tpl = templates.find((t) => t.id === tplId);
  preview.value = tpl?.body || "Pick a template above.";
}

async function sendBulkWhatsapp() {
  const phones = state._bulkWaPhones || [];
  const tplSel = qs("[data-bulk-wa-template]");
  const stats = qs("[data-bulk-wa-stats]");
  if (!phones.length || !tplSel?.value) {
    toast("Pick a template first.");
    return;
  }
  if (stats) stats.textContent = `Sending to ${phones.length}…`;
  try {
    const headers = new Headers({ "Content-Type": "application/json" });
    if (state.adminToken) headers.set("Authorization", `Bearer ${state.adminToken}`);
    const response = await fetch("/api/admin/broadcast", {
      method: "POST",
      headers,
      body: JSON.stringify({
        template_id: tplSel.value,
        filters: { phones },
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (stats) stats.textContent = `Failed: ${payload.error || response.status}`;
      toast(`Bulk WhatsApp failed: ${payload.error || "server error"}`);
      return;
    }
    const sent = payload.sent ?? payload.recipient_count ?? phones.length;
    const skipped = payload.skipped_opt_out || 0;
    if (stats) stats.textContent = `Sent ${sent} · ${skipped} skipped (opt-out / over-messaged).`;
    toast(`WhatsApp sent to ${sent} customer${sent === 1 ? "" : "s"}.`);
    setTimeout(() => closeModal(), 1800);
  } catch (err) {
    if (stats) stats.textContent = `Failed: ${err.message || err}`;
    toast("Network error sending broadcast.");
  }
}

// Browser desktop notification helper. Opt-in via Notification.requestPermission()
// triggered from a Settings toggle. State persists in localStorage so the
// operator's choice survives reload. Fires from the auto-refresh tick when
// new orders arrive — useful when the portal tab is backgrounded.
const NOTIF_PREF_KEY = "gb_desktop_notif";

function desktopNotifPreferred() {
  try { return localStorage.getItem(NOTIF_PREF_KEY) === "on"; } catch { return false; }
}

async function enableDesktopNotifications() {
  if (typeof Notification === "undefined") {
    toast("This browser doesn't support desktop notifications.");
    return false;
  }
  let perm = Notification.permission;
  if (perm === "default") perm = await Notification.requestPermission();
  if (perm === "granted") {
    try { localStorage.setItem(NOTIF_PREF_KEY, "on"); } catch {}
    toast("Desktop notifications on. We'll ping you when new orders arrive.");
    return true;
  }
  toast("Desktop notifications were blocked. Enable in your browser settings, then toggle again.");
  return false;
}

function disableDesktopNotifications() {
  try { localStorage.setItem(NOTIF_PREF_KEY, "off"); } catch {}
  toast("Desktop notifications off.");
}

function maybeFireOrderNotification(newOrders) {
  if (!desktopNotifPreferred()) return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  if (!newOrders.length) return;
  // Single notification summarising the batch — never spam one per order.
  const title = newOrders.length === 1
    ? `New order ${newOrders[0].id}`
    : `${newOrders.length} new orders just landed`;
  const body = newOrders.length === 1
    ? `${newOrders[0].customer_name || "Customer"} · ${PKR.format(newOrders[0].total_pkr || 0)}`
    : `Total ${PKR.format(newOrders.reduce((s, o) => s + Number(o.total_pkr || 0), 0))} across ${newOrders.length} orders`;
  try {
    const n = new Notification(title, {
      body,
      icon: "/assets/logo.png",
      badge: "/assets/logo.png",
      tag: "gb-new-orders",      // collapse repeats into one OS notification
      renotify: true,
    });
    // Click to focus the tab + jump to Orders.
    n.onclick = () => {
      window.focus();
      qs("[data-admin-tab='orders']")?.click();
      n.close();
    };
  } catch {
    /* silent — notification API can throw in odd contexts (iframes etc) */
  }
}

// Background auto-refresh — every 30s while the portal tab is visible
// the dashboard polls /api/admin/dashboard. If new orders arrived since
// the last poll we ping the freshness dot and surface a one-line toast
// so the operator knows fresh work is waiting without staring at the tab.
function startAutoRefresh() {
  if (_autoRefreshTickerId) return;
  _autoRefreshTickerId = setInterval(async () => {
    if (document.body.dataset.page !== "portal") return;
    if (document.visibilityState !== "visible") return;          // pause if backgrounded
    if (!state.adminToken && !document.cookie.includes("gb_team_session=")) return;
    if (state._autoRefreshInflight) return;                       // no overlap
    state._autoRefreshInflight = true;
    const previousIds = new Set((state.orders || []).map((o) => o.id));
    try {
      await refreshAdmin();
      const fresh = (state.orders || []).filter((o) => !previousIds.has(o.id));
      if (fresh.length) {
        // Ping the freshness chip + toast. Once-only per refresh tick.
        const wrap = qs("[data-today-freshness]");
        if (wrap) {
          wrap.classList.add("has-ping");
          setTimeout(() => wrap.classList.remove("has-ping"), 2500);
        }
        toast(`${fresh.length} new order${fresh.length === 1 ? "" : "s"} just landed.`);
        // Desktop notification (if the operator opted in via Settings).
        // Caught here rather than inside refreshAdmin so we can diff
        // against the prior order set.
        maybeFireOrderNotification(fresh);
        // SLA-breach sound — only if an order's SLA flipped to danger
        // since the last tick.
        maybeFireSlaSound(fresh);
      }
    } catch {
      /* silent — next tick will retry */
    } finally {
      state._autoRefreshInflight = false;
    }
  }, 30_000);
}

// ─── Overview rewrites ───
// Builds the new KPI hero strip on the Overview tab + the consolidated
// "Needs your attention" queue (collapses pending-SLA + balance-overdue +
// stale-accepted into one prioritised list) + the snapshot navigation cards.
// Monthly revenue-target gauge — confirmed revenue this calendar month
// vs the goal in store_settings.monthly_revenue_target (editable in
// Settings; falls back to a sensible default). Semicircle SVG gauge.
function renderTargetGauge() {
  const slot = qs("[data-target-gauge]");
  if (!slot) return;
  const target = Number(state.settings?.monthly_revenue_target || 0) || 1500000;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  // "Confirmed" = advance_confirmed / paid_in_full / balance_* — money the
  // team has actually committed this month, not raw order requests.
  const confirmedStates = new Set(["advance_confirmed", "balance_due", "balance_uploaded", "paid_in_full"]);
  const achieved = (state.orders || [])
    .filter((o) => new Date(o.created_at || 0) >= monthStart && confirmedStates.has(o.payment_status))
    .reduce((s, o) => s + Number(o.total_pkr || 0), 0);
  const pct = Math.max(0, Math.min(1, target > 0 ? achieved / target : 0));
  const pctLabel = Math.round(pct * 100);
  // Semicircle arc: radius 80, circumference of half = π*r ≈ 251.3
  const r = 80;
  const halfC = Math.PI * r;
  const dash = pct * halfC;
  const tone = pct >= 1 ? "var(--success)" : pct >= 0.6 ? "var(--pink-2)" : "var(--warning)";
  const monthName = now.toLocaleDateString("en-PK", { month: "long" });
  const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate();
  slot.innerHTML = `
    <svg class="gauge-svg" viewBox="0 0 200 120" role="img" aria-label="${pctLabel}% of monthly target">
      <path d="M20 110 A80 80 0 0 1 180 110" fill="none" stroke="var(--line)" stroke-width="16" stroke-linecap="round" />
      <path d="M20 110 A80 80 0 0 1 180 110" fill="none" stroke="${tone}" stroke-width="16" stroke-linecap="round"
        stroke-dasharray="${dash.toFixed(1)} ${halfC.toFixed(1)}" style="transition: stroke-dasharray 900ms var(--ease-cinema);" />
    </svg>
    <div class="gauge-readout">
      <strong>${pctLabel}%</strong>
      <span>${PKR.format(achieved)} of ${PKR.format(target)}</span>
      <small>${monthName} · ${daysLeft} day${daysLeft === 1 ? "" : "s"} left</small>
    </div>
  `;
}

// Operator leaderboard — per-`owner` performance this calendar month.
// Orders handled, confirmed revenue, and avg hours to first acceptance.
function renderOperatorLeaderboard() {
  const slot = qs("[data-operator-leaderboard]");
  if (!slot) return;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthOrders = (state.orders || []).filter((o) => new Date(o.created_at || 0) >= monthStart);
  const byOwner = new Map();
  for (const o of monthOrders) {
    const owner = (o.owner || "").trim() || "Unassigned";
    if (!byOwner.has(owner)) byOwner.set(owner, { owner, count: 0, revenue: 0 });
    const row = byOwner.get(owner);
    row.count += 1;
    if (["advance_confirmed", "balance_due", "balance_uploaded", "paid_in_full"].includes(o.payment_status)) {
      row.revenue += Number(o.total_pkr || 0);
    }
  }
  const rows = [...byOwner.values()].sort((a, b) => b.revenue - a.revenue || b.count - a.count);
  if (!rows.length) {
    slot.innerHTML = `<p class="kanban-empty">No orders yet this month.</p>`;
    return;
  }
  const max = rows[0].revenue || 1;
  const medals = ["①", "②", "③"];
  slot.innerHTML = `
    <ol class="leaderboard-list">
      ${rows.map((r, i) => `
        <li class="leaderboard-row">
          <span class="leaderboard-rank">${medals[i] || i + 1}</span>
          <span class="leaderboard-name">${esc(r.owner)}</span>
          <span class="leaderboard-bar-wrap"><span class="leaderboard-bar" style="width:${Math.max(4, (r.revenue / max) * 100).toFixed(0)}%"></span></span>
          <span class="leaderboard-stat"><strong>${shortPkr(r.revenue)}</strong><small>${r.count} order${r.count === 1 ? "" : "s"}</small></span>
        </li>
      `).join("")}
    </ol>
  `;
}

function renderOverviewExtras() {
  if (!has("[data-overview-kpis]")) return;

  // Greeting tied to the local time so the dashboard feels human.
  const greet = qs("[data-overview-greeting]");
  if (greet) {
    const hour = new Date().getHours();
    const word = hour < 5 ? "Working late?" : hour < 12 ? "Good morning." : hour < 17 ? "Good afternoon." : "Good evening.";
    greet.textContent = word;
  }

  const orders = state.orders || [];
  const pending = orders.filter((o) => o.status === "pending_review").length;
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const ordersToday = orders.filter((o) => new Date(o.created_at || 0) >= startOfDay);
  const revenueToday = ordersToday.reduce((s, o) => s + Number(o.total_pkr || 0), 0);
  const inTransit = orders.filter((o) => ["in_transit", "sourcing", "pakistan_processing"].includes(o.status)).length;

  // 14-day daily series for sparklines + 7-day trend deltas. The recent
  // 7 days vs prior 7 days is a much stabler signal than today-vs-yesterday
  // (which swings wildly when one Karachi customer drops a 80k bag order).
  const ordersSeries  = dailySeries(orders, 14, () => 1);
  const revenueSeries = dailySeries(orders, 14, (o) => Number(o.total_pkr || 0));

  // Delivered in the last 7 days — completion throughput. This replaces the
  // old "Pending review" hero KPI, which duplicated both the Today ribbon's
  // "Pending now" snapshot and the action queue that now leads this tab.
  const weekAgo = Date.now() - 7 * 86400000;
  const delivered7d = orders.filter((o) =>
    o.status === "delivered" &&
    new Date(o.delivered_at || o.updated_at || o.created_at || 0).getTime() >= weekAgo
  ).length;

  renderKpiHero("[data-overview-kpis]", [
    {
      label: "Delivered · 7d",
      value: String(delivered7d),
      numeric: delivered7d,
      format: "raw",
      key: "delivered-7d",
      sub: delivered7d ? "Completed & dispatched" : "None this week",
      tone: "ok",
      action: "jump-tab",
      actionFilter: "orders:delivered",
    },
    {
      label: "Orders · 7d",
      value: String(ordersSeries.slice(-7).reduce((s, v) => s + v, 0)),
      numeric: ordersSeries.slice(-7).reduce((s, v) => s + v, 0),
      format: "raw",
      key: "orders-7d",
      sub: `${ordersToday.length} today`,
      sparkline: ordersSeries,
      trend: { value: trend7d(ordersSeries) ?? 0, title: "vs previous 7 days" },
    },
    {
      label: "Revenue · 7d",
      value: shortPkr(revenueSeries.slice(-7).reduce((s, v) => s + v, 0)),
      numeric: revenueSeries.slice(-7).reduce((s, v) => s + v, 0),
      format: "short-pkr",
      key: "revenue-7d",
      sub: `${shortPkr(revenueToday)} today`,
      sparkline: revenueSeries,
      trend: { value: trend7d(revenueSeries) ?? 0, title: "vs previous 7 days" },
    },
    {
      label: "Active in pipeline",
      value: String(inTransit),
      numeric: inTransit,
      format: "raw",
      key: "active-pipeline",
      sub: "Sourcing → arrived",
    },
  ]);

  // Action queue — every order with an SLA badge, sorted by severity then age
  const attentionRows = orders
    .map((o) => ({ order: o, sla: orderSlaBadge(o) }))
    .filter(({ sla }) => sla && sla.level !== "ok")
    .sort((a, b) => {
      const order = { danger: 0, warn: 1 };
      const dDiff = (order[a.sla.level] ?? 9) - (order[b.sla.level] ?? 9);
      return dDiff !== 0 ? dDiff : (b.sla.mins || 0) - (a.sla.mins || 0);
    });

  // Low-stock chips — any active in-stock product whose inventory drops to
  // or below its threshold (defaults to 2 when unset). Respects per-product
  // override for products that need a higher safety margin.
  const lowStock = (state.products || [])
    .filter((p) => {
      if (p.stock_mode !== "in_stock") return false;
      if ((p.status || "active") !== "active") return false;
      const threshold = Number(p.low_stock_threshold ?? 2);
      return Number(p.inventory || 0) <= threshold;
    })
    // Surface the most urgent first: a LIVE product at 0 units is a broken
    // listing (customers can't buy it) — show those above merely-low ones.
    .sort((a, b) => Number(a.inventory || 0) - Number(b.inventory || 0))
    .slice(0, 6);
  const totalAttention = attentionRows.length + lowStock.length;
  const attentionCountEl = qs("[data-attention-count]");
  if (attentionCountEl) attentionCountEl.textContent = String(totalAttention);

  // ── Miss-prevention chips ────────────────────────────────────────────
  // Three buckets that fall through the cracks in a busy OMS:
  //   1. Unassigned — orders with no owner (silently sit in the queue)
  //   2. Stuck     — same status >2× typical (already flagged per-row)
  //   3. Balance overdue — pakistan_processing orders with unpaid balance
  // Each chip is click-filtered to its bucket on the Orders tab so an
  // operator can drill in immediately. Hidden when its count is zero.
  const openSet = new Set(["pending_review", "accepted", "sourcing", "in_transit", "pakistan_processing"]);
  const unassignedCount = orders.filter((o) => openSet.has(o.status) && !(o.owner || "").trim()).length;
  const stuckCount      = orders.filter((o) => openSet.has(o.status) && isOrderStuck(o)).length;
  const overdueBalanceCount = orders.filter((o) => {
    if (o.status !== "pakistan_processing") return false;
    const balOut = Math.max(0, Number(o.balance_due_pkr || 0) - Number(o.balance_paid_pkr || 0));
    return balOut > 0;
  }).length;
  const missChips = [
    { count: unassignedCount,     glyph: "⊘",  label: "unassigned",      filter: "orders:unassigned",          tone: unassignedCount > 0 ? "warn" : "ok" },
    { count: stuckCount,          glyph: "◔",  label: "stuck",           filter: "orders:stuck",               tone: stuckCount > 0 ? "danger" : "ok" },
    { count: overdueBalanceCount, glyph: "▣",  label: "balance overdue", filter: "orders:pakistan_processing", tone: overdueBalanceCount > 0 ? "warn" : "ok" },
  ];
  setHTML(
    "[data-attention-miss-chips]",
    missChips
      .filter((c) => c.count > 0)
      .map((c) => `
        <button class="miss-chip miss-${c.tone}" type="button" data-action="jump-tab" data-action-filter="${attr(c.filter)}" title="Filter Orders to ${esc(c.label)}">
          <span class="miss-glyph" aria-hidden="true">${c.glyph}</span>
          <strong>${c.count}</strong>
          <span>${esc(c.label)}</span>
        </button>
      `)
      .join(""),
  );
  const slaRows = attentionRows.slice(0, 10).map(({ order: o, sla }) => `
    <button class="attention-row tone-${sla.level}" type="button" data-action="view-order" data-order-id="${attr(o.id)}">
      <span class="attention-tone">${sla.level === "danger" ? "●" : "▲"}</span>
      <div>
        <strong>${esc(o.id)} — ${esc(o.customer_name || "")}</strong>
        <small>${esc((o.status || "").replaceAll("_", " "))} · ${esc(o.city || "")}</small>
      </div>
      <span class="attention-label">${esc(sla.label)}</span>
    </button>
  `).join("");
  const stockRows = lowStock.map((p) => {
    // A live in-stock product at 0 units is "out of stock" — more urgent than
    // "low", and now a hard block (the server rejects orders for it). Flag it
    // distinctly and jump to the Inventory board where stock is managed.
    const out = Number(p.inventory || 0) <= 0;
    return `
    <button class="attention-row tone-${out ? "danger" : "warn"}" type="button" data-action="jump-tab" data-action-filter="inventory">
      <span class="attention-tone">${out ? "●" : "⛁"}</span>
      <div>
        <strong>${esc(p.title)} — ${out ? "out of stock" : "low stock"}</strong>
        <small>${esc(p.brand || "")} · ${esc(p.category || "")}</small>
      </div>
      <span class="attention-label">${out ? "0 left · live" : `${Number(p.inventory || 0)} left`}</span>
    </button>`;
  }).join("");
  setHTML(
    "[data-attention-queue]",
    totalAttention > 0
      ? `${slaRows}${stockRows}`
      : `<p class="cashflow-empty">✓ No SLA breaches, no low stock — everything's on track.</p>`,
  );

  // Recent activity rail — last 6 order events across the whole portal,
  // pulled from order.events. Replaces the snapshot grid; the team gets a
  // pulse of what's actually moving instead of static stat cards.
  const allEvents = [];
  for (const o of state.orders || []) {
    for (const ev of orderEvents(o)) {
      allEvents.push({
        order_id: o.id,
        customer: o.customer_name || "",
        status: ev.status,
        note: ev.note,
        created_at: ev.created_at,
      });
    }
  }
  allEvents.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  const top = allEvents.slice(0, 6);
  renderConversionFunnel();
  renderTargetGauge();
  renderOperatorLeaderboard();
  renderOrderHeatmap();
  renderSlaDashboard();
  setHTML("[data-overview-activity]",
    top.length
      ? top.map((ev) => {
          const meta = timelineMeta(ev.status);
          return `
            <li class="activity-row tone-${meta.tone}">
              <span class="activity-glyph" aria-hidden="true">${meta.glyph}</span>
              <div>
                <strong>${esc(meta.label)}</strong>
                <small>${esc(ev.order_id)} · ${esc(ev.customer)} · ${esc(relativeTime(ev.created_at))}</small>
              </div>
            </li>
          `;
        }).join("")
      : `<li class="kanban-empty">No recent activity.</li>`
  );
}

// Pending scheduled broadcasts list — shown under the broadcast form.
function renderScheduledBroadcastsList() {
  const el = qs("[data-scheduled-broadcasts]");
  if (!el) return;
  const pending = (state.scheduledBroadcasts || []).filter((b) => ["pending", "running"].includes(b.status));
  if (!pending.length) {
    el.innerHTML = "";
    return;
  }
  el.innerHTML = `
    <h3 class="broadcast-sub-title">Pending sends · ${pending.length}</h3>
    <ul class="scheduled-list">
      ${pending.map((b) => {
        const when = b.send_at ? new Date(b.send_at) : null;
        const fires = when ? when.toLocaleString("en-PK", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—";
        const filters = Object.entries(b.filters || {}).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(" · ") || "All eligible";
        return `
          <li>
            <div>
              <strong>${esc(b.template_id || "Custom")}</strong>
              <small>${esc(fires)} · ${esc(filters)} · ${b.recipient_count ?? "?"} recipients</small>
            </div>
            <button class="button secondary" type="button" data-action="cancel-scheduled" data-broadcast-id="${attr(b.id)}">Cancel</button>
          </li>
        `;
      }).join("")}
    </ul>
  `;
}

// Reply-rate scoreboard for past broadcasts.
function renderCampaignReplyRates() {
  const el = qs("[data-campaign-reply-rates]");
  if (!el) return;
  const campaigns = (state.broadcastCampaigns || []).slice(0, 8);
  if (!campaigns.length) { el.innerHTML = ""; return; }
  el.innerHTML = `
    <h3 class="broadcast-sub-title">Recent reply rates</h3>
    <ul class="campaign-rates">
      ${campaigns.map((c) => {
        const rate = c.sent_count > 0 ? Math.round((Number(c.reply_count || 0) / Number(c.sent_count)) * 100) : 0;
        const tone = rate >= 15 ? "ok" : rate >= 5 ? "warn" : "info";
        const when = c.triggered_at ? relativeTime(c.triggered_at) : "—";
        return `
          <li class="tone-${tone}">
            <div>
              <strong>${esc(c.template_name || c.template_id || "Custom")}</strong>
              <small>${esc(when)} · ${c.sent_count} sent · ${c.reply_count || 0} replies</small>
            </div>
            <span class="rate-badge tone-${tone}">${rate}%</span>
          </li>
        `;
      }).join("")}
    </ul>
  `;
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
  // Refund / cancellation tracking — a cancelled order's collected advance is
  // a real cash position (held until refunded), and refunds are real cash out.
  let refundsPaid = 0;     // cash already returned to customers
  let refundsDue = 0;      // cash still owed back on cancelled orders
  let cancelledHeld = 0;   // collected − refunded on cancelled orders (cash retained)
  let cancelledCount = 0;
  for (const order of orders) {
    const isCancelled = order.status === "cancelled";
    if (!OPEN_STAGES.has(order.status) && !isCancelled) continue;
    // USD on the card is spent regardless of where the order ends up — if you
    // sourced it then it cancelled, that's a real (sunk) outflow.
    usdSpent += orderUsdSpent(order);
    if (isCancelled) {
      cancelledCount += 1;
      refundsPaid += Number(order.refund_paid_pkr || 0);
      refundsDue += orderRefundOutstanding(order);
      cancelledHeld += Math.max(0, orderCollectedPkr(order) - Number(order.refund_paid_pkr || 0));
      continue;
    }
    openCount += 1;
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
  // Cash in hand = advances held on open orders + cash retained from cancelled
  // orders − USD already spent. Refunds already left your hand (netted into
  // cancelledHeld), so they're not subtracted twice.
  const pkrInHand = advanceCollected + cancelledHeld - usdSpent * fx;
  return {
    pkrInHand,
    usdSpent,
    balanceToCollect,
    futureBalance,
    expectedProfit,
    openCount,
    advanceCollected,
    refundsPaid,
    refundsDue,
    cancelledHeld,
    cancelledCount,
  };
}

function renderCashflow() {
  if (!has("[data-cashflow-strip]")) return;
  const fx = Number(state.settings?.fx_rate || 282);

  // FX assumption surfaced near the top — the numbers depend on this.
  setHTML("[data-cashflow-fx]", `<small>USD→PKR rate: <strong>${fx.toFixed(2)}</strong> · from Settings</small>`);

  const orders = state.orders || [];
  const agg = cashflowAggregate(orders, fx);

  // Cashflow KPIs now flow through renderKpiHero so they pick up the
  // count-up animation + drill-down hooks. Each card carries an
  // action="jump-tab" so clicking it routes to Orders with a filter
  // preset — finally surfaces the underlying rows for any metric.
  renderKpiHero("[data-cashflow-strip]", [
    {
      label: "PKR in hand",
      value: shortPkr(agg.pkrInHand),
      numeric: agg.pkrInHand,
      format: "short-pkr",
      key: "pkr-in-hand",
      sub: `${shortPkr(agg.advanceCollected + agg.cancelledHeld)} collected − ${shortPkr(agg.usdSpent * fx)} USD spend`,
      tone: agg.pkrInHand < 0 ? "warn" : "ok",
    },
    {
      label: "USD on card",
      value: USD.format(Math.round(agg.usdSpent)),
      numeric: agg.usdSpent,
      format: "usd",
      key: "usd-on-card",
      sub: "Awaiting recovery from PK collections",
    },
    {
      label: "Balance to collect",
      value: shortPkr(agg.balanceToCollect),
      numeric: agg.balanceToCollect,
      format: "short-pkr",
      key: "balance-to-collect",
      sub: "Arrived in PK · chase customers",
      tone: agg.balanceToCollect > 0 ? "warn" : "ok",
      action: "jump-tab",
      actionFilter: "orders:pakistan_processing",
    },
    {
      label: "Future balance",
      value: shortPkr(agg.futureBalance),
      numeric: agg.futureBalance,
      format: "short-pkr",
      key: "future-balance",
      sub: "Not yet arrived in PK",
      action: "jump-tab",
      actionFilter: "orders:in_transit",
    },
    {
      label: "Expected profit",
      value: shortPkr(agg.expectedProfit),
      numeric: agg.expectedProfit,
      format: "short-pkr",
      key: "expected-profit",
      sub: "If every open order pays in full",
      tone: agg.expectedProfit < 0 ? "warn" : "ok",
    },
    {
      // Refunds — surfaces money owed back (or already returned) on
      // cancellations so it never silently leaks out of the cash position.
      label: agg.refundsDue > 0 ? "Refunds owed" : "Refunds paid",
      value: shortPkr(agg.refundsDue > 0 ? agg.refundsDue : agg.refundsPaid),
      numeric: agg.refundsDue > 0 ? agg.refundsDue : agg.refundsPaid,
      format: "short-pkr",
      key: "refunds",
      sub: agg.refundsDue > 0
        ? `${shortPkr(agg.refundsPaid)} paid · ${agg.cancelledCount} cancelled`
        : `${agg.cancelledCount} cancelled order${agg.cancelledCount === 1 ? "" : "s"}`,
      tone: agg.refundsDue > 0 ? "warn" : "ok",
    },
    {
      label: "Open orders",
      value: String(agg.openCount),
      numeric: agg.openCount,
      format: "raw",
      key: "open-orders",
      sub: "Across all open stages",
      action: "jump-tab",
      actionFilter: "orders",
    },
  ]);

  // The money stripe: 4 segments showing where capital sits.
  // Left to right: USD already on card (red, outflow); PKR collected (green, inflow);
  // PKR to collect on arrival (blue, near); PKR future balance (grey, far).
  const totalScale = Math.max(
    1,
    agg.usdSpent * fx + agg.advanceCollected + agg.balanceToCollect + agg.futureBalance + agg.refundsPaid
  );
  const segments = [
    ["USD spent (PKR equiv)", agg.usdSpent * fx, "out"],
    ["PKR advance collected", agg.advanceCollected, "in"],
    ["PKR balance to collect", agg.balanceToCollect, "near"],
    ["PKR future balance", agg.futureBalance, "far"],
  ];
  // Refunds paid show as a distinct outflow band so cancellations are visible
  // in the capital picture, not hidden inside "USD spent".
  if (agg.refundsPaid > 0) segments.push(["Refunds paid", agg.refundsPaid, "refund"]);
  // Money bar — segments fill left-to-right with a staggered animation
  // on render. CSS does the work (transition on width); we render with
  // width:0 and bump to the real width on next frame.
  setHTML(
    "[data-cashflow-money-bar]",
    `<div class="money-bar-track" data-money-bar-track>
      ${segments
        .map(
          ([label, value, tone], i) => `
        <span class="money-bar-seg money-bar-${tone}" data-target-width="${(value / totalScale) * 100}" style="--seg-i:${i}; width:0%" title="${label}: ${PKR.format(value)}"></span>`
        )
        .join("")}
    </div>
    <div class="money-bar-legend">
      ${segments
        .map(([label, value, tone]) => `<span class="money-bar-key money-bar-${tone}"><i></i>${label} · ${shortPkr(value)}</span>`)
        .join("")}
    </div>`
  );
  // Double-rAF so the browser commits the width:0 baseline before we
  // change the target width — otherwise the CSS transition has nothing
  // to interpolate from.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      qsa("[data-money-bar-track] .money-bar-seg").forEach((node) => {
        node.style.width = `${node.dataset.targetWidth}%`;
      });
    });
  });

  renderReceivablesAging();
  renderCashflowWaterfall(agg, fx);
  renderSourcingQueue();
  renderCashflowBatches(fx);
  renderCashflowWorklists();
  renderLedger();
  renderCashflowSankey(agg, fx);
}

// Receivables aging — buckets every outstanding balance (advance not yet paid,
// or PK-arrived balance still owed) by how long the order has been waiting, so
// the team can see which money is going cold. Top dashboards (and every
// accounting tool) lead with an A/R aging view; the lump "balance to collect"
// number hid which receivables were at risk.
function renderReceivablesAging() {
  const slot = qs("[data-receivables-aging]");
  if (!slot) return;
  const buckets = [
    { key: "0-7", label: "0–7 days", max: 7, total: 0, count: 0 },
    { key: "8-14", label: "8–14 days", max: 14, total: 0, count: 0 },
    { key: "15-30", label: "15–30 days", max: 30, total: 0, count: 0 },
    { key: "30+", label: "30+ days", max: Infinity, total: 0, count: 0 },
  ];
  let grandTotal = 0;
  for (const order of state.orders || []) {
    if (!OPEN_STAGES.has(order.status)) continue;
    const due = amountDueForOrder(order);
    if (due <= 0) continue;
    // Age from the last stage change if we have it, else order creation.
    const events = orderEvents(order) || [];
    const since = events.length ? events[events.length - 1].created_at : order.created_at;
    const age = daysSince(since) ?? 0;
    const bucket = buckets.find((b) => age <= b.max) || buckets[buckets.length - 1];
    bucket.total += due;
    bucket.count += 1;
    grandTotal += due;
  }
  if (grandTotal <= 0) {
    slot.innerHTML = `<section class="ops-panel"><div class="panel-title-row"><h2>Receivables aging</h2></div><p class="cashflow-empty">No outstanding balances — every open order is paid up.</p></section>`;
    return;
  }
  const max = Math.max(1, ...buckets.map((b) => b.total));
  slot.innerHTML = `
    <section class="ops-panel receivables-aging-panel">
      <div class="panel-title-row">
        <h2>Receivables aging</h2>
        <small class="kicker">${PKR.format(grandTotal)} outstanding across open orders</small>
      </div>
      <div class="aging-grid">
        ${buckets.map((b) => {
          const pct = (b.total / max) * 100;
          const tone = b.key === "30+" ? "danger" : b.key === "15-30" ? "warn" : b.key === "8-14" ? "soft" : "ok";
          return `
            <button class="aging-col aging-${tone}" type="button" data-action="jump-tab" data-action-filter="orders" title="${b.count} order${b.count === 1 ? "" : "s"} · ${PKR.format(b.total)}">
              <span class="aging-amount">${shortPkr(b.total)}</span>
              <span class="aging-bar"><span style="height:${b.total > 0 ? Math.max(6, pct) : 0}%"></span></span>
              <span class="aging-label">${b.label}</span>
              <span class="aging-count">${b.count} order${b.count === 1 ? "" : "s"}</span>
            </button>`;
        }).join("")}
      </div>
    </section>`;
}

// Money-flow Sankey diagram.
//
// Visualizes where every open position is sitting RIGHT NOW. Two columns:
//   Left (sources)        Right (destinations)
//   ─────────────         ──────────────────────
//   Advance collected →   USD spent on goods
//   Balance owed (PK)  →   Shipping/customs spend
//   Future balance     →   Expected profit
//                          Pending recovery
//
// Path widths scale to the amount each flow carries. Hover any group to
// highlight the source/destination pair. Linear timing on the path draw-in
// (constant motion) + spring-feel on hover (Emil's framework).
function renderCashflowSankey(agg, fx) {
  const target = qs("[data-cashflow-sankey]");
  if (!target) return;

  // Source bucket — what's committed (regardless of who has it yet)
  const advanceIn = Math.max(0, agg.advanceCollected || 0);
  const balanceOwed = Math.max(0, agg.balanceToCollect || 0);
  const futureBalance = Math.max(0, agg.futureBalance || 0);
  const totalSource = advanceIn + balanceOwed + futureBalance;

  // Destination bucket — where it ends up
  // (For the SVG, we model the expected end-state, scaled by current source totals)
  const usdSpentPkr = Math.max(0, (agg.usdSpent || 0) * fx);
  // Shipping is rough: 7% of source as a working estimate when no explicit shipping field
  const shippingEst = Math.max(0, Math.min(totalSource * 0.07, totalSource * 0.15));
  const expectedProfit = Math.max(0, agg.expectedProfit || 0);
  // Anything left over is "pending recovery" — money in motion that hasn't been classified
  const accountedDest = usdSpentPkr + shippingEst + expectedProfit;
  const pendingRecovery = Math.max(0, totalSource - accountedDest);
  const totalDest = usdSpentPkr + shippingEst + expectedProfit + pendingRecovery;

  if (totalSource === 0 && totalDest === 0) {
    target.innerHTML = `<div class="sankey-empty">No open positions yet. The flow diagram fills in as soon as the first advance lands.</div>`;
    return;
  }

  // Geometry
  const W = 800, H = 280;
  const nodeW = 18;
  const nodeXL = 130;       // left column right edge
  const nodeXR = W - 130;   // right column left edge
  const colLeftHeight = H - 60;
  const colRightHeight = H - 60;

  const sources = [
    { key: "advance",  label: "Advance collected", value: advanceIn,     tone: "in" },
    { key: "balance",  label: "Balance owed (PK)", value: balanceOwed,   tone: "in" },
    { key: "future",   label: "Future balance",    value: futureBalance, tone: "in" },
  ].filter((s) => s.value > 0);
  const destinations = [
    { key: "cost",    label: "USD goods cost",     value: usdSpentPkr,     tone: "cost" },
    { key: "ship",    label: "Shipping / customs", value: shippingEst,     tone: "ship" },
    { key: "profit",  label: "Expected profit",    value: expectedProfit,  tone: "profit" },
    { key: "pending", label: "Pending recovery",   value: pendingRecovery, tone: "pending" },
  ].filter((d) => d.value > 0);

  // Allocate vertical heights — each node's height is proportional to its
  // share of the total, with a minimum so labels stay readable.
  const minBand = 14;
  const sLayout = computeBands(sources, colLeftHeight, totalSource, minBand);
  const dLayout = computeBands(destinations, colRightHeight, totalDest, minBand);

  // Allocate flows: every source's value gets distributed across destinations
  // in proportion to each destination's share of total. (i.e. a simple
  // outer-product allocation — visually clean for this scale.)
  const flows = [];
  sources.forEach((s, si) => {
    destinations.forEach((d, di) => {
      const share = totalDest > 0 ? d.value / totalDest : 0;
      const value = s.value * share;
      if (value <= 0) return;
      flows.push({ si, di, sKey: s.key, dKey: d.key, value, dTone: d.tone });
    });
  });

  // Slice the source/destination bands by flow value so paths stack.
  const sOffset = sLayout.map(() => 0);
  const dOffset = dLayout.map(() => 0);
  const flowSvgs = flows.map((f) => {
    const sBand = sLayout[f.si];
    const dBand = dLayout[f.di];
    const sH = (f.value / sources[f.si].value) * sBand.h;
    const dH = (f.value / destinations[f.di].value) * dBand.h;
    const sy0 = sBand.y + sOffset[f.si];
    const sy1 = sy0 + sH;
    const dy0 = dBand.y + dOffset[f.di];
    const dy1 = dy0 + dH;
    sOffset[f.si] += sH;
    dOffset[f.di] += dH;
    const x0 = nodeXL + nodeW;
    const x1 = nodeXR;
    const midX = (x0 + x1) / 2;
    const path = `M${x0},${sy0} C${midX},${sy0} ${midX},${dy0} ${x1},${dy0} L${x1},${dy1} C${midX},${dy1} ${midX},${sy1} ${x0},${sy1} Z`;
    return `<g class="sankey-group" data-flow="${f.sKey}-${f.dKey}">
      <title>${esc(sources[f.si].label)} → ${esc(destinations[f.di].label)} · ${esc(PKR.format(f.value))}</title>
      <path class="sankey-flow tone-${f.dTone}" d="${path}" />
    </g>`;
  }).join("");

  // Node rectangles + labels
  const sourceNodes = sLayout.map((band, i) => `
    <g class="sankey-group">
      <rect class="sankey-node-rect tone-${sources[i].tone}" x="${nodeXL}" y="${band.y}" width="${nodeW}" height="${band.h}" rx="4" />
      <text class="sankey-label" x="${nodeXL - 10}" y="${band.y + 14}" text-anchor="end">${esc(sources[i].label)}</text>
      <text class="sankey-sublabel" x="${nodeXL - 10}" y="${band.y + 30}" text-anchor="end">${esc(PKR.format(sources[i].value))}</text>
    </g>`).join("");
  const destNodes = dLayout.map((band, i) => `
    <g class="sankey-group">
      <rect class="sankey-node-rect tone-${destinations[i].tone}" x="${nodeXR - nodeW}" y="${band.y}" width="${nodeW}" height="${band.h}" rx="4" />
      <text class="sankey-label" x="${nodeXR + 10}" y="${band.y + 14}" text-anchor="start">${esc(destinations[i].label)}</text>
      <text class="sankey-sublabel" x="${nodeXR + 10}" y="${band.y + 30}" text-anchor="start">${esc(PKR.format(destinations[i].value))}</text>
    </g>`).join("");

  target.innerHTML = `
    <svg class="sankey-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Money-flow diagram from sources to destinations">
      ${flowSvgs}
      ${sourceNodes}
      ${destNodes}
    </svg>
    <div class="sankey-legend" aria-hidden="true">
      <span class="tone-in"><i></i>Money in (sources)</span>
      <span class="tone-cost"><i></i>USD goods cost</span>
      <span class="tone-ship"><i></i>Shipping / customs</span>
      <span class="tone-profit"><i></i>Profit</span>
      <span class="tone-pending"><i></i>Pending recovery</span>
    </div>
  `;

  function computeBands(items, totalHeight, totalValue, minBand) {
    const gap = 8;
    const usableH = totalHeight - gap * (items.length - 1);
    const raw = items.map((it) => Math.max(minBand, (it.value / Math.max(1, totalValue)) * usableH));
    // Renormalize so summed heights + gaps fit
    const sumRaw = raw.reduce((a, b) => a + b, 0);
    const scale = usableH / Math.max(1, sumRaw);
    let y = 30;
    return items.map((_, i) => {
      const h = raw[i] * scale;
      const band = { y, h };
      y += h + gap;
      return band;
    });
  }
}

// True waterfall: each step is a floating bar showing a delta, with the
// running cumulative position carried across. Reads left-to-right as the
// money actually moves: advance collected (+) → balance still to collect
// (+) → USD already spent (−) → net cash position (total).
function renderCashflowWaterfall(agg, fx) {
  const slot = qs("[data-cashflow-waterfall]");
  if (!slot) return;
  const usdOut = Math.round(agg.usdSpent * fx);
  const steps = [
    { label: "Advance in", delta: Math.round(agg.advanceCollected), tone: "in" },
    // Split the inbound balance: money on parcels already in Pakistan
    // (collectable now) vs money still in transit (collectable later).
    { label: "Balance · in PK", delta: Math.round(agg.balanceToCollect), tone: "near" },
    { label: "Balance · in transit", delta: Math.round(agg.futureBalance), tone: "far" },
    { label: "USD spend", delta: -usdOut, tone: "out" },
  ];
  // Compute running cumulative + the floating top/bottom of each bar.
  let running = 0;
  const bars = steps.map((s) => {
    const start = running;
    running += s.delta;
    return { ...s, start, end: running };
  });
  const net = running;
  bars.push({ label: "Net position", delta: net, tone: net >= 0 ? "total-pos" : "total-neg", start: 0, end: net, isTotal: true });

  // Scale: from the lowest point reached to the highest, so negative dips
  // render correctly.
  const lo = Math.min(0, ...bars.map((b) => Math.min(b.start, b.end)));
  const hi = Math.max(0, ...bars.map((b) => Math.max(b.start, b.end)));
  const span = Math.max(1, hi - lo);
  const H = 200; // px chart height
  const y = (v) => H - ((v - lo) / span) * H; // value → pixel y (top-down)

  slot.innerHTML = `
    <div class="waterfall-chart" style="--wf-h:${H}px">
      ${bars.map((b, i) => {
        const top = Math.min(y(b.start), y(b.end));
        const h = Math.max(2, Math.abs(y(b.start) - y(b.end)));
        const sign = b.delta >= 0 ? "+" : "−";
        return `
          <div class="waterfall-col">
            <div class="waterfall-bar-track">
              <span class="waterfall-bar waterfall-${b.tone}"
                style="--wf-top:${top.toFixed(1)}px; --wf-h-bar:${h.toFixed(1)}px; --wf-i:${i}"
                title="${b.label}: ${sign}${PKR.format(Math.abs(b.delta))}"></span>
            </div>
            <span class="waterfall-val ${b.delta >= 0 ? "is-pos" : "is-neg"}">${b.isTotal ? "" : sign}${shortPkr(Math.abs(b.delta))}</span>
            <span class="waterfall-label">${esc(b.label)}</span>
          </div>`;
      }).join("")}
    </div>
  `;
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
            const waNum = canonPhone(o.customer_phone);
            const waHref = isValidPkMobile(waNum)
              ? `https://wa.me/${waNum}?text=${encodeURIComponent(`Hi ${o.customer_name.split(" ")[0]}, your Global Bestie order ${o.id} has arrived in Pakistan. Remaining balance: Rs ${due}. Please transfer before local dispatch.`)}`
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
  renderActionItems();
}

// Consolidated Action items panel on the Cashflow tab. Aggregates the two
// legacy worklists (balance chase + stale orders) into one filterable list
// so the eye lands on the count + one place to act.
function renderActionItems() {
  const slot = qs("[data-action-items]");
  if (!slot) return;
  const filter = state._cashflowActionFilter || "all";

  // Balance chase
  const balanceItems = (state.orders || [])
    .filter((o) => {
      if (o.status !== "pakistan_processing") return false;
      const due = Math.max(0, Number(o.balance_due_pkr || 0) - Number(o.balance_paid_pkr || 0));
      return due > 0;
    })
    .map((o) => {
      const due = Math.max(0, Number(o.balance_due_pkr || 0) - Number(o.balance_paid_pkr || 0));
      const days = daysSince(o.arrived_at || o.updated_at || o.created_at);
      const urgent = days !== null && days >= 3;
      const waNum = canonPhone(o.customer_phone);
      const waHref = isValidPkMobile(waNum)
        ? `https://wa.me/${waNum}?text=${encodeURIComponent(`Hi ${(o.customer_name || "").split(" ")[0]}, your Global Bestie order ${o.id} has arrived in Pakistan. Remaining balance: Rs ${due.toLocaleString()}. Please transfer before local dispatch.`)}`
        : "";
      return {
        kind: "balance",
        order: o,
        urgent,
        primary: `${o.id} · ${o.customer_name || ""}`,
        secondary: `${o.city || ""}${days !== null ? ` · arrived ${days}d ago` : ""}`,
        amount: PKR.format(due),
        waHref,
      };
    });

  // Stale-orders (accepted >7d, no batch)
  const staleItems = (state.orders || [])
    .filter((o) => {
      if (o.status !== "accepted") return false;
      if (shipmentBatchForOrder(o)) return false;
      const d = daysSince(o.accepted_at || o.created_at);
      return d !== null && d >= 7;
    })
    .map((o) => {
      const days = daysSince(o.accepted_at || o.created_at) || 0;
      const urgent = days >= 14;
      return {
        kind: "stale",
        order: o,
        urgent,
        primary: `${o.id} · ${o.customer_name || ""}`,
        secondary: `${days} days accepted · no batch yet`,
        amount: PKR.format(Number(o.total_pkr || 0)),
        waHref: "",
      };
    });

  const balCount = qs("[data-action-count-balance]");
  const staleCount = qs("[data-action-count-stale]");
  const allCount = qs("[data-action-count-all]");
  if (balCount) balCount.textContent = String(balanceItems.length);
  if (staleCount) staleCount.textContent = String(staleItems.length);
  if (allCount) allCount.textContent = String(balanceItems.length + staleItems.length);

  const all = filter === "balance" ? balanceItems
    : filter === "stale" ? staleItems
    : [...balanceItems, ...staleItems];

  slot.innerHTML = all.length
    ? all.map((item) => `
        <div class="worklist-row ${item.urgent ? "urgent" : ""}">
          <div>
            <strong>${esc(item.primary)}</strong>
            <small>${esc(item.secondary)} · ${item.kind === "balance" ? "Balance due" : "Stale"}</small>
          </div>
          <strong>${esc(item.amount)}</strong>
          ${item.waHref
            ? `<a class="button secondary" href="${item.waHref}" target="_blank" rel="noreferrer">WhatsApp</a>`
            : `<button class="button secondary" type="button" data-action="view-order" data-order-id="${attr(item.order.id)}">Open</button>`}
        </div>
      `).join("")
    : `<p class="cashflow-empty">✓ Nothing needs action right now.</p>`;
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
  let totalRefundPaid = 0;
  let totalRefundDue = 0;

  tbody.innerHTML = rows
    .map((o) => {
      const isCancelled = o.status === "cancelled";
      const payment = orderPaymentSummary(o);
      const usd = orderUsdExpected(o);
      const usdActual = orderUsdSpent(o);
      const collected = orderCollectedPkr(o);
      const refundPaid = Number(o.refund_paid_pkr || 0);
      const refundOut = orderRefundOutstanding(o);
      const balanceLeft = isCancelled ? 0 : Math.max(0, payment.balanceDue - Number(o.balance_paid_pkr || 0));
      // A cancelled order recognises no sale — its P&L is the cash kept
      // (collected − refunded) minus any USD already sunk into sourcing.
      const saleValue = isCancelled ? 0 : payment.total;
      // On a cancellation the committed refund (owed or paid) is the liability,
      // so P&L = cash genuinely kept − any USD already sunk. A fully-refunded
      // cancel nets ~0; a partial/zero refund keeps the retained portion.
      const refundCommitment = Math.max(refundPaid, Number(o.refund_due_pkr || 0));
      const profit = isCancelled ? (collected - refundCommitment) - usdActual * fx : payment.total - usd * fx;
      const batch = shipmentBatchForOrder(o);
      const profitClass = profit >= 0 ? "profit-positive" : "profit-negative";
      const waNum = canonPhone(o.customer_phone);
      const waHref = !isCancelled && isValidPkMobile(waNum) && balanceLeft > 0
        ? `https://wa.me/${waNum}?text=${encodeURIComponent(`Hi ${(o.customer_name || "").split(" ")[0]}, your Global Bestie order ${o.id} has a remaining balance of Rs ${balanceLeft.toLocaleString()}. Please transfer when convenient — thank you!`)}`
        : "";
      totalPkr += saleValue;
      totalUsd += usdActual;
      totalAdvance += Number(o.advance_paid_pkr || 0);
      totalBalance += balanceLeft;
      totalProfit += profit;
      totalRefundPaid += refundPaid;
      totalRefundDue += refundOut;
      const refundBadge = isCancelled
        ? (refundOut > 0
            ? ` <span class="ledger-refund-badge due" title="Refund still owed">refund ${PKR.format(refundOut)}</span>`
            : refundPaid > 0
              ? ` <span class="ledger-refund-badge done" title="Refunded ${PKR.format(refundPaid)}">refunded</span>`
              : "")
        : "";
      const stageCell = isCancelled ? `cancelled${refundBadge}` : o.status.replaceAll("_", " ");
      return `
        <tr role="button" tabindex="0" class="order-row${isCancelled ? " ledger-cancelled" : ""}" data-action="view-order" data-order-id="${o.id}" data-payment="${o.payment_status}">
          <td><strong>${o.id}</strong>${waHref ? `<br><a class="ledger-wa-link" href="${waHref}" target="_blank" rel="noreferrer" data-stop-row title="WhatsApp balance reminder">↗ WA</a>` : ""}</td>
          <td>${esc(o.customer_name || "")}<br><small>${esc(formatPkDisplay(canonPhone(o.customer_phone)) || o.customer_phone || "")}</small></td>
          <td>${batch ? batch.name : "—"}</td>
          <td>${stageCell}</td>
          <td>${paymentLabel(o.payment_status)}</td>
          <td>${isCancelled ? `<s>${PKR.format(payment.total)}</s>` : PKR.format(payment.total)}</td>
          <td>${USD.format(usdActual)}${usdActual < usd && !isCancelled ? `<br><small>est ${USD.format(usd)}</small>` : ""}</td>
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
  // Refunds memo — keeps cancellations visible in the ledger's bottom line
  // instead of vanishing. Only shown when there's something to report.
  const refundMemo = (totalRefundPaid > 0 || totalRefundDue > 0)
    ? `<tr class="ledger-refund-row">
        <td colspan="10">↩ Refunds — <strong>${PKR.format(totalRefundPaid)}</strong> paid${totalRefundDue > 0 ? ` · <strong class="profit-negative">${PKR.format(totalRefundDue)}</strong> still owed` : ""}</td>
       </tr>`
    : "";
  const table = tbody.closest("table");
  if (table) {
    let tfoot = table.querySelector("tfoot");
    if (!tfoot) {
      tfoot = document.createElement("tfoot");
      table.appendChild(tfoot);
    }
    tfoot.innerHTML = tfootRow + refundMemo;
  }

  // Stash current filtered rows so the CSV export uses exactly what is shown.
  state._ledgerExport = rows;
}

// Bulk action bar visibility + selected-count chip + batch picker options.
// Called whenever the selection set changes.
function renderBulkActionBar() {
  const bar = qs("[data-bulk-action-bar]");
  if (!bar) return;
  const n = state.selectedOrders?.size || 0;
  bar.classList.toggle("hidden", n === 0);
  const count = qs("[data-bulk-selected-count]");
  if (count) count.textContent = String(n);
  const batchSel = qs("[data-bulk-batch-select]");
  if (batchSel) {
    const current = batchSel.value;
    batchSel.innerHTML =
      `<option value="">Assign to batch…</option>` +
      (state.shipmentBatches || []).filter((b) => b.status !== "arrived").map((b) => `<option value="${attr(b.id)}">${esc(b.name)}</option>`).join("");
    batchSel.value = current || "";
  }
}

// Thin pink progress bar overlay inside the bulk-action-bar — call setBulkProgress(pct)
// during async loops so the operator can see the bulk-mark inching toward done.
function setBulkProgress(pct) {
  const wrap = qs("[data-bulk-progress]");
  const bar = qs("[data-bulk-progress-bar]");
  if (!wrap || !bar) return;
  if (pct == null) { wrap.hidden = true; bar.style.width = "0%"; return; }
  wrap.hidden = false;
  bar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
}

// Bulk operations on the selected orders. Currently supports:
//   • mark-accepted  → PATCH each pending_review row to accepted via acceptOrder
//   • export         → CSV download of just the selected rows
//   • clear          → empty selection
async function bulkOrdersAction(op) {
  const ids = [...(state.selectedOrders || new Set())];
  if (op === "clear") {
    state.selectedOrders = new Set();
    qsa("[data-order-select]").forEach((cb) => { cb.checked = false; });
    qsa(".order-row.is-selected").forEach((row) => row.classList.remove("is-selected"));
    renderBulkActionBar();
    return;
  }
  if (!ids.length) { toast("Select at least one order."); return; }
  if (op === "export") {
    const prev = state._ordersExport;
    state._ordersExport = (state.orders || []).filter((o) => ids.includes(o.id));
    exportOrdersCsv();
    state._ordersExport = prev;
    return;
  }
  if (op === "mark-accepted") {
    if (!window.confirm(`Mark ${ids.length} order(s) as accepted?`)) return;
    let ok = 0;
    let processed = 0;
    setBulkProgress(0);
    for (const id of ids) {
      const o = state.orders.find((x) => x.id === id);
      processed += 1;
      setBulkProgress((processed / ids.length) * 100);
      if (!o) continue;
      if (o.status !== "pending_review") continue;
      try {
        await acceptOrder(id);
        ok += 1;
      } catch {}
    }
    setBulkProgress(null);
    toast(`Marked ${ok} order(s) as accepted.`);
    state.selectedOrders = new Set();
    renderAdminOrders();
    renderBulkActionBar();
  }
  if (op === "assign-batch") {
    const batchId = qs("[data-bulk-batch-select]")?.value;
    if (!batchId) { toast("Pick a batch first."); return; }
    const batch = (state.shipmentBatches || []).find((b) => b.id === batchId);
    if (!batch) return;
    if (!window.confirm(`Assign ${ids.length} order(s) to ${batch.name}?`)) return;
    let ok = 0;
    let processed = 0;
    setBulkProgress(0);
    for (const id of ids) {
      processed += 1;
      setBulkProgress((processed / ids.length) * 100);
      try {
        await apiFetch(`/api/admin/orders/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify({ shipment_batch_id: batchId, note: `Assigned to ${batch.name} via bulk action.` }),
        }, { ok: true });
        // Optimistic local update so the UI reflects assignment before
        // the next dashboard refresh.
        const local = state.orders.find((x) => x.id === id);
        if (local) local.shipment_batch_id = batchId;
        if (!batch.order_ids?.includes(id)) batch.order_ids = [...(batch.order_ids || []), id];
        ok += 1;
      } catch {}
    }
    setBulkProgress(null);
    toast(`Assigned ${ok} order(s) to ${batch.name}.`);
    state.selectedOrders = new Set();
    renderAdminOrders();
    renderBulkActionBar();
  }
}

// CSV export for the Customers tab. Calls the server endpoint with the
// current filter as a query string so the file is exactly what's on screen.
// Falls back to client-side export when offline-preview mode is in effect.
async function exportCustomersCsv() {
  const f = state.customerFilters || {};
  const params = new URLSearchParams();
  if (f.city && f.city !== "all") params.set("city", f.city);
  if (f.search) params.set("search", f.search);
  const url = `/api/admin/customers/export?${params.toString()}`;

  // Try server-side first. If the admin endpoint isn't configured (local
  // preview), fall through to a client-side CSV from state.customers.
  try {
    const r = await fetch(url, {
      headers: state.adminToken ? { Authorization: `Bearer ${state.adminToken}` } : {},
    });
    if (r.ok) {
      const blob = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `global-bestie-customers-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
      toast(`Exported customers CSV.`);
      return;
    }
  } catch { /* fall through */ }

  // Offline fallback — build from state.customers directly
  const list = (state.customers || []).filter((c) => {
    if (f.city && f.city !== "all" && (c.city || "").toLowerCase() !== f.city.toLowerCase()) return false;
    if (f.search) {
      const hay = [c.name, c.phone, c.city, ...(c.tags || [])].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(f.search.toLowerCase())) return false;
    }
    return true;
  });
  if (!list.length) { toast("No customers in the current view."); return; }
  const csvEsc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const headers = ["Phone", "Name", "City", "Total orders", "Lifetime revenue", "Tags", "WhatsApp opt-in"];
  const body = list.map((c) => [
    formatPkDisplay(c.phone) || c.phone || "",
    c.name || "",
    c.city || "",
    Number(c.total_orders || 0),
    Number(c.total_revenue_pkr || 0),
    (c.tags || []).join(" | "),
    c.whatsapp_opt_in === false ? "no" : "yes",
  ].map(csvEsc).join(","));
  const csv = [headers.join(","), ...body].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `global-bestie-customers-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
  toast(`Exported ${list.length} customers to CSV.`);
}

// Counts how many customers match a given segment's filters. Used to badge
// each chip in the segment bar so the operator knows the size before applying.
function countMatchingCustomers(filters) {
  return (state.customers || []).filter((c) => {
    if (filters.city && (c.city || "").toLowerCase() !== String(filters.city).toLowerCase()) return false;
    if (filters.min_orders && Number(c.total_orders || 0) < Number(filters.min_orders)) return false;
    if (filters.min_revenue && Number(c.total_revenue_pkr || 0) < Number(filters.min_revenue)) return false;
    if (filters.tag) {
      const tags = Array.isArray(c.tags) ? c.tags : [];
      if (!tags.some((t) => String(t).toLowerCase() === String(filters.tag).toLowerCase())) return false;
    }
    if (filters.last_order_days > 0) {
      const ls = c.last_seen ? new Date(c.last_seen).getTime() : 0;
      const cutoff = Date.now() - Number(filters.last_order_days) * 86_400_000;
      if (!ls || ls < cutoff) return false;
    }
    return true;
  }).length;
}

// Suggests the next-best broadcast for a customer based on their top brand
// affinity vs the active product catalog. Surfaces "Coach (3 orders) — we
// have 4 new Coach pieces. Try the Coach drop template." Renders nothing
// when there's no signal yet.
function renderNextBestSuggestion(orders) {
  if (!orders?.length) return "";
  const brandSpend = new Map();
  for (const o of orders) {
    for (const it of orderItems(o)) {
      const p = state.products.find((x) => x.id === it.product_id);
      const brand = p?.brand || "";
      if (!brand) continue;
      brandSpend.set(brand, (brandSpend.get(brand) || 0) + Number(it.unit_price_pkr || 0) * Number(it.quantity || 1));
    }
  }
  const topBrand = [...brandSpend.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!topBrand) return "";
  const newPieces = (state.products || []).filter((p) => p.brand === topBrand && p.status !== "archived").length;
  if (newPieces < 2) return "";
  return `
    <aside class="nbb-suggestion">
      <strong>Next move</strong>
      <p>This customer's top brand is <strong>${esc(topBrand)}</strong> — we have ${newPieces} active piece${newPieces === 1 ? "" : "s"}. Worth a quick WhatsApp.</p>
    </aside>
  `;
}

// Risk audit banner — counts risk-flagged customers, splits them by city
// so the team can spot regional concentration ("12 risky · 7 Karachi · 3
// Lahore"). Toggles its own visibility based on whether anyone's flagged.
function renderRiskAuditBanner() {
  const banner = qs("[data-risk-audit-banner]");
  if (!banner) return;
  const risky = (state.customers || []).filter((c) => c.risk_flag);
  banner.classList.toggle("hidden", risky.length === 0);
  const count = qs("[data-risk-count]");
  if (count) count.textContent = String(risky.length);
  // Per-city breakdown — top 3 cities
  const byCity = new Map();
  for (const c of risky) {
    const city = c.city || "Unknown";
    byCity.set(city, (byCity.get(city) || 0) + 1);
  }
  const top = [...byCity.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  let breakdown = banner.querySelector("[data-risk-breakdown]");
  if (!breakdown) {
    breakdown = document.createElement("span");
    breakdown.dataset.riskBreakdown = "";
    breakdown.className = "risk-breakdown";
    banner.insertBefore(breakdown, banner.querySelector("button"));
  }
  breakdown.innerHTML = top.length
    ? top.map(([city, n]) => `<button type="button" class="risk-city-chip" data-action="filter-by-risk-city" data-city="${attr(city)}">${esc(city)} ${n}</button>`).join("")
    : "";
}

// CSV export for the Orders tab. Pulls whatever's currently filtered into
// state._ordersExport (set by renderAdminOrders) so the operator gets
// exactly the view they're looking at — same date range, same batch, same
// status filter.
function exportOrdersCsv() {
  const rows = state._ordersExport || state.orders || [];
  if (!rows.length) {
    toast("No orders in the current view to export.");
    return;
  }
  const headers = [
    "Order ID",
    "Created",
    "Customer",
    "Phone",
    "City",
    "Address",
    "Batch",
    "Status",
    "Payment status",
    "Total PKR",
    "Advance due",
    "Advance paid",
    "Balance due",
    "Balance paid",
    "Tracking",
    "Courier",
  ];
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = rows.map((o) => {
    const batch = shipmentBatchForOrder(o);
    return [
      o.id,
      o.created_at || "",
      o.customer_name || "",
      formatPkDisplay(canonPhone(o.customer_phone)) || o.customer_phone || "",
      o.city || "",
      (o.address || "").replace(/\n/g, " "),
      batch ? batch.name : "",
      (o.status || "").replaceAll("_", " "),
      paymentLabel(o.payment_status),
      Number(o.total_pkr || 0),
      Number(o.advance_due_pkr || 0),
      Number(o.advance_paid_pkr || 0),
      Number(o.balance_due_pkr || 0),
      Number(o.balance_paid_pkr || 0),
      o.tracking_number || o.usa_tracking || "",
      o.courier_name || o.local_courier || "",
    ].map(esc).join(",");
  });
  const csv = [headers.join(","), ...body].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  const range = state.orderFilters?.dateRange && state.orderFilters.dateRange !== "all" ? `-${state.orderFilters.dateRange}` : "";
  a.href = url;
  a.download = `global-bestie-orders${range}-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast(`Exported ${rows.length} orders to CSV.`);
}

// Dispatch modal — surfaces every order that's `pakistan_processing` AND
// paid in full, with inline tracking + courier inputs and a "Dispatch all"
// button. Server flips status to delivered + fires a WhatsApp tracking
// message per order.
function openDispatchModal({ batchId } = {}) {
  let eligible = (state.orders || []).filter((o) => {
    if (o.status !== "pakistan_processing") return false;
    const due = Math.max(0, Number(o.balance_due_pkr || 0) - Number(o.balance_paid_pkr || 0));
    return due === 0;
  });
  // Scope to one batch if invoked via the per-batch "Open dispatch" button
  let scopedBatch = null;
  if (batchId) {
    scopedBatch = (state.shipmentBatches || []).find((b) => b.id === batchId);
    eligible = eligible.filter((o) => (scopedBatch?.order_ids || []).includes(o.id));
  }
  if (!eligible.length) {
    openModal(`
      <div class="dispatch-modal">
        <p class="kicker">Bulk dispatch</p>
        <h2>Nothing ready to dispatch.</h2>
        <p class="confirmation-sub">Dispatch is available once an order arrives in Pakistan AND the balance is fully paid. Chase any open balances on the Cashflow tab first.</p>
        <div class="confirmation-actions">
          <button class="button secondary" type="button" data-action="close-modal">Close</button>
        </div>
      </div>
    `);
    return;
  }
  state.dispatchQueue = eligible.map((o) => ({ order_id: o.id, tracking_number: "", courier_name: o.local_courier || "" }));
  // Courier options come from store_settings.couriers (comma-separated).
  // Falls back to a sane default list if the setting hasn't been customized.
  const couriers = String(state.settings?.couriers || "Leopards,TCS,M&P,OCS,Trax")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  const courierOptions = (selected) => couriers.map((c) => `<option value="${attr(c)}" ${c === selected ? "selected" : ""}>${esc(c)}</option>`).join("");
  const rows = eligible.map((o, i) => {
    const phone = formatPkDisplay(canonPhone(o.customer_phone)) || "";
    return `
      <li class="dispatch-row" data-dispatch-index="${i}">
        <div class="dispatch-row-id">
          <strong>${esc(o.id)}</strong>
          <small>${esc(o.customer_name || "")} · ${esc(o.city || "")}</small>
          <small>${esc(phone)}</small>
        </div>
        <label class="dispatch-field">
          <span>Tracking #</span>
          <input type="text" data-dispatch-tracking placeholder="e.g. LP123456789" />
        </label>
        <label class="dispatch-field">
          <span>Courier</span>
          <select data-dispatch-courier>${courierOptions(o.local_courier || "")}</select>
        </label>
      </li>
    `;
  }).join("");
  openModal(`
    <div class="dispatch-modal">
      <p class="kicker">Bulk dispatch · ${eligible.length} ready${scopedBatch ? ` · ${esc(scopedBatch.name)}` : ""}</p>
      <h2>Mark out for delivery</h2>
      <p class="confirmation-sub">${scopedBatch ? `Showing only orders in <strong>${esc(scopedBatch.name)}</strong>. ` : ""}Add a tracking number for each order. Customers get an automatic WhatsApp with the tracking link. Leave blank to skip a row.</p>
      <ul class="dispatch-list">${rows}</ul>
      <div class="confirmation-actions">
        <button class="button primary" type="button" data-action="dispatch-submit">Dispatch all with tracking</button>
        <button class="button secondary" type="button" data-action="close-modal">Cancel</button>
      </div>
    </div>
  `);
  // Wire inputs to state. Listen on both events so the select picker bubbles
  // correctly across browsers.
  const handleDispatchChange = (e) => {
    const row = e.target.closest(".dispatch-row");
    if (!row) return;
    const i = Number(row.dataset.dispatchIndex);
    const item = state.dispatchQueue[i];
    if (!item) return;
    if (e.target.matches("[data-dispatch-tracking]")) item.tracking_number = e.target.value.trim();
    if (e.target.matches("[data-dispatch-courier]")) item.courier_name = e.target.value.trim();
  };
  qs(".dispatch-list")?.addEventListener("input", handleDispatchChange);
  qs(".dispatch-list")?.addEventListener("change", handleDispatchChange);
}

// ═════════════════ MANUAL ORDER ENTRY ═════════════════
// In-portal form for the team to create an order on a customer's behalf
// (typically off the back of a WhatsApp / Instagram conversation). Sends
// to the same /api/orders POST as the storefront so it goes through the
// canonical-phone + idempotency + auto-WhatsApp pipeline.
const MANUAL_ORDER_DRAFT_KEY = "gb_manual_order_draft";
function loadManualOrderDraft() {
  try {
    const raw = localStorage.getItem(MANUAL_ORDER_DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function saveManualOrderDraft() {
  try { localStorage.setItem(MANUAL_ORDER_DRAFT_KEY, JSON.stringify(state.manualOrderDraft)); } catch {}
}
function clearManualOrderDraft() {
  try { localStorage.removeItem(MANUAL_ORDER_DRAFT_KEY); } catch {}
}

state.manualOrderDraft = loadManualOrderDraft() || { lines: [{ product_id: "", quantity: 1 }] };

function openManualOrderModal() {
  // Restore an in-progress draft if there is one; otherwise start fresh.
  const existing = loadManualOrderDraft();
  if (existing && existing.lines?.some((l) => l.product_id || l.search || l.variant)) {
    state.manualOrderDraft = existing;
  } else {
    state.manualOrderDraft = { lines: [{ product_id: "", quantity: 1, variant: "" }] };
  }
  // Fresh idempotency key per modal open — every click of "Create order"
  // inside one modal session reuses this same key so the server can
  // catch double-clicks.
  state._manualOrderIdemKey = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  renderManualOrderModal();
}

function renderManualOrderModal() {
  const products = (state.products || []).filter((p) => (p.status || "active") === "active");
  // Datalist-backed typeahead — the operator types a brand or title and the
  // native browser picker filters. Cleaner than a 100-option <select> when
  // the catalog grows.
  const datalistId = "manual-product-options";
  const datalistOptions = products.map((p) =>
    `<option value="${attr(p.title)}" data-product-id="${attr(p.id)}">${esc(p.brand || "")} — ${PKR.format(calculatePrice(p))} ${p.stock_mode === "preorder" ? "(preorder)" : "(in stock)"}</option>`,
  ).join("");
  const lines = (state.manualOrderDraft?.lines || []).map((line, i) => {
    const product = products.find((p) => p.id === line.product_id);
    const subtotal = product ? calculatePrice(product) * Number(line.quantity || 1) : 0;
    const displayValue = product ? product.title : (line.search || "");
    return `
      <div class="manual-line" data-line-index="${i}">
        <input type="search" class="manual-product-search" data-manual-product-search list="${datalistId}" value="${attr(displayValue)}" placeholder="Search by brand or title…" autocomplete="off" />
        <input type="number" data-manual-qty min="1" step="1" value="${line.quantity || 1}" aria-label="Quantity" />
        <input type="text" data-manual-variant value="${attr(line.variant || "")}" placeholder="Size / shade / color" aria-label="Variant" />
        <span class="manual-line-subtotal">${subtotal ? PKR.format(subtotal) : "—"}</span>
        <button class="button secondary" type="button" data-action="manual-order-remove-line" data-line-index="${i}" aria-label="Remove line">×</button>
      </div>
    `;
  }).join("");
  // Datalist rendered once at the end of the modal
  const productsDatalist = `<datalist id="${datalistId}">${datalistOptions}</datalist>`;
  // Pre-compute totals from current draft for the running display
  let total = 0;
  for (const l of (state.manualOrderDraft?.lines || [])) {
    const p = products.find((pr) => pr.id === l.product_id);
    if (p) total += calculatePrice(p) * Number(l.quantity || 1);
  }
  openModal(`
    <div class="manual-order-modal">
      <p class="kicker">Manual order entry</p>
      <h2>Create order on behalf of customer</h2>
      <p class="confirmation-sub">Sends through the standard order pipeline (canonical phone, auto-WhatsApp, audit trail). Customer doesn't see this form.</p>

      <div class="form-grid manual-customer-grid">
        <label>Customer name<input type="text" data-manual-name autocomplete="off" /></label>
        <label>WhatsApp phone<input type="text" data-manual-phone placeholder="0300 1234567" autocomplete="off" /></label>
        <label>City<input type="text" data-manual-city autocomplete="off" /></label>
        <label>Delivery method
          <select data-manual-delivery>
            <option value="standard_courier">Standard courier</option>
            <option value="insured_courier">Insured courier</option>
            <option value="pickup_coordination">Pickup coordination</option>
          </select>
        </label>
        <label class="span-2">Address<textarea data-manual-address rows="2"></textarea></label>
        <label class="span-2">Internal note (optional)<textarea data-manual-note rows="2" placeholder="How the order came in, special instructions, etc."></textarea></label>
      </div>

      <div class="manual-lines">
        <div class="manual-lines-header">
          <strong>Items</strong>
          <button class="button secondary" type="button" data-action="manual-order-add-line">+ Add item</button>
        </div>
        ${lines}
        <div class="manual-total"><span>Order total</span><strong data-manual-total>${PKR.format(total)}</strong></div>
      </div>

      <label class="check-row">
        <input type="checkbox" data-manual-skip-wa />
        <span>Don't send auto-WhatsApp (use if you've already chatted with them)</span>
      </label>

      <div class="confirmation-actions">
        <button class="button primary" type="button" data-action="manual-order-submit">Create order</button>
        <button class="button secondary" type="button" data-action="close-modal">Cancel</button>
      </div>
      ${productsDatalist}
    </div>
  `);

  // Wire the typeahead product inputs. On 'change' (fires when the user
  // picks a datalist suggestion or commits typing), look up the matching
  // product by title and lock it onto the draft line.
  qsa("[data-manual-product-search]").forEach((el, i) => {
    el.addEventListener("change", () => {
      const typed = el.value.trim().toLowerCase();
      const match = products.find((p) => p.title.toLowerCase() === typed);
      state.manualOrderDraft.lines[i].product_id = match ? match.id : "";
      state.manualOrderDraft.lines[i].search = el.value;
      saveManualOrderDraft();
      renderManualOrderModal();
    });
  });
  qsa("[data-manual-qty]").forEach((el, i) => {
    el.addEventListener("input", () => {
      state.manualOrderDraft.lines[i].quantity = Math.max(1, Number(el.value || 1));
      saveManualOrderDraft();
      renderManualOrderModal();
    });
  });
  qsa("[data-manual-variant]").forEach((el, i) => {
    el.addEventListener("input", () => {
      state.manualOrderDraft.lines[i].variant = el.value;
      saveManualOrderDraft();
    });
  });

  // Phone-recall: when the operator types a phone, autofill the rest from
  // localStorage customer profile (same mechanism storefront uses).
  qs("[data-manual-phone]")?.addEventListener("blur", (e) => {
    const profile = recallCustomerProfile(e.target.value);
    if (!profile) return;
    const fields = { name: "[data-manual-name]", city: "[data-manual-city]", address: "[data-manual-address]" };
    if (profile.customer_name && !qs(fields.name).value) qs(fields.name).value = profile.customer_name;
    if (profile.city && !qs(fields.city).value) qs(fields.city).value = profile.city;
    if (profile.address && !qs(fields.address).value) qs(fields.address).value = profile.address;
  });
}

function manualOrderAddLine() {
  state.manualOrderDraft.lines.push({ product_id: "", quantity: 1, variant: "" });
  renderManualOrderModal();
}

function manualOrderRemoveLine(index) {
  const i = Number(index);
  state.manualOrderDraft.lines.splice(i, 1);
  if (!state.manualOrderDraft.lines.length) state.manualOrderDraft.lines.push({ product_id: "", quantity: 1, variant: "" });
  renderManualOrderModal();
}

async function submitManualOrder() {
  // Guard against double-click: a submit currently in-flight pins this
  // flag, and the early-return below stops a second click from issuing
  // a second POST with a new idempotency_key.
  if (state._manualOrderSubmitting) return;
  const submitBtn = qs("[data-action='manual-order-submit']");
  const name = qs("[data-manual-name]")?.value.trim();
  const phone = qs("[data-manual-phone]")?.value.trim();
  const city = qs("[data-manual-city]")?.value.trim();
  const address = qs("[data-manual-address]")?.value.trim();
  const delivery = qs("[data-manual-delivery]")?.value || "standard_courier";
  const note = qs("[data-manual-note]")?.value.trim();
  const skipWa = !!qs("[data-manual-skip-wa]")?.checked;
  const canon = canonPhone(phone);

  if (!name) { toast("Customer name is required."); return; }
  if (!isValidPkMobile(canon)) { toast("Enter a valid Pakistani phone number (e.g. 0300 1234567)."); return; }
  if (!city || !address) { toast("City and address required."); return; }

  const items = (state.manualOrderDraft.lines || [])
    .filter((l) => l.product_id)
    .map((l) => {
      const p = state.products.find((x) => x.id === l.product_id);
      if (!p) return null;
      return {
        product_id: p.id,
        title: p.title,
        quantity: Math.max(1, Number(l.quantity || 1)),
        unit_price_pkr: calculatePrice(p),
        stock_mode: p.stock_mode,
        image_url: p.image_url,
        variant: l.variant || "",
        source_url: p.source_url || "",
      };
    })
    .filter(Boolean);

  if (!items.length) { toast("Add at least one item."); return; }

  const payment = splitPaymentFromLines(items.map((i) => ({ ...i, product: state.products.find((p) => p.id === i.product_id) || {}, subtotal: i.unit_price_pkr * i.quantity })));
  const payload = {
    customer_name: name,
    customer_phone: canon,
    city,
    address,
    notes: note ? `[Manual order] ${note}` : "[Manual order — created by team]",
    items,
    total_pkr: payment.total,
    advance_due_pkr: payment.advanceDue,
    balance_due_pkr: payment.balanceDue,
    delivery_method: delivery,
    whatsapp_opt_in: !skipWa,
    channel: "manual",
    // STABLE idempotency key per modal-open. If the operator double-clicks,
    // the second submit goes to the server with the SAME key, and the
    // server's recentSubmissions map returns the original orderId instead
    // of inserting a duplicate row. Cleared after the modal closes.
    idempotency_key: state._manualOrderIdemKey || (state._manualOrderIdemKey = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
  };

  state._manualOrderSubmitting = true;
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.dataset.busy = "1";
    submitBtn.textContent = "Creating order…";
  }
  try {
    const result = await apiFetch("/api/orders", {
      method: "POST",
      body: JSON.stringify(payload),
    }, { order: { ...payload, id: `GB-MANUAL-${Date.now()}`, status: "pending_review", created_at: new Date().toISOString() } });
    closeModal();
    clearManualOrderDraft();
    state.manualOrderDraft = { lines: [{ product_id: "", quantity: 1, variant: "" }] };
    state._manualOrderIdemKey = null; // fresh key for the next manual order
    if (result.duplicate) {
      // Server caught the dupe: open the original order instead of inserting
      // a half-empty stub row.
      toast(`This order was just submitted — opening it.`);
      setTimeout(() => showOrderDetails(result.order?.id || result.order_id), 200);
    } else if (result.order) {
      // ID-dedupe on insert. If state.orders somehow already has this id
      // (e.g., a race with refreshAdmin), update in place instead of pushing
      // a second row.
      const existingIndex = state.orders.findIndex((o) => o.id === result.order.id);
      if (existingIndex >= 0) state.orders[existingIndex] = result.order;
      else state.orders.unshift(result.order);
      state._recentlyCreated = state._recentlyCreated || new Map();
      state._recentlyCreated.set(result.order.id, Date.now());
      renderAdmin();
      toast(`Order ${result.order.id} created. ${skipWa ? "" : "Auto-WhatsApp queued."}`);
      setTimeout(() => showOrderDetails(result.order.id), 200);
    } else {
      toast("Order created.");
      refreshAdmin();
    }
  } catch {
    toast("Couldn't create order — try again.");
  } finally {
    state._manualOrderSubmitting = false;
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.removeAttribute("data-busy");
      submitBtn.textContent = "Create order";
    }
  }
}

async function submitDispatch() {
  if (state._dispatchSubmitting) return;
  const items = (state.dispatchQueue || []).filter((i) => i.tracking_number && i.courier_name);
  if (!items.length) {
    toast("Add at least one tracking number first.");
    return;
  }
  const proceed = window.confirm(`Dispatch ${items.length} order(s) and send tracking via WhatsApp?`);
  if (!proceed) return;
  state._dispatchSubmitting = true;
  const btn = qs("[data-action='dispatch-submit']");
  if (btn) { btn.disabled = true; btn.dataset.busy = "1"; btn.textContent = "Dispatching…"; }
  try {
    const result = await apiFetch("/api/admin/dispatch", {
      method: "POST",
      body: JSON.stringify({ items }),
    }, { ok: false, sent: 0, failed: 0, results: [] });
    closeModal();
    refreshAdmin();
    toast(`Dispatched ${result.sent || 0} order(s)${result.failed ? `, ${result.failed} failed` : ""}.`);
  } catch {
    toast("Dispatch failed — try again.");
  } finally {
    state._dispatchSubmitting = false;
    if (btn) {
      btn.disabled = false;
      btn.removeAttribute("data-busy");
      btn.textContent = "Dispatch all with tracking";
    }
  }
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
    overview: pending + balanceDue + handoffs,
    orders: pending + balanceDue,
    shipments: activeBatch ? 1 : 0,
    products: lowStock,
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
// FX-rate staleness banner. Agent file mandates a twice-weekly FX refresh
// because every PKR price depends on `settings.fx_rate`. If we haven't
// touched it in 4+ days the team is silently selling at the wrong margin.
// Global cmd-K (or ctrl-K) palette for the portal. Searches orders by ID/
// customer/phone, products by title/brand, batches by name. Selecting a hit
// opens the right modal / jumps to the right tab — no clicking around.
function openCommandPalette() {
  if (document.body.dataset.page !== "portal") return;
  const root = ensureModalRoot();
  root.innerHTML = `
    <div class="modal-backdrop cmd-palette-backdrop">
      <section class="cmd-palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <input type="search" class="cmd-palette-input" placeholder="Search orders, customers, products, batches…" autofocus />
        <div class="cmd-palette-results" data-cmd-results></div>
        <div class="cmd-palette-hint">↑↓ navigate · Enter open · Esc close</div>
      </section>
    </div>
  `;
  // Match openModal()'s body class so any sticky/fixed chrome that hides
  // for regular modals also hides for the palette.
  document.body.classList.add("modal-open");
  qs(".cmd-palette-backdrop")?.addEventListener("click", (e) => {
    if (!e.target.closest(".cmd-palette")) closeModal();
  });
  const input = qs(".cmd-palette-input");
  let cursor = 0;
  // Case-insensitive substring highlight — wraps the typed query in <mark>
  // inside labels + sub-text so the eye lands on the match. Defined at the
  // top of render() so BOTH the action path and the search path can use it.
  const markMatch = (text, q) => {
    const safe = esc(text);
    const trimmed = (q || "").trim();
    if (!trimmed) return safe;
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    try {
      return safe.replace(new RegExp(`(${escaped})`, "gi"), '<mark class="cmd-palette-mark">$1</mark>');
    } catch {
      return safe;
    }
  };
  const render = (q) => {
    const needle = q.trim().toLowerCase();
    const hits = [];
    if (needle) {
      // ─── Action mode ───
      // Typing `>` at the start of the query switches the palette into
      // action mode: a curated list of common operator commands. Lets the
      // team do "export orders", "new broadcast", "refresh" without
      // hunting through tabs.
      if (needle.startsWith(">")) {
        const aq = needle.slice(1).trim();
        const actions = [
          { label: "Export orders CSV", sub: "Current filter view", run: () => { qs("[data-admin-tab='orders']")?.click(); setTimeout(exportOrdersCsv, 80); } },
          { label: "Export customers CSV", sub: "Current filter view", run: () => { qs("[data-admin-tab='customers']")?.click(); setTimeout(exportCustomersCsv, 80); } },
          { label: "Open dispatch", sub: "Bulk mark out for delivery", run: () => openDispatchModal() },
          { label: "Refresh data", sub: "Reload from /api/admin/dashboard", run: () => refreshAdmin() },
          { label: "Jump to Overview", sub: "KPIs + needs-attention queue", run: () => qs("[data-admin-tab='overview']")?.click() },
          { label: "Jump to Cashflow", sub: "Ledger + balance chase", run: () => qs("[data-admin-tab='cashflow']")?.click() },
          { label: "Jump to Customers", sub: "Customer 360 + segments", run: () => qs("[data-admin-tab='customers']")?.click() },
          { label: "Jump to Settings", sub: "FX, bank, couriers", run: () => qs("[data-admin-tab='settings']")?.click() },
        ];
        for (const a of actions) {
          if (!aq || a.label.toLowerCase().includes(aq) || a.sub.toLowerCase().includes(aq)) {
            hits.push({ type: "Action", label: a.label, sub: a.sub, action: () => { closeModal(); setTimeout(a.run, 30); } });
          }
        }
        cursor = 0;
        const target = qs("[data-cmd-results]");
        if (!hits.length) {
          target.innerHTML = `<div class="cmd-palette-empty">No actions match "${esc(aq)}".</div>`;
          target._hits = [];
        } else {
          target.innerHTML = hits.map((h, i) => `
            <button class="cmd-palette-row${i === cursor ? " active" : ""}" type="button" data-cmd-index="${i}">
              <span class="cmd-palette-type tone-action">⌘</span>
              <span class="cmd-palette-label">${markMatch(h.label, aq)}</span>
              <span class="cmd-palette-sub">${markMatch(h.sub, aq)}</span>
            </button>
          `).join("");
          target._hits = hits;
        }
        return;
      }

      // Phone-shaped queries match exactly against canonicalized customer
      // numbers — typing "0300" or "+92 300" surfaces the right customer
      // immediately, not every order that happens to contain "300".
      const canon = canonPhone(needle);
      const phoneLike = canon.length >= 4;

      // Customers first — phone is the identity, so it should be the top hit.
      for (const c of state.customers || []) {
        const hay = [c.name, c.phone, c.city, c.email].filter(Boolean).join(" ").toLowerCase();
        const phoneMatch = phoneLike && String(c.phone || "").includes(canon);
        if (hay.includes(needle) || phoneMatch) {
          hits.push({
            type: "Customer",
            label: c.name || formatPkDisplay(c.phone),
            sub: `${formatPkDisplay(c.phone)} · ${c.total_orders || 0} orders · ${PKR.format(Number(c.total_revenue_pkr || 0))}`,
            avatar: customerAvatarHtml(c, { size: "sm" }),
            action: () => { closeModal(); showCustomerDetails(c.phone); },
          });
        }
        if (hits.length >= 8) break;
      }
      for (const o of state.orders || []) {
        const hay = [o.id, o.customer_name, o.customer_phone].filter(Boolean).join(" ").toLowerCase();
        const phoneMatch = phoneLike && canonPhone(o.customer_phone).includes(canon);
        if (hay.includes(needle) || phoneMatch) {
          hits.push({
            type: "Order", label: o.id, sub: `${o.customer_name} · ${o.status?.replaceAll("_", " ") || ""}`,
            action: () => { closeModal(); showOrderDetails(o.id); },
          });
        }
        if (hits.length >= 20) break;
      }
      for (const p of state.products || []) {
        const hay = [p.title, p.brand, p.category].filter(Boolean).join(" ").toLowerCase();
        if (hay.includes(needle)) {
          hits.push({
            type: "Product", label: p.title, sub: `${p.brand || ""} · ${p.category || ""}`,
            action: () => { closeModal(); showProductDetails(p.id); },
          });
        }
        if (hits.length >= 32) break;
      }
      for (const b of state.shipmentBatches || []) {
        const hay = (b.name || "").toLowerCase();
        if (hay.includes(needle)) {
          hits.push({
            type: "Batch", label: b.name, sub: `${b.status} · ETA ${formatDate(b.eta_date) || "—"}`,
            action: () => { closeModal(); qs("[data-admin-tab='shipments']")?.click(); },
          });
        }
      }
    }
    cursor = 0;
    const target = qs("[data-cmd-results]");
    if (!hits.length) {
      target.innerHTML = needle
        ? `<div class="cmd-palette-empty">No matches for "${esc(needle)}". Try <code>&gt;</code> for actions.</div>`
        : `<div class="cmd-palette-empty">Type to search customers, orders, products. Type <code>&gt;</code> for actions.</div>`;
      target._hits = [];
      return;
    }
    target.innerHTML = hits.map((h, i) => `
      <button class="cmd-palette-row${i === cursor ? " active" : ""}${h.avatar ? " has-avatar" : ""}" type="button" data-cmd-index="${i}">
        ${h.avatar || `<span class="cmd-palette-type">${esc(h.type)}</span>`}
        ${h.avatar ? `<span class="cmd-palette-type subtle">${esc(h.type)}</span>` : ""}
        <span class="cmd-palette-label">${markMatch(h.label, needle)}</span>
        <span class="cmd-palette-sub">${markMatch(h.sub, needle)}</span>
      </button>
    `).join("");
    target._hits = hits;
  };
  render("");
  input.addEventListener("input", (e) => render(e.target.value));
  input.addEventListener("keydown", (e) => {
    const target = qs("[data-cmd-results]");
    const hits = target?._hits || [];
    if (e.key === "ArrowDown") {
      e.preventDefault();
      cursor = Math.min(hits.length - 1, cursor + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      cursor = Math.max(0, cursor - 1);
    } else if (e.key === "Enter" && hits[cursor]) {
      e.preventDefault();
      hits[cursor].action();
      return;
    } else {
      return;
    }
    qsa(".cmd-palette-row").forEach((row, i) => row.classList.toggle("active", i === cursor));
    qsa(".cmd-palette-row")[cursor]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  });
  qs("[data-cmd-results]")?.addEventListener("click", (e) => {
    const row = e.target.closest(".cmd-palette-row");
    if (!row) return;
    const target = qs("[data-cmd-results]");
    const hits = target?._hits || [];
    const i = Number(row.dataset.cmdIndex);
    if (hits[i]) hits[i].action();
  });
}

function renderFxBanner() {
  const target = qs("[data-fx-banner]");
  if (!target) return;
  const s = state.settings || {};
  const fx = Number(s.fx_rate || 0);
  const updated = s.fx_updated_at || s.updated_at || s.fx_rate_updated_at;
  const ts = updated ? new Date(updated).getTime() : 0;
  const days = ts ? Math.floor((Date.now() - ts) / 86400000) : null;
  const stale = !ts || days === null || days >= 4;
  if (!stale && fx > 0) {
    target.hidden = true;
    target.innerHTML = "";
    return;
  }
  target.hidden = false;
  target.className = "fx-stale-banner";
  const ageCopy = days === null
    ? "FX rate has no update timestamp"
    : `FX rate hasn't been updated in ${days} days`;
  target.innerHTML = `
    <strong>⚠️ ${esc(ageCopy)}</strong>
    <span>Current value: <code>Rs ${fx ? fx.toFixed(0) : "—"} / $1</code>. Refresh it in <a href="#" data-action="jump-settings">Settings</a> twice a week so every product price stays accurate.</span>
  `;
}

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

// Kanban board view — 6 columns (one per status). Cards are virtualized
// when a column has > 50 entries (renders the first 50 + a "Show all"
// button) so an operator with 300 in-transit orders doesn't pay the cost
// of building 300 DOM nodes per render. Click any card → full-screen
// order detail.
const KANBAN_VISIBLE_LIMIT = 50;
function renderKanbanBoard(rows) {
  const slot = qs("[data-orders-board]");
  if (!slot) return;
  const expanded = state._kanbanExpanded || new Set();
  const columns = [
    { key: "pending_review", label: "Pending Review", tone: "warn" },
    { key: "accepted", label: "Accepted", tone: "info" },
    { key: "sourcing", label: "Sourcing", tone: "info" },
    { key: "in_transit", label: "In Transit", tone: "info" },
    { key: "pakistan_processing", label: "Arrived in PK", tone: "ok" },
    { key: "delivered", label: "Delivered", tone: "ok" },
  ];
  slot.innerHTML = columns.map((col) => {
    const cards = rows.filter((o) => o.status === col.key);
    const isExpanded = expanded.has(col.key);
    const visible = (cards.length > KANBAN_VISIBLE_LIMIT && !isExpanded) ? cards.slice(0, KANBAN_VISIBLE_LIMIT) : cards;
    const hiddenCount = cards.length - visible.length;
    // Stage totals — sum of total_pkr for every order in this column.
    // Surfaces "how much money is sitting at each stage" at a glance.
    const stageTotal = cards.reduce((s, o) => s + Number(o.total_pkr || 0), 0);
    return `
      <div class="kanban-col tone-${col.tone}" data-kanban-col="${attr(col.key)}">
        <header>
          <div class="kanban-col-titlerow">
            <strong>${esc(col.label)}</strong>
            <span class="kanban-count">${cards.length}</span>
          </div>
          ${cards.length ? `<small class="kanban-col-total" title="${attr(PKR.format(stageTotal))} across ${cards.length} order${cards.length === 1 ? "" : "s"}">${shortPkr(stageTotal)} total</small>` : ""}
        </header>
        <div class="kanban-cards" data-kanban-drop="${attr(col.key)}">
          ${visible.length
            ? visible.map((o) => {
                const sla = orderSlaBadge(o);
                const balance = Math.max(0, Number(o.balance_due_pkr || 0) - Number(o.balance_paid_pkr || 0));
                const ageDays = daysSince(o.created_at);
                const watched = isWatched(o.id);
                return `
                  <button class="kanban-card ${sla ? `sla-${sla.level}` : ""} ${watched ? "is-watched" : ""} ${o.has_sourcing_request ? "is-sourcing" : ""}" type="button" draggable="true" data-action="view-order" data-order-id="${attr(o.id)}" data-kanban-drag="${attr(o.id)}">
                    <div class="kanban-card-top">
                      <strong>${esc(o.id)}</strong>
                      ${o.has_sourcing_request ? `<span class="kanban-sourcing-chip" title="Customer-pasted URL — needs quote">SRC</span>` : ""}
                      ${watched ? `<span class="kanban-star" aria-hidden="true">★</span>` : ""}
                    </div>
                    <small>${esc((o.customer_name || "").split(" ").slice(0, 2).join(" "))}</small>
                    <div class="kanban-card-bottom">
                      <span class="kanban-amount">${PKR.format(Number(o.total_pkr || 0))}</span>
                      <span class="kanban-age">${ageDays === 0 ? "today" : `${ageDays}d`}</span>
                    </div>
                    ${sla ? `<span class="kanban-sla sla-${sla.level}">${esc(sla.label)}</span>` : ""}
                    ${balance > 0 && col.key === "pakistan_processing" ? `<span class="kanban-balance">₨${balance.toLocaleString()} due</span>` : ""}
                  </button>
                `;
              }).join("")
            : `<p class="kanban-empty">·</p>`
          }
          ${hiddenCount > 0 ? `<button class="kanban-show-all" type="button" data-action="kanban-expand-col" data-col-key="${attr(col.key)}">Show ${hiddenCount} more</button>` : ""}
        </div>
      </div>
    `;
  }).join("");
}

// Renders a "Recently viewed" horizontal strip at the bottom of the PDP
// modal. Skipped silently when the customer has no history.
function renderRecentlyViewedStrip(currentId) {
  const ids = getRecentlyViewed(currentId);
  if (!ids.length) return "";
  const products = ids
    .map((id) => state.products.find((p) => p.id === id))
    .filter(Boolean)
    .slice(0, RECENT_VIEWED_LIMIT);
  if (!products.length) return "";
  return `
    <section class="recently-viewed-strip">
      <h3>Recently viewed</h3>
      <div class="recently-viewed-row">
        ${products.map((p) => {
          const parts = productPricingParts(p);
          const img = p.image_url ? `<img src="${safeUrl(imageUrl(p.image_url, { width: 200, height: 200 }), "")}" alt="${attr(p.title)}" loading="lazy" decoding="async" />` : `<span class="recent-placeholder">·</span>`;
          return `
            <button class="recently-viewed-tile" type="button" data-action="open-recent-product" data-product-id="${attr(p.id)}" aria-label="Open ${attr(p.title)}">
              ${img}
              <strong>${esc(p.title)}</strong>
              <span class="recent-price">${PKR.format(parts.total)}</span>
            </button>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

// ─── Wishlist (storefront, localStorage-backed) ───
// Customers who tap the ♥ on a product card store the product id locally
// so the same browser sees their saved items. No server roundtrip; works
// fine for the typical "I'll come back to this" pattern.
const WISHLIST_KEY = "gb_wishlist";
function loadWishlist() {
  try { return new Set(JSON.parse(localStorage.getItem(WISHLIST_KEY) || "[]")); }
  catch { return new Set(); }
}
function saveWishlist(set) {
  try { localStorage.setItem(WISHLIST_KEY, JSON.stringify([...set])); } catch {}
}
function isWishlisted(productId) {
  state._wishlist = state._wishlist || loadWishlist();
  return state._wishlist.has(productId);
}
function toggleWishlist(productId) {
  state._wishlist = state._wishlist || loadWishlist();
  if (state._wishlist.has(productId)) state._wishlist.delete(productId);
  else state._wishlist.add(productId);
  saveWishlist(state._wishlist);
  renderProducts();
  renderWishlistChip();
}

// Surfaces the saved-items count + filter toggle in the shop sidebar.
// Hidden completely when no items are saved so the UI stays clean.
function renderWishlistChip() {
  const chip = qs("[data-wishlist-toggle]");
  if (!chip) return;
  const wished = state._wishlist || (state._wishlist = loadWishlist());
  const count = wished.size;
  const countEl = chip.querySelector("[data-wishlist-count]");
  if (countEl) countEl.textContent = count;
  chip.classList.toggle("hidden", count === 0);
  const active = !!state.filters?.wishlistOnly;
  chip.classList.toggle("is-active", active);
  chip.setAttribute("aria-pressed", active ? "true" : "false");
  // If the filter is on but the wishlist just emptied, clear the filter
  // so the grid doesn't get stuck showing "no products".
  if (active && count === 0) {
    state.filters.wishlistOnly = false;
    renderProducts();
  }
}

// ─── Recently viewed products (storefront, localStorage) ───
// Tracks the last N product IDs the customer opened on the PDP. Surfaced
// at the bottom of every PDP as a "Recently viewed" strip.
const RECENT_VIEWED_KEY = "gb_recent_viewed";
const RECENT_VIEWED_LIMIT = 6;
function recordRecentlyViewed(productId) {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_VIEWED_KEY) || "[]");
    const next = [productId, ...list.filter((id) => id !== productId)].slice(0, RECENT_VIEWED_LIMIT);
    localStorage.setItem(RECENT_VIEWED_KEY, JSON.stringify(next));
  } catch {}
}
function getRecentlyViewed(excludeId) {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_VIEWED_KEY) || "[]");
    return list.filter((id) => id !== excludeId);
  } catch { return []; }
}

// Watchlist — pin orders to the top of the operator's view. State lives in
// localStorage so it survives reload but doesn't leak between operators.
function toggleWatchOrder(id) {
  if (!id) return;
  state.watchedOrders = state.watchedOrders || new Set();
  if (state.watchedOrders.has(id)) state.watchedOrders.delete(id);
  else state.watchedOrders.add(id);
  localStorage.setItem("gb_watched_orders", JSON.stringify([...state.watchedOrders]));
  toast(state.watchedOrders.has(id) ? "★ Added to watchlist" : "Removed from watchlist");
  renderAdminOrders();
  // Re-render order detail if open to update the star state
  if (state._currentOrderId === id) showOrderDetails(id);
}

function isWatched(id) {
  return state.watchedOrders?.has(id) || false;
}

// Humanize an elapsed-minutes count so SLA chips never read "32496 min".
// < 60 → "45 min", < 24h → "3 h", else "5 d".
function humanizeMins(mins) {
  if (mins < 60) return `${mins} min`;
  if (mins < 1440) return `${Math.floor(mins / 60)} h`;
  return `${Math.floor(mins / 1440)} d`;
}

// SLA windows tuned to the agent file's promise of a 15 min WhatsApp reply.
// Returns { level: "ok" | "warn" | "danger", label, mins }.
function orderSlaBadge(order) {
  if (!order) return null;
  const status = order.status;
  const balance = Math.max(0, Number(order.balance_due_pkr || 0) - Number(order.balance_paid_pkr || 0));
  // Pending review — the team has 15 min to acknowledge, 30 to accept.
  if (status === "pending_review") {
    const mins = Math.floor((Date.now() - new Date(order.created_at || 0).getTime()) / 60000);
    if (mins >= 30) return { level: "danger", label: `${humanizeMins(mins)} — overdue`, mins };
    if (mins >= 15) return { level: "warn", label: `${humanizeMins(mins)} — replying late`, mins };
    return { level: "ok", label: `${humanizeMins(mins)} — fresh`, mins };
  }
  // Arrived in PK with balance unpaid — courier dispatch can't happen until
  // paid; >24 h is silent revenue loss.
  if (status === "pakistan_processing" && balance > 0) {
    const ref = order.arrived_at || order.updated_at || order.created_at;
    const hours = Math.floor((Date.now() - new Date(ref || 0).getTime()) / 3_600_000);
    if (hours >= 48) return { level: "danger", label: `${hours} h — balance overdue`, mins: hours * 60 };
    if (hours >= 24) return { level: "warn", label: `${hours} h — chase balance`, mins: hours * 60 };
  }
  // Accepted but no batch after 7 days — already in stale-orders worklist,
  // mirror it here so it's visible from the main orders table too.
  if (status === "accepted" && !shipmentBatchForOrder(order)) {
    const days = daysSince(order.accepted_at || order.created_at);
    if (days !== null && days >= 14) return { level: "danger", label: `${days} d — stale, no batch`, mins: days * 1440 };
    if (days !== null && days >= 7) return { level: "warn", label: `${days} d — assign batch`, mins: days * 1440 };
  }
  return null;
}

// ═══════════════════════ ORDER FILTER PERSISTENCE ═══════════════════════
// Snapshot the Orders tab filter UI and persist it across sessions. Avoids
// the everyday friction of "I had it filtered to Karachi handbags, then
// reloaded, and it reset to All". Per-browser (localStorage) is enough —
// operators usually work from the same machine.

const ORDER_FILTERS_KEY = "gb_order_filters_v1";

function persistOrderFilters() {
  try {
    const snapshot = {
      status: qs("[data-admin-order-filter]")?.value || "all",
      batch: qs("[data-orders-batch]")?.value || "all",
      dateRange: qs("[data-orders-date]")?.value || "all",
      customStart: qs("[data-orders-start]")?.value || "",
      customEnd: qs("[data-orders-end]")?.value || "",
      search: qs("[data-orders-search]")?.value || "",
      chip: qs("[data-order-filter-chip].active")?.dataset.orderFilterChip || "all",
    };
    localStorage.setItem(ORDER_FILTERS_KEY, JSON.stringify(snapshot));
  } catch {
    /* localStorage can be unavailable (Safari private mode); fail silent */
  }
}

function restoreOrderFilters() {
  let snapshot;
  try {
    const raw = localStorage.getItem(ORDER_FILTERS_KEY);
    if (!raw) return;
    snapshot = JSON.parse(raw);
  } catch {
    return;
  }
  if (!snapshot || typeof snapshot !== "object") return;
  const setVal = (sel, val) => {
    const el = qs(sel);
    if (el && val !== undefined && val !== null) el.value = val;
  };
  setVal("[data-admin-order-filter]", snapshot.status);
  setVal("[data-orders-batch]", snapshot.batch);
  setVal("[data-orders-date]", snapshot.dateRange);
  setVal("[data-orders-start]", snapshot.customStart);
  setVal("[data-orders-end]", snapshot.customEnd);
  setVal("[data-orders-search]", snapshot.search);
  // Show custom-range row if dateRange === "custom"
  qs("[data-orders-custom]")?.classList.toggle("hidden", snapshot.dateRange !== "custom");
  // Mirror the chip row to the persisted chip selection.
  qsa("[data-order-filter-chip]").forEach((c) => {
    c.classList.toggle("active", c.dataset.orderFilterChip === (snapshot.chip || "all"));
  });
  // Don't call renderAdminOrders here — the regular renderAll() pass
  // that follows wireEvents will pick up the restored values naturally.
}

// ═══════════════════════ OMS-STYLE ROW HELPERS ═══════════════════════════
// Inspired by Shopify / Brightpearl / Linnworks dashboards — small affordances
// that pay off when the team is processing dozens of orders per hour.

// Build a stable HSL colour from a name so each owner's avatar is recognisable
// without any image upload. The hue is name-derived; saturation/lightness
// fixed so it works against both light and dark portal themes.
function ownerAvatarColor(name) {
  if (!name) return "hsl(220, 10%, 70%)";
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  // Lightness kept low (40%) so the white initials clear 3:1 across every
  // generated hue — at 56% the lighter hues (cyan/yellow) dropped to ~2:1.
  return `hsl(${hue}, 52%, 40%)`;
}

function ownerAvatar(name) {
  const display = (name || "Unassigned").trim();
  const initials = display === "Unassigned" ? "?" : display
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  const bg = display === "Unassigned" ? "var(--line-strong)" : ownerAvatarColor(display);
  const muted = display === "Unassigned" ? " is-unassigned" : "";
  return `<span class="owner-chip${muted}" title="${attr(display)}" style="background:${bg};">${esc(initials)}</span>`;
}

// Age in hours — used to tint rows that have sat in the system too long
// regardless of stage. 0–24h = fresh, 24–72h = warm, 72h+ = hot.
function orderAgeTone(order) {
  const created = new Date(order.created_at || 0).getTime();
  if (!created || order.status === "delivered" || order.status === "cancelled") return "fresh";
  const hrs = (Date.now() - created) / 3_600_000;
  if (hrs >= 72) return "hot";
  if (hrs >= 24) return "warm";
  return "fresh";
}

// "Stuck order" — same status for 2× the typical SLA target. Pulses red.
// Doesn't fire for terminal stages (delivered / cancelled).
const STAGE_TYPICAL_HOURS = {
  pending_review: 1,
  accepted: 24,
  sourcing: 168,        // 7 days
  in_transit: 336,      // 14 days
  pakistan_processing: 48,
};

function isOrderStuck(order) {
  const target = STAGE_TYPICAL_HOURS[order.status];
  if (!target) return false;
  const stamp = order.updated_at || order.accepted_at || order.created_at;
  if (!stamp) return false;
  const hoursInStage = (Date.now() - new Date(stamp).getTime()) / 3_600_000;
  return hoursInStage > target * 2;
}

// Customer LTV chip — quick lifetime spend + repeat count, computed from
// the orders already in state. O(N) per render; fine for the typical
// 100–500-order working set.
const _customerLtvCache = new WeakMap();
function customerLtv(order) {
  if (!order?.customer_phone) return null;
  // Cache by the orders array reference so we recompute on data refresh
  // but not on every render.
  let cache = _customerLtvCache.get(state.orders);
  if (!cache) {
    cache = new Map();
    for (const o of state.orders) {
      const key = canonPhone ? canonPhone(o.customer_phone) : o.customer_phone;
      const cur = cache.get(key) || { count: 0, total: 0 };
      cur.count++;
      cur.total += Number(o.total_pkr || 0);
      cache.set(key, cur);
    }
    _customerLtvCache.set(state.orders, cache);
  }
  const key = canonPhone ? canonPhone(order.customer_phone) : order.customer_phone;
  return cache.get(key) || null;
}

function customerLtvChip(order) {
  const ltv = customerLtv(order);
  if (!ltv) return "";
  if (ltv.count === 1) {
    return `<span class="ltv-chip is-new" title="First order from this customer">New customer</span>`;
  }
  // Click LTV chip → open the customer-orders modal so the operator can
  // see every order from this phone in one screen.
  return `<button type="button" class="ltv-chip" data-action="view-customer-orders" data-customer-phone="${attr(order.customer_phone || "")}" data-customer-name="${attr(order.customer_name || "")}" title="${ltv.count} orders · lifetime spend ${PKR.format(ltv.total)} · click for full history" data-stop-row>${ltv.count}× · ${shortPkr(ltv.total)}</button>`;
}

// Hover tooltip — last 3 events on the order. Rendered inline so it works
// with no JS (CSS-only :hover reveal). Kept short so it doesn't dominate.
function orderActivityTooltip(order) {
  const events = orderEvents(order).slice(-3).reverse();
  if (!events.length) return "";
  const items = events.map((e) => {
    const when = e.created_at ? new Date(e.created_at).toLocaleString("en-PK", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
    const status = String(e.status || "").replaceAll("_", " ");
    return `<li><strong>${esc(when)}</strong> · ${esc(status)}${e.note ? ` — ${esc(e.note.slice(0, 80))}` : ""}</li>`;
  }).join("");
  return `<div class="row-activity-pop" role="tooltip"><strong>Recent activity</strong><ol>${items}</ol></div>`;
}

// Builds one order row. Extracted so a single status change can repaint just
// its <tr> (see patchOrderRow) instead of re-rendering the whole table.
function orderRowHTML(order) {
  const payment = orderPaymentSummary(order);
  const due = amountDueForOrder(order);
  const sla = orderSlaBadge(order);
  const slaClass = sla ? ` sla-${sla.level}` : "";
  const slaChip = sla
    ? `<button class="sla-chip sla-${sla.level}" type="button" data-action="toggle-sla-filter" data-stop-row title="Filter to SLA breaches only">${esc(sla.label)}</button>`
    : "";
  const isSelected = state.selectedOrders?.has(order.id);
  // OMS-style row treatments — age tint, stuck pulse, owner avatar, LTV chip,
  // inline activity-tooltip-on-hover (revealed via CSS :hover, no JS cost).
  const ageTone = orderAgeTone(order);
  const stuck = isOrderStuck(order);
  const stuckChip = stuck ? `<span class="stuck-pulse" title="Same status for 2× typical — chase this">stuck</span>` : "";
  const ageHint = ageTone === "hot" ? "Aged 3+ days — chase or close" : ageTone === "warm" ? "Aged 1–3 days" : "";
  // One-click forward motion: Advance steps to the next stage (the 90% action).
  // The <select> stays for the exceptions — jumping, going back, cancelling.
  const next = nextOrderStage(order.status);
  const nextShort = next ? (ORDER_STAGE_SHORT[next] || next) : "";
  const advanceControl = next
    ? `<button class="button primary stage-advance" type="button" data-action="advance-order" data-order-id="${attr(order.id)}" aria-label="Advance to ${attr(nextShort)}" title="Advance to ${attr(nextShort)}">Advance <span class="stage-advance-next">${esc(nextShort)}</span> →</button>`
    : `<span class="stage-terminal">${order.status === "cancelled" ? "Cancelled" : "✓ Delivered"}</span>`;
  const nextActionLine = order.next_action
    ? `<div class="order-next-action" title="Recommended next step"><span class="order-next-action-dot"></span><span>${esc(order.next_action)}</span></div>`
    : `<div class="order-next-action is-empty"><span class="order-next-action-dot"></span><span>No next action set</span></div>`;
  return `
    <tr class="order-row${slaClass}${isSelected ? " is-selected" : ""} age-${ageTone}${stuck ? " is-stuck" : ""}" data-action="view-order" data-order-id="${attr(order.id)}" tabindex="0">
      <td class="bulk-col" data-stop-row><input type="checkbox" data-order-select="${attr(order.id)}" ${isSelected ? "checked" : ""} aria-label="Select order ${attr(order.id)}" /></td>
      <td>
        <strong>${esc(order.id)}</strong>${slaChip}${stuckChip}
        <br /><small${ageHint ? ` title="${attr(ageHint)}"` : ""}>${new Date(order.created_at).toLocaleString()}</small>
      </td>
      <td class="cell-customer">
        <div class="customer-row">${ownerAvatar(order.owner)}<span>${esc(order.customer_name)}</span>${customerLtvChip(order)}</div>
        <small>${esc(order.customer_phone)} · ${esc(order.city)}</small>
        <br /><small>${esc(order.priority || "Standard")} · Owner ${esc(order.owner || "Unassigned")}</small>
        ${orderActivityTooltip(order)}
      </td>
      <td class="cell-status">
        <div class="status-control" data-stop-row>
          ${advanceControl}
          <select data-order-status="${attr(order.id)}" aria-label="Set stage for ${attr(order.id)}">
            ${ORDER_STEPS.map(([status, label]) => `<option value="${status}" ${order.status === status ? "selected" : ""}>${label}</option>`).join("")}
            <option value="cancelled" ${order.status === "cancelled" ? "selected" : ""}>Cancelled</option>
          </select>
        </div>
        ${nextActionLine}
        <small class="order-risk">${esc(orderCompletionRisk(order))}</small>
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
        <button class="button secondary" type="button" data-action="save-order-status" data-order-id="${attr(order.id)}" data-stop-row title="Apply the stage / payment dropdowns">Save edits</button>
        <button class="button ghost" type="button" data-action="print-order" data-order-id="${attr(order.id)}" data-stop-row title="Open packing slip">⎙ Print</button>
        <small>${esc(order.local_courier || "Courier TBD")} · ${esc(order.tracking_number || "No tracking")}</small>
      </td>
    </tr>
  `;
}

function renderAdminOrders() {
  if (!has("[data-admin-orders]")) return;
  // Preserve the operator's place in the queue across the tbody/cards swap so
  // an inline status change doesn't bounce them back to the top of the list.
  const _ordersWrap = qs("[data-orders-list-wrap]");
  const _ordersWrapScroll = _ordersWrap ? _ordersWrap.scrollTop : 0;
  const _ordersScrollY = window.scrollY;
  const _ordersFocusedId = document.activeElement?.closest?.("tr.order-row")?.dataset?.orderId || null;
  renderOrderViewsChips();
  const filter = qs("[data-admin-order-filter]")?.value || "all";
  const slaFilter = state.adminFilters?.slaOnly || false;
  const metaFilter = state.adminFilters?.metaFilter || null; // "unassigned" | "stuck" | null
  qs("[data-sla-filter-banner]")?.classList.toggle("hidden", !slaFilter);
  // Mirror an indicator into the SLA banner area for the meta filters too,
  // so the operator can see why their list is narrow.
  const metaBanner = qs("[data-meta-filter-banner]");
  if (metaBanner) {
    metaBanner.classList.toggle("hidden", !metaFilter);
    if (metaFilter) metaBanner.querySelector("[data-meta-filter-label]").textContent = metaFilter;
  }

  // ── Batch filter <select> options refresh ──
  const batchSelect = qs("[data-orders-batch]");
  if (batchSelect) {
    const current = batchSelect.value || "all";
    batchSelect.innerHTML =
      `<option value="all">All batches</option><option value="__none__">No batch</option>` +
      (state.shipmentBatches || []).map((b) => `<option value="${attr(b.id)}">${esc(b.name)}</option>`).join("");
    batchSelect.value = current;
  }
  const batchFilter = qs("[data-orders-batch]")?.value || "all";
  const dateRange = qs("[data-orders-date]")?.value || "all";
  qs("[data-orders-custom]")?.classList.toggle("hidden", dateRange !== "custom");
  const customStart = qs("[data-orders-start]")?.value || "";
  const customEnd = qs("[data-orders-end]")?.value || "";
  const search = (qs("[data-orders-search]")?.value || "").toLowerCase();
  // Persist filter state so the CSV export reads the same view.
  state.orderFilters = { ...(state.orderFilters || {}), dateRange, batch: batchFilter, customStart, customEnd, search };

  // ── Date window helper ──
  const dateWindow = (() => {
    const now = new Date();
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    if (dateRange === "7") return { from: now.getTime() - 7 * 86_400_000, to: Infinity };
    if (dateRange === "30") return { from: now.getTime() - 30 * 86_400_000, to: Infinity };
    if (dateRange === "90") return { from: now.getTime() - 90 * 86_400_000, to: Infinity };
    if (dateRange === "month") {
      const m = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: m.getTime(), to: Infinity };
    }
    if (dateRange === "prev_month") {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: start.getTime(), to: end.getTime() };
    }
    if (dateRange === "custom") {
      const from = customStart ? new Date(customStart).getTime() : -Infinity;
      const end = customEnd ? new Date(customEnd) : null;
      if (end) end.setHours(23, 59, 59, 999);
      return { from, to: end ? end.getTime() : Infinity };
    }
    return { from: -Infinity, to: Infinity };
  })();

  const rows = state.orders.filter((order) => {
    if (filter !== "all" && order.status !== filter) return false;
    // Meta filters from the Overview attention chips. These can't sit in
    // the status <select> because they're not stages — they're attributes
    // across stages (no owner, stuck in same state too long).
    if (metaFilter === "unassigned") {
      const terminal = order.status === "delivered" || order.status === "cancelled";
      if (terminal) return false;
      if ((order.owner || "").trim()) return false;
    } else if (metaFilter === "stuck") {
      if (!isOrderStuck(order)) return false;
    }
    if (slaFilter) {
      const b = orderSlaBadge(order);
      if (!b || b.level === "ok") return false;
    }
    if (batchFilter !== "all") {
      const ob = shipmentBatchForOrder(order);
      if (batchFilter === "__none__" && ob) return false;
      if (batchFilter !== "__none__" && (!ob || ob.id !== batchFilter)) return false;
    }
    if (dateRange !== "all") {
      const ts = new Date(order.created_at || 0).getTime();
      if (Number.isNaN(ts) || ts < dateWindow.from || ts > dateWindow.to) return false;
    }
    if (search) {
      const hay = [order.id, order.customer_name, order.customer_phone].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  // Count chip + persist filtered rows so CSV export uses the exact view.
  const countChip = qs("[data-orders-count-chip]");
  if (countChip) {
    const all = state.orders.length;
    countChip.textContent = `${rows.length} of ${all}`;
  }
  // Watched orders → recently-created (last 5 min) → chronological. The
  // recently-created highlight is just for "you just made this" feedback.
  const now = Date.now();
  const recentMap = state._recentlyCreated || new Map();
  const isRecentlyCreated = (id) => {
    const t = recentMap.get(id);
    return t && (now - t < 5 * 60_000);
  };
  rows.sort((a, b) => {
    const aw = isWatched(a.id) ? 0 : 1;
    const bw = isWatched(b.id) ? 0 : 1;
    if (aw !== bw) return aw - bw;
    const ar = isRecentlyCreated(a.id) ? 0 : 1;
    const br = isRecentlyCreated(b.id) ? 0 : 1;
    if (ar !== br) return ar - br;
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  });
  state._ordersExport = rows;
  renderBulkActionBar();
  // Sync the visibility based on current view choice + render kanban if active
  qs("[data-orders-list-wrap]")?.classList.toggle("hidden", state.ordersView === "board");
  qs("[data-orders-board]")?.classList.toggle("hidden", state.ordersView !== "board");
  qsa("[data-action='set-orders-view']").forEach((b) => b.classList.toggle("active", b.dataset.ordersView === (state.ordersView || "list")));
  if (state.ordersView === "board") renderKanbanBoard(rows);
  const tableRows = rows.map(orderRowHTML);
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
          ${order.status === "pending_review"
            ? `<button class="button primary" type="button" data-action="accept-order" data-order-id="${attr(order.id)}" data-stop-row>Accept</button>`
            : (nextOrderStage(order.status)
              ? `<button class="button primary" type="button" data-action="advance-order" data-order-id="${attr(order.id)}" data-stop-row>Advance → ${esc(ORDER_STAGE_SHORT[nextOrderStage(order.status)])}</button>`
              : "")}
          <button class="button secondary" type="button" data-action="view-order" data-order-id="${attr(order.id)}" data-stop-row>Review</button>
        </div>
      </article>
    `;
  }).join("") || "<p>No orders match this filter.</p>");

  // Restore scroll + focus after the swap (see capture at the top).
  if (_ordersWrap) _ordersWrap.scrollTop = _ordersWrapScroll;
  if (_ordersScrollY) window.scrollTo({ top: _ordersScrollY });
  if (_ordersFocusedId) {
    qs(`[data-admin-orders] tr.order-row[data-order-id="${CSS.escape(_ordersFocusedId)}"]`)?.focus({ preventScroll: true });
  }
}

function renderShipmentBatches() {
  if (!has("[data-shipment-batches]")) return;
  const fx = Number(state.settings?.fx_rate || 282);
  setHTML("[data-shipment-batches]", state.shipmentBatches.map((batch) => {
    const assignedOrders = state.orders.filter((order) => (batch.order_ids || []).includes(order.id));
    const used = Number(batch.used ?? assignedOrders.length);
    const capacity = Number(batch.capacity || Math.max(used, 1));
    const fill = Math.min(100, Math.round((used / capacity) * 100));
    // Per-batch financials: total order value (PKR sale) vs total USD cost
    // converted at the active FX. Profit = sale − cost × FX. Surfaces the
    // economic shape of a batch so the team can decide which to close.
    let saleTotal = 0;
    let usdCost = 0;
    for (const o of assignedOrders) {
      saleTotal += Number(o.total_pkr || 0);
      usdCost += orderUsdExpected ? orderUsdExpected(o) : 0;
    }
    const costPkr = usdCost * fx;
    const profit = saleTotal - costPkr;
    const profitTone = profit >= 0 ? "ok" : "warn";
    // Show "Open dispatch" only when at least one order in this batch is
    // ready (arrived in PK AND balance fully collected).
    const dispatchable = assignedOrders.filter((o) => {
      if (o.status !== "pakistan_processing") return false;
      const due = Math.max(0, Number(o.balance_due_pkr || 0) - Number(o.balance_paid_pkr || 0));
      return due === 0;
    }).length;
    return `
      <article class="shipment-card">
        <div class="panel-title-row">
          <div>
            <span class="status-pill ${batch.status === "arrived" ? "in_stock" : "preorder"}">${esc(batchStatusLabel(batch.status))}</span>
            <h3>${esc(batch.name)}</h3>
          </div>
          <div class="shipment-card-actions">
            <strong>${formatDate(batch.eta_date) || "ETA pending"}</strong>
            ${dispatchable > 0 ? `<button class="button secondary" type="button" data-action="dispatch-batch" data-batch-id="${attr(batch.id)}" title="${dispatchable} ready to dispatch">Dispatch ${dispatchable}</button>` : ""}
            <button class="shipment-delete" type="button" data-action="delete-batch" data-batch-id="${attr(batch.id)}" aria-label="Delete batch ${attr(batch.name)}" title="Delete batch">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg>
            </button>
          </div>
        </div>
        <p>${esc(batch.note || "No batch note added.")}</p>
        <div class="batch-financials">
          <article><span>Sale value</span><strong>${PKR.format(saleTotal)}</strong></article>
          <article><span>USD cost</span><strong>${USD.format(usdCost)}</strong><small>${PKR.format(costPkr)} @ ${fx.toFixed(0)}</small></article>
          <article class="tone-${profitTone}"><span>Projected profit</span><strong>${PKR.format(profit)}</strong><small>${saleTotal > 0 ? Math.round((profit / saleTotal) * 100) : 0}% margin</small></article>
        </div>
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

// ════════════════════════════════════════════════════════════════════════
// INVENTORY BOARD — in-stock stock-on-hand operations.
// The in-stock sibling to Shipments (preorder batches): surfaces what's
// physically in Pakistan and ready to ship in days, the capital tied up in it,
// and what's running low or out. Inline steppers commit optimistically and
// persist on a short debounce (holding +/- doesn't fire a request per click).
// Stock changes do TARGETED DOM updates — never a full board rebuild — so the
// focused stepper survives rapid clicks (same reasoning as the order-row patch
// path: re-swapping innerHTML would drop keyboard/mouse focus mid-edit).
// ════════════════════════════════════════════════════════════════════════
function inStockProducts() {
  return (state.products || []).filter((p) => p.stock_mode === "in_stock");
}
function inventoryLowThreshold(p) {
  return Number(p.low_stock_threshold ?? 2);
}
// "out" | "low" | "healthy" for an in-stock product.
function inventoryHealth(p) {
  const qty = Number(p.inventory || 0);
  if (qty <= 0) return "out";
  if (qty <= inventoryLowThreshold(p)) return "low";
  return "healthy";
}
function inventoryDeliveryLabel(p) {
  const lo = Number(p.delivery_days_min || 0);
  const hi = Number(p.delivery_days_max || 0);
  if (lo && hi) return lo === hi ? `Ships in ${lo} days` : `Ships in ${lo}–${hi} days`;
  if (hi) return `Ships in ${hi} days`;
  return "Ready to ship";
}
function inventoryIsLive(p) {
  return (p.status || p.product_status) !== "draft";
}
function inventoryAttentionCount() {
  return inStockProducts().filter((p) => inventoryIsLive(p) && inventoryHealth(p) !== "healthy").length;
}
function updateInventoryBadge() {
  const badge = qs('[data-tab-badge="inventory"]');
  if (!badge) return;
  const n = inventoryAttentionCount();
  badge.textContent = n > 0 ? String(n) : "";
  badge.classList.toggle("has-count", n > 0);
}
function inventoryStatsHTML() {
  const items = inStockProducts().filter(inventoryIsLive);
  let units = 0, retail = 0, cost = 0, low = 0, out = 0;
  for (const p of items) {
    const qty = Math.max(0, Number(p.inventory || 0));
    units += qty;
    retail += qty * calculatePrice(p);
    cost += qty * Number(p.supplier_cost_pkr || 0);
    const h = inventoryHealth(p);
    if (h === "out") out += 1;
    else if (h === "low") low += 1;
  }
  const profit = retail - cost;
  const margin = retail > 0 ? Math.round((profit / retail) * 100) : 0;
  // Two tiers: the three money figures get prominent cards; the counts (which
  // are just small whole numbers) sit in a compact chip row beneath — cleaner
  // and balanced, vs. seven equal cards that orphaned on the last row.
  const money = [
    { label: "Retail value", value: PKR.format(retail), sub: "if it all sells" },
    { label: "Capital in stock", value: PKR.format(cost), sub: "supplier cost" },
    { label: "Locked profit", value: PKR.format(profit), sub: `${margin}% margin`, tone: profit >= 0 ? "ok" : "warn" },
  ];
  const counts = [
    { n: items.length, label: "in-stock SKUs" },
    { n: units, label: "units on hand" },
    { n: low, label: "low stock", tone: low > 0 ? "warn" : "" },
    { n: out, label: "out of stock", tone: out > 0 ? "bad" : "" },
  ];
  return `
    <div class="inv-stat-money">
      ${money.map((t) => `
        <article class="metric-card inventory-stat${t.tone ? " tone-" + t.tone : ""}">
          <span>${esc(t.label)}</span>
          <strong>${t.value}</strong>
          <small>${esc(t.sub)}</small>
        </article>`).join("")}
    </div>
    <div class="inv-stat-counts">
      ${counts.map((c) => `<span class="inv-chip${c.tone ? " tone-" + c.tone : ""}"><strong>${c.n}</strong> ${esc(c.label)}</span>`).join("")}
    </div>`;
}
function inventoryRowHTML(p) {
  const qty = Math.max(0, Number(p.inventory || 0));
  const health = inventoryHealth(p);
  const price = calculatePrice(p);
  const statusClass = health === "out" ? "soldout" : health === "low" ? "preorder" : "in_stock";
  const statusLabel = health === "out" ? "Out of stock" : health === "low" ? `Low · ${qty} left` : "In stock";
  const img = p.image_url
    ? `<img src="${safeUrl(imageUrl(p.image_url), "")}" alt="${attr(p.title)}" loading="lazy" decoding="async" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'inv-noimg',textContent:'No image'}));" />`
    : `<div class="inv-noimg">No image</div>`;
  return `
    <article class="inventory-row inv-${health}${inventoryIsLive(p) ? "" : " inv-draft"}" data-inventory-row="${attr(p.id)}">
      <div class="inv-product">
        <div class="inv-thumb">${img}</div>
        <div class="inv-id">
          <strong>${esc(p.title)}</strong>
          <small>${esc(p.brand || "—")}${p.category ? " · " + esc(p.category) : ""}${inventoryIsLive(p) ? "" : " · draft"}</small>
        </div>
      </div>
      <span class="status-pill ${statusClass}" data-inv-status>${esc(statusLabel)}</span>
      <span class="inv-ship">${esc(inventoryDeliveryLabel(p))}</span>
      <div class="inv-stepper" role="group" aria-label="Adjust stock for ${attr(p.title)}">
        <button class="inv-step" type="button" data-action="inv-dec" data-product-id="${attr(p.id)}" aria-label="Decrease stock for ${attr(p.title)}"${qty <= 0 ? " disabled" : ""}>−</button>
        <input class="inv-qty" type="number" min="0" inputmode="numeric" value="${qty}" data-inv-input="${attr(p.id)}" aria-label="Stock count for ${attr(p.title)}" />
        <button class="inv-step" type="button" data-action="inv-inc" data-product-id="${attr(p.id)}" aria-label="Increase stock for ${attr(p.title)}">+</button>
      </div>
      <span class="inv-money inv-cost">${PKR.format(Number(p.supplier_cost_pkr || 0))}<small>cost</small></span>
      <span class="inv-money inv-price">${PKR.format(price)}<small>retail</small></span>
      <span class="inv-money inv-value" data-inv-value>${PKR.format(qty * price)}<small>in stock</small></span>
    </article>
  `;
}
function inventoryBoardHTML() {
  const s = state._inventory || (state._inventory = { search: "", filter: "all", sort: "attention" });
  if (!inStockProducts().length) {
    return `<div class="inventory-empty"><strong>No in-stock items yet.</strong><p>Add products with stock mode “In stock” in the Products tab (or switch a preorder SKU to in-stock). Anything already in Pakistan shows here, ready to ship in days.</p></div>`;
  }
  let items = inStockProducts();
  const q = (s.search || "").trim().toLowerCase();
  if (q) items = items.filter((p) => `${p.title} ${p.brand} ${p.category}`.toLowerCase().includes(q));
  if (s.filter === "attention") items = items.filter((p) => inventoryHealth(p) !== "healthy");
  else if (s.filter === "healthy") items = items.filter((p) => inventoryHealth(p) === "healthy");
  const rank = { out: 0, low: 1, healthy: 2 };
  const sorters = {
    attention: (a, b) => rank[inventoryHealth(a)] - rank[inventoryHealth(b)] || Number(a.inventory || 0) - Number(b.inventory || 0),
    "stock-asc": (a, b) => Number(a.inventory || 0) - Number(b.inventory || 0),
    "stock-desc": (a, b) => Number(b.inventory || 0) - Number(a.inventory || 0),
    "value-desc": (a, b) => (Number(b.inventory || 0) * calculatePrice(b)) - (Number(a.inventory || 0) * calculatePrice(a)),
    name: (a, b) => String(a.title).localeCompare(String(b.title)),
  };
  items = items.slice().sort(sorters[s.sort] || sorters.attention);
  if (!items.length) {
    return `<div class="inventory-empty"><strong>Nothing matches.</strong><p>Try a different search term or filter.</p></div>`;
  }
  return `
    <div class="inventory-board-head" aria-hidden="true">
      <span>Product</span><span>Status</span><span>Delivery</span><span>Stock</span><span>Cost</span><span>Retail</span><span>Value</span>
    </div>
    ${items.map(inventoryRowHTML).join("")}
  `;
}
function updateInventoryLede() {
  const lede = qs("[data-inventory-lede]");
  if (!lede) return;
  const items = inStockProducts().filter(inventoryIsLive);
  const readyUnits = items.reduce((n, p) => n + Math.max(0, Number(p.inventory || 0)), 0);
  lede.textContent = items.length
    ? `${readyUnits} unit${readyUnits === 1 ? "" : "s"} across ${items.length} SKU${items.length === 1 ? "" : "s"} ready to leave within days — no USA wait.`
    : "Items already in Pakistan show here, ready to ship in days.";
}
function renderInventory() {
  if (!has("[data-inventory-board]")) return;
  state._inventory = state._inventory || { search: "", filter: "all", sort: "attention" };
  updateInventoryLede();
  setHTML("[data-inventory-stats]", inventoryStatsHTML());
  setHTML("[data-inventory-board]", inventoryBoardHTML());
  qsa("[data-inventory-filter]").forEach((c) => c.classList.toggle("active", c.dataset.inventoryFilter === state._inventory.filter));
  const sortSel = qs("[data-inventory-sort]");
  if (sortSel && sortSel.value !== state._inventory.sort) sortSel.value = state._inventory.sort;
  updateInventoryBadge();
  renderInventoryLog();
}
// Targeted repaint after a stock change — updates only the affected row's
// status pill / value / stepper state plus the stats header, leaving the
// focused stepper in the DOM so holding +/- keeps working.
function paintInventoryRow(productId) {
  const p = state.products.find((x) => x.id === productId);
  const row = qs(`[data-inventory-row="${productId}"]`);
  if (!p || !row) return;
  const qty = Math.max(0, Number(p.inventory || 0));
  const health = inventoryHealth(p);
  row.className = `inventory-row inv-${health}${inventoryIsLive(p) ? "" : " inv-draft"}`;
  const status = row.querySelector("[data-inv-status]");
  if (status) {
    status.className = `status-pill ${health === "out" ? "soldout" : health === "low" ? "preorder" : "in_stock"}`;
    status.textContent = health === "out" ? "Out of stock" : health === "low" ? `Low · ${qty} left` : "In stock";
  }
  const valueCell = row.querySelector("[data-inv-value]");
  if (valueCell) valueCell.innerHTML = `${PKR.format(qty * calculatePrice(p))}<small>in stock</small>`;
  const dec = row.querySelector('[data-action="inv-dec"]');
  if (dec) dec.disabled = qty <= 0;
  setHTML("[data-inventory-stats]", inventoryStatsHTML());
  updateInventoryLede();
  updateInventoryBadge();
}
// Stock saves are debounced (650ms) so holding +/- fires one request, not ten.
// Manual edits log their NET delta on settle; order-driven changes log
// immediately with their own reason (see adjustOrderStock).
const _inventorySaveTimers = {};
const _inventoryBaseline = {};
function scheduleStockSave(productId, logReason) {
  const product = state.products.find((p) => p.id === productId);
  if (!product) return;
  if (logReason && _inventoryBaseline[productId] === undefined) {
    _inventoryBaseline[productId] = Number(product._savedInventory ?? product.inventory ?? 0);
  }
  clearTimeout(_inventorySaveTimers[productId]);
  _inventorySaveTimers[productId] = setTimeout(() => persistStockNow(productId, logReason), 650);
}
async function persistStockNow(productId, logReason) {
  const product = state.products.find((p) => p.id === productId);
  if (!product) return;
  const after = Number(product.inventory || 0);
  if (logReason && _inventoryBaseline[productId] !== undefined) {
    const before = _inventoryBaseline[productId];
    delete _inventoryBaseline[productId];
    if (after !== before) logInventoryChange({ product, before, after, reason: logReason });
  }
  product._savedInventory = after;
  const row = qs(`[data-inventory-row="${productId}"]`);
  try {
    const saved = await apiFetch("/api/catalog", { method: "POST", body: JSON.stringify(product) }, { product });
    const idx = state.products.findIndex((p) => p.id === productId);
    // Keep the live inventory value (a slow echo can't clobber a newer edit).
    if (idx >= 0 && saved.product) state.products[idx] = { ...saved.product, inventory: product.inventory, _savedInventory: product.inventory };
    if (row) { row.classList.add("inv-saved"); setTimeout(() => row.classList.remove("inv-saved"), 1100); }
  } catch {
    toast("Couldn't save stock. Check the portal key and try again.");
  }
}
function setInventory(productId, nextQty) {
  const product = state.products.find((p) => p.id === productId);
  if (!product) return;
  const qty = Math.max(0, Math.round(Number(nextQty) || 0));
  product.inventory = qty;
  // The same stepper can live in both the Inventory board and the Products
  // table, so sync every matching input and repaint both rows.
  qsa(`[data-inv-input="${productId}"]`).forEach((input) => { if (Number(input.value) !== qty) input.value = qty; });
  paintInventoryRow(productId);
  paintProductRow(productId);
  scheduleStockSave(productId, "Manual adjustment");
}
function adjustInventory(productId, delta) {
  const product = state.products.find((p) => p.id === productId);
  if (!product) return;
  setInventory(productId, Math.max(0, Number(product.inventory || 0) + delta));
}

// ── Order ↔ inventory sync (optimistic UI only) ─────────────────────────────
// The SERVER is now authoritative for stock: admin-orders.js atomically
// decrements via the adjust_inventory RPC when an order crosses "delivered" and
// restocks on reversal, made idempotent by the durable orders.stock_deducted
// flag. Here we ONLY mirror that change in memory so the board feels instant —
// we deliberately never persist (that would double-count with the server) and
// guard with a client-only flag so a re-render can't reapply it. On the next
// catalog load the server's value lands and everything reconciles.
function adjustOrderStock(order, sign) {
  for (const item of order.items || []) {
    if (item.stock_mode !== "in_stock") continue;
    const product = state.products.find((p) => p.id === item.product_id);
    if (!product) continue;
    const qty = Math.max(1, Number(item.quantity || 1));
    const before = Math.max(0, Number(product.inventory || 0));
    const after = Math.max(0, before + sign * qty);
    if (after === before) continue;
    product.inventory = after;
    product._savedInventory = after; // keep the board's saved baseline aligned
    paintInventoryRow(product.id);
    paintProductRow(product.id);
  }
}
function applyOrderStockEffects(order, toStatus) {
  if (!order) return;
  const goingDelivered = toStatus === "delivered" && !order._uiStockApplied;
  const leavingApplied = order._uiStockApplied && toStatus !== "delivered";
  if (goingDelivered) {
    adjustOrderStock(order, -1);
    order._uiStockApplied = true;
  } else if (leavingApplied) {
    adjustOrderStock(order, +1);
    order._uiStockApplied = false;
  }
}

// ── Stock change log ────────────────────────────────────────────────────────
// In-memory + localStorage; surfaced as "Recent stock activity" on the board.
function logInventoryChange({ product, before, after, reason, orderId }) {
  const delta = Number(after) - Number(before);
  if (!delta) return;
  state.inventoryLog = state.inventoryLog || [];
  state.inventoryLog.unshift({
    ts: new Date().toISOString(),
    product_id: product.id,
    title: product.title,
    before: Number(before),
    after: Number(after),
    delta,
    reason,
    order_id: orderId || null,
  });
  state.inventoryLog = state.inventoryLog.slice(0, 80);
  try { localStorage.setItem("gb_inventory_log", JSON.stringify(state.inventoryLog)); } catch {}
  renderInventoryLog();
}
function renderInventoryLog() {
  if (!has("[data-inventory-log]")) return;
  const log = state.inventoryLog || [];
  if (!log.length) {
    setHTML("[data-inventory-log]", `<li class="inventory-log-empty">No stock changes yet — manual adjustments and order deliveries will appear here.</li>`);
    return;
  }
  setHTML("[data-inventory-log]", log.slice(0, 12).map((e) => {
    const up = e.delta > 0;
    const t = new Date(e.ts);
    const time = isNaN(t.getTime()) ? "" : t.toLocaleString("en-PK", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    return `
      <li class="inventory-log-row">
        <span class="inv-log-delta ${up ? "up" : "down"}">${up ? "+" : ""}${e.delta}</span>
        <span class="inv-log-main"><strong>${esc(e.title)}</strong><small>${esc(e.reason)}${e.order_id ? " · " + esc(e.order_id) : ""}</small></span>
        <span class="inv-log-meta">${esc(e.before)}&nbsp;→&nbsp;${esc(e.after)}<small>${esc(time)}</small></span>
      </li>`;
  }).join(""));
}

// ── CSV export ──────────────────────────────────────────────────────────────
function exportInventoryCsv() {
  const items = inStockProducts();
  if (!items.length) { toast("No in-stock items to export."); return; }
  const headers = ["Product", "Brand", "Category", "Status", "Stock", "Low at", "Delivery days", "Unit cost PKR", "Retail PKR", "Stock value PKR"];
  const cell = (v) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const body = items.map((p) => {
    const qty = Math.max(0, Number(p.inventory || 0));
    const price = calculatePrice(p);
    const health = inventoryHealth(p);
    const days = (Number(p.delivery_days_min) && Number(p.delivery_days_max)) ? `${p.delivery_days_min}-${p.delivery_days_max}` : "";
    return [p.title, p.brand || "", p.category || "", health === "out" ? "Out of stock" : health === "low" ? "Low" : "In stock", qty, inventoryLowThreshold(p), days, Number(p.supplier_cost_pkr || 0), price, qty * price].map(cell).join(",");
  });
  const csv = [headers.join(","), ...body].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `global-bestie-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast(`Exported ${items.length} in-stock items to CSV.`);
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

// ════════════════════════════════════════════════════════════════════════
// BESTIES (UGC) ADMIN — curate the storefront testimonial rail.
// Lazy-loaded when the Besties tab opens (not part of the dashboard payload).
// ════════════════════════════════════════════════════════════════════════
async function loadUgcAdmin() {
  const list = qs("[data-ugc-admin-list]");
  if (list && !state.ugcPosts) list.innerHTML = `<p class="muted">Loading…</p>`;
  const data = await apiFetch("/api/admin/ugc", {}, { posts: state.ugcPosts || [], configured: false });
  state.ugcPosts = data.posts || [];
  state._ugcConfigured = data.configured;
  renderUgcAdmin();
}

function renderUgcAdmin() {
  const list = qs("[data-ugc-admin-list]");
  if (!list) return;
  const posts = state.ugcPosts || [];
  const liveCount = posts.filter((p) => p.status === "approved").length;
  const chip = qs("[data-ugc-approved-count]");
  if (chip) chip.textContent = `${liveCount} live`;
  const badge = qs('[data-tab-badge="besties"]');
  if (badge) {
    const pending = posts.filter((p) => p.status === "pending").length;
    badge.textContent = pending > 0 ? String(pending) : "";
    badge.classList.toggle("has-count", pending > 0);
  }

  if (!posts.length) {
    list.innerHTML = `<p class="muted">${state._ugcConfigured === false
      ? "Supabase isn't connected here — the storefront shows the curated seed rail. Add posts once the database is configured."
      : "No posts yet. Add your first customer photo above — approved posts appear on the homepage rail."}</p>`;
    return;
  }

  list.innerHTML = posts.map((p) => {
    const isApproved = p.status === "approved";
    const statusClass = isApproved ? "in_stock" : p.status === "rejected" ? "soldout" : "preorder";
    const img = p.image_url
      ? `<img src="${safeUrl(p.image_url, "")}" alt="${attr(p.handle)}" loading="lazy" decoding="async" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'ugc-admin-noimg',textContent:'No image'}));" />`
      : `<div class="ugc-admin-noimg">No image</div>`;
    return `
      <article class="ugc-admin-card${isApproved ? " is-live" : ""}">
        <div class="ugc-admin-media">${img}<span class="status-pill ${statusClass}">${esc(p.status)}</span></div>
        <div class="ugc-admin-body">
          <strong>${esc(p.handle)}${p.city ? ` · ${esc(p.city)}` : ""}</strong>
          <p>"${esc(p.quote)}"</p>
          <small>${esc(p.category || "uncategorized")} · sort ${esc(p.sort_order ?? 0)}</small>
          <div class="mini-actions">
            ${isApproved
              ? `<button class="button secondary" type="button" data-action="ugc-unapprove" data-ugc-id="${attr(p.id)}">Unpublish</button>`
              : `<button class="button primary" type="button" data-action="ugc-approve" data-ugc-id="${attr(p.id)}">Approve</button>`}
            <button class="button secondary" type="button" data-action="ugc-edit" data-ugc-id="${attr(p.id)}">Edit</button>
            <button class="button secondary" type="button" data-action="ugc-delete" data-ugc-id="${attr(p.id)}">Delete</button>
          </div>
        </div>
      </article>`;
  }).join("");
}

// ── Meta Ads bot panel ─────────────────────────────────────────────────────
// Reads the four cloud functions (ads-report / ads-creative / ads-create /
// ads-optimize) and renders the dashboard, approval queue, and optimizer log.
// The only money-moving control here is "Launch" — everything else is read-only
// or builds paused objects.
// Tiny inline SVG sparkline from a number series. transform/opacity-free,
// hardware-cheap; used on the KPI cards to show the trend behind the total.
function sparklineSvg(values, { w = 76, h = 22 } = {}) {
  const nums = (values || []).map(Number).filter((v) => !Number.isNaN(v));
  if (nums.length < 2) return "";
  const max = Math.max(...nums);
  const min = Math.min(...nums);
  const range = max - min || 1;
  const step = w / (nums.length - 1);
  const pts = nums.map((v, i) => `${(i * step).toFixed(1)},${(h - ((v - min) / range) * (h - 3) - 1.5).toFixed(1)}`);
  const up = nums[nums.length - 1] >= nums[0];
  return `<svg class="ads-spark ${up ? "is-up" : "is-down"}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts.join(" ")}" /></svg>`;
}

function adsSkeletonGrid(n) {
  return `<div class="ads-skel-grid">${Array.from({ length: n }, () => `<div class="ads-skel ads-skel-card"></div>`).join("")}</div>`;
}
function adsSkeletonLines(n) {
  return Array.from({ length: n }, () => `<div class="ads-skel ads-skel-line"></div>`).join("");
}

// Refetch just the performance report for a new window and repaint the
// dashboard + creative stats (which are window-scoped).
async function adsSetReportRange(days) {
  state._adsReportDays = days;
  const kpis = qs("[data-ads-kpis]");
  const rows = qs("[data-ads-campaign-rows]");
  if (kpis) kpis.innerHTML = adsSkeletonGrid(6);
  if (rows) rows.innerHTML = `<tr><td colspan="6">${adsSkeletonLines(2)}</td></tr>`;
  const report = await apiFetch(`/api/admin/ads-report?days=${days}`, {}, { configured: false, totals: {}, campaigns: [], daily: [] }).catch(() => ({ configured: false, totals: {}, campaigns: [], daily: [] }));
  state._adsReport = report;
  renderAdsDashboard(report);
  if (state._adsCreatives) renderAdsCreatives(state._adsCreatives);
}

async function loadAdsAdmin() {
  const statusPill = qs("[data-ads-status]");
  if (statusPill) statusPill.textContent = "Loading…";
  populateAdsProductSelect();
  // Paint skeletons so the surfaces don't flash empty/"Loading…" text.
  const kpiHost = qs("[data-ads-kpis]"); if (kpiHost) kpiHost.innerHTML = adsSkeletonGrid(6);
  const libHost = qs("[data-ads-creative-library]"); if (libHost) libHost.innerHTML = adsSkeletonGrid(4);
  const days = state._adsReportDays || 7;
  // Pull all surfaces in parallel; tolerate any one being unconfigured. The
  // audience read is cheap/cached (no Meta call) — only the refresh recomputes.
  const emptyConfig = { keys: {}, publisher_platforms: "instagram" };
  const [report, queue, actions, audience, config, creatives] = await Promise.all([
    apiFetch(`/api/admin/ads-report?days=${days}`, {}, { configured: false, totals: {}, campaigns: [], daily: [] }),
    apiFetch(`/api/admin/ads-create`, {}, { configured: false, campaigns: [] }),
    apiFetch(`/api/admin/ads-optimize?preview=1`, {}, { configured: false, actions: [], dry_run: true }).catch(() => ({ actions: [] })),
    apiFetch(`/api/admin/ads-audience?cached=1`, {}, { configured: false, reco: null }).catch(() => ({ reco: null })),
    apiFetch(`/api/admin/ads-config`, {}, emptyConfig).catch(() => emptyConfig),
    apiFetch(`/api/admin/ads-creative`, {}, { creatives: [] }).catch(() => ({ creatives: [] })),
  ]);
  state._adsReport = report;
  state._adsQueue = queue.campaigns || [];
  state._adsActions = actions.actions || [];
  state._adsAudience = audience.reco || null;
  state._adsConfig = config;
  state._adsCreatives = creatives.creatives || [];

  if (statusPill) {
    const live = report.configured && queue.configured;
    statusPill.textContent = live ? "Connected" : "Not configured";
    statusPill.className = `status-pill ${live ? "in_stock" : "soldout"}`;
  }
  renderAdsConfig(state._adsConfig);
  renderAdsDashboard(report);
  renderAdsQueue(state._adsQueue);
  renderAdsActions(state._adsActions);
  renderAdsAudience(state._adsAudience);
  renderAdsCreatives(state._adsCreatives);
}

const AD_CTA_LABELS = { SHOP_NOW: "Shop now", LEARN_MORE: "Learn more", ORDER_NOW: "Order now", MESSAGE_PAGE: "Send message" };

// Creative library: each item renders as an Instagram-ad preview with its
// live performance (joined from the report's creativeStats), plus the
// campaign-builder dropdown. Honors the search box.
function renderAdsCreatives(creatives) {
  const list = creatives || [];
  const ready = list.filter((c) => c.status === "ready" || c.status === "draft");
  const countPill = qs("[data-ads-creative-count]");
  if (countPill) countPill.textContent = `${ready.length} ready`;
  const navBadge = qs('[data-ads-nav-badge="creatives"]');
  if (navBadge) navBadge.textContent = ready.length ? String(ready.length) : "";

  const stats = state._adsReport?.creativeStats || {};
  const term = (state._adsCreativeSearch || "").trim().toLowerCase();
  const shown = term
    ? list.filter((c) => `${c.headline} ${c.primary_text}`.toLowerCase().includes(term))
    : list;

  const host = qs("[data-ads-creative-library]");
  if (host) {
    host.innerHTML = shown.length
      ? shown.map((c) => {
          const used = c.status === "in_use";
          const img = c.image_url
            ? `<img src="${safeUrl(imageUrl(c.image_url), "")}" alt="${attr(c.headline)}" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'ad-creative-noimg',textContent:'No image'}));" />`
            : `<div class="ad-creative-noimg">No image</div>`;
          const text = (c.primary_text || "");
          const s = stats[c.id];
          const perf = s ? `
            <div class="ad-creative-stats">
              <span title="Spend">${PKR.format(s.spend || 0)}</span>
              <span class="${(s.roas || 0) >= 2 ? "good" : ""}" title="ROAS">${(s.roas || 0).toFixed(2)}× ROAS</span>
              <span title="Purchases">${s.purchases || 0} sales</span>
            </div>` : "";
          return `
          <article class="ad-creative-card">
            <div class="ig-preview">
              <div class="ig-bar"><span class="ig-avatar">GB</span><div class="ig-id"><strong>globalbestie</strong><small>Sponsored</small></div></div>
              <div class="ig-media">${img}</div>
              <div class="ig-cta-row"><span class="ig-icons">♡  ◯  ➤</span><span class="ig-cta">${esc(AD_CTA_LABELS[c.cta_type] || "Shop now")} ›</span></div>
              <div class="ig-caption"><strong>globalbestie</strong> ${esc(text.slice(0, 110))}${text.length > 110 ? "…" : ""}</div>
            </div>
            <div class="ad-creative-body">
              <div class="ad-creative-head"><strong>${esc(c.headline)}</strong><span class="status-pill ${used ? "in_stock" : "preorder"}">${esc(c.status)}</span></div>
              ${perf}
              <div class="mini-actions">
                ${c.status !== "archived" ? `<button class="button secondary" type="button" data-action="ads-archive-creative" data-creative-id="${attr(c.id)}">Archive</button>` : ""}
              </div>
            </div>
          </article>`;
        }).join("")
      : `<p class="portal-login-note">${list.length ? "No creatives match your search." : "No creatives yet — upload your first above."}</p>`;
  }
  // Campaign-builder dropdown
  const select = qs("[data-ads-campaign-creative]");
  if (select) {
    const current = select.value;
    select.innerHTML = `<option value="">Select a ready creative…</option>` +
      ready.map((c) => `<option value="${attr(c.id)}">${esc(c.headline)}</option>`).join("");
    if (current) select.value = current;
  }
}

// Setup checklist — shows which META_* env vars Netlify has detected. Values
// are never sent to the browser, only presence booleans.
function renderAdsConfig(config) {
  const host = qs("[data-ads-config]");
  const pill = qs("[data-ads-config-status]");
  if (!host) return;
  const keys = (config && config.keys) || {};
  // [env var, label, required?]
  const rows = [
    ["META_SYSTEM_USER_TOKEN", "System user token", true],
    ["META_AD_ACCOUNT_ID", "Ad account ID", true],
    ["META_PAGE_ID", "Facebook Page ID", true],
    ["META_INSTAGRAM_ACTOR_ID", "Instagram account ID", true],
    ["META_PIXEL_ID", "Pixel ID", false],
  ];
  const missingRequired = rows.filter(([k, , req]) => req && !keys[k]).length;
  if (pill) {
    pill.textContent = missingRequired === 0 ? "Ready" : `${missingRequired} missing`;
    pill.className = `status-pill ${missingRequired === 0 ? "in_stock" : "soldout"}`;
  }
  const navBadge = qs('[data-ads-nav-badge="setup"]');
  if (navBadge) navBadge.textContent = missingRequired > 0 ? String(missingRequired) : "";
  host.innerHTML = `
    <ul class="ads-config-list">
      ${rows.map(([k, label, req]) => {
        const ok = !!keys[k];
        return `<li class="ads-config-row">
          <span class="status-pill ${ok ? "in_stock" : (req ? "soldout" : "preorder")}">${ok ? "✓ detected" : (req ? "missing" : "optional")}</span>
          <strong>${esc(label)}</strong>
          <code>${esc(k)}</code>
        </li>`;
      }).join("")}
    </ul>
    <p class="portal-login-note">Placements: <strong>${esc(config?.publisher_platforms || "instagram")}</strong>${
      missingRequired === 0
        ? " · all required keys detected — ads can run."
        : " · add the missing required keys in Netlify, then redeploy."
    }</p>`;
}

// Show the data-driven targeting recommendation new campaigns will use.
function renderAdsAudience(reco) {
  const host = qs("[data-ads-audience]");
  if (!host) return;
  if (!reco || reco.confidence === "none") {
    host.innerHTML = `<p class="portal-login-note">No audience recommendation yet — new campaigns use a broad Pakistan / 18–45 default. Once campaigns have run and converted, hit “Refresh audience data” to learn who buys.</p>`;
    return;
  }
  const genders = (reco.genders || []).length
    ? (reco.genders[0] === 2 ? "Women" : "Men")
    : "All genders";
  const regions = (reco.region_labels || []).length ? reco.region_labels.join(", ") : "Pakistan (broad)";
  const tone = reco.confidence === "high" ? "in_stock" : "preorder";
  const b = reco.basis || {};
  const chip = (label, value) => `<div class="today-stat"><span class="today-stat-label">${esc(label)}</span><strong>${esc(value)}</strong></div>`;
  // Breakdown table — shows the segment math behind the pick (the "why").
  const breakdown = (title, segs) => {
    if (!segs || !segs.length) return "";
    return `
      <div class="ads-breakdown">
        <h3>${esc(title)}</h3>
        <table class="ads-breakdown-table">
          <thead><tr><th>Segment</th><th>CPA</th><th>Purchases</th></tr></thead>
          <tbody>${segs.map((s) => `<tr><td>${esc(s.seg)}</td><td>${s.cpa ? PKR.format(s.cpa) : "—"}</td><td>${esc(s.purchases ?? 0)}</td></tr>`).join("")}</tbody>
        </table>
      </div>`;
  };
  host.innerHTML = `
    <div class="mini-actions" style="margin-bottom:8px">
      <span class="status-pill ${tone}">${esc(reco.confidence)} confidence</span>
      <small class="portal-login-note">from ${esc(b.total_purchases ?? 0)} purchases · ${esc(reco.window_days || 30)}d window</small>
    </div>
    <div class="today-stats-grid">
      ${chip("Age", `${reco.age_min}–${reco.age_max}`)}
      ${chip("Gender", genders)}
      ${chip("Top regions", regions)}
    </div>
    <div class="ads-breakdowns">
      ${breakdown("By age", b.top_ages)}
      ${breakdown("By gender", b.top_genders)}
      ${breakdown("By region", b.top_regions)}
    </div>`;
}

function populateAdsProductSelect() {
  const select = qs("[data-ads-product]");
  if (!select || select.dataset.filled === "1") return;
  const products = (state.products || []).filter((p) => p.status !== "archived");
  select.insertAdjacentHTML("beforeend", products
    .map((p) => `<option value="${attr(p.id)}">${esc(p.title)}</option>`).join(""));
  if (products.length) select.dataset.filled = "1";
}

function renderAdsDashboard(report) {
  const kpis = qs("[data-ads-kpis]");
  const rows = qs("[data-ads-campaign-rows]");
  const windowPill = qs("[data-ads-window]");
  const t = report.totals || {};
  if (windowPill) windowPill.textContent = report.configured ? `${report.window_days || 7}d` : "offline";

  if (kpis) {
    if (!report.configured) {
      kpis.innerHTML = `<p class="portal-login-note">Meta isn't connected here yet. Add the META_* environment variables in Netlify, then refresh.</p>`;
    } else {
      const daily = report.daily || [];
      const card = (label, value, { tone = "", spark = null } = {}) =>
        `<div class="today-stat ${tone}"><span class="today-stat-label">${esc(label)}</span><strong>${esc(value)}</strong>${spark || ""}</div>`;
      kpis.innerHTML = [
        card("Spend", PKR.format(t.spend || 0), { spark: sparklineSvg(daily.map((d) => d.spend)) }),
        card("Purchases", String(t.purchases || 0)),
        card("Revenue", PKR.format(t.purchase_value || 0), { spark: sparklineSvg(daily.map((d) => d.purchase_value)) }),
        card("ROAS", `${(t.roas || 0).toFixed(2)}×`, { tone: (t.roas || 0) >= 2 ? "tone-good" : "", spark: sparklineSvg(daily.map((d) => d.roas)) }),
        card("CPA", t.cpa ? PKR.format(t.cpa) : "—"),
        card("CTR", `${(t.ctr || 0).toFixed(2)}%`),
      ].join("");
    }
  }

  if (rows) {
    const campaigns = report.campaigns || [];
    rows.innerHTML = campaigns.length
      ? campaigns.map((c) => `
        <tr>
          <td>${esc(c.name || c.campaign_id)}</td>
          <td>${PKR.format(c.spend || 0)}</td>
          <td>${c.purchases || 0}</td>
          <td>${PKR.format(c.purchase_value || 0)}</td>
          <td>${(c.roas || 0).toFixed(2)}×</td>
          <td>${c.cpa ? PKR.format(c.cpa) : "—"}</td>
        </tr>`).join("")
      : `<tr><td colspan="6" class="portal-login-note">No campaign spend in this window yet.</td></tr>`;
  }
}

function renderAdsQueue(campaigns) {
  const host = qs("[data-ads-campaign-queue]");
  const count = qs("[data-ads-queue-count]");
  const navBadge = qs('[data-ads-nav-badge="campaigns"]');
  if (!host) return;
  const waiting = campaigns.filter((c) => c.approval_state === "built");
  if (count) count.textContent = `${waiting.length} waiting`;
  if (navBadge) navBadge.textContent = waiting.length ? String(waiting.length) : "";
  if (!campaigns.length) {
    host.innerHTML = `<p class="portal-login-note">No campaigns built yet. Upload a creative, then build one from the Campaigns tab — it stays paused until you launch it.</p>`;
    return;
  }
  // Filter chips (all / built / launched / paused).
  const filter = state._adsQueueFilter || "all";
  const filtered = filter === "all" ? campaigns : campaigns.filter((c) => c.approval_state === filter);
  if (!filtered.length) {
    host.innerHTML = `<p class="portal-login-note">No ${esc(filter)} campaigns.</p>`;
    return;
  }
  const stateClass = (s) => s === "launched" ? "in_stock" : s === "rejected" ? "soldout" : s === "paused" ? "preorder" : "preorder";
  host.innerHTML = filtered.map((c) => {
    const built = c.approval_state === "built";
    const launched = c.approval_state === "launched";
    const paused = c.approval_state === "paused";
    // Live or paused campaigns get an inline daily-budget editor so spend is
    // managed straight from the UI (clamped to the guardrail server-side).
    const budgetEditor = (launched || paused) ? `
      <div class="ads-budget-edit mini-actions">
        <label class="ads-budget-label">Daily budget (PKR)
          <input type="number" min="100" step="100" value="${Number(c.daily_budget_pkr || 0)}" data-ads-budget-input="${attr(c.id)}" />
        </label>
        <button class="button secondary" type="button" data-action="ads-set-budget" data-ads-id="${attr(c.id)}">Update budget</button>
      </div>` : "";
    return `
      <article class="ugc-admin-card">
        <div class="ugc-admin-body">
          <div class="panel-title-row">
            <strong>${esc(c.name)}</strong>
            <span class="status-pill ${stateClass(c.approval_state)}">${esc(c.approval_state)}</span>
          </div>
          <small>${PKR.format(c.daily_budget_pkr || 0)}/day · ${esc(c.objective || "OUTCOME_SALES")}${c.notes ? ` · ${esc(c.notes)}` : ""}</small>
          ${budgetEditor}
          <div class="mini-actions">
            ${built ? `<button class="button primary" type="button" data-action="ads-launch" data-ads-id="${attr(c.id)}">Approve &amp; launch</button>` : ""}
            ${built ? `<button class="button secondary" type="button" data-action="ads-reject" data-ads-id="${attr(c.id)}">Reject</button>` : ""}
            ${launched ? `<button class="button secondary" type="button" data-action="ads-undo" data-ads-id="${attr(c.id)}">Pause spend</button>` : ""}
            ${paused ? `<button class="button primary" type="button" data-action="ads-resume" data-ads-id="${attr(c.id)}">Resume spend</button>` : ""}
          </div>
        </div>
      </article>`;
  }).join("");
}

function renderAdsActions(actions) {
  const host = qs("[data-ads-actions]");
  if (!host) return;
  if (!actions.length) {
    host.innerHTML = `<p class="portal-login-note">No optimizer activity yet. It runs daily and logs here.</p>`;
    return;
  }
  host.innerHTML = `<ul class="ads-action-log">${actions.map((a) => `
    <li>
      <span class="status-pill ${a.action === "pause" ? "soldout" : "in_stock"}">${esc(a.action)}</span>
      <strong>${esc(a.entity_name || a.entity_id)}</strong>
      <small>${esc(a.reason || "")}${a.dry_run ? " · dry-run" : ""}</small>
    </li>`).join("")}</ul>`;
}

// Upload the operator's chosen image, then save it as a creative (image + copy)
// into the library. No external AI — the team supplies the media and the words.
async function adsUploadMedia() {
  const form = qs("[data-ads-creative-form]");
  const statusEl = qs("[data-ads-creative-status]");
  if (!form) return;
  const data = Object.fromEntries(new FormData(form).entries());
  const file = qs("[data-ad-media-file]")?.files?.[0];
  if (!data.headline?.trim() || !data.primary_text?.trim()) {
    if (statusEl) statusEl.textContent = "Headline and primary text are required."; return;
  }
  // Destination: a linked product deep-links to its page; otherwise the typed URL.
  const destination = data.product_id
    ? `/product/${data.product_id}`
    : (data.destination_url || "").trim();
  if (!destination) { if (statusEl) statusEl.textContent = "Pick a product or enter a destination URL."; return; }

  const restore = withSubmitState(form, "Uploading…");
  try {
    let imageUrlValue = "";
    if (file) {
      if (statusEl) statusEl.textContent = "Uploading image…";
      const compressed = await compressImageFile(file);
      const uploaded = await apiFetch("/api/admin/upload", {
        method: "POST",
        body: JSON.stringify({ folder: "ad-creatives", file: await fileToPayload(compressed) }),
      }, { publicUrl: URL.createObjectURL(file), configured: false });
      imageUrlValue = uploaded.publicUrl || "";
    }
    if (statusEl) statusEl.textContent = "Saving creative…";
    await apiFetch("/api/admin/ads-creative", {
      method: "POST",
      body: JSON.stringify({ action: "add", creative: {
        product_id: data.product_id || null,
        headline: data.headline.trim(),
        primary_text: data.primary_text.trim(),
        cta_type: data.cta_type || "SHOP_NOW",
        destination_url: destination,
        image_url: imageUrlValue,
        source: "manual",
        status: "ready",
      } }),
    });
    form.reset();
    const prev = qs("[data-ad-media-preview]"); if (prev) { prev.hidden = true; prev.innerHTML = ""; }
    if (statusEl) statusEl.textContent = "Saved to the library — pick it in Campaigns to build an ad.";
    await loadAdsAdmin();
    toast("Creative saved.");
  } catch (err) {
    if (statusEl) statusEl.textContent = `Upload failed: ${err.message || err}`;
  } finally {
    restore();
  }
}

// Build a paused campaign from a chosen library creative + daily budget.
async function adsBuildCampaign() {
  const form = qs("[data-ads-create-form]");
  const statusEl = qs("[data-ads-create-status]");
  if (!form) return;
  const creativeRef = form.elements.creative_ref?.value;
  const budget = Number(form.elements.daily_budget_pkr?.value || 0);
  if (!creativeRef) { if (statusEl) statusEl.textContent = "Pick a creative."; return; }
  if (!budget) { if (statusEl) statusEl.textContent = "Enter a daily budget."; return; }
  const restore = withSubmitState(form, "Building…");
  try {
    const built = await apiFetch("/api/admin/ads-create", {
      method: "POST",
      body: JSON.stringify({ action: "build", creative_ref: creativeRef, daily_budget_pkr: budget, created_by: "operator" }),
    });
    if (statusEl) statusEl.textContent = built.clamped
      ? "Built — budget was clamped to your guardrail ceiling. Review it in the approval queue, then launch."
      : "Built (paused). Review it in the approval queue, then launch.";
    form.reset();
    await loadAdsAdmin();
    toast("Campaign built (paused).");
  } catch (err) {
    if (statusEl) statusEl.textContent = `Build failed: ${err.message || err}`;
  } finally {
    restore();
  }
}

async function adsArchiveCreative(id) {
  if (!id || !confirm("Archive this creative? It will no longer be selectable for new campaigns.")) return;
  try {
    await apiFetch("/api/admin/ads-creative", {
      method: "POST", body: JSON.stringify({ action: "status", id, status: "archived" }),
    });
    toast("Creative archived.");
    await loadAdsAdmin();
  } catch (err) {
    toast(`Could not archive: ${err.message || err}`);
  }
}

async function adsCampaignAction(action, id) {
  const confirms = {
    launch: "Launch this campaign live? It will start spending.",
    resume: "Resume spend on this campaign?",
  };
  if (confirms[action] && !confirm(confirms[action])) return;
  const labels = { launch: "Campaign launched.", undo: "Spend paused.", resume: "Spend resumed.", reject: "Campaign rejected." };
  try {
    await apiFetch("/api/admin/ads-create", {
      method: "POST", body: JSON.stringify({ action, id, approved_by: "operator" }),
    });
    toast(labels[action] || "Campaign updated.");
    await loadAdsAdmin();
  } catch (err) {
    toast(`Could not ${action}: ${err.message || err}`);
  }
}

// Change a campaign's daily budget from the UI. Reads the inline input, posts
// set_budget (server clamps to the guardrail), then refreshes the queue.
async function adsSetBudget(id) {
  const input = qs(`[data-ads-budget-input="${id}"]`);
  const value = Number(input?.value || 0);
  if (!(value > 0)) { toast("Enter a daily budget above 0."); return; }
  try {
    const res = await apiFetch("/api/admin/ads-create", {
      method: "POST", body: JSON.stringify({ action: "set_budget", id, daily_budget_pkr: value }),
    });
    toast(res.clamped ? "Budget set (capped at your guardrail ceiling)." : "Daily budget updated.");
    await loadAdsAdmin();
  } catch (err) {
    toast(`Could not update budget: ${err.message || err}`);
  }
}

// Recompute the audience recommendation from Meta (the cron does this weekly;
// this is the on-demand button). Slower than the cached read — it hits Meta.
async function adsAudienceRefresh() {
  const host = qs("[data-ads-audience]");
  if (host) host.innerHTML = `<p class="portal-login-note">Analyzing audience performance…</p>`;
  try {
    const res = await apiFetch("/api/admin/ads-audience", {}, { reco: null });
    if (res.configured === false) {
      if (host) host.innerHTML = `<p class="portal-login-note">Meta isn't connected here yet — add the META_* env vars to compute audience data.</p>`;
      return;
    }
    state._adsAudience = res.reco || null;
    renderAdsAudience(state._adsAudience);
    toast("Audience recommendation refreshed.");
  } catch (err) {
    toast(`Audience refresh failed: ${err.message || err}`);
    renderAdsAudience(state._adsAudience);
  }
}

async function adsOptimizePreview() {
  toast("Running optimizer dry-run…");
  try {
    const res = await apiFetch("/api/admin/ads-optimize", {}, { actions: [], dry_run: true });
    state._adsActions = res.actions || [];
    renderAdsActions(state._adsActions);
    toast(`Optimizer evaluated ${res.evaluated || 0} ads, ${res.acted || 0} action(s)${res.dry_run ? " (dry-run)" : ""}.`);
  } catch (err) {
    toast(`Optimizer preview failed: ${err.message || err}`);
  }
}

async function saveUgcPost(payload) {
  const status = qs("[data-ugc-status]");
  if (status) { status.textContent = "Saving…"; status.className = "ugc-form-status"; }
  const result = await apiFetch("/api/admin/ugc", {
    method: "POST",
    body: JSON.stringify(payload),
  }, null);
  if (!result || result.error) {
    if (status) { status.textContent = result?.error || "Save failed — check Supabase connection."; status.className = "ugc-form-status warn"; }
    return false;
  }
  if (status) { status.textContent = "Saved ✓"; status.className = "ugc-form-status ok"; }
  await loadUgcAdmin();
  return true;
}

async function handleUgcSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const fd = new FormData(form);
  const payload = {
    id: fd.get("id") || undefined,
    handle: String(fd.get("handle") || "").trim(),
    city: String(fd.get("city") || "").trim(),
    category: fd.get("category") || "",
    sort_order: Number(fd.get("sort_order") || 0),
    image_url: String(fd.get("image_url") || "").trim(),
    quote: String(fd.get("quote") || "").trim(),
    status: fd.get("approve_now") ? "approved" : "pending",
  };
  if (!payload.handle || !payload.quote) {
    toast("Handle and quote are required.");
    return;
  }
  const ok = await saveUgcPost(payload);
  if (ok) {
    form.reset();
    form.elements.id.value = "";
    form.elements.sort_order.value = "0";
    qs("[data-ugc-submit]").textContent = "Add post";
    qs("[data-action='ugc-cancel-edit']")?.classList.add("hidden");
  }
}

function startUgcEdit(id) {
  const post = (state.ugcPosts || []).find((p) => p.id === id);
  const form = qs("[data-ugc-form]");
  if (!post || !form) return;
  form.elements.id.value = post.id;
  form.elements.handle.value = post.handle || "";
  form.elements.city.value = post.city || "";
  form.elements.category.value = post.category || "";
  form.elements.sort_order.value = post.sort_order ?? 0;
  form.elements.image_url.value = post.image_url || "";
  form.elements.quote.value = post.quote || "";
  form.elements.approve_now.checked = post.status === "approved";
  qs("[data-ugc-submit]").textContent = "Save changes";
  qs("[data-action='ugc-cancel-edit']")?.classList.remove("hidden");
  form.scrollIntoView({ behavior: "smooth", block: "center" });
}

function cancelUgcEdit() {
  const form = qs("[data-ugc-form]");
  if (!form) return;
  form.reset();
  form.elements.id.value = "";
  form.elements.sort_order.value = "0";
  qs("[data-ugc-submit]").textContent = "Add post";
  qs("[data-action='ugc-cancel-edit']")?.classList.add("hidden");
}

async function setUgcStatus(id, status) {
  const post = (state.ugcPosts || []).find((p) => p.id === id);
  if (!post) return;
  await saveUgcPost({ ...post, status });
}

async function deleteUgcPost(id) {
  await apiFetch(`/api/admin/ugc?id=${encodeURIComponent(id)}`, { method: "DELETE" }, { ok: true });
  await loadUgcAdmin();
  toast("Post removed.");
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

// Growth Studio is currently disabled — its panel was removed from the
// portal in May 2026 (the team decided Content/Campaigns/Broadcasts would
// run from external tools instead). The function and all the renderers
// below stay in the codebase so we can re-enable the panel without
// rewriting it; they no-op when the `[data-admin-panel="growth"]` panel
// is absent from the DOM.
function renderMarketing() {
  if (!has("[data-admin-panel=\"growth\"]")) return;

  // Refresh the broadcast template <select> and live preview every time we
  // re-render — cheap, and ensures newly seeded templates appear without a
  // page reload after a Supabase migration.
  renderBroadcastTemplateOptions();
  refreshBroadcastPreview();

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

// Show/hide pricing fields based on the selected mode. Preorder shows USD +
// FX + shipping (we compute the customer PKR). In-stock hides those and
// shows a direct PKR price plus the 3-5 day delivery window override.
function applyPricingModeVisibility(form, mode) {
  if (!form) return;
  const active = mode === "in_stock" ? "in_stock" : "preorder";
  form.querySelectorAll("[data-pricing-field]").forEach((node) => {
    const show = node.dataset.pricingField === active;
    node.style.display = show ? "" : "none";
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
    pricing_mode: "preorder",
    usa_price_usd: "",
    shipping_pkr: "",
    fx_rate: state.settings.fx_rate,
    customer_price_pkr: "",
    delivery_days_min: "",
    delivery_days_max: "",
    stock_mode: "preorder",
    inventory: 0,
    low_stock_threshold: 2,
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
  const inferredMode = product.pricing_mode
    || (Number(product.customer_price_pkr || 0) > 0 && !Number(product.usa_price_usd || 0) ? "in_stock" : "preorder");
  const prepared = {
    ...defaults,
    ...product,
    pricing_mode: inferredMode,
    // The publish select is named product_status but `status` is canonical now.
    product_status: product.status || product.product_status || "active",
    gallery_urls: Array.isArray(product.gallery_urls) ? product.gallery_urls.join("\n") : product.gallery_urls || "",
  };
  Object.entries(prepared).forEach(([key, value]) => {
    if (form.elements[key]) form.elements[key].value = value;
  });
  applyPricingModeVisibility(form, inferredMode);
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

const QUOTE_SHIPPING_DEFAULTS = {
  handbags: 15000,
  shoes: 11000,
  makeup: 4800,
  fragrance: 6500,
  accessories: 8500,
};

const QUOTE_CATEGORY_LABELS = {
  handbags: "Handbag",
  shoes: "Shoes",
  makeup: "Makeup",
  fragrance: "Fragrance",
  accessories: "Accessories",
};

const QUOTE_CATEGORY_IMAGES = {
  handbags: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=900&q=84",
  shoes: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=84",
  makeup: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=900&q=84",
  fragrance: "https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=900&q=84",
  accessories: "https://images.unsplash.com/photo-1594223274512-ad4803739b7c?auto=format&fit=crop&w=900&q=84",
};

function getQuoteEstimate({ resetShipping = false } = {}) {
  const form = qs("[data-quote-form]");
  if (!form) return null;
  const category = form.elements.category?.value || "handbags";
  const shippingInput = form.elements.shipping_pkr;
  const fxInput = form.elements.fx_rate;
  if (fxInput && !fxInput.value) fxInput.value = state.settings.fx_rate || 282;
  if (shippingInput && (resetShipping || !shippingInput.value)) {
    shippingInput.value = QUOTE_SHIPPING_DEFAULTS[category] || QUOTE_SHIPPING_DEFAULTS.accessories;
  }

  const data = Object.fromEntries(new FormData(form).entries());
  const usa = Number(data.usa_price_usd || 0);
  const fx = Number(data.fx_rate || state.settings.fx_rate || 282);
  const baseShipping = Number(data.shipping_pkr || QUOTE_SHIPPING_DEFAULTS[category] || 0);
  const shoeBoxFee = category === "shoes" && data.shoe_box ? 2500 : 0;
  const shipping = baseShipping + shoeBoxFee;
  const markupRate = Number(state.settings.markup_rate ?? 0.25);
  const retailPkr = usa * fx;
  const service = retailPkr * markupRate;
  const total = Math.ceil((retailPkr + service + shipping) / 10) * 10;
  const advance = Math.ceil((total * 0.5) / 10) * 10;
  const balance = Math.max(0, total - advance);
  return {
    category,
    label: QUOTE_CATEGORY_LABELS[category] || "Product",
    usa,
    fx,
    baseShipping,
    shoeBoxFee,
    shipping,
    markupRate,
    retailPkr,
    service,
    total,
    advance,
    balance,
  };
}

function updateQuoteEstimator(options = {}) {
  const quote = getQuoteEstimate(options);
  if (!quote) return;
  const { label, usa, total, advance, balance } = quote;
  const result = qs("[data-quote-result]");
  if (result) {
    // Customer-facing breakdown intentionally omits FX rate, USD × PKR
    // math, markup percentage, and shipping line. We show the final PKR,
    // the 50/50 split, and an inclusive "what's covered" list — the same
    // privacy stance the PDP and order summary take.
    result.innerHTML = `
      <div class="quote-total">
        <span>Estimated PKR price</span>
        <strong>${PKR.format(total || 0)}</strong>
      </div>
      <dl class="quote-breakdown">
        <div><dt>50% advance at checkout</dt><dd>${PKR.format(advance || 0)}</dd></div>
        <div><dt>Balance on Pakistan arrival</dt><dd>${PKR.format(balance || 0)}</dd></div>
      </dl>
      <ul class="quote-includes" aria-label="What's included in this estimate">
        <li>USA sourcing &amp; receipts</li>
        <li>International shipping to Pakistan</li>
        <li>Service &amp; door-to-door delivery</li>
      </ul>
      <p class="quote-note">Working estimate — the final PKR price you pay is shown at checkout. We share the exact shipment batch on WhatsApp after you order.</p>
    `;
  }
  const wa = qs("[data-quote-whatsapp]");
  if (wa) {
    // The DM message intentionally references only the USA price the
    // customer entered + the final PKR estimate — never our FX or markup.
    const msg = `Hi Global Bestie, can you confirm this ${label.toLowerCase()} quote? USA retail: $${usa || 0}. PKR estimate I saw: ${PKR.format(total || 0)}.`;
    wa.href = `https://wa.me/13362556023?text=${encodeURIComponent(msg)}`;
  }
}

function addQuoteEstimateToCart() {
  const quote = getQuoteEstimate();
  if (!quote || !quote.usa || !quote.total) {
    toast("Enter a USA retail price first.");
    qs("[data-quote-form] input[name='usa_price_usd']")?.focus();
    return;
  }
  const product = {
    id: `quote-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: `Custom USA ${quote.label} Quote`,
    brand: "Customer request",
    category: quote.category,
    description: `Working estimate for a USA ${quote.label.toLowerCase()} request. Final PKR price, availability, and shipment batch are confirmed by the team before sourcing.`,
    usa_price_usd: quote.usa,
    shipping_pkr: quote.shipping,
    fx_rate: quote.fx,
    markup_rate: quote.markupRate,
    customer_price_pkr: quote.total,
    price_pkr: quote.total,
    stock_mode: "preorder",
    inventory: 0,
    image_url: QUOTE_CATEGORY_IMAGES[quote.category] || QUOTE_CATEGORY_IMAGES.accessories,
    gallery_urls: [QUOTE_CATEGORY_IMAGES[quote.category] || QUOTE_CATEGORY_IMAGES.accessories],
    source_url: "",
    variants: "Custom quote request. Add product link, size, shade, color, or screenshot notes at checkout.",
    authenticity_note: "Team confirms source, availability, final PKR price, and shipment batch before payment/sourcing.",
    social_proof: "Custom USA sourcing estimate.",
    featured: false,
    preorder_weeks: state.settings.preorder_weeks || 4,
  };
  state.cart.push({
    product_id: product.id,
    quantity: 1,
    product,
    variant: product.variants,
  });
  saveCart();
  renderCart();
  renderProducts();
  setCartDrawerOpen(true);
  toast("Custom quote added to bag.");
}

function renderAll() {
  renderBatchRibbon();
  renderProducts();
  renderCart();
  renderBankDetails();
  renderSupportLinks();
  updateQuoteEstimator();
  renderAdmin();
  // renderMarketing() — Growth Studio panel is currently removed from
  // the portal; the function's guard makes the call a no-op but we skip
  // it entirely to save the selector query on every render.
  renderRecentOrdersRail();
}

// On the public /track view, surface a "Your recent orders" rail under the
// search form whenever the customer's browser has a saved profile (i.e.,
// they've ordered with us before from this device). One-tap to pull that
// order's tracking info — saves them digging up the order number.
function renderRecentOrdersRail() {
  const slot = qs("[data-recent-orders-rail]");
  if (!slot) return;
  // Pull every saved phone profile from localStorage, then surface only
  // orders whose canon phone matches. In offline-preview mode there might
  // not be any — render nothing in that case.
  let profiles = {};
  try { profiles = JSON.parse(localStorage.getItem(CUSTOMER_PROFILE_KEY) || "{}"); } catch {}
  const knownPhones = Object.keys(profiles);
  if (!knownPhones.length) { slot.innerHTML = ""; return; }
  const matches = (state.orders || [])
    .filter((o) => knownPhones.includes(canonPhone(o.customer_phone)))
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .slice(0, 4);
  if (!matches.length) { slot.innerHTML = ""; return; }
  slot.innerHTML = `
    <h3>Your recent orders</h3>
    <div class="recent-orders-row">
      ${matches.map((o) => {
        const stage = (o.status || "").replaceAll("_", " ");
        const created = o.created_at ? new Date(o.created_at).toLocaleDateString("en-PK", { month: "short", day: "numeric" }) : "";
        return `
          <button class="recent-order-tile" type="button" data-action="track-recent-order" data-order-id="${attr(o.id)}">
            <strong>${esc(o.id)}</strong>
            <small>${esc(created)} · ${esc(stage)}</small>
            <span>${PKR.format(Number(o.total_pkr || 0))}</span>
          </button>
        `;
      }).join("")}
    </div>
  `;
}

// Live ribbon under the header. Keep this customer-facing and simple:
// current doorstep timing plus the estimate for new orders.
// Both halves are settings-driven (via sampleSettings / Supabase), and
// the doorstep window auto-hides once its end date passes so we never
// ship a stale promise.
function renderBatchRibbon() {
  const el = qs("[data-batch-ribbon]");
  if (!el) return;
  const window = currentDoorstepWindow();
  const nextLabel = nextShipmentLabel();
  el.innerHTML = `
    <strong>USA sourcing for Pakistan</strong>
    ${window ? `<span class="announce-sep" aria-hidden="true">·</span><span>Current batch doorstep delivery: ${esc(window)}</span>` : ""}
    <span class="announce-sep" aria-hidden="true">·</span>
    <span>${esc(nextLabel)}</span>
  `;
}

// Clean-URL router (pushState) — replaces the legacy hashchange routing.
// Each public view has its own URL (/shop, /preorder, /track, /checkout),
// which lets Google index them and gives us per-route <title>/meta
// description for SEO. Netlify's catch-all redirect (in netlify.toml) sends
// every path back to /index.html so the SPA boots normally.

const ROUTE_TO_PATH = {
  home: "/",
  shop: "/shop",
  preorder: "/preorder",
  checkout: "/checkout",
  "checkout-chat": "/checkout-preview",
  track: "/track",
  quote: "/quote",
  faq: "/preorder",
  about: "/about",
  contact: "/contact",
  returns: "/returns",
  "size-guide": "/size-guide",
  batches: "/batches",
  "this-week": "/this-week",
};

const PATH_TO_ROUTE = {
  "/": "home",
  "": "home",
  "/shop": "shop",
  "/preorder": "preorder",
  "/checkout": "checkout",
  "/checkout-preview": "checkout-chat",
  "/track": "track",
  "/quote": "quote",
  "/faq": "preorder",
  "/about": "about",
  "/contact": "contact",
  "/returns": "returns",
  "/size-guide": "size-guide",
  "/batches": "batches",
  "/this-week": "this-week",
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
    title: "Preorder & FAQ | Global Bestie",
    description: "How Global Bestie's USA preorder batches, payment, delivery, authenticity, and product requests work.",
  },
  checkout: {
    title: "Checkout | Global Bestie",
    description: "Pay the 50% advance to confirm your Global Bestie order. We confirm your shipment batch on WhatsApp.",
  },
  track: {
    title: "Track Your Order | Global Bestie",
    description: "Follow your Global Bestie order from USA sourcing to Pakistan delivery.",
  },
  quote: {
    title: "Custom Quote | Global Bestie",
    description: "Preview a Global Bestie USA-to-Pakistan preorder price in PKR before sending your product link.",
  },
  admin: {
    title: "Global Bestie Portal",
    description: "Internal Global Bestie operations portal.",
  },
  about: {
    title: "About Global Bestie | USA → Pakistan luxury concierge",
    description: "Who we are and how Global Bestie sources authentic USA branded handbags, shoes, makeup, and accessories for Pakistan.",
  },
  contact: {
    title: "Contact Global Bestie",
    description: "Talk to the Global Bestie concierge on WhatsApp — replies typically within 15 minutes during business hours.",
  },
  returns: {
    title: "Returns & Refunds | Global Bestie",
    description: "How cancellations, refunds, defective items, and USA retailer policies work at Global Bestie.",
  },
  "size-guide": {
    title: "Size guide | Global Bestie",
    description: "US ↔ UK ↔ EU ↔ desi size conversions for shoes and clothing — find your USA size before you preorder.",
  },
  "checkout-chat": {
    title: "Concierge checkout (preview) | Global Bestie",
    description: "A preview of Global Bestie's upcoming chat-style checkout, designed to match our WhatsApp concierge.",
  },
  batches: {
    title: "Live shipment batches | Global Bestie",
    description: "Track every Global Bestie USA-to-Pakistan shipment batch in real time — when it ships, arrives, and dispatches.",
  },
  "this-week": {
    title: "This week's sourcing | Global Bestie",
    description: "Preview the USA finds we're sourcing into our next consolidated batch — lock yours in before the batch closes.",
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
  if ((!viewName || viewName === "home") && fromHash) {
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

const SHOP_FILTER_OPTIONS = {
  category: new Set(["all", "handbags", "shoes", "makeup", "fragrance", "accessories"]),
  stock: new Set(["all", "in_stock", "preorder"]),
  sort: new Set(["featured", "price_asc", "price_desc", "newest"]),
};

function cleanShopFilter(key, value) {
  const raw = String(value || "").trim();
  if (key === "search") return raw;
  return SHOP_FILTER_OPTIONS[key]?.has(raw) ? raw : "all";
}

function shopFiltersFromParams(params) {
  return {
    search: cleanShopFilter("search", params.get("q") || params.get("search") || ""),
    category: cleanShopFilter("category", params.get("category") || "all"),
    stock: cleanShopFilter("stock", params.get("stock") || "all"),
    sort: SHOP_FILTER_OPTIONS.sort.has(params.get("sort") || "") ? params.get("sort") : "featured",
  };
}

function shopFiltersFromControls() {
  return {
    search: cleanShopFilter("search", qs("[data-filter-search]")?.value || ""),
    category: cleanShopFilter("category", qs("[data-filter-category]")?.value || "all"),
    stock: cleanShopFilter("stock", qs("[data-filter-stock]")?.value || "all"),
    sort: SHOP_FILTER_OPTIONS.sort.has(qs("[data-filter-sort]")?.value || "") ? qs("[data-filter-sort]")?.value : "featured",
  };
}

function applyShopFiltersToControls() {
  const controls = [
    ["[data-filter-search]", state.filters.search || ""],
    ["[data-filter-category]", state.filters.category || "all"],
    ["[data-filter-stock]", state.filters.stock || "all"],
    ["[data-filter-sort]", state.filters.sort || "featured"],
  ];
  controls.forEach(([selector, value]) => {
    const control = qs(selector);
    if (control && control.value !== value) control.value = value;
  });
  updateShopFilterBadge();
}

function activeShopFilterCount() {
  return ["search", "category", "stock"].filter((key) => {
    const value = state.filters[key];
    return value && value !== "all";
  }).length;
}

function updateShopFilterBadge() {
  const count = qs("[data-active-filter-count]");
  if (count) {
    const active = activeShopFilterCount();
    count.textContent = active > 0 ? `· ${active}` : "";
  }
}

function syncShopFiltersFromRoute(params) {
  const hasFilterParams = ["q", "search", "category", "stock", "sort"].some((key) => params.has(key));
  state.filters = hasFilterParams ? shopFiltersFromParams(params) : shopFiltersFromControls();
  applyShopFiltersToControls();
}

function syncShopFilterUrl() {
  if (parseRoute().viewName !== "shop") return;
  const params = new URLSearchParams(location.search);
  params.delete("q");
  params.delete("search");
  params.delete("category");
  params.delete("stock");
  params.delete("sort");
  if (state.filters.search) params.set("q", state.filters.search);
  if (state.filters.category && state.filters.category !== "all") params.set("category", state.filters.category);
  if (state.filters.stock && state.filters.stock !== "all") params.set("stock", state.filters.stock);
  if (state.filters.sort && state.filters.sort !== "featured") params.set("sort", state.filters.sort);
  const query = params.toString();
  const nextUrl = `${location.pathname}${query ? `?${query}` : ""}`;
  if (nextUrl !== `${location.pathname}${location.search}`) {
    history.replaceState({ route: "shop" }, "", nextUrl);
  }
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
  const isFirstLoad = _firstLoad;

  if (!isFirstLoad && curtain) {
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
    syncShopFiltersFromRoute(params);
    renderProducts();
  }
  // Live-data surfaces — fetch on entry. Each renderer no-ops gracefully and
  // leaves the static fallback markup in place if the fetch fails.
  if (safeView === "batches") renderBatchesPage();
  if (safeView === "this-week") renderThisWeek();
  setCartDrawerOpen(false);
  window.scrollTo({ top: 0 });

  if (!isFirstLoad && curtain) {
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
  // Pick up the variant the customer typed into the PDP input (if any).
  // Falls back to whatever variant is already on an existing cart line.
  const variantInput = qs(`[data-pdp-variant][data-product-id="${productId}"]`);
  const typedVariant = variantInput ? variantInput.value.trim() : "";
  const existing = state.cart.find((line) => line.product_id === productId);
  // First add of this product → "fresh" (open drawer, show toast).
  // Subsequent increments from the in-card stepper → "quiet" (just update,
  // no drawer pop, no spam toast — supports rapid tap-tap-tap haul flow).
  const isFreshAdd = !existing;
  if (existing) {
    existing.quantity += 1;
    if (typedVariant) existing.variant = typedVariant;
  } else {
    state.cart.push({ product_id: productId, quantity: 1, product, variant: typedVariant || "" });
  }
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

// Compresses an image File to a target max-dimension/quality so PK 3G/4G
// uploads don't time out. PDFs and small images (< target) pass through.
// Returns a File-shaped object (Blob) the rest of the pipeline can use.
async function compressImageFile(file, { maxDim = 1600, targetBytes = 1024 * 1024, quality = 0.82 } = {}) {
  if (!file || !/^image\//.test(file.type) || /image\/heic|image\/heif/.test(file.type)) {
    // Browsers can't canvas-decode HEIC/HEIF — let the server keep the
    // original. For non-images (PDF) we also skip.
    return file;
  }
  if (file.size <= targetBytes) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const ratio = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * ratio);
    const h = Math.round(bitmap.height * ratio);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file;
    // Re-wrap so consumers see a `File` (name + type + size).
    return new File([blob], file.name.replace(/\.[a-z0-9]+$/i, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file; // any decode failure → fall back to original
  }
}

// Max size for the transfer-proof upload BEFORE base64 expansion. 5 MB is
// well under Netlify Functions' 6 MB synchronous payload limit and covers any
// reasonable bank-app screenshot. Anything larger we bounce client-side with
// a helpful message instead of letting the request silently 413.
const TRANSFER_PROOF_MAX_BYTES = 5 * 1024 * 1024;

// Generates a per-form-mount idempotency key so a double-tap on Place Order
// resolves to the same server-side row instead of two duplicate orders.
function ensureIdempotencyKey(form) {
  if (!form.dataset.idempotencyKey) {
    form.dataset.idempotencyKey = `idem-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
  return form.dataset.idempotencyKey;
}

async function handleCheckout(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submitBtn = form.querySelector("button[type='submit']");

  // ─── Guard 1: cart not empty ───────────────────────────────────────────
  if (!state.cart.length) {
    toast("Add at least one product before checkout.");
    navigateTo("shop");
    return;
  }

  const data = Object.fromEntries(new FormData(form).entries());

  // ─── Guard 2: phone is a valid Pakistani mobile ───────────────────────
  const canon = canonPhone(data.customer_phone);
  if (!isValidPkMobile(canon)) {
    toast("Please enter a valid Pakistani mobile number (e.g. 0300 1234567).");
    form.elements.customer_phone?.focus();
    return;
  }
  // Replace whatever the user typed with the canonical form so the server
  // and the local profile cache agree on identity.
  data.customer_phone = canon;

  // ─── Guard 3: ack checkboxes ──────────────────────────────────────────
  if (!data.balance_ack || !data.terms_ack) {
    toast("Please confirm both checkboxes before placing your order.");
    return;
  }

  // ─── Guard 4: required variants ───────────────────────────────────────
  const missingVariant = cartLines().find((line) => {
    const cat = line.product.category;
    const needsVariant = ["shoes", "makeup", "fragrance"].includes(cat);
    return needsVariant && !(line.variant && line.variant.trim());
  });
  if (missingVariant) {
    toast(`Please add a ${variantLabel(missingVariant.product)} for ${missingVariant.product.title}.`);
    setCartDrawerOpen(true);
    return;
  }

  // ─── Guard 5: transfer proof file size + compression ──────────────────
  let file = form.elements.transfer_file?.files?.[0];
  if (file && file.size > TRANSFER_PROOF_MAX_BYTES) {
    toast(`Transfer proof is ${(file.size / 1024 / 1024).toFixed(1)} MB — please upload an image under 5 MB or skip and just send the reference.`);
    return;
  }
  // Compress big images to ~1 MB so PK 3G/4G uploads don't time out.
  if (file) {
    const original = file;
    file = await compressImageFile(file);
    const hint = qs("[data-transfer-hint]");
    if (hint) {
      const kb = (file.size / 1024).toFixed(0);
      hint.textContent = file === original
        ? `Uploading ${file.name} (${kb} KB)…`
        : `Compressed to ${kb} KB · uploading…`;
      hint.className = "upload-hint ok";
    }
  }

  // ─── Disable submit + spinner state ───────────────────────────────────
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.dataset.originalLabel = submitBtn.textContent;
    submitBtn.textContent = "Placing your order…";
  }

  const payment = cartPaymentSummary();
  const idempotencyKey = ensureIdempotencyKey(form);
  const order = {
    ...data,
    idempotency_key: idempotencyKey,
    transfer_file: file ? await fileToPayload(file) : null,
    items: cartLines().map((line) => {
      const isSourcing = line.kind === "sourcing_request" || line.product.is_sourcing_request;
      return {
        product_id: line.product_id,
        title: line.product.title,
        quantity: line.quantity,
        unit_price_pkr: calculatePrice(line.product),
        stock_mode: line.product.stock_mode,
        image_url: line.product.image_url,
        variant: line.variant || line.product.variants || "",
        customer_variant_input: line.variant || "",
        source_url: line.product.source_url || "",
        source_status: isSourcing
          ? "Sourcing request · awaiting team quote"
          : (line.product.stock_mode === "preorder" ? "Pending USA sourcing" : "In-stock verification"),
        // Sourcing-request flag travels with the item so the team's
        // portal Kanban can route it into the dedicated swimlane.
        is_sourcing_request: isSourcing ? true : undefined,
        kind: isSourcing ? "sourcing_request" : undefined,
      };
    }),
    has_sourcing_request: cartLines().some((line) => line.kind === "sourcing_request" || line.product.is_sourcing_request),
    total_pkr: payment.total,
    advance_due_pkr: payment.advanceDue,
    balance_due_pkr: payment.balanceDue,
    eta: payment.hasPreorder ? nextShipmentLabel() : "Ready for dispatch after payment match",
    next_action: "Review product availability, source price, and shipment batch before accepting.",
  };
  // Fallback order ID matches the server's new MMDDXXXX shape so even when
  // we're in offline-preview mode the format the customer sees is identical.
  const now = new Date();
  const mmdd = String(now.getMonth() + 1).padStart(2, "0") + String(now.getDate()).padStart(2, "0");
  const fallbackOrder = {
    id: `GB-${now.getFullYear()}-${mmdd}${Math.floor(1000 + Math.random() * 9000)}`,
    ...order,
    status: "pending_review",
    payment_status: data.transfer_reference || file ? "advance_uploaded" : "awaiting_advance",
    created_at: now.toISOString(),
    advance_paid_pkr: 0,
    balance_paid_pkr: 0,
    next_action: order.next_action,
    eta: order.eta,
    events: [{ status: "pending_review", note: `Order request created. Estimated value: ${PKR.format(payment.total)}.`, created_at: now.toISOString() }],
  };

  // Race the request against a 30 s timeout so we never leave the customer
  // staring at "Placing…" forever on a flaky connection.
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("timeout")), 30_000),
  );

  try {
    const created = await Promise.race([
      apiFetch("/api/orders", { method: "POST", body: JSON.stringify(order) }, { order: fallbackOrder }),
      timeoutPromise,
    ]);
    const placedOrder = created.order || fallbackOrder;

    // If the server requoted any item, surface it before the confirmation
    // screen so the customer knows the total they're paying.
    if (Array.isArray(created.pricing_notes) && created.pricing_notes.length) {
      toast(`We requoted at today's rate: ${created.pricing_notes.join(" ")}`);
    }
    if (created.duplicate) {
      // Server returned a duplicate marker — the original order already
      // exists. Don't insert the half-empty stub object; just show the
      // confirmation toast and skip ahead to the confirmation screen
      // using whatever order data we already have locally.
      toast("This order was already submitted — opening your confirmation.");
      const existing = state.orders.find((o) => o.id === placedOrder.id) || placedOrder;
      form.reset();
      delete form.dataset.idempotencyKey;
      renderAll();
      showOrderConfirmation(existing);
      return;
    }

    // ID-dedupe on insert. Refresh races or replay loops can result in
    // an order with this id already being in state.orders — update in
    // place instead of pushing a second row.
    const existingIndex = state.orders.findIndex((o) => o.id === placedOrder.id);
    if (existingIndex >= 0) state.orders[existingIndex] = placedOrder;
    else state.orders.unshift(placedOrder);
    state.cart = [];
    saveCart();
    rememberCustomerProfile({
      customer_phone: canon,
      customer_name: data.customer_name,
      customer_email: data.customer_email,
      city: data.city,
      address: data.address,
      // The "sender account title" they used last time — saves them
      // re-typing the bank name on every order.
      transfer_reference: data.transfer_reference || "",
    });
    // Remember the last phone used so we can prefill on next visit even
    // before they re-type it. Recall flow on phone blur handles the rest.
    try { localStorage.setItem("gb_last_phone", canon); } catch {}
    form.reset();
    delete form.dataset.idempotencyKey;
    renderAll();
    // Replace the toast-only success with a full confirmation screen.
    showOrderConfirmation(placedOrder);
  } catch (err) {
    const isTimeout = err?.message === "timeout";
    showSubmitFailureFallback({
      isTimeout,
      cart: cartLines(),
      customer: data,
    });
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = submitBtn.dataset.originalLabel || "Place order";
    }
  }
}

// Full-screen confirmation modal after a successful order POST. Replaces the
// previous "tiny toast then redirect to /track" pattern, which gave the
// customer no proof of submission they could screenshot.
function showOrderConfirmation(order) {
  const phone = canonPhone(order.customer_phone);
  const waNum = canonPhone(state.settings?.support_whatsapp || "");
  const shareMsg = `Hi Global Bestie, my order is ${order.id}. Looking forward to confirming details.`;
  const waHref = waNum ? `https://wa.me/${waNum}?text=${encodeURIComponent(shareMsg)}` : "";
  const items = (order.items || []).map((it) => `<li><strong>${esc(it.title)}</strong>${it.variant ? ` — ${esc(it.variant)}` : ""} <small>× ${it.quantity}</small></li>`).join("");
  const advance = Number(order.advance_due_pkr || 0);
  const balance = Number(order.balance_due_pkr || 0);
  openModal(`
    <div class="order-confirmation">
      <div class="confirmation-headline">
        <svg viewBox="0 0 24 24" class="confirmation-check" aria-hidden="true">
          <circle cx="12" cy="12" r="11" fill="none" stroke="currentColor" stroke-width="1.4"/>
          <path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <p class="kicker">Order received</p>
        <h2>${esc(order.id)}</h2>
        <p class="confirmation-sub">We've got your order. The team will confirm shipment batch and availability on WhatsApp within ~15 minutes.</p>
      </div>
      <div class="confirmation-grid">
        <article>
          <span>Customer</span>
          <strong>${esc(order.customer_name || "")}</strong>
          <small>${esc(formatPkDisplay(phone))}</small>
        </article>
        <article>
          <span>Advance due now</span>
          <strong>${PKR.format(advance)}</strong>
          ${balance > 0 ? `<small>Balance ${PKR.format(balance)} on PK arrival</small>` : "<small>Pay in full after confirmation</small>"}
        </article>
        <article>
          <span>ETA</span>
          <strong>${esc(order.eta || "Confirmed on WhatsApp")}</strong>
        </article>
      </div>
      <ul class="confirmation-items">${items}</ul>
      <div class="confirmation-actions">
        ${waHref ? `<a class="button primary wide" href="${waHref}" target="_blank" rel="noreferrer">Continue on WhatsApp</a>` : ""}
        <button class="button secondary" type="button" data-action="track-this-order" data-order-id="${attr(order.id)}">View tracking</button>
        <button class="button secondary" type="button" data-action="close-modal">Close</button>
      </div>
      <p class="confirmation-helper">Screenshot this confirmation — your order ID is your reference for any future questions.</p>
    </div>
  `);
}

// Shown when the POST times out or fails. Doesn't claim success; lets the
// customer either retry or send their order to WhatsApp as plain text so the
// team can manually re-key it.
function showSubmitFailureFallback({ isTimeout, cart, customer }) {
  const waNum = canonPhone(state.settings?.support_whatsapp || "");
  const lines = cart.map((line) => `• ${line.product.title}${line.variant ? ` (${line.variant})` : ""} × ${line.quantity}`).join("\n");
  const total = cart.reduce((sum, line) => sum + line.subtotal, 0);
  const waText = `Hi Global Bestie, I tried to place an order but had a connection issue. Please book it for me:

Name: ${customer.customer_name}
Phone: ${customer.customer_phone}
City: ${customer.city}
Address: ${customer.address}

Items:
${lines}

Estimated total: Rs ${total.toLocaleString()}`;
  const waHref = waNum ? `https://wa.me/${waNum}?text=${encodeURIComponent(waText)}` : "";
  openModal(`
    <div class="submit-failure">
      <p class="kicker">${isTimeout ? "Took too long" : "Connection issue"}</p>
      <h2>We're not sure if your order saved.</h2>
      <p>Rather than risk a duplicate, please ${waHref ? "send your order to us on WhatsApp" : "try again in a moment"}. We'll book it manually within 15 minutes — same prices, same shipment batch.</p>
      <div class="confirmation-actions">
        ${waHref ? `<a class="button primary wide" href="${waHref}" target="_blank" rel="noreferrer">Send via WhatsApp</a>` : ""}
        <button class="button secondary" type="button" data-action="close-modal">Try again</button>
      </div>
    </div>
  `);
}

// Customer profile recall — keyed by normalized phone digits. Stored locally
// only; we never sync this anywhere. Used purely to skip retyping name + city
// + address on repeat checkouts.
const CUSTOMER_PROFILE_KEY = "gb_customer_profiles";

// === Phone canonicalization ===
// Mirrors netlify/functions/_shared/phone.js exactly. Canonical form is
// E.164-without-plus: a PK mobile becomes `923xxxxxxxxx`. Every place we
// reference a customer (localStorage key, server lookup, WhatsApp link)
// uses this form so customer identity stays stable across formats.
function canonPhone(raw) {
  let d = String(raw || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0")) d = "92" + d.slice(1);
  if (d.length === 10 && d.startsWith("3")) d = "92" + d;
  return d;
}

function isValidPkMobile(canon) {
  return /^923\d{9}$/.test(canon);
}

function validateAndCanon(raw) {
  const c = canonPhone(raw);
  return isValidPkMobile(c) ? c : null;
}

function formatPkDisplay(canon) {
  if (!isValidPkMobile(canon)) return canon || "";
  return `+92 ${canon.slice(2, 5)} ${canon.slice(5)}`;
}

// Legacy alias — older code paths still call this. Now returns the canon form
// so localStorage keys and existing call sites converge automatically.
function normalizePhone(p) {
  return canonPhone(p) || String(p || "").replace(/\D/g, "");
}

function rememberCustomerProfile(profile) {
  const key = normalizePhone(profile.customer_phone);
  if (!key || key.length < 7) return;
  try {
    const store = JSON.parse(localStorage.getItem(CUSTOMER_PROFILE_KEY) || "{}");
    store[key] = {
      customer_name: profile.customer_name || store[key]?.customer_name || "",
      customer_email: profile.customer_email || store[key]?.customer_email || "",
      city: profile.city || store[key]?.city || "",
      address: profile.address || store[key]?.address || "",
      // Save the bank-account name they typed last so the transfer-reference
      // field can prefill it on their next order. We don't store the
      // transaction ID itself (always unique per transfer).
      transfer_reference: profile.transfer_reference || store[key]?.transfer_reference || "",
      saved_at: new Date().toISOString(),
    };
    localStorage.setItem(CUSTOMER_PROFILE_KEY, JSON.stringify(store));
  } catch {
    // Storage quota / private mode — silently ignore.
  }
}

function recallCustomerProfile(phone) {
  const key = normalizePhone(phone);
  if (!key || key.length < 7) return null;
  try {
    const store = JSON.parse(localStorage.getItem(CUSTOMER_PROFILE_KEY) || "{}");
    return store[key] || null;
  } catch {
    return null;
  }
}

// Customer-detail modal — the panel you land on from cmd-K, the repeat-
// customer banner, or any future "open customer" link. Shows lifetime
// summary, all orders, tags, notes, and a quick WA-templates jump for any
// order. Read-only for now; mutations land in a follow-up if we want to
// edit tags/notes inline.
// Saves tag/notes changes back to the server. Debounced so a noisy typer
// produces one PATCH at the end, not 60. Also patches state.customers in
// place so subsequent renders show the new values instantly.
const customerSaveTimers = new Map();
async function patchCustomer(canon, updates, { silent } = {}) {
  if (!canon) return;
  const local = (state.customers || []).find((c) => c.phone === canon);
  if (local) Object.assign(local, updates);
  try {
    await apiFetch(`/api/admin/customers?phone=${encodeURIComponent(canon)}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    }, { ok: true });
    if (!silent) {
      const status = qs("[data-notes-status]");
      if (status) {
        status.textContent = "Saved";
        status.classList.add("ok");
        clearTimeout(customerSaveTimers.get(`${canon}:status`));
        customerSaveTimers.set(`${canon}:status`, setTimeout(() => {
          status.textContent = "";
          status.classList.remove("ok");
        }, 1400));
      }
    }
  } catch {
    if (!silent) toast("Couldn't save — check connection.");
  }
}

// Wire the message-filter chips inside the customer modal. Re-renders just
// the history section instead of the whole modal so the customer never sees
// a full reflow when toggling.
function bindMessageFilterChips() {
  const wrap = qs(".msg-filter-chips");
  if (!wrap) return;
  wrap.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-msg-filter]");
    if (!btn) return;
    state.messageFilter = btn.dataset.msgFilter || "all";
    const section = qs("[data-message-history]");
    if (!section) return;
    section.outerHTML = renderCustomerMessageHistory(btn.dataset.customerPhone);
    bindMessageFilterChips();
  });
}

function bindCustomerEditors() {
  // Notes — debounced save 700 ms after the last keystroke
  const notes = qs("[data-customer-notes]");
  if (notes) {
    const phone = notes.dataset.customerPhone;
    const input = notes.querySelector("[data-notes-input]");
    const status = notes.querySelector("[data-notes-status]");
    input?.addEventListener("input", () => {
      if (status) { status.textContent = "Saving…"; status.classList.remove("ok"); }
      clearTimeout(customerSaveTimers.get(phone));
      customerSaveTimers.set(phone, setTimeout(() => {
        patchCustomer(phone, { notes: input.value });
      }, 700));
    });
  }

  // Tag chips — remove on × click, add on Enter / comma in the inline input
  const tagsEl = qs("[data-customer-tags-editor]");
  if (tagsEl) {
    const phone = tagsEl.dataset.customerPhone;
    const refresh = () => {
      const customer = (state.customers || []).find((c) => c.phone === phone) || {};
      const current = (customer.tags || []).filter(Boolean);
      const wrap = tagsEl.querySelector("[data-customer-tags]");
      wrap.innerHTML = (current.length
        ? current.map((t) => `<span class="tag-chip">${esc(t)}<button type="button" data-remove-tag="${attr(t)}" aria-label="Remove ${attr(t)} tag">×</button></span>`).join("")
        : `<span class="customer-tags-empty">No tags yet — try "Karachi top", "Coach fan", "slow payer"</span>`
      ) + `<input type="text" class="tag-add-input" data-add-tag placeholder="+ add tag" aria-label="Add a tag" />`;
      // Re-bind the freshly inserted input
      bindTagInput();
    };
    const bindTagInput = () => {
      const addInput = tagsEl.querySelector("[data-add-tag]");
      addInput?.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === ",") {
          e.preventDefault();
          const tag = addInput.value.trim().replace(/,$/, "");
          if (!tag) return;
          const customer = (state.customers || []).find((c) => c.phone === phone) || { tags: [] };
          const next = [...new Set([...(customer.tags || []), tag])];
          patchCustomer(phone, { tags: next });
          addInput.value = "";
          refresh();
        }
      });
    };
    bindTagInput();
    tagsEl.addEventListener("click", (e) => {
      const removeBtn = e.target.closest("[data-remove-tag]");
      if (!removeBtn) return;
      const tag = removeBtn.dataset.removeTag;
      const customer = (state.customers || []).find((c) => c.phone === phone) || { tags: [] };
      const next = (customer.tags || []).filter((t) => t !== tag);
      patchCustomer(phone, { tags: next });
      refresh();
    });
  }
}

// All tags currently in use across every customer. Sorted by frequency
// (most-used first) so the most common tags surface in the datalist
// autocomplete before the long-tail entries.
// Stable 2-letter monogram + pastel background derived from the phone hash.
// Same phone → same color forever, so the team learns to recognize each
// regular customer at a glance. The 8 base hues are all on the pink-rose-
// peach side of the palette so they stay on-brand.
const AVATAR_HUES = [340, 350, 18, 30, 322, 305, 5, 350];

function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function customerAvatarHtml(customer, { size } = { size: "md" }) {
  const name = customer?.name || "";
  const initials = name
    ? name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase()
    : "·";
  const hue = AVATAR_HUES[hashCode(customer?.phone || "x") % AVATAR_HUES.length];
  const bg = `hsl(${hue}, 64%, 78%)`;
  const fg = `hsl(${hue}, 70%, 18%)`;
  return `<span class="customer-avatar avatar-${size}" style="background:${bg};color:${fg}" aria-hidden="true">${esc(initials || "·")}</span>`;
}

// ═════════════════════ CUSTOMERS TAB ═════════════════════
// Renders the dedicated customer 360 panel: KPI strip, filter bar, sortable
// table. Filter state lives on state.customerFilters so the "Broadcast to
// current view" action can read the same filter without re-asking.

function customerKpis() {
  const list = state.customers || [];
  const total = list.length;
  const totalRevenue = list.reduce((s, c) => s + Number(c.total_revenue_pkr || 0), 0);
  const ninetyDaysAgo = Date.now() - 90 * 86_400_000;
  const active90 = list.filter((c) => new Date(c.last_seen || 0).getTime() >= ninetyDaysAgo).length;
  const repeatCount = list.filter((c) => Number(c.total_orders || 0) >= 2).length;
  const avgLtv = total ? Math.round(totalRevenue / total) : 0;
  return [
    { label: "Total customers", value: total.toLocaleString(), sub: `${repeatCount} repeat buyers` },
    { label: "Active (90 days)", value: active90.toLocaleString(), sub: `${total ? Math.round((active90 / total) * 100) : 0}% of book` },
    { label: "Lifetime revenue", value: PKR.format(totalRevenue), sub: `Avg LTV ${PKR.format(avgLtv)}` },
    { label: "WA opt-in", value: `${list.filter((c) => c.whatsapp_opt_in !== false).length}/${total}`, sub: "Eligible to broadcast" },
  ];
}

// Previous KPI numeric values keyed by slot+label. Lets us count up from
// the last render's value to the new one instead of snapping.
const _kpiPreviousValues = new Map();

// Short-format helper. 247000 → "247K", 1_200_000 → "1.2M".
// `prefix` lets callers prepend "Rs " / "$" without re-formatting.
function shortNum(n, prefix = "") {
  const v = Number(n || 0);
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${prefix}${(v / 1_000_000).toFixed(v % 1_000_000 ? 1 : 0)}M`;
  if (abs >= 1_000)     return `${prefix}${(v / 1_000).toFixed(v % 1_000 >= 100 ? 1 : 0)}K`;
  return `${prefix}${Math.round(v)}`;
}

function shortPkr(n) { return shortNum(n, "Rs "); }

// Tiny inline-SVG sparkline. Takes a series of numbers, returns an SVG
// string. 60×18px by default — sits next to the KPI label without taking
// over the card. Auto-scales to the data; flat zero data hides the line.
function kpiSparkline(values, { width = 60, height = 18, color = "var(--pink-2)" } = {}) {
  if (!Array.isArray(values) || values.length < 2) return "";
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const step = width / (values.length - 1);
  const points = values.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  // Final dot at the latest value so the eye lands at the right edge.
  const lastX = width;
  const lastY = height - ((values[values.length - 1] - min) / range) * height;
  return `<svg class="kpi-sparkline" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true">
    <polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" />
    <circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="2" fill="${color}" />
  </svg>`;
}

// Count-up animation. Takes a DOM element, animates its textContent from
// `from` to `to` over `duration` ms using the supplied formatter to render
// each frame. rAF-driven, easeOutCubic. Honors prefers-reduced-motion by
// snapping instantly.
function animateCountUp(el, from, to, duration = 700, formatter = (n) => String(Math.round(n))) {
  if (!el) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || from === to) {
    el.textContent = formatter(to);
    return;
  }
  const start = performance.now();
  const ease = (t) => 1 - Math.pow(1 - t, 3); // easeOutCubic
  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const val = from + (to - from) * ease(t);
    el.textContent = formatter(val);
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// Returns a daily-bucketed series of length `days+1` (last `days` plus today)
// using `accessor` to extract the value from each order (or 1 for count).
// Used to feed sparklines + 7-day trend comparisons.
function dailySeries(orders, days, accessor = () => 1) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const buckets = new Array(days + 1).fill(0);
  for (const o of orders) {
    const t = new Date(o.created_at || 0).getTime();
    if (!Number.isFinite(t)) continue;
    const diffDays = Math.floor((today.getTime() - t) / 86_400_000);
    if (diffDays >= 0 && diffDays <= days) {
      buckets[days - diffDays] += Number(accessor(o)) || 0;
    }
  }
  return buckets;
}

// 7-day vs prior-7-day trend %. Capped at ±999 to keep the chip readable
// when prior was 0.
function trend7d(currentSeries) {
  if (!Array.isArray(currentSeries) || currentSeries.length < 14) return null;
  const recent = currentSeries.slice(-7).reduce((s, v) => s + v, 0);
  const prior = currentSeries.slice(-14, -7).reduce((s, v) => s + v, 0);
  if (!prior) return recent ? 100 : 0;
  return Math.max(-999, Math.min(999, Math.round(((recent - prior) / prior) * 100)));
}

function renderKpiHero(slot, kpis, options = {}) {
  const el = qs(slot);
  if (!el) return;
  // First render of this slot since pageload? If so, do NOT animate from 0
  // (looks like every counter rolled up from a cold start). Snap instead.
  const slotKey = `${slot}:firstRender`;
  const firstRender = !_kpiPreviousValues.has(slotKey);
  _kpiPreviousValues.set(slotKey, true);

  el.innerHTML = kpis.map((k, i) => {
    let trendChip = "";
    if (k.trend && typeof k.trend.value === "number") {
      const v = k.trend.value;
      const positive = (k.trend.invert ? v < 0 : v > 0);
      const arrow = v > 0 ? "↑" : v < 0 ? "↓" : "·";
      const tone = v === 0 ? "info" : positive ? "ok" : "warn";
      trendChip = `<span class="kpi-trend tone-${tone}" title="${attr(k.trend.title || "vs previous period")}">${arrow} ${Math.abs(v)}${k.trend.unit || "%"}</span>`;
    }
    const sparkline = (k.sparkline && k.sparkline.length >= 2)
      ? kpiSparkline(k.sparkline)
      : "";
    // The displayed value — if numeric is supplied we'll animate to it
    // (and overwrite the data-target attribute below). Otherwise the
    // value string renders directly.
    const valueAttr = (typeof k.numeric === "number")
      ? ` data-kpi-target="${k.numeric}" data-kpi-format="${attr(k.format || "raw")}"`
      : "";
    return `
    <article class="kpi-card${k.tone ? ` tone-${k.tone}` : ""}${k.action ? " kpi-action" : ""}"
             data-kpi-key="${attr(slot + ":" + i + ":" + (k.key || k.label))}"
             ${k.action ? `data-action="${attr(k.action)}"${k.actionFilter ? ` data-action-filter="${attr(k.actionFilter)}"` : ""}` : ""}>
      <div class="kpi-card-top">
        <span class="kpi-label">${esc(k.label)}</span>
        ${sparkline}
      </div>
      <div class="kpi-value-row">
        <strong class="kpi-value"${valueAttr}>${esc(String(k.value))}</strong>
        ${trendChip}
      </div>
      ${k.sub ? `<small class="kpi-sub">${esc(k.sub)}</small>` : ""}
    </article>
  `;
  }).join("");

  // Count-up pass: walk every .kpi-value with a data-kpi-target and animate
  // from the previously-stored numeric to the new one.
  if (!firstRender) {
    el.querySelectorAll(".kpi-value[data-kpi-target]").forEach((node) => {
      const card = node.closest(".kpi-card");
      const key = card?.dataset.kpiKey;
      if (!key) return;
      const to = Number(node.dataset.kpiTarget);
      const from = _kpiPreviousValues.get(key);
      const fmt = node.dataset.kpiFormat;
      const formatter = (n) =>
        fmt === "pkr" ? PKR.format(Math.round(n)) :
        fmt === "short-pkr" ? shortPkr(n) :
        fmt === "usd" ? USD.format(Math.round(n)) :
        String(Math.round(n));
      if (typeof from === "number" && from !== to) {
        animateCountUp(node, from, to, 700, formatter);
      }
      _kpiPreviousValues.set(key, to);
    });
  } else {
    // First render — just remember the values, don't animate.
    el.querySelectorAll(".kpi-value[data-kpi-target]").forEach((node) => {
      const card = node.closest(".kpi-card");
      const key = card?.dataset.kpiKey;
      if (key) _kpiPreviousValues.set(key, Number(node.dataset.kpiTarget));
    });
  }
}

// Render the segment chip bar above the Customers filter. Pinned segments
// sort first; the unpinned tail is alphabetised. Each chip is clickable to
// apply, with a hidden delete button revealed on hover.
// ═════════════════ SAVED ORDERS VIEWS ═════════════════
function renderOrderViewsChips() {
  const chips = qs("[data-order-views-chips]");
  if (!chips) return;
  const views = (state.orderViews || []).slice().sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return b.pinned ? 1 : -1;
    return (a.name || "").localeCompare(b.name || "");
  });
  if (!views.length) {
    chips.innerHTML = `<span class="segment-empty">No saved views. Set filters, then "Save current view".</span>`;
    return;
  }
  chips.innerHTML = views.map((v) => {
    const n = countMatchingOrders(v.filters || {});
    return `
      <span class="segment-chip${v.pinned ? " pinned" : ""}">
        <button type="button" data-action="apply-order-view" data-view-id="${attr(v.id)}">
          ${v.pinned ? "★ " : ""}${esc(v.name)}
          <span class="segment-count">${n}</span>
        </button>
        <button type="button" class="segment-chip-delete" data-action="delete-order-view" data-view-id="${attr(v.id)}" aria-label="Delete ${attr(v.name)}">×</button>
      </span>
    `;
  }).join("");
}

// Counts how many orders match a saved-view filter. Reused by the chip
// count badges so the operator knows the size before applying.
function countMatchingOrders(f = {}) {
  return (state.orders || []).filter((o) => {
    if (f.status && o.status !== f.status) return false;
    if (f.batch && f.batch !== "all") {
      const ob = shipmentBatchForOrder(o);
      if (f.batch === "__none__" && ob) return false;
      if (f.batch !== "__none__" && (!ob || ob.id !== f.batch)) return false;
    }
    if (f.search) {
      const hay = [o.id, o.customer_name, o.customer_phone].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(String(f.search).toLowerCase())) return false;
    }
    if (f.dateRange && f.dateRange !== "all") {
      const ts = new Date(o.created_at || 0).getTime();
      const now = Date.now();
      let fromTime = -Infinity, toTime = Infinity;
      if (f.dateRange === "7") fromTime = now - 7 * 86_400_000;
      else if (f.dateRange === "30") fromTime = now - 30 * 86_400_000;
      else if (f.dateRange === "90") fromTime = now - 90 * 86_400_000;
      else if (f.dateRange === "month") { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(1); fromTime = d.getTime(); }
      else if (f.dateRange === "prev_month") {
        const d = new Date(); const start = new Date(d.getFullYear(), d.getMonth() - 1, 1);
        const end = new Date(d.getFullYear(), d.getMonth(), 1);
        fromTime = start.getTime(); toTime = end.getTime();
      } else if (f.dateRange === "custom") {
        if (f.customStart) fromTime = new Date(f.customStart).getTime();
        if (f.customEnd) toTime = new Date(`${f.customEnd}T23:59:59`).getTime();
      }
      if (Number.isNaN(ts) || ts < fromTime || ts > toTime) return false;
    }
    return true;
  }).length;
}

function applyOrderView(view) {
  const f = view.filters || {};
  const statusSel = qs("[data-admin-order-filter]");
  if (statusSel) statusSel.value = f.status || "all";
  const batchSel = qs("[data-orders-batch]");
  if (batchSel) batchSel.value = f.batch || "all";
  const dateSel = qs("[data-orders-date]");
  if (dateSel) dateSel.value = f.dateRange || "all";
  const startEl = qs("[data-orders-start]");
  if (startEl) startEl.value = f.customStart || "";
  const endEl = qs("[data-orders-end]");
  if (endEl) endEl.value = f.customEnd || "";
  const searchEl = qs("[data-orders-search]");
  if (searchEl) searchEl.value = f.search || "";
  state.adminFilters = state.adminFilters || {};
  state.adminFilters.slaOnly = !!f.slaOnly;
  renderAdminOrders();
  toast(`Applied view: ${view.name}`);
}

function openOrderViewSaveModal() {
  const f = state.orderFilters || {};
  const status = qs("[data-admin-order-filter]")?.value || "all";
  const summary = [
    status && status !== "all" ? `Status: ${status}` : "",
    f.batch && f.batch !== "all" ? `Batch: ${f.batch}` : "",
    f.dateRange && f.dateRange !== "all" ? `Range: ${f.dateRange}` : "",
    f.search ? `Search: "${f.search}"` : "",
  ].filter(Boolean).join(" · ") || "All orders";
  openModal(`
    <div class="segment-save-modal">
      <p class="kicker">Save view</p>
      <h2>Name this orders view</h2>
      <p class="confirmation-sub">${esc(summary)}</p>
      <label class="span-2">
        <span>View name</span>
        <input type="text" data-order-view-name placeholder="Pending this week · Balance due Karachi · …" autofocus />
      </label>
      <label class="check-row">
        <input type="checkbox" data-order-view-pinned />
        <span>Pin to the top of the saved-views bar</span>
      </label>
      <div class="confirmation-actions">
        <button class="button primary" type="button" data-action="order-view-save-submit">Save</button>
        <button class="button secondary" type="button" data-action="close-modal">Cancel</button>
      </div>
    </div>
  `);
}

async function saveCurrentOrderView() {
  const name = qs("[data-order-view-name]")?.value.trim();
  const pinned = !!qs("[data-order-view-pinned]")?.checked;
  if (!name) { toast("Name required."); return; }
  const filters = {
    status: qs("[data-admin-order-filter]")?.value || "all",
    batch: qs("[data-orders-batch]")?.value || "all",
    dateRange: qs("[data-orders-date]")?.value || "all",
    customStart: qs("[data-orders-start]")?.value || "",
    customEnd: qs("[data-orders-end]")?.value || "",
    search: qs("[data-orders-search]")?.value || "",
  };
  try {
    const result = await apiFetch("/api/admin/order-views", {
      method: "POST",
      body: JSON.stringify({ name, filters, pinned }),
    }, { ok: true, view: { id: `local-${Date.now()}`, name, filters, pinned } });
    state.orderViews = [result.view, ...((state.orderViews || []).filter((v) => v.id !== result.view.id))];
    closeModal();
    renderOrderViewsChips();
    toast(`Saved view: ${name}`);
  } catch {
    toast("Couldn't save view — try again.");
  }
}

async function deleteOrderView(id) {
  try {
    await apiFetch(`/api/admin/order-views?id=${encodeURIComponent(id)}`, { method: "DELETE" }, { ok: true });
    state.orderViews = (state.orderViews || []).filter((v) => v.id !== id);
    renderOrderViewsChips();
    toast("View deleted.");
  } catch {
    toast("Couldn't delete — try again.");
  }
}

function renderSegmentChips() {
  const chips = qs("[data-segment-chips]");
  if (!chips) return;
  const segments = (state.smartSegments || []).slice().sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return b.pinned ? 1 : -1;
    return (a.name || "").localeCompare(b.name || "");
  });
  if (!segments.length) {
    chips.innerHTML = `<span class="segment-empty">No saved segments yet. Use the filters and hit "Save current view".</span>`;
    return;
  }
  chips.innerHTML = segments.map((s) => {
    const n = countMatchingCustomers(s.filters || {});
    return `
    <span class="segment-chip${s.pinned ? " pinned" : ""}">
      <button type="button" data-action="apply-segment" data-segment-id="${attr(s.id)}">
        ${s.pinned ? "★ " : ""}${esc(s.name)}
        <span class="segment-count">${n}</span>
      </button>
      <button type="button" class="segment-chip-delete" data-action="delete-segment" data-segment-id="${attr(s.id)}" aria-label="Delete ${attr(s.name)}">×</button>
    </span>
  `;
  }).join("");
}

function applySegment(segment) {
  const f = segment.filters || {};
  state.customerFilters = {
    search: "",
    city: f.city || "all",
    sort: state.customerFilters?.sort || "revenue",
  };
  // Mirror the filter into the form inputs so the operator sees what was applied.
  const c = qs("[data-customer-city]");
  if (c) c.value = f.city || "all";
  const s = qs("[data-customer-search]");
  if (s) s.value = "";
  renderCustomersTab();
  // Mirror into broadcast form too so a follow-up broadcast picks up the segment.
  const bForm = qs("[data-broadcast-form]");
  if (bForm) {
    ["city", "tag", "last_order_days", "min_orders", "min_revenue"].forEach((k) => {
      if (bForm.elements[k]) bForm.elements[k].value = f[k] || "";
    });
    if (qs("[data-admin-panel='growth']")?.classList.contains("active")) previewBroadcastCount();
  }
  toast(`Applied segment: ${segment.name} · ${countMatchingCustomers(f)} customers`);
}

function openSegmentSaveModal() {
  const f = state.customerFilters || {};
  const summary = [
    f.city && f.city !== "all" ? `City: ${f.city}` : "",
    f.tier && f.tier !== "all" ? `Tier: ${f.tier}` : "",
    f.search ? `Search: "${f.search}"` : "",
  ].filter(Boolean).join(" · ") || "All customers";
  openModal(`
    <div class="segment-save-modal">
      <p class="kicker">Save segment</p>
      <h2>Name this view</h2>
      <p class="confirmation-sub">${esc(summary)}</p>
      <label class="span-2">
        <span>Segment name</span>
        <input type="text" data-segment-name placeholder="Top customers in Karachi · Coach fans · Win-back targets" autofocus />
      </label>
      <label class="check-row">
        <input type="checkbox" data-segment-pinned />
        <span>Pin to the top of the segment bar</span>
      </label>
      <div class="confirmation-actions">
        <button class="button primary" type="button" data-action="segment-save-submit">Save</button>
        <button class="button secondary" type="button" data-action="close-modal">Cancel</button>
      </div>
    </div>
  `);
}

async function saveCurrentSegment() {
  const name = qs("[data-segment-name]")?.value.trim();
  const pinned = !!qs("[data-segment-pinned]")?.checked;
  if (!name) { toast("Name required."); return; }
  const f = state.customerFilters || {};
  const filters = {};
  if (f.city && f.city !== "all") filters.city = f.city;
  try {
    const result = await apiFetch("/api/admin/segments", {
      method: "POST",
      body: JSON.stringify({ name, filters, pinned }),
    }, { ok: true, segment: { id: `local-${Date.now()}`, name, filters, pinned } });
    state.smartSegments = [result.segment, ...((state.smartSegments || []).filter((s) => s.id !== result.segment.id))];
    closeModal();
    renderSegmentChips();
    toast(`Saved segment: ${name}`);
  } catch {
    toast("Couldn't save segment — try again.");
  }
}

async function deleteSegment(id) {
  try {
    await apiFetch(`/api/admin/segments?id=${encodeURIComponent(id)}`, { method: "DELETE" }, { ok: true });
    state.smartSegments = (state.smartSegments || []).filter((s) => s.id !== id);
    renderSegmentChips();
    toast("Segment deleted.");
  } catch {
    toast("Couldn't delete — try again.");
  }
}

// Toggle the visibility of optional customer columns in the table header
// based on state.customerColumns. The rows themselves already check the
// same flags, so the header just needs to mirror them.
function applyCustomerColumns() {
  const cols = state.customerColumns || {};
  qsa("[data-col-key]").forEach((th) => {
    const key = th.dataset.colKey;
    th.hidden = !cols[key];
  });
}

function openCustomerColumnsModal() {
  const cols = state.customerColumns || {};
  const optionalKeys = [
    { key: "trend", label: "Trend (6 mo sparkline)" },
    { key: "last_wa", label: "Last WhatsApp sent" },
  ];
  openModal(`
    <div class="segment-save-modal">
      <p class="kicker">Customers · Columns</p>
      <h2>Show / hide columns</h2>
      <p class="confirmation-sub">Hide columns you don't use day-to-day to keep the table scannable. Customer name, phone, city, orders, lifetime spend, and last seen are always visible.</p>
      ${optionalKeys.map((c) => `
        <label class="check-row">
          <input type="checkbox" data-action="toggle-customer-col" data-col-key="${attr(c.key)}" ${cols[c.key] ? "checked" : ""} />
          <span>${esc(c.label)}</span>
        </label>
      `).join("")}
      <div class="confirmation-actions">
        <button class="button primary" type="button" data-action="close-modal">Done</button>
      </div>
    </div>
  `);
}

function renderCustomersTab() {
  if (!has("[data-admin-panel=\"customers\"]")) return;
  renderSegmentChips();
  renderRiskAuditBanner();
  applyCustomerColumns();
  renderKpiHero("[data-customers-kpis]", customerKpis());

  // City <select> — populated from the union of every customer's city
  const citySelect = qs("[data-customer-city]");
  if (citySelect) {
    const seen = new Set();
    const cities = (state.customers || []).map((c) => c.city).filter((v) => {
      if (!v) return false;
      const k = v.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).sort();
    const current = citySelect.value || "all";
    citySelect.innerHTML = `<option value="all">All cities</option>` + cities.map((c) => `<option value="${attr(c)}">${esc(c)}</option>`).join("");
    citySelect.value = cities.includes(current) ? current : "all";
  }

  const f = state.customerFilters || {};
  const search = (f.search || "").toLowerCase();
  const city = f.city || "all";
  const sort = f.sort || "revenue";

  const riskOnly = !!f.riskOnly;
  let list = (state.customers || []).filter((c) => {
    if (riskOnly && !c.risk_flag) return false;
    if (city !== "all" && (c.city || "").toLowerCase() !== city.toLowerCase()) return false;
    if (search) {
      const hay = [c.name, c.phone, c.city, c.email, ...(c.tags || [])].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });
  list.sort((a, b) => {
    if (sort === "orders") return Number(b.total_orders || 0) - Number(a.total_orders || 0);
    if (sort === "recent") return new Date(b.last_seen || 0) - new Date(a.last_seen || 0);
    if (sort === "dormant") return new Date(a.last_seen || 0) - new Date(b.last_seen || 0);
    if (sort === "name") return (a.name || "").localeCompare(b.name || "");
    return Number(b.total_revenue_pkr || 0) - Number(a.total_revenue_pkr || 0);
  });

  const countChip = qs("[data-customer-count-chip]");
  if (countChip) countChip.textContent = `${list.length} of ${(state.customers || []).length}`;

  // Pre-bucket every customer's orders by month so the per-row sparkline is
  // a single sweep across state.orders rather than N×M per render.
  const monthBuckets = new Map();
  const now = new Date();
  for (const o of state.orders || []) {
    const phone = canonPhone(o.customer_phone);
    if (!phone) continue;
    const d = new Date(o.created_at || 0);
    if (Number.isNaN(d.getTime())) continue;
    const diffMo = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
    if (diffMo < 0 || diffMo > 5) continue;
    const bucketIndex = 5 - diffMo; // 0=oldest, 5=current
    const arr = monthBuckets.get(phone) || new Array(6).fill(0);
    arr[bucketIndex] += Number(o.total_pkr || 0);
    monthBuckets.set(phone, arr);
  }

  setHTML("[data-customers-rows]", list.length ? list.map((c) => {
    const avatar = customerAvatarHtml(c, { size: "sm" });
    const lastWa = c.last_outbound_at ? relativeTime(c.last_outbound_at) : "—";
    const riskDot = c.risk_flag ? `<span class="risk-dot" title="${attr(c.risk_reason || "Auto-flagged risk")}">●</span>` : "";
    const cols = state.customerColumns || {};
    return `
      <tr class="customer-row${c.risk_flag ? " is-risky" : ""}" data-action="open-customer" data-customer-phone="${attr(c.phone)}" tabindex="0">
        <td>
          <div class="customer-cell-name">${avatar}<div><strong>${riskDot}${esc(c.name || "Unnamed")}</strong>${c.tags?.length ? `<br><small>${c.tags.slice(0, 3).map((t) => esc(t)).join(" · ")}</small>` : ""}</div></div>
        </td>
        <td><small class="phone-display">${esc(formatPkDisplay(c.phone) || c.phone || "")}</small></td>
        <td>${esc(c.city || "—")}</td>
        <td>${Number(c.total_orders || 0)}</td>
        <td><strong>${PKR.format(Number(c.total_revenue_pkr || 0))}</strong></td>
        ${cols.trend ? `<td>${rowSparkline(monthBuckets.get(c.phone))}</td>` : ""}
        <td><small>${esc(c.last_seen ? relativeTime(c.last_seen) : "—")}</small></td>
        ${cols.last_wa ? `<td><small>${esc(lastWa)}</small></td>` : ""}
        <td class="customer-row-actions">
          <button class="button secondary" type="button" data-action="open-customer" data-customer-phone="${attr(c.phone)}" data-stop-row>Open</button>
        </td>
      </tr>
    `;
  }).join("") : `<tr><td colspan="9"><p class="cashflow-empty">No customers match these filters.</p></td></tr>`);
}

function allKnownTags() {
  const counts = new Map();
  for (const c of state.customers || []) {
    for (const t of (c.tags || [])) {
      if (!t) continue;
      counts.set(t, (counts.get(t) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([t]) => t);
}

function showCustomerDetails(phone) {
  const canon = canonPhone(phone);
  const customer = (state.customers || []).find((c) => c.phone === canon);
  const orders = (state.orders || [])
    .filter((o) => canonPhone(o.customer_phone) === canon)
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  // Derived stats from orders when the customers row hasn't been backfilled
  // yet (migration window).
  const totalOrders = customer?.total_orders ?? orders.length;
  const totalRevenue = customer?.total_revenue_pkr ?? orders.reduce((s, o) => s + Number(o.total_pkr || 0), 0);
  const firstSeen = customer?.first_seen || orders[orders.length - 1]?.created_at;
  const lastSeen = customer?.last_seen || orders[0]?.created_at;
  const tags = (customer?.tags || []).filter(Boolean);

  const orderRows = orders.length ? orders.map((o) => {
    const stage = (o.status || "").replaceAll("_", " ");
    const payment = paymentLabel(o.payment_status);
    const balance = Math.max(0, Number(o.balance_due_pkr || 0) - Number(o.balance_paid_pkr || 0));
    const created = o.created_at ? new Date(o.created_at).toLocaleDateString("en-PK", { month: "short", day: "numeric", year: "numeric" }) : "";
    return `
      <div class="customer-order-row-shell">
        <button class="customer-order-row" type="button" data-action="view-order" data-order-id="${attr(o.id)}">
          <div>
            <strong>${esc(o.id)}</strong>
            <small>${esc(created)} · ${esc(stage)} · ${esc(payment)}</small>
          </div>
          <div class="customer-order-row-totals">
            <strong>${PKR.format(Number(o.total_pkr || 0))}</strong>
            ${balance > 0 ? `<small class="balance-due">Balance ${PKR.format(balance)}</small>` : ""}
          </div>
        </button>
        <button class="reorder-btn" type="button" data-action="reorder-from-past" data-order-id="${attr(o.id)}" title="Send a re-quote at today's prices via WhatsApp">↻ Reorder</button>
      </div>
    `;
  }).join("") : `<p class="cashflow-empty">No orders yet — captured as a lead.</p>`;

  const waNum = isValidPkMobile(canon) ? canon : "";
  const waHref = waNum
    ? `https://wa.me/${waNum}?text=${encodeURIComponent(`Hi ${(customer?.name || "").split(" ")[0] || "there"}, this is Global Bestie following up.`)}`
    : "";

  openModal(`
    <div class="customer-detail-modal">
      <div class="drawer-hero customer-hero">
        ${customerAvatarHtml({ name: customer?.name, phone: canon }, { size: "lg" })}
        <div>
          <p class="kicker">Customer${customer?.risk_flag ? ` · <button class="risk-badge" type="button" data-action="clear-risk-flag" data-customer-phone="${attr(canon)}" title="${attr(customer.risk_reason || "Auto-flagged risk")} — click to clear">⚠ risk · clear</button>` : ""}</p>
          <h2>${esc(customer?.name || formatPkDisplay(canon))}</h2>
          <p>${esc(formatPkDisplay(canon))}${customer?.city ? ` · ${esc(customer.city)}` : ""}${customer?.email ? ` · ${esc(customer.email)}` : ""}</p>
          ${renderLastContactPill(canon)}
          ${customer?.risk_flag && customer.risk_reason ? `<details class="risk-reason-details"><summary class="risk-reason">${esc(customer.risk_reason)}</summary><p>Risk flags are auto-derived from your notes when they contain words like refund, cancel, angry, late, etc. Clear the flag once you've handled the issue.</p></details>` : ""}
        </div>
        <div class="drawer-actions">
          ${waHref ? `<a class="button primary" href="${waHref}" target="_blank" rel="noreferrer">Open WhatsApp</a>` : ""}
          <button class="button secondary" type="button" data-action="copy-text" data-copy="${attr(canon)}" data-copy-label="phone">Copy phone</button>
          <button class="button secondary" type="button" data-action="close-modal">Close</button>
        </div>
      </div>
      <div class="customer-stat-grid">
        <article><span>Lifetime spend</span><strong>${PKR.format(Number(totalRevenue || 0))}</strong></article>
        <article><span>Orders</span><strong>${totalOrders}</strong></article>
        <article><span>Avg order</span><strong>${PKR.format(totalOrders ? Math.round(Number(totalRevenue || 0) / totalOrders) : 0)}</strong></article>
        <article class="customer-sparkline-card">
          <span>Last 6 months</span>
          ${customerSparklineSvg(orders)}
        </article>
        <article><span>First seen</span><strong>${firstSeen ? new Date(firstSeen).toLocaleDateString("en-PK", { month: "short", year: "numeric" }) : "—"}</strong></article>
        <article><span>Last seen</span><strong>${lastSeen ? new Date(lastSeen).toLocaleDateString("en-PK", { month: "short", day: "numeric" }) : "—"}</strong></article>
      </div>
      ${renderNextBestSuggestion(orders)}
      ${renderProductAffinity(orders)}
      <div class="customer-tags-editor" data-customer-tags-editor data-customer-phone="${attr(canon)}">
        <strong class="customer-tags-label">Tags</strong>
        <div class="customer-tags" data-customer-tags>
          ${tags.length ? tags.map((t) => `
            <span class="tag-chip">${esc(t)}<button type="button" data-remove-tag="${attr(t)}" aria-label="Remove ${attr(t)} tag">×</button></span>
          `).join("") : `<span class="customer-tags-empty">No tags yet — try "Karachi top", "Coach fan", "slow payer"</span>`}
          <input type="text" class="tag-add-input" data-add-tag list="customer-tag-suggestions" placeholder="+ add tag" aria-label="Add a tag" />
        </div>
        <datalist id="customer-tag-suggestions">${allKnownTags().map((t) => `<option value="${attr(t)}"></option>`).join("")}</datalist>
      </div>
      <aside class="customer-notes editable" data-customer-notes data-customer-phone="${attr(canon)}">
        <strong>Internal notes <small>(click to edit)</small></strong>
        <textarea data-notes-input rows="3" placeholder="Anything the team should remember about this customer…">${esc(customer?.notes || "")}</textarea>
        <span class="notes-status" data-notes-status></span>
      </aside>
      ${renderCustomerMessageHistory(canon)}
      <section class="customer-audit">
        <h3>Internal activity</h3>
        <ul class="audit-list" data-customer-audit data-customer-phone="${attr(canon)}"><li class="audit-loading">Loading…</li></ul>
      </section>
      <section class="customer-orders">
        <h3>Order history</h3>
        <div>${orderRows}</div>
      </section>
    </div>
  `);
  bindCustomerEditors();
  bindMessageFilterChips();
  // Fetch the audit trail in the background so the modal pops instantly
  // and the timeline fills in shortly after.
  loadCustomerAudit(canon);
}

// Renders a "Last contact" pill on the customer modal hero — shows the
// most recent inbound/outbound WhatsApp activity for this customer with
// a direction icon + relative time. Helps the operator avoid double-
// messaging someone they just replied to.
function renderLastContactPill(canon) {
  const messages = (state.marketingMessages || []).filter((m) => canonPhone(m.customer_phone) === canon);
  if (!messages.length) return "";
  const last = messages[0]; // already sorted desc on the server
  const dir = last.direction === "outbound" ? "→ Sent" : "← Replied";
  const tone = last.direction === "outbound" ? "info" : "ok";
  return `<small class="last-contact-pill tone-${tone}">${esc(dir)} ${esc(relativeTime(last.created_at))}</small>`;
}

// Pulls /api/admin/customers (GET) with the phone query, expects an `audit`
// array, then injects the rendered timeline into the modal.
async function loadCustomerAudit(canon) {
  // Race guard: if the operator closed this modal and opened a different
  // customer before our fetch returned, we'd otherwise overwrite the new
  // customer's audit with this one's. Stamp the in-flight phone and bail
  // out if the slot no longer belongs to this canon when we return.
  state._auditInflight = canon;
  try {
    const result = await apiFetch(`/api/admin/customers?phone=${encodeURIComponent(canon)}`, {}, { audit: [] });
    if (state._auditInflight !== canon) return;
    const audit = Array.isArray(result.audit) ? result.audit : [];
    const slot = qs("[data-customer-audit]");
    if (!slot) return;
    // Belt-and-braces: the slot itself carries the phone it was rendered
    // for, so even if a third party swapped the modal mid-flight we still
    // refuse to write into a foreign audit panel.
    if (slot.dataset.customerPhone && slot.dataset.customerPhone !== canon) return;
    if (!audit.length) {
      slot.innerHTML = `<p class="cashflow-empty">No internal changes logged for this customer yet.</p>`;
      return;
    }
    slot.innerHTML = audit.slice(0, 12).map((row) => {
      const when = row.created_at ? relativeTime(row.created_at) : "—";
      const action = (row.action || "").replace(/^customer\./, "").replace(/_/g, " ");
      const updates = row.payload?.updates ? Object.keys(row.payload.updates).join(", ") : "";
      return `
        <li class="audit-row">
          <span class="audit-dot" aria-hidden="true"></span>
          <div>
            <strong>${esc(action)}</strong>
            ${updates ? `<small>${esc(updates)}</small>` : ""}
          </div>
          <span class="audit-when" title="${esc(row.created_at || "")}">${esc(when)}</span>
        </li>
      `;
    }).join("");
  } catch {
    /* audit panel stays empty on failure — non-critical */
  }
}

// Compact 6-bar SVG sparkline for a customer table row. Takes a 6-length
// numeric array (oldest → newest month) and returns a 60×18 chart. Renders
// a single gentle dot when the customer has no orders in the window.
function rowSparkline(buckets) {
  const safe = Array.isArray(buckets) && buckets.length === 6 ? buckets : new Array(6).fill(0);
  const max = Math.max(1, ...safe);
  const w = 60, h = 18, gap = 1;
  const bw = (w - gap * 5) / 6;
  const bars = safe.map((v, i) => {
    const bh = Math.max(1, (v / max) * (h - 2));
    const x = i * (bw + gap);
    const y = h - bh;
    const op = v > 0 ? (0.45 + (v / max) * 0.55) : 0.15;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="1" fill="var(--pink)" fill-opacity="${op.toFixed(2)}"/>`;
  }).join("");
  return `<svg class="row-sparkline" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">${bars}</svg>`;
}

// Product affinity — aggregates this customer's order items by brand and
// category, sorts by spend, and renders the top 4 as ranked pills. Helps
// the team see "this person is a Coach buyer" at a glance and feeds
// future personalized-broadcast targeting.
function renderProductAffinity(orders) {
  if (!orders?.length) return "";
  const byBrand = new Map();
  const byCategory = new Map();
  let totalSpend = 0;
  for (const o of orders) {
    const items = orderItems(o);
    for (const it of items) {
      const product = state.products.find((p) => p.id === it.product_id);
      const brand = product?.brand || "";
      const category = product?.category || "";
      const spend = Number(it.unit_price_pkr || 0) * Number(it.quantity || 1);
      totalSpend += spend;
      if (brand) byBrand.set(brand, (byBrand.get(brand) || 0) + spend);
      if (category) byCategory.set(category, (byCategory.get(category) || 0) + spend);
    }
  }
  const topBrands = [...byBrand.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const topCats = [...byCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  if (!topBrands.length && !topCats.length) return "";
  const renderPills = (entries) => entries.map(([label, spend]) => {
    const pct = totalSpend ? Math.round((spend / totalSpend) * 100) : 0;
    return `
      <li class="affinity-pill" title="${esc(label)} · ${PKR.format(spend)} lifetime · ${pct}% of spend">
        <strong>${esc(label)}</strong>
        <span class="affinity-bar"><span style="width:${pct}%"></span></span>
        <small>${pct}% · ${PKR.format(spend)}</small>
      </li>
    `;
  }).join("");
  return `
    <section class="customer-affinity">
      <header><h3>Buys</h3><small>What this customer has spent on</small></header>
      <div class="affinity-grid">
        ${topBrands.length ? `<div><h4>By brand</h4><ul>${renderPills(topBrands)}</ul></div>` : ""}
        ${topCats.length ? `<div><h4>By category</h4><ul>${renderPills(topCats)}</ul></div>` : ""}
      </div>
    </section>
  `;
}

// Small SVG bar chart of revenue per month over the last 6 months. Pure
// inline SVG — no library, scales with parent width. Bars get tinted darker
// the higher the value so the trend reads at a glance.
function customerSparklineSvg(orders) {
  // Build 6 buckets of (year, month) ending with the current month.
  const buckets = [];
  const now = new Date();
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({ year: d.getFullYear(), month: d.getMonth(), revenue: 0, label: d.toLocaleDateString("en-PK", { month: "short" }) });
  }
  for (const o of orders || []) {
    const d = new Date(o.created_at || 0);
    if (Number.isNaN(d.getTime())) continue;
    const b = buckets.find((x) => x.year === d.getFullYear() && x.month === d.getMonth());
    if (b) b.revenue += Number(o.total_pkr || 0);
  }
  const max = Math.max(1, ...buckets.map((b) => b.revenue));
  const width = 168;
  const height = 44;
  const gap = 4;
  const barW = (width - gap * (buckets.length - 1)) / buckets.length;
  const bars = buckets.map((b, i) => {
    const h = Math.max(1, (b.revenue / max) * (height - 4));
    const x = i * (barW + gap);
    const y = height - h;
    const opacity = 0.45 + (b.revenue / max) * 0.55;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" fill="var(--pink)" fill-opacity="${opacity.toFixed(2)}"><title>${b.label}: ${PKR.format(b.revenue)}</title></rect>`;
  }).join("");
  const lastLabel = buckets[buckets.length - 1]?.label || "";
  const firstLabel = buckets[0]?.label || "";
  return `
    <strong class="sparkline-headline">${PKR.format(buckets.reduce((s, b) => s + b.revenue, 0))}</strong>
    <svg class="customer-sparkline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-label="Revenue per month over last 6 months">${bars}</svg>
    <small class="sparkline-axis"><span>${firstLabel}</span><span>${lastLabel}</span></small>
  `;
}

// Renders a compact recent-WhatsApp panel for the customer modal. Tells the
// team how often we've messaged this customer recently so they don't fire a
// 4th broadcast on top of 3 sent yesterday.
function renderCustomerMessageHistory(canon) {
  const all = (state.marketingMessages || []).filter((m) => canonPhone(m.customer_phone) === canon);
  if (!all.length) return "";
  const last30Cutoff = Date.now() - 30 * 86_400_000;
  const recent = all.filter((m) => new Date(m.created_at || 0).getTime() >= last30Cutoff);
  const outbound = recent.filter((m) => m.direction === "outbound");
  const broadcasts = outbound.filter((m) => String(m.source || "").startsWith("Broadcast"));
  const inbound = recent.filter((m) => m.direction === "inbound");
  const last = all[0];
  const lastDir = last?.direction === "outbound" ? "sent" : "received";
  const overSaturated = outbound.length >= 6;
  const headlineTone = overSaturated ? "warn" : "ok";

  // Apply the per-modal filter (state.messageFilter). Chips below the
  // header toggle this without re-rendering the whole modal.
  const filter = state.messageFilter || "all";
  const filtered = all.filter((m) => {
    if (filter === "all") return true;
    if (filter === "inbound") return m.direction === "inbound";
    if (filter === "outbound") return m.direction === "outbound" && !String(m.source || "").startsWith("Broadcast");
    if (filter === "broadcast") return m.direction === "outbound" && String(m.source || "").startsWith("Broadcast");
    return true;
  });

  const recentList = filtered.slice(0, 12).map((m) => {
    const when = relativeTime(m.created_at);
    const dir = m.direction === "outbound" ? "→" : "←";
    const klass = m.direction === "outbound" ? "outbound" : "inbound";
    const isBroadcast = String(m.source || "").startsWith("Broadcast");
    return `
      <li class="msg-row ${klass}${isBroadcast ? " is-broadcast" : ""}">
        <span class="msg-arrow">${dir}</span>
        <div class="msg-body">
          <strong>${esc(m.source || (m.direction === "outbound" ? "Outbound" : "Reply"))}${m.replied_to_broadcast ? ` <small class="msg-reply-tag">↳ reply to broadcast</small>` : ""}</strong>
          <p>${esc((m.body || "").slice(0, 200))}${m.body?.length > 200 ? "…" : ""}</p>
        </div>
        <span class="msg-when">${esc(when)}</span>
      </li>
    `;
  }).join("") || `<li class="msg-empty">No ${filter === "all" ? "" : filter} messages.</li>`;

  return `
    <section class="customer-messages tone-${headlineTone}" data-message-history>
      <header>
        <h3>Recent WhatsApp activity</h3>
        <div class="msg-counts">
          <span><strong>${outbound.length}</strong> sent</span>
          <span><strong>${broadcasts.length}</strong> broadcasts</span>
          <span><strong>${inbound.length}</strong> replies</span>
          <span class="msg-last">Last ${esc(lastDir)} ${esc(relativeTime(last?.created_at))}</span>
        </div>
        ${overSaturated ? `<p class="msg-warn">⚠️ This customer has received ${outbound.length} messages in the last 30 days — consider skipping the next broadcast.</p>` : ""}
        <div class="msg-filter-chips" role="tablist" aria-label="Filter messages">
          <button type="button" class="${filter === "all" ? "active" : ""}" data-msg-filter="all" data-customer-phone="${attr(canon)}">All (${all.length})</button>
          <button type="button" class="${filter === "inbound" ? "active" : ""}" data-msg-filter="inbound" data-customer-phone="${attr(canon)}">Inbound (${all.filter((m) => m.direction === "inbound").length})</button>
          <button type="button" class="${filter === "outbound" ? "active" : ""}" data-msg-filter="outbound" data-customer-phone="${attr(canon)}">Direct (${all.filter((m) => m.direction === "outbound" && !String(m.source || "").startsWith("Broadcast")).length})</button>
          <button type="button" class="${filter === "broadcast" ? "active" : ""}" data-msg-filter="broadcast" data-customer-phone="${attr(canon)}">Broadcasts (${all.filter((m) => String(m.source || "").startsWith("Broadcast")).length})</button>
        </div>
      </header>
      <ul class="msg-list">${recentList}</ul>
    </section>
  `;
}

// When a customer types just their phone and we find multiple orders, this
// renders a chooser so they can drill into any one. Without it, they'd only
// ever see the most recent order (worst case: their second order's tracking
// stays invisible while their first looms forever).
// Builds a WhatsApp quote message from a past order, re-priced at today's
// product rates. Drops customers into the same WA template modal we use
// elsewhere — pre-filled with the quote body, ready to send. We deliberately
// don't auto-create a draft order: the agent file mandates "team confirms
// availability, PKR price, and shipment batch before payment is accepted",
// so the customer must reply confirming before anything becomes real.
function reorderFromPast(pastOrder) {
  const canon = canonPhone(pastOrder.customer_phone);
  if (!isValidPkMobile(canon)) {
    toast("This customer's phone isn't a valid WhatsApp number.");
    return;
  }
  // Re-price each line item from the live product catalog. If the product
  // is gone (delisted), keep the original price but flag it inline.
  const items = orderItems(pastOrder);
  const lines = items.map((item) => {
    const product = state.products.find((p) => p.id === item.product_id);
    const todayUnit = product ? calculatePrice(product) : Number(item.unit_price_pkr || 0);
    const qty = Number(item.quantity || 1);
    const subtotal = todayUnit * qty;
    const note = !product ? " (no longer in catalog — previous price shown)" : "";
    return {
      title: item.title,
      variant: item.variant || "",
      qty,
      unit: todayUnit,
      subtotal,
      note,
    };
  });
  const total = lines.reduce((s, l) => s + l.subtotal, 0);
  const advance = Math.ceil(total * 0.5);

  const itemBlock = lines.map((l) => `• ${l.title}${l.variant ? ` (${l.variant})` : ""} × ${l.qty} — PKR ${l.subtotal.toLocaleString()}${l.note}`).join("\n");
  const firstName = (pastOrder.customer_name || "").split(" ")[0] || "there";
  const newId = `(new)`; // The real ID is created when the customer confirms.
  const body =
`Hi ${firstName}, thank you for considering another Global Bestie order! Here's a re-quote at today's rate:

${itemBlock}

Total: PKR ${total.toLocaleString()}
50% advance to confirm: PKR ${advance.toLocaleString()}

Reply YES and we'll create your order ${newId} on the next available shipment batch.`;

  // Synthesize a virtual order shape the template modal can consume.
  const virtual = {
    id: `re-${pastOrder.id}`,
    customer_name: pastOrder.customer_name,
    customer_phone: canon,
    total_pkr: total,
    advance_due_pkr: advance,
    balance_due_pkr: total - advance,
    advance_paid_pkr: 0,
    balance_paid_pkr: 0,
    eta: "Confirmed on reply",
    status: "pending_review",
    payment_status: "awaiting_advance",
    items,
  };
  // Inject a one-off "reorder quote" entry so the modal preselects it.
  const reorderTpl = {
    id: "tmpl-reorder",
    name: "Reorder quote (live)",
    category: "advance_request",
    body,
  };
  const prev = state.waTemplates || [];
  state.waTemplates = [reorderTpl, ...prev.filter((t) => t.id !== "tmpl-reorder")];
  showWhatsappTemplateModal(virtual);
}

// Default WhatsApp templates — used as a fallback when the
// `whatsapp_templates` Supabase table is empty or unreachable. Same shape as
// the seed rows in supabase/schema.sql so behavior is identical.
const DEFAULT_WA_TEMPLATES = [
  { id: "tmpl-advance", name: "Advance payment request", category: "advance_request",
    body: "Hi {{name}}, thank you for your Global Bestie order {{order_id}}. Please transfer the 50% advance of PKR {{advance}} to confirm — bank details on the order page. Reply once sent so we can match it. ETA: {{eta}}" },
  { id: "tmpl-balance", name: "Balance reminder (arrived in PK)", category: "balance_reminder",
    body: "Hi {{name}}, your order {{order_id}} has arrived in Pakistan. Please transfer the remaining balance of PKR {{balance}} so we can dispatch via courier today. Thank you!" },
  { id: "tmpl-sourcing", name: "Sourcing update", category: "sourcing_update",
    body: "Hi {{name}}, quick update on order {{order_id}} — we've sourced your item and it's on its way to the consolidator. ETA: {{eta}}. We'll message again once it lands in Pakistan." },
  { id: "tmpl-dispatch", name: "Dispatch confirmation", category: "dispatch",
    body: "Hi {{name}}, your order {{order_id}} is out for delivery 📦 Tracking: {{tracking}}. Please expect a call from the courier within 1–2 working days." },
];

function interpolateTemplate(body, order) {
  const payment = orderPaymentSummary ? orderPaymentSummary(order) : {};
  const advanceLeft = Math.max(0, Number(payment.advanceDue || 0) - Number(order.advance_paid_pkr || 0));
  const balanceLeft = Math.max(0, Number(payment.balanceDue || 0) - Number(order.balance_paid_pkr || 0));
  const map = {
    name: (order.customer_name || "").split(" ")[0] || "there",
    full_name: order.customer_name || "",
    order_id: order.id || "",
    eta: order.eta || "to be confirmed",
    advance: advanceLeft.toLocaleString(),
    balance: balanceLeft.toLocaleString(),
    total: Number(order.total_pkr || 0).toLocaleString(),
    tracking: order.tracking_number || order.usa_tracking || "to be shared",
    city: order.city || "",
  };
  return body.replace(/\{\{(\w+)\}\}/g, (_, key) => map[key] ?? `{{${key}}}`);
}

// Modal that lists every WA template, shows a live interpolated preview of
// the chosen one with the current order's data, and ships the message to
// WhatsApp on click. The Maychats Cloud API send happens server-side; for
// now we open `wa.me/{canon}?text=...` so the team can review/send manually.
// Populate the template <select> on the broadcast form with whatever the
// portal has loaded (live from /api/admin/dashboard, falling back to the
// inline DEFAULT_WA_TEMPLATES). Idempotent — safe to call on every render.
// Template editor in Settings — lists every template with edit/delete
// buttons. Called from renderAdmin so it refreshes whenever data loads.
function renderTemplatesEditor() {
  const slot = qs("[data-templates-editor]");
  if (!slot) return;
  const templates = state.waTemplates || [];
  if (!templates.length) {
    slot.innerHTML = `<p class="cashflow-empty">No templates yet. Hit "New template" to seed your first WhatsApp script.</p>`;
    return;
  }
  slot.innerHTML = `
    <ul class="template-list">
      ${templates.map((t) => `
        <li class="template-row ${t.is_active === false ? "is-inactive" : ""}">
          <div class="template-meta">
            <strong>${esc(t.name)}</strong>
            <small>${esc(t.category || "custom")}${t.is_active === false ? " · inactive" : ""}</small>
          </div>
          <p class="template-body-preview">${esc((t.body || "").slice(0, 180))}${t.body?.length > 180 ? "…" : ""}</p>
          <div class="template-row-actions">
            <button class="button secondary" type="button" data-action="edit-wa-template" data-template-id="${attr(t.id)}">Edit</button>
            <button class="button secondary" type="button" data-action="delete-wa-template" data-template-id="${attr(t.id)}">Delete</button>
          </div>
        </li>
      `).join("")}
    </ul>
  `;
}

function openTemplateEditor(template) {
  const t = template || { id: "", name: "", category: "custom", body: "", is_active: true };
  openModal(`
    <div class="template-editor-modal">
      <p class="kicker">${template ? "Edit template" : "New template"}</p>
      <h2>${esc(t.name || "Untitled template")}</h2>
      <label>
        <span>Name</span>
        <input type="text" data-template-name value="${attr(t.name || "")}" placeholder="e.g. Sourcing update — bags" autofocus />
      </label>
      <label>
        <span>Category</span>
        <select data-template-category>
          <option value="advance_request" ${t.category === "advance_request" ? "selected" : ""}>Advance request</option>
          <option value="balance_reminder" ${t.category === "balance_reminder" ? "selected" : ""}>Balance reminder</option>
          <option value="sourcing_update" ${t.category === "sourcing_update" ? "selected" : ""}>Sourcing update</option>
          <option value="dispatch" ${t.category === "dispatch" ? "selected" : ""}>Dispatch</option>
          <option value="in_stock_confirmation" ${t.category === "in_stock_confirmation" ? "selected" : ""}>In-stock confirmation</option>
          <option value="custom" ${(!t.category || t.category === "custom") ? "selected" : ""}>Custom</option>
        </select>
      </label>
      <label>
        <span>Body — use {{name}}, {{order_id}}, {{advance}}, {{balance}}, {{eta}}, {{tracking}}</span>
        <textarea data-template-body rows="6" placeholder="Hi {{name}}, your order {{order_id}}…">${esc(t.body || "")}</textarea>
      </label>
      <div class="template-preview-pane">
        <strong>Live preview</strong>
        <p data-template-preview></p>
      </div>
      <label class="check-row">
        <input type="checkbox" data-template-active ${t.is_active !== false ? "checked" : ""} />
        <span>Active (available to send)</span>
      </label>
      <input type="hidden" data-template-id value="${attr(t.id || "")}" />
      <div class="confirmation-actions">
        <button class="button primary" type="button" data-action="template-save-submit">Save</button>
        <button class="button secondary" type="button" data-action="close-modal">Cancel</button>
      </div>
    </div>
  `);
  // Live preview — interpolate with realistic sample data so the team can
  // catch placeholder typos before saving.
  const bodyEl = qs("[data-template-body]");
  const previewEl = qs("[data-template-preview]");
  if (bodyEl && previewEl) {
    const sample = {
      name: "Ayesha",
      full_name: "Ayesha Khan",
      order_id: `GB-${new Date().getFullYear()}-051501234`,
      advance: "18,500",
      balance: "18,500",
      total: "37,000",
      eta: "Jun 24",
      tracking: "LP123456789",
      city: "Karachi",
    };
    const refresh = () => {
      const text = (bodyEl.value || "").replace(/\{\{(\w+)\}\}/g, (_, k) => sample[k] ?? `{{${k}}}`);
      previewEl.textContent = text;
    };
    bodyEl.addEventListener("input", refresh);
    refresh();
  }
}

async function saveTemplateFromModal() {
  const name = qs("[data-template-name]")?.value.trim();
  const body = qs("[data-template-body]")?.value.trim();
  const category = qs("[data-template-category]")?.value || "custom";
  const isActive = !!qs("[data-template-active]")?.checked;
  const id = qs("[data-template-id]")?.value || undefined;
  if (!name || !body) { toast("Name and body required."); return; }
  try {
    const result = await apiFetch("/api/admin/templates", {
      method: "POST",
      body: JSON.stringify({ id, name, body, category, is_active: isActive }),
    }, { ok: true, template: { id: id || `tmpl-${Date.now()}`, name, body, category, is_active: isActive } });
    // Optimistic upsert
    const list = state.waTemplates || [];
    const idx = list.findIndex((t) => t.id === result.template.id);
    if (idx >= 0) list[idx] = result.template;
    else list.unshift(result.template);
    state.waTemplates = list;
    closeModal();
    renderTemplatesEditor();
    renderBroadcastTemplateOptions();
    refreshBroadcastPreview();
    toast(`Template saved.`);
  } catch {
    toast("Couldn't save template — try again.");
  }
}

async function deleteTemplate(id) {
  try {
    await apiFetch(`/api/admin/templates?id=${encodeURIComponent(id)}`, { method: "DELETE" }, { ok: true });
    state.waTemplates = (state.waTemplates || []).filter((t) => t.id !== id);
    renderTemplatesEditor();
    renderBroadcastTemplateOptions();
    toast("Template deleted.");
  } catch {
    toast("Couldn't delete — try again.");
  }
}

function renderBroadcastTemplateOptions() {
  const select = qs("[data-broadcast-template]");
  if (!select) return;
  const templates = (state.waTemplates && state.waTemplates.length) ? state.waTemplates : DEFAULT_WA_TEMPLATES;
  const current = select.value;
  select.innerHTML = templates
    .map((t) => `<option value="${attr(t.id)}">${esc(t.name)} · ${esc(t.category.replaceAll("_", " "))}</option>`)
    .join("");
  if (templates.some((t) => t.id === current)) select.value = current;
}

// Live preview of the selected template body. Pure client-side; the server
// re-interpolates per recipient on send.
function refreshBroadcastPreview() {
  const select = qs("[data-broadcast-template]");
  const preview = qs("[data-broadcast-preview]");
  if (!select || !preview) return;
  const templates = (state.waTemplates && state.waTemplates.length) ? state.waTemplates : DEFAULT_WA_TEMPLATES;
  const t = templates.find((x) => x.id === select.value);
  if (!t) { preview.value = ""; return; }
  preview.value = t.body.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    const sample = {
      name: "Ayesha",
      order_id: "your order",
      advance: "—",
      balance: "—",
      eta: "—",
      tracking: "—",
      city: "Karachi",
    };
    return sample[k] ?? `{{${k}}}`;
  });
}

// Reads the current filter form values and asks the server how many
// recipients match. Cheap GET, no sends.
async function previewBroadcastCount() {
  const form = qs("[data-broadcast-form]");
  if (!form) return;
  const data = new FormData(form);
  const params = new URLSearchParams();
  for (const [k, v] of data.entries()) {
    if (k === "template_id") continue;
    if (v) params.set(k, String(v));
  }
  const countEl = qs("[data-broadcast-count]");
  if (countEl) countEl.textContent = "Counting…";
  try {
    const result = await apiFetch(`/api/admin/broadcast?${params.toString()}`, {}, { count: 0, sample: [] });
    if (countEl) {
      const warn = result.count > 200 ? " · ⚠️ over 200 — narrow filters" : "";
      countEl.textContent = `${result.count} recipient${result.count === 1 ? "" : "s"} match${warn}`;
      countEl.classList.toggle("over-cap", result.count > 200);
    }
  } catch {
    if (countEl) countEl.textContent = "Couldn't fetch count.";
  }
}

async function sendBroadcast(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());
  if (!data.template_id) { toast("Pick a template first."); return; }
  // Scheduled? Confirm differently and route through scheduling path.
  const sendAt = data.send_at ? new Date(data.send_at) : null;
  const isScheduled = sendAt && !Number.isNaN(sendAt.getTime()) && sendAt.getTime() > Date.now() + 30_000;
  const countEl = qs("[data-broadcast-count]");
  const countText = countEl?.textContent || "";
  const verb = isScheduled
    ? `Schedule this template for ${sendAt.toLocaleString("en-PK")} (${countText})?`
    : `Send this template to ${countText}? Opt-outs are skipped automatically.`;
  if (!window.confirm(verb)) return;

  const submitBtn = form.querySelector("button[type='submit']");
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = isScheduled ? "Scheduling…" : "Sending…"; }
  try {
    const result = await apiFetch("/api/admin/broadcast", {
      method: "POST",
      body: JSON.stringify({
        template_id: data.template_id,
        send_at: isScheduled ? sendAt.toISOString() : null,
        filters: {
          city: data.city,
          tag: data.tag,
          last_order_days: Number(data.last_order_days || 0),
          min_orders: Number(data.min_orders || 0),
          min_revenue: Number(data.min_revenue || 0),
        },
      }),
    }, { ok: false, sent: 0, failed: 0, count: 0 });
    if (result.error === "rate_limited") {
      const wait = result.wait_seconds ? `${result.wait_seconds}s` : `${result.retry_after_minutes || "a few"} min`;
      toast(`Broadcast paused — please wait ${wait} before sending again.`);
      return;
    }
    if (result.scheduled) {
      // Optimistically prepend so the pending-sends list shows it before
      // the next dashboard refresh.
      state.scheduledBroadcasts = [
        {
          id: result.id,
          template_id: result.template?.id,
          send_at: result.send_at,
          recipient_count: result.recipient_count,
          filters: JSON.parse(JSON.stringify({ city: data.city, tag: data.tag })),
          status: "pending",
        },
        ...(state.scheduledBroadcasts || []),
      ];
      renderScheduledBroadcastsList();
      toast(`Scheduled for ${new Date(result.send_at).toLocaleString("en-PK")} · ${result.recipient_count} recipients`);
      form.reset();
      refreshBroadcastPreview();
      return;
    }
    if (result.idempotent_replay) {
      toast("Same broadcast was just sent — showing previous result.");
    }
    showBroadcastResults(result);
  } catch {
    toast("Broadcast failed — try again.");
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Send broadcast"; }
  }
}

// Result-summary modal shown after a broadcast send. Surfaces sent /
// failed / skipped counts and a clickable list of failed phones so the
// team can chase them manually.
function showBroadcastResults(result) {
  const sent = Number(result.sent || 0);
  const failed = Number(result.failed || 0);
  const skipDaily = Number(result.skipped_daily_cap || 0);
  const skipOptOut = Number(result.skipped_opt_out || 0);
  const total = sent + failed + skipDaily;
  const headlineTone = failed > 0 || skipDaily > 0 ? "warn" : "ok";
  const fails = Array.isArray(result.failures) ? result.failures : [];
  const skipped = Array.isArray(result.skipped) ? result.skipped : [];
  openModal(`
    <div class="broadcast-results">
      <div class="confirmation-headline">
        <p class="kicker">Broadcast complete</p>
        <h2>${sent} delivered${failed ? ` · ${failed} failed` : ""}</h2>
        ${result.hard_capped ? `<p class="confirmation-sub">⚠️ Hit the 200-recipient cap — narrow your filters to reach the remaining ${(result.count || 0) - 200} customers.</p>` : ""}
      </div>
      <div class="broadcast-stats">
        <article class="stat-ok"><span>Sent</span><strong>${sent}</strong></article>
        <article class="stat-warn"><span>Failed</span><strong>${failed}</strong></article>
        <article class="stat-info"><span>Skipped (daily cap)</span><strong>${skipDaily}</strong></article>
        <article class="stat-info"><span>Skipped (opted out)</span><strong>${skipOptOut}</strong></article>
      </div>
      ${fails.length ? `
        <section class="broadcast-list">
          <h3>Failed sends · ${fails.length}${fails.length === 25 && failed > 25 ? " (showing first 25)" : ""}</h3>
          <ul>
            ${fails.map((f) => `<li><strong>${esc(formatPkDisplay(f.phone) || f.phone)}</strong>${f.name ? ` <span>${esc(f.name)}</span>` : ""} <small>${esc(String(f.reason || "unknown"))}</small></li>`).join("")}
          </ul>
        </section>
      ` : ""}
      ${skipped.length ? `
        <section class="broadcast-list muted">
          <h3>Skipped recipients</h3>
          <ul>
            ${skipped.map((s) => `<li><strong>${esc(formatPkDisplay(s.phone) || s.phone)}</strong>${s.name ? ` <span>${esc(s.name)}</span>` : ""} <small>${s.reason === "daily_cap" ? "Already received 3 messages in 24h" : esc(s.reason)}</small></li>`).join("")}
          </ul>
        </section>
      ` : ""}
      <div class="confirmation-actions">
        <button class="button primary" type="button" data-action="close-modal">Close</button>
      </div>
    </div>
  `);
}

function showWhatsappTemplateModal(order) {
  const canon = canonPhone(order.customer_phone);
  if (!isValidPkMobile(canon)) {
    toast("This order's phone number is not in a valid WhatsApp format.");
    return;
  }
  const templates = (state.waTemplates && state.waTemplates.length) ? state.waTemplates : DEFAULT_WA_TEMPLATES;
  // Sensible default: balance reminder if balance is due, otherwise advance
  // request, otherwise sourcing.
  const balanceLeft = Math.max(0, Number(order.balance_due_pkr || 0) - Number(order.balance_paid_pkr || 0));
  const advanceLeft = Math.max(0, Number(order.advance_due_pkr || 0) - Number(order.advance_paid_pkr || 0));
  let pickId = templates[0]?.id;
  if (balanceLeft > 0 && order.status === "pakistan_processing") {
    pickId = templates.find((t) => t.category === "balance_reminder")?.id || pickId;
  } else if (advanceLeft > 0) {
    pickId = templates.find((t) => t.category === "advance_request")?.id || pickId;
  } else if (order.status === "sourcing" || order.status === "in_transit") {
    pickId = templates.find((t) => t.category === "sourcing_update")?.id || pickId;
  } else if (order.status === "delivered") {
    pickId = templates.find((t) => t.category === "dispatch")?.id || pickId;
  }
  openModal(`
    <div class="wa-template-modal">
      <p class="kicker">WhatsApp templates</p>
      <h2>Reply to ${esc(order.customer_name || "customer")}</h2>
      <p class="wa-template-sub">${esc(formatPkDisplay(canon))} · order ${esc(order.id)}</p>
      <div class="wa-template-grid">
        <aside class="wa-template-list" role="listbox">
          ${templates.map((t) => `
            <button class="wa-template-row${t.id === pickId ? " active" : ""}" type="button" data-wa-pick="${attr(t.id)}">
              <strong>${esc(t.name)}</strong>
              <small>${esc(t.category.replaceAll("_", " "))}</small>
            </button>
          `).join("")}
        </aside>
        <div class="wa-template-preview">
          <label>
            <span>Preview (edit before sending)</span>
            <textarea data-wa-body rows="9"></textarea>
          </label>
          <div class="wa-template-actions">
            <a class="button primary" data-wa-send target="_blank" rel="noreferrer">Open in WhatsApp</a>
            <button class="button secondary" type="button" data-action="copy-text" data-copy-label="message">Copy text</button>
            <button class="button secondary" type="button" data-action="close-modal">Close</button>
          </div>
        </div>
      </div>
    </div>
  `);
  const bodyEl = qs("[data-wa-body]");
  const sendLink = qs("[data-wa-send]");
  const copyBtn = qs("[data-wa-template-modal] [data-action='copy-text'], .wa-template-modal [data-action='copy-text']");
  const setTemplate = (id) => {
    const t = templates.find((x) => x.id === id) || templates[0];
    if (!t) return;
    bodyEl.value = interpolateTemplate(t.body, order);
    refreshSendLink();
    qsa(".wa-template-row").forEach((row) => row.classList.toggle("active", row.dataset.waPick === id));
  };
  const refreshSendLink = () => {
    const text = bodyEl.value;
    sendLink.href = `https://wa.me/${canon}?text=${encodeURIComponent(text)}`;
    if (copyBtn) copyBtn.dataset.copy = text;
  };
  qsa(".wa-template-row").forEach((row) => {
    row.addEventListener("click", () => setTemplate(row.dataset.waPick));
  });
  bodyEl.addEventListener("input", refreshSendLink);
  setTemplate(pickId);
}

function renderOrderList(orders, canon) {
  const target = qs("[data-tracking-result]");
  if (!target) return;
  const rows = orders.map((o) => {
    const stage = (o.status || "").replaceAll("_", " ");
    const payment = paymentLabel ? paymentLabel(o.payment_status) : (o.payment_status || "").replaceAll("_", " ");
    const balance = Math.max(0, Number(o.balance_due_pkr || 0) - Number(o.balance_paid_pkr || 0));
    const created = o.created_at ? new Date(o.created_at).toLocaleDateString("en-PK", { month: "short", day: "numeric", year: "numeric" }) : "";
    return `
      <button class="order-list-row" type="button" data-action="open-tracking-order" data-order-id="${attr(o.id)}">
        <div>
          <strong>${esc(o.id)}</strong>
          <small>${esc(created)} · ${esc(stage)} · ${esc(payment)}</small>
        </div>
        <div class="order-list-row-totals">
          <strong>${PKR.format(Number(o.total_pkr || 0))}</strong>
          ${balance > 0 ? `<small>Balance due ${PKR.format(balance)}</small>` : ""}
        </div>
      </button>
    `;
  }).join("");
  target.innerHTML = `
    <div class="order-list-shell">
      <p class="kicker">Found ${orders.length} orders</p>
      <h2>${esc(formatPkDisplay(canon))}</h2>
      <p class="order-list-helper">Choose an order to see status, payment progress, and next steps.</p>
      <div class="order-list">${rows}</div>
    </div>
  `;
}

async function handleTrack(event) {
  event.preventDefault();
  const rawQuery = new FormData(event.currentTarget).get("query").trim();
  // If the input looks like a phone number, canonicalize so we exact-match.
  // Otherwise treat it as an order ID lookup (case-insensitive).
  const canon = canonPhone(rawQuery);
  const looksLikePhone = isValidPkMobile(canon);
  const query = looksLikePhone ? canon : rawQuery.toLowerCase();
  const fallbackMatches = state.orders.filter((order) => {
    if (looksLikePhone) return canonPhone(order.customer_phone) === canon;
    return [order.id, order.customer_phone].filter(Boolean).some((value) => String(value).toLowerCase().includes(query));
  });
  const result = await apiFetch(`/api/orders?query=${encodeURIComponent(query)}`, {}, {
    order: fallbackMatches[0] || null,
    orders: fallbackMatches,
  });
  // If the lookup was by phone and the customer has multiple orders, render
  // a list so they can pick the one they want — not just the most recent.
  const orders = Array.isArray(result.orders) ? result.orders : (result.order ? [result.order] : []);
  if (looksLikePhone && orders.length > 1) {
    renderOrderList(orders, canon);
    return;
  }
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
  if (document.body.dataset.page === "ads") {
    toast("Meta Ads unlocked.");
    loadAdsPageData();
    return;
  }
  toast("Internal portal unlocked.");
  refreshAdmin();
}

// Pull a human-readable message out of an apiFetch error. apiFetch throws
// `new Error(responseBodyText)`, which for our functions is JSON like
// {"error":"Cannot move…","code":"illegal_transition"}. Falls back to the
// raw message, then a generic string.
function parseApiError(err) {
  const raw = String(err?.message || err || "").trim();
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.error === "string") return parsed.error;
  } catch {}
  return raw.length <= 160 ? raw : "";
}

async function refreshAdmin() {
  // Skeleton state — flag the body so CSS can shimmer KPI cards / list rows
  // while we wait for /api/admin/dashboard. First-load only (state.orders
  // hasn't been populated yet); subsequent refreshes show stale-then-fresh
  // without the placeholders flashing.
  const firstLoad = !state.orders?.length;
  if (firstLoad) document.body.classList.add("admin-loading");
  const fallback = {
    orders: state.orders,
    products: state.products,
    trends: state.trends,
    settings: state.settings,
    shipmentBatches: state.shipmentBatches,
    customers: state.customers || [],
    waTemplates: state.waTemplates || [],
    marketingMessages: state.marketingMessages || [],
  };
  const data = await apiFetch("/api/admin/dashboard", {}, fallback);
  state.orders = data.orders || state.orders;
  state.products = data.products || state.products;
  state.trends = data.trends || state.trends;
  state.shipmentBatches = data.shipmentBatches || data.shipment_batches || state.shipmentBatches;
  state.customers = data.customers || state.customers || [];
  state.waTemplates = data.waTemplates || data.wa_templates || state.waTemplates || [];
  state.marketingMessages = data.marketingMessages || data.marketing_messages || state.marketingMessages || [];
  state.broadcastCampaigns = data.broadcastCampaigns || data.broadcast_campaigns || state.broadcastCampaigns || [];
  state.scheduledBroadcasts = data.scheduledBroadcasts || data.scheduled_broadcasts || state.scheduledBroadcasts || [];
  state.smartSegments = data.smartSegments || data.smart_segments || state.smartSegments || [];
  state.orderViews = data.orderViews || data.order_views || state.orderViews || [];
  state.teamMembers = data.teamMembers || data.team_members || state.teamMembers || [];
  state.settings = { ...state.settings, ...(data.settings || {}) };
  document.body.classList.remove("admin-loading");
  renderAll();
}

async function saveProduct(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const product = Object.fromEntries(new FormData(form).entries());
  delete product.image_file;
  if (!product.title || !product.title.trim()) {
    toast("Product title is required.");
    return;
  }
  // Distinguish a brand-new product from an edit BEFORE we derive an id, so we
  // can both preserve `featured` on edits and avoid slug-collisions on creates.
  const isNewProduct = !product.id;
  const existingProduct = isNewProduct ? null : state.products.find((p) => p.id === product.id);
  if (isNewProduct) {
    const baseId = product.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "product";
    // Guard against two products slugging to the same id (which would silently
    // overwrite the first). Append a short suffix until the id is unique.
    let candidate = baseId;
    let n = 2;
    while (state.products.some((p) => p.id === candidate)) candidate = `${baseId}-${n++}`;
    product.id = candidate;
  }
  const pricingMode = product.pricing_mode || "preorder";
  delete product.pricing_mode;

  // PKR-FIRST.
  // Both modes now require a final customer PKR price. The admin types
  // (or accepts the auto-filled suggestion). USD / FX / shipping are
  // optional internal-bookkeeping fields — kept only because the team
  // sometimes wants to track the underlying cost for margin reports.
  product.customer_price_pkr = Number(product.customer_price_pkr || 0);
  if (product.customer_price_pkr <= 0) {
    toast("Set the final customer PKR price. Paste a retailer URL above to auto-suggest one.");
    qs("[data-customer-price]")?.focus();
    return;
  }

  // Internal-only USD/FX/shipping bookkeeping — passes through whatever
  // was filled (by URL autofill or by hand in the cost-breakdown drawer).
  // The customer never sees these.
  product.usa_price_usd = Number(product.usa_price_usd || 0);
  product.shipping_pkr = Number(product.shipping_pkr || 0);
  product.fx_rate = Number(product.fx_rate || state.settings.fx_rate || 282);

  if (pricingMode === "in_stock") {
    product.stock_mode = "in_stock";
    product.delivery_days_min = Number(product.delivery_days_min || 3);
    product.delivery_days_max = Number(product.delivery_days_max || 5);
    product.preorder_weeks = 0;
  } else {
    product.stock_mode = "preorder";
    product.delivery_days_min = 0;
    product.delivery_days_max = 0;
    product.preorder_weeks = Number(state.settings.preorder_weeks || 4);
  }
  product.inventory = Number(product.inventory || 0);
  product.low_stock_threshold = product.low_stock_threshold !== "" && product.low_stock_threshold != null
    ? Number(product.low_stock_threshold)
    : 2;
  if (product.stock_mode === "in_stock" && product.inventory <= 0 && product.product_status === "active") {
    toast("Active in-stock products need inventory above 0.");
    return;
  }
  product.supplier_cost_pkr = Number(product.supplier_cost_pkr || 0);
  product.gallery_urls = String(product.gallery_urls || "").split(/\n|,/).map((url) => url.trim()).filter(Boolean);
  product.image_url = String(product.image_url || "").trim();
  product.markup_rate = state.settings.markup_rate;
  // Preserve an existing product's featured flag (the star toggle owns it) —
  // only auto-feature the first few brand-new products as a convenience. The
  // old code recomputed this on every save, silently un-featuring edits.
  product.featured = isNewProduct ? state.products.length < 3 : Boolean(existingProduct?.featured);
  // `status` is the single source of truth; the editor's publish select is
  // still named product_status, so map it across and drop the legacy key.
  product.status = product.product_status || "active";
  delete product.product_status;
  const restore = withSubmitState(form, "Saving product…");
  try {
    const saved = await apiFetch("/api/catalog", { method: "POST", body: JSON.stringify(product) }, { product });
    const index = state.products.findIndex((item) => item.id === product.id);
    if (index >= 0) state.products[index] = saved.product || product;
    else state.products.unshift(saved.product || product);
    renderAll();
    fillProductForm();
    toast("Product saved.");
  } catch (err) {
    // Surface the real cause so we don't keep guessing. Most common is a
    // missing-column error from Supabase when the schema migration hasn't
    // been run yet — that message points the user directly at the fix.
    const raw = (err && (err.message || err.error || String(err))) || "";
    let msg = "Product could not be saved.";
    if (/column .* schema cache|Could not find/i.test(raw)) {
      msg = "Database is missing a new column. Run the latest supabase/schema.sql in the Supabase SQL editor.";
    } else if (/Unauthorized/i.test(raw)) {
      msg = "Portal key rejected. Re-enter the admin token.";
    } else if (raw) {
      msg = `Save failed: ${raw}`;
    }
    toast(msg);
    console.error("[saveProduct]", err);
  } finally {
    restore();
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
  const health = qs("[data-product-url-import-health]");
  if (!form || !input) return;
  const url = input.value.trim();
  if (!url) {
    toast("Paste a product URL first.");
    return;
  }
  if (status) status.textContent = "Fetching retailer page…";
  if (health) health.innerHTML = "";

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
      if (health) health.innerHTML = `<span class="missing">Endpoint offline</span><span class="missing">Manual fill needed</span>`;
      toast(message);
      return;
    }
    if (response.status === 401) {
      const message = "Portal session expired. Reload and unlock the portal again.";
      if (status) status.textContent = message;
      if (health) health.innerHTML = `<span class="missing">Session expired</span>`;
      toast(message);
      return;
    }
    result = await response.json();
  } catch (err) {
    const message = "Couldn't reach the autofill endpoint. Check your connection — or fill the form manually.";
    if (status) status.textContent = message;
    if (health) health.innerHTML = `<span class="missing">Connection failed</span><span class="missing">Manual fill needed</span>`;
    toast(message);
    return;
  }
  if (result.error && !result.candidate) {
    // The function ran but couldn't extract anything — typically because the
    // retailer is bot-blocking. Show the server's message verbatim, plus a
    // hint that manual works.
    const message = `${result.error} You can still type the title, price, and image URL manually.`;
    if (status) status.textContent = message;
    if (health) health.innerHTML = `<span class="missing">Retailer blocked</span><span class="missing">Manual fill needed</span>`;
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
  writeIfEmpty("shipping_pkr", c.shipping_pkr || "");
  // PKR-first: pre-fill the customer-facing PKR price from the server's
  // suggested figure (USD × FX × markup + shipping band). Admin only sees
  // this field and can edit it; USD/FX/shipping live in the collapsed
  // "Cost breakdown" section. Remember the suggestion so the reset button
  // can restore it.
  if (c.suggested_customer_price_pkr) {
    writeIfEmpty("customer_price_pkr", c.suggested_customer_price_pkr);
    const priceField = form.elements.customer_price_pkr;
    if (priceField) priceField.dataset.suggested = c.suggested_customer_price_pkr;
    const hint = qs("[data-customer-price-hint]");
    if (hint) {
      hint.innerHTML = `Auto-filled: <strong>${PKR.format(c.suggested_customer_price_pkr)}</strong> (USD ${c.usa_price_usd || "?"} × FX × markup + shipping). Edit to override.`;
    }
  }
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
  const healthItems = [
    ["title", "Title", c.title],
    ["price", "Price", c.usa_price_usd],
    ["shipping", "Shipping", c.shipping_pkr],
    ["image", "Image", c.image_url],
    ["source", "Source URL", c.source_url || url],
  ];
  if (health) {
    health.innerHTML = healthItems
      .map(([, label, value]) => `<span class="${value ? "ok" : "missing"}">${esc(label)}</span>`)
      .join("");
  }
  const filled = healthItems.filter(([, , value]) => value).length;
  if (status) status.textContent = `Filled ${filled}/5 key fields. Review and edit before saving.`;
  toast("Autofill complete — review the form before saving.");
}

// ═══════════════════════ SOURCING TRAY (admin bulk URL importer) ═════════
// Paste up to 50 retailer URLs, hit Fetch All. Each parsed row gets a
// queue card with title, USD, suggested PKR, and dedupe info. Admin
// checks the rows they want and clicks Save selected — server bulk-
// upserts them in one round trip.

const sourcingState = {
  queue: [],         // array of { url, status, candidate?, existing? }
  fetching: false,
  saving: false,
};

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || `item-${Date.now().toString(36)}`;
}

// "Suggest 10 products" — primary bulk-upload flow. Hits /api/scraper
// (which has been seeded with 18 curated products spanning all 5 categories
// with a 5-image gallery per item) and renders the response as rich cards
// in the same queue the URL-paste flow uses. Each candidate arrives with
// title, brand, category, USD, suggested PKR, description, and asset_urls.
async function suggestTenProducts() {
  const status = qs("[data-sourcing-status]");
  const queueWrap = qs("[data-sourcing-queue]");
  const footer = qs("[data-sourcing-footer]");
  const clearBtn = qs("[data-suggest-clear-btn]");

  if (status) {
    status.textContent = "Curating 10 review-ready products…";
    status.classList.add("is-busy");
  }

  let payload;
  try {
    const headers = new Headers({ "Content-Type": "application/json" });
    if (state.adminToken) headers.set("Authorization", `Bearer ${state.adminToken}`);
    const response = await fetch("/api/scraper", {
      method: "POST",
      headers,
      body: JSON.stringify({ target_count: 10, batch_id: `suggest-${Date.now().toString(36)}` }),
    });
    if (!response.ok) throw new Error(await response.text());
    payload = await response.json();
  } catch (err) {
    if (status) {
      status.textContent = `Couldn't suggest products: ${err.message || err}`;
      status.classList.remove("is-busy");
    }
    return;
  }
  if (status) status.classList.remove("is-busy");

  const trends = payload.trends || [];
  if (!trends.length) {
    if (status) status.textContent = "No suggestions returned. Try again in a moment.";
    return;
  }

  // Mirror trend candidates into the sourcing queue shape so the existing
  // bulk-save pipeline (POST /api/catalog with { products: [...] }) just
  // works. Compute a suggested customer_price_pkr server-side equivalent
  // client-side using current store settings.
  const fx = Number(state.settings?.fx_rate || 282);
  const markup = Number(state.settings?.markup_rate ?? 0.25);
  sourcingState.queue = trends.map((t) => {
    const usd = Number(t.usa_price_usd || 0);
    const shipping = Number(t.shipping_pkr || 0);
    const retail = usd * fx;
    const suggestedPkr = Math.ceil(retail + retail * markup + shipping);
    const gallery = Array.isArray(t.asset_urls) && t.asset_urls.length
      ? t.asset_urls
      : (t.image_url ? [t.image_url] : []);
    return {
      url: t.source_url || "",
      ok: true,
      status: "ok",
      selected: true,
      // The candidate shape the existing renderer / save flow already
      // understands, plus a few extras for the rich card.
      candidate: {
        title: t.title,
        brand: t.brand,
        category: t.category || "accessories",
        description: t.suggested_description || "",
        usa_price_usd: usd,
        shipping_pkr: shipping,
        image_url: gallery[0] || "",
        gallery_urls: gallery,
        source_url: t.source_url || "",
        variants: t.variants || "Confirm size, shade, color, or volume before approval.",
        authenticity_note: t.authenticity_note || "Verify official retailer source and attach receipt before publishing.",
        suggested_customer_price_pkr: suggestedPkr,
        suggested_shipping_pkr: shipping,
        // Hero-index lets the admin click thumbnails to swap which image
        // becomes the saved product's hero. Defaults to 0.
        _heroIdx: 0,
      },
    };
  });

  if (queueWrap) {
    queueWrap.hidden = false;
    queueWrap.classList.add("suggest-grid");
  }
  if (footer) footer.hidden = false;
  if (clearBtn) clearBtn.hidden = false;
  if (status) status.textContent = `${trends.length} review-ready products curated. Tweak anything, pick hero images, then save.`;
  renderSourcingTrayQueue();
}

async function sourcingFetchAll() {
  const textarea = qs("[data-sourcing-urls]");
  const status = qs("[data-sourcing-status]");
  const queueWrap = qs("[data-sourcing-queue]");
  const footer = qs("[data-sourcing-footer]");
  if (!textarea) return;
  const raw = String(textarea.value || "").trim();
  if (!raw) {
    toast("Paste at least one retailer URL.");
    return;
  }
  const urls = [...new Set(raw.split(/\r?\n/).map((line) => line.trim()).filter((line) => /^https?:\/\//i.test(line)))].slice(0, 50);
  if (!urls.length) {
    toast("No valid http(s) URLs found in the box.");
    return;
  }
  sourcingState.fetching = true;
  if (status) {
    status.textContent = `Fetching ${urls.length} URL${urls.length === 1 ? "" : "s"}…`;
    status.classList.add("is-busy");
  }
  let payload;
  try {
    const headers = new Headers({ "Content-Type": "application/json" });
    if (state.adminToken) headers.set("Authorization", `Bearer ${state.adminToken}`);
    const response = await fetch("/api/admin/fetch-product", {
      method: "POST",
      headers,
      body: JSON.stringify({ urls }),
    });
    if (!response.ok) throw new Error(await response.text());
    payload = await response.json();
  } catch (err) {
    if (status) {
      status.textContent = `Fetch failed: ${err.message || err}`;
      status.classList.remove("is-busy");
    }
    sourcingState.fetching = false;
    return;
  }
  sourcingState.fetching = false;
  if (status) status.classList.remove("is-busy");
  sourcingState.queue = (payload.results || []).map((row) => ({
    ...row,
    selected: row.status === "ok" || row.status === "partial",
  }));
  const ok = sourcingState.queue.filter((r) => r.status === "ok").length;
  const blocked = sourcingState.queue.filter((r) => r.status === "blocked" || r.status === "error").length;
  const dupes = sourcingState.queue.filter((r) => r.status === "duplicate").length;
  if (status) {
    status.textContent = `Fetched ${ok} ok · ${dupes} already in catalog · ${blocked} blocked. Review and save selected.`;
  }
  if (queueWrap) queueWrap.hidden = false;
  if (footer) footer.hidden = false;
  renderSourcingTrayQueue();
}

function renderSourcingTrayQueue() {
  const queueWrap = qs("[data-sourcing-queue]");
  if (!queueWrap) return;
  if (!sourcingState.queue.length) {
    queueWrap.hidden = true;
    return;
  }
  queueWrap.hidden = false;
  // Two render modes:
  //   • Rich card grid — when every row is a parseable candidate. Used
  //     by "Suggest 10" and by URL-paste rows that came back ok.
  //   • Compact row list — for rows that need attention (duplicate /
  //     blocked / error). Mixed queues fall back to the row list.
  const allRich = sourcingState.queue.every((r) => (r.status === "ok" || r.status === "partial") && r.candidate?.gallery_urls?.length);
  queueWrap.classList.toggle("suggest-grid", allRich);
  queueWrap.innerHTML = sourcingState.queue.map((row, i) => allRich ? renderSuggestCard(row, i) : renderSuggestRow(row, i)).join("");
  updateSourcingSelectedCount();
}

// Rich suggestion card — used by the Suggest 10 grid. Each card shows:
//   • Image gallery: big hero on top, thumbnail strip below.
//   • Editable title, brand, category, suggested PKR.
//   • Description preview + source link.
//   • Select checkbox + remove button.
function renderSuggestCard(row, i) {
  const c = row.candidate || {};
  const gallery = Array.isArray(c.gallery_urls) ? c.gallery_urls : [];
  const heroIdx = Math.max(0, Math.min(gallery.length - 1, c._heroIdx || 0));
  const hero = gallery[heroIdx] || c.image_url || "";
  const thumbs = gallery.length > 1
    ? gallery.map((g, gi) => `
        <button type="button" class="suggest-thumb${gi === heroIdx ? " is-active" : ""}"
                data-action="suggest-set-hero" data-row="${i}" data-img-idx="${gi}"
                aria-label="Use image ${gi + 1} as hero">
          <img src="${safeUrl(imageUrl(g, { width: 100, height: 100 }), "")}" alt="" loading="lazy" />
        </button>
      `).join("")
    : "";
  const categoryOptions = ["handbags", "shoes", "makeup", "fragrance", "accessories"]
    .map((cat) => `<option value="${cat}"${cat === c.category ? " selected" : ""}>${cat[0].toUpperCase() + cat.slice(1)}</option>`)
    .join("");
  return `
    <article class="suggest-card${row.selected ? " is-selected" : ""}" data-sourcing-tray-row="${i}">
      <header class="suggest-card-head">
        <label class="suggest-select">
          <input type="checkbox" data-sourcing-check ${row.selected ? "checked" : ""} aria-label="Select" />
        </label>
        <span class="suggest-img-count">${gallery.length} photo${gallery.length === 1 ? "" : "s"}</span>
        <button type="button" class="suggest-remove" data-action="sourcing-remove" data-row="${i}" aria-label="Remove">×</button>
      </header>
      <div class="suggest-hero">
        ${hero
          ? `<img src="${safeUrl(imageUrl(hero, { width: 600, height: 600 }), "")}" alt="${attr(c.title || "")}" loading="lazy" />`
          : `<div class="suggest-hero-fallback">No image</div>`}
      </div>
      ${thumbs ? `<div class="suggest-thumb-strip">${thumbs}</div>` : ""}
      <div class="suggest-body">
        <label class="suggest-field suggest-field-title">
          <span>Title</span>
          <input type="text" data-suggest-edit data-row="${i}" data-field="title" value="${attr(c.title || "")}" />
        </label>
        <div class="suggest-field-grid">
          <label class="suggest-field">
            <span>Brand</span>
            <input type="text" data-suggest-edit data-row="${i}" data-field="brand" value="${attr(c.brand || "")}" />
          </label>
          <label class="suggest-field">
            <span>Category</span>
            <select data-suggest-edit data-row="${i}" data-field="category">${categoryOptions}</select>
          </label>
        </div>
        <label class="suggest-field suggest-field-price">
          <span>Customer price PKR (final)</span>
          <div class="suggest-price-wrap">
            <span class="suggest-price-prefix">Rs</span>
            <input type="number" min="0" step="100" data-suggest-edit data-row="${i}" data-field="suggested_customer_price_pkr" value="${attr(c.suggested_customer_price_pkr || 0)}" />
          </div>
        </label>
        <p class="suggest-description">${esc((c.description || "").slice(0, 200))}${(c.description || "").length > 200 ? "…" : ""}</p>
        ${c.source_url ? `<a class="suggest-source" href="${safeUrl(c.source_url)}" target="_blank" rel="noopener noreferrer">View source →</a>` : ""}
      </div>
    </article>
  `;
}

// Compact row used for mixed queues (e.g. URL paste with duplicates/blocks).
function renderSuggestRow(row, i) {
  const c = row.candidate || {};
  const img = c.image_url
    ? `<img class="row-image" src="${safeUrl(imageUrl(c.image_url, { width: 120, height: 120 }), "")}" alt="" loading="lazy" />`
    : `<div class="row-image row-image-fallback">no img</div>`;
  const checkable = row.status === "ok" || row.status === "partial";
  const statusChip = {
    ok: "Ready",
    partial: "Partial",
    duplicate: "Already in catalog",
    blocked: "Bot-blocked",
    error: "Error",
  }[row.status] || row.status;
  const titleLine = row.status === "duplicate"
    ? esc(row.existing_title || "Existing product")
    : esc(c.title || row.url);
  const metaParts = [];
  if (row.status === "ok" || row.status === "partial") {
    if (c.brand) metaParts.push(esc(c.brand));
    if (c.category) metaParts.push(esc(c.category));
    if (c.suggested_customer_price_pkr) {
      metaParts.push(`Suggested <strong>${PKR.format(c.suggested_customer_price_pkr)}</strong>`);
    }
  } else if (row.status === "duplicate") {
    metaParts.push(`<a href="#" data-action="sourcing-open-existing" data-product-id="${attr(row.existing_product_id)}">Open existing product →</a>`);
  } else {
    metaParts.push(esc(row.error || "Could not fetch this URL"));
  }
  return `
    <div class="sourcing-row is-${esc(row.status)}" data-sourcing-tray-row="${i}">
      <input type="checkbox" data-sourcing-check ${row.selected && checkable ? "checked" : ""} ${checkable ? "" : "disabled"} aria-label="Select row" />
      ${img}
      <div class="row-body">
        <div class="row-title">${titleLine}</div>
        <div class="row-meta">${metaParts.join(" · ")}</div>
      </div>
      <div class="row-actions">
        <span class="row-status-chip">${esc(statusChip)}</span>
        ${checkable ? `<button class="row-mini" type="button" data-action="sourcing-edit" data-row="${i}">Edit</button>` : ""}
        <button class="row-mini" type="button" data-action="sourcing-remove" data-row="${i}" aria-label="Remove row">×</button>
      </div>
    </div>
  `;
}

function updateSourcingSelectedCount() {
  const target = qs("[data-sourcing-selected]");
  if (!target) return;
  const n = sourcingState.queue.filter((r) => r.selected && (r.status === "ok" || r.status === "partial")).length;
  target.textContent = `${n} selected`;
}

function sourcingToggleSelectAll(checked) {
  sourcingState.queue.forEach((row) => {
    if (row.status === "ok" || row.status === "partial") row.selected = checked;
  });
  renderSourcingTrayQueue();
}

function sourcingClear() {
  const textarea = qs("[data-sourcing-urls]");
  if (textarea) textarea.value = "";
  sourcingState.queue = [];
  renderSourcingTrayQueue();
  const status = qs("[data-sourcing-status]");
  if (status) status.textContent = "";
  const queueWrap = qs("[data-sourcing-queue]");
  const footer = qs("[data-sourcing-footer]");
  if (queueWrap) queueWrap.hidden = true;
  if (footer) footer.hidden = true;
}

// "Edit" — drops the row into the main product editor form so admin can
// tweak before saving. Removes the row from the tray (it's now "live" in
// the form).
function sourcingEditRow(index) {
  const row = sourcingState.queue[index];
  if (!row || !row.candidate) return;
  const c = row.candidate;
  fillProductForm({
    id: slugify(c.title),
    title: c.title,
    brand: c.brand,
    category: c.category,
    description: c.description,
    image_url: c.image_url,
    gallery_urls: (c.gallery_urls || []).join("\n"),
    source_url: c.source_url,
    variants: c.variants,
    authenticity_note: c.authenticity_note,
    usa_price_usd: c.usa_price_usd,
    shipping_pkr: c.suggested_shipping_pkr,
    pricing_mode: "preorder",
    stock_mode: "preorder",
    fx_rate: state.settings.fx_rate || 282,
    inventory: 0,
    product_status: "draft",
  });
  // Scroll the form into view so admin sees the change immediately.
  qs("[data-product-editor]")?.scrollIntoView({ behavior: "smooth", block: "start" });
  sourcingState.queue.splice(index, 1);
  renderSourcingTrayQueue();
  toast("Loaded into editor. Adjust and save.");
}

function sourcingRemoveRow(index) {
  sourcingState.queue.splice(index, 1);
  renderSourcingTrayQueue();
}

// Bulk save — sends all selected rows in one POST to /api/catalog with
// { products: [...] }. Server upserts each and returns a results array.
async function sourcingSaveSelected() {
  const publishSelect = qs("[data-sourcing-publish]");
  const publishAs = publishSelect?.value === "active" ? "active" : "draft";
  const selected = sourcingState.queue.filter((r) => r.selected && (r.status === "ok" || r.status === "partial"));
  if (!selected.length) {
    toast("Select at least one row to save.");
    return;
  }
  const fx = Number(state.settings.fx_rate || 282);
  const markup = Number(state.settings.markup_rate ?? 0.25);
  const products = selected.map((row) => {
    const c = row.candidate;
    // Hero image follows _heroIdx (admin clicked a thumbnail). Falls
    // back to the existing image_url (which suggest-set-hero keeps in
    // sync) or the first gallery image.
    const gallery = Array.isArray(c.gallery_urls) ? c.gallery_urls : [];
    const heroIdx = Math.max(0, Math.min(gallery.length - 1, c._heroIdx || 0));
    const hero = gallery[heroIdx] || c.image_url || gallery[0] || "";
    return {
      id: slugify(c.title),
      title: c.title,
      brand: c.brand,
      category: c.category,
      description: c.description,
      usa_price_usd: Number(c.usa_price_usd || 0),
      shipping_pkr: Number(c.suggested_shipping_pkr || c.shipping_pkr || 0),
      fx_rate: fx,
      markup_rate: markup,
      // PKR-first: the inline-edited customer price wins. Falls back to
      // the server's suggested figure if the admin didn't touch it.
      customer_price_pkr: Number(c.suggested_customer_price_pkr || c.customer_price_pkr || 0),
      stock_mode: "preorder",
      inventory: 0,
      low_stock_threshold: 2,
      image_url: hero,
      gallery_urls: gallery,
      variants: c.variants,
      authenticity_note: c.authenticity_note,
      source_url: c.source_url,
      product_status: publishAs,
      status: publishAs,
      preorder_weeks: Number(state.settings.preorder_weeks || 4),
      featured: false,
    };
  });
  sourcingState.saving = true;
  const status = qs("[data-sourcing-status]");
  if (status) {
    status.textContent = `Saving ${products.length} product${products.length === 1 ? "" : "s"}…`;
    status.classList.add("is-busy");
  }
  try {
    const headers = new Headers({ "Content-Type": "application/json" });
    if (state.adminToken) headers.set("Authorization", `Bearer ${state.adminToken}`);
    const response = await fetch("/api/catalog", {
      method: "POST",
      headers,
      body: JSON.stringify({ products }),
    });
    if (!response.ok) throw new Error(await response.text());
    const payload = await response.json();
    // Merge saved products into local state so admin can see them
    // immediately in the grid below.
    (payload.results || []).forEach((r) => {
      if (!r.ok || !r.product) return;
      const idx = state.products.findIndex((p) => p.id === r.product.id);
      if (idx >= 0) state.products[idx] = r.product;
      else state.products.unshift(r.product);
    });
    renderAll();
    // Drop the saved rows from the queue, leave failed rows for retry.
    const failedIds = new Set((payload.results || []).filter((r) => !r.ok).map((r) => r.id));
    sourcingState.queue = sourcingState.queue.filter((r) => {
      const id = slugify(r.candidate?.title || "");
      return failedIds.has(id) || r.status === "duplicate" || r.status === "blocked" || r.status === "error";
    });
    renderSourcingTrayQueue();
    if (status) status.textContent = `Saved ${payload.saved} · failed ${payload.failed}.`;
    toast(`Saved ${payload.saved} product${payload.saved === 1 ? "" : "s"} as ${publishAs}.`);
  } catch (err) {
    if (status) status.textContent = `Save failed: ${err.message || err}`;
    toast("Bulk save failed. Check the portal key and try again.");
  } finally {
    sourcingState.saving = false;
    if (status) status.classList.remove("is-busy");
  }
}

// ═══════════════════════ SOURCING REQUEST (public storefront) ═════════════
// Customer pastes a USA retailer URL on /shop. We hit /api/source-estimate
// and surface one of:
//   • existing in catalog → "View it" button (routes to PDP)
//   • parsed → estimate card with "Add to cart for team review"
//   • blocked → WhatsApp deeplink with the URL pre-filled

// Temp state for the modal — we hold the last estimate so the add-to-cart
// button can use it without re-fetching.
let lastSourceEstimate = null;

function openSourceRequestModal() {
  lastSourceEstimate = null;
  openModal(`
    <div class="source-modal">
      <h3>Source any USA product</h3>
      <p class="source-modal-intro">Paste a US retailer link below. We'll quote the final PKR price for sourcing, USA shipping, and delivery to your door in Pakistan.</p>
      <label>
        Retailer URL
        <input type="url" data-source-url placeholder="https://www.coach.com/products/..." autofocus />
      </label>
      <label>
        Variant / size / shade (optional)
        <input type="text" data-source-variant placeholder="e.g. Size 38, shade Pillow Talk" maxlength="280" />
      </label>
      <div class="source-modal-actions">
        <button class="button primary" type="button" data-action="source-quote">Get instant quote</button>
        <button class="button ghost" type="button" data-action="close-modal">Cancel</button>
      </div>
      <div class="source-modal-result" data-source-result></div>
    </div>
  `);
}

async function submitSourceRequest() {
  const urlInput = qs("[data-source-url]");
  const variantInput = qs("[data-source-variant]");
  const resultBox = qs("[data-source-result]");
  if (!urlInput || !resultBox) return;
  const url = String(urlInput.value || "").trim();
  if (!url) {
    resultBox.innerHTML = `<div class="source-result is-blocked">Paste a product URL first.</div>`;
    return;
  }
  resultBox.innerHTML = `<div class="source-result">Reaching out to the retailer… this usually takes a few seconds.</div>`;
  let payload;
  try {
    const response = await fetch("/api/source-estimate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, variant_note: variantInput?.value || "" }),
    });
    payload = await response.json();
    if (response.status === 429) {
      resultBox.innerHTML = `<div class="source-result is-blocked">${esc(payload.error || "Too many quotes — try again later.")}</div>`;
      return;
    }
    if (!response.ok && !payload) {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (err) {
    resultBox.innerHTML = `<div class="source-result is-blocked">Couldn't reach our quote service. Try again, or send the URL on WhatsApp.</div>`;
    return;
  }

  // Already in catalog — surface "view it"
  if (payload.matched_product_id) {
    resultBox.innerHTML = `
      <div class="source-result is-match">
        <p class="source-result-title">We already carry this!</p>
        <p class="source-result-meta">${esc(payload.matched_title || "Match found")}</p>
        <div class="source-modal-actions">
          <button class="button primary" type="button" data-action="source-open-existing" data-product-id="${attr(payload.matched_product_id)}">View product</button>
        </div>
      </div>
    `;
    return;
  }

  // Blocked path — WhatsApp fallback
  if (payload.blocked) {
    const waNumber = (payload.support_whatsapp || state.settings?.support_whatsapp || "").replace(/\D/g, "");
    const waText = `Hi Global Bestie, can you source this for me?\n${url}${variantInput?.value ? `\nVariant: ${variantInput.value}` : ""}`;
    const waHref = waNumber ? `https://wa.me/${waNumber}?text=${encodeURIComponent(waText)}` : "";
    resultBox.innerHTML = `
      <div class="source-result is-blocked">
        <p class="source-result-title">Couldn't auto-quote this one</p>
        <p class="source-result-meta">${esc(payload.message || "Send the link on WhatsApp and we'll quote within 15 minutes.")}</p>
        <div class="source-modal-actions">
          ${waHref ? `<a class="button primary" href="${attr(waHref)}" target="_blank" rel="noopener noreferrer">Send on WhatsApp</a>` : ""}
          <button class="button ghost" type="button" data-action="close-modal">Close</button>
        </div>
      </div>
    `;
    return;
  }

  // Good estimate path
  const c = payload.candidate || {};
  lastSourceEstimate = {
    source_url: c.source_url || url,
    title: c.title || url,
    image_url: c.image_url || "",
    category: c.category || "accessories",
    variant_note: c.variant_note || "",
    estimated_pkr: Number(payload.estimated_pkr || 0),
    preorder_weeks: Number(payload.preorder_weeks || 4),
  };
  const img = c.image_url
    ? `<img src="${safeUrl(imageUrl(c.image_url, { width: 320, height: 320 }), "")}" alt="${attr(c.title || "")}" style="width:120px;height:120px;object-fit:cover;border-radius:8px;border:1px solid var(--line);" />`
    : "";
  resultBox.innerHTML = `
    <div class="source-result is-match">
      <div style="display:flex;gap:14px;align-items:flex-start;">
        ${img}
        <div style="flex:1;min-width:0;">
          <p class="source-result-title">${esc(c.title || url)}</p>
          <p class="source-result-price">Estimated total: ${PKR.format(lastSourceEstimate.estimated_pkr)}</p>
          <p class="source-result-meta">Includes sourcing, international shipping, and our service. ~${lastSourceEstimate.preorder_weeks}-week preorder · 50% advance at checkout, balance on arrival.</p>
        </div>
      </div>
      <small class="source-result-note">${esc(payload.notes || "Working estimate — final PKR price shown at checkout. We share the shipment batch on WhatsApp within 15 min.")}</small>
      <div class="source-modal-actions">
        <button class="button primary" type="button" data-action="add-sourcing-to-cart">Add to cart for team review</button>
        <button class="button ghost" type="button" data-action="close-modal">Close</button>
      </div>
    </div>
  `;
}

function addSourcingRequestToCart() {
  if (!lastSourceEstimate) return;
  const id = `sourcing-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  state.cart = state.cart || [];
  state.cart.push({
    product_id: id,
    quantity: 1,
    kind: "sourcing_request",
    is_estimate: true,
    variant: lastSourceEstimate.variant_note || "",
    // Synthetic product so the existing cart rendering keeps working.
    product: {
      id,
      title: lastSourceEstimate.title,
      brand: "Sourcing request",
      category: lastSourceEstimate.category,
      customer_price_pkr: lastSourceEstimate.estimated_pkr,
      stock_mode: "preorder",
      image_url: lastSourceEstimate.image_url,
      source_url: lastSourceEstimate.source_url,
      preorder_weeks: lastSourceEstimate.preorder_weeks,
      is_sourcing_request: true,
    },
  });
  saveCart();
  renderCart();
  closeModal();
  setCartDrawerOpen(true);
  toast("Added to cart as a sourcing request — team will confirm the final price.");
}

// Inline version of submitSourceRequest() that targets the /quote page's
// own DOM ([data-quote-url] / [data-quote-variant] / [data-quote-url-result])
// instead of the modal's. Same backend (/api/source-estimate), same three
// branches (matched / blocked / good estimate). Reuses lastSourceEstimate
// so the "Add to cart" CTA on the quote page can call
// addSourcingRequestToCart() without re-fetching.
async function submitQuoteFromUrl() {
  const urlInput = qs("[data-quote-url]");
  const variantInput = qs("[data-quote-variant]");
  const resultBox = qs("[data-quote-url-result]");
  if (!urlInput) {
    // Belt-and-braces: shouldn't happen if the page rendered, but if it
    // does we surface it loudly instead of silently doing nothing.
    toast("Quote field missing on this page — reload and try again.");
    return;
  }
  if (!resultBox) {
    toast("Quote result slot missing — reload and try again.");
    return;
  }
  const url = String(urlInput.value || "").trim();
  if (!url) {
    resultBox.innerHTML = `<div class="source-result is-blocked">Paste a USA retailer link first.</div>`;
    resultBox.scrollIntoView({ behavior: "smooth", block: "center" });
    urlInput.focus();
    return;
  }
  if (!/^https?:\/\//i.test(url)) {
    resultBox.innerHTML = `<div class="source-result is-blocked">Link must start with http:// or https://</div>`;
    urlInput.focus();
    return;
  }
  resultBox.innerHTML = `<div class="source-result is-loading">
    <span class="quote-spinner" aria-hidden="true"></span>
    Reaching out to the retailer… this usually takes a few seconds.
  </div>`;
  // Ensure the loading state is actually visible — if the result slot
  // sits below the fold the user thinks nothing happened.
  resultBox.scrollIntoView({ behavior: "smooth", block: "center" });

  let payload;
  try {
    const response = await fetch("/api/source-estimate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, variant_note: variantInput?.value || "" }),
    });
    payload = await response.json().catch(() => null);
    if (response.status === 429) {
      resultBox.innerHTML = `<div class="source-result is-blocked">${esc(payload?.error || "Too many quotes right now — try again in an hour, or send the link on WhatsApp.")}</div>`;
      return;
    }
    if (!response.ok && !payload) throw new Error(`HTTP ${response.status}`);
  } catch (err) {
    resultBox.innerHTML = `<div class="source-result is-blocked">
      <p class="source-result-title">Couldn't reach our quote service</p>
      <p class="source-result-meta">Your connection might be flaky — try again, or send us the link on WhatsApp and we'll quote it for you.</p>
      <div class="source-modal-actions">
        <a class="button primary" href="https://wa.me/13362556023?text=${encodeURIComponent(`Hi Global Bestie, can you quote this?\n${url}`)}" target="_blank" rel="noopener noreferrer">Send on WhatsApp</a>
      </div>
    </div>`;
    return;
  }

  // Branch 1 — already in catalog. Surface "view product" deeplink.
  if (payload.matched_product_id) {
    resultBox.innerHTML = `
      <div class="source-result is-match">
        <p class="source-result-title">We already carry this!</p>
        <p class="source-result-meta">${esc(payload.matched_title || "Match found in our catalog")}</p>
        <div class="source-modal-actions">
          <button class="button primary" type="button" data-action="source-open-existing" data-product-id="${attr(payload.matched_product_id)}">View product</button>
          <a class="button ghost" href="/shop" data-route="shop">Keep browsing</a>
        </div>
      </div>
    `;
    return;
  }

  // Branch 2 — blocked or off-allowlist. Offer WhatsApp deeplink with the URL
  // pre-filled so the customer doesn't have to retype anything.
  if (payload.blocked) {
    const waNumber = (payload.support_whatsapp || state.settings?.support_whatsapp || "13362556023").replace(/\D/g, "");
    const waText = `Hi Global Bestie, can you source this for me?\n${url}${variantInput?.value ? `\nVariant: ${variantInput.value}` : ""}`;
    const waHref = `https://wa.me/${waNumber}?text=${encodeURIComponent(waText)}`;
    resultBox.innerHTML = `
      <div class="source-result is-blocked">
        <p class="source-result-title">Couldn't auto-quote this one</p>
        <p class="source-result-meta">${esc(payload.message || "Send the link on WhatsApp and we'll quote within 15 minutes — same workflow, just done by hand.")}</p>
        <div class="source-modal-actions">
          <a class="button primary" href="${attr(waHref)}" target="_blank" rel="noopener noreferrer">Send on WhatsApp</a>
        </div>
      </div>
    `;
    return;
  }

  // Branch 3 — successful estimate. Stash in lastSourceEstimate so the
  // "Add to cart for team review" button has everything it needs.
  const c = payload.candidate || {};
  lastSourceEstimate = {
    source_url: c.source_url || url,
    title: c.title || url,
    image_url: c.image_url || "",
    category: c.category || "accessories",
    variant_note: c.variant_note || variantInput?.value || "",
    estimated_pkr: Number(payload.estimated_pkr || 0),
    preorder_weeks: Number(payload.preorder_weeks || 4),
  };
  const img = c.image_url
    ? `<img src="${safeUrl(imageUrl(c.image_url, { width: 320, height: 320 }), "")}" alt="${attr(c.title || "")}" loading="lazy" />`
    : `<div class="quote-result-img-fallback" aria-hidden="true">img</div>`;
  resultBox.innerHTML = `
    <div class="source-result is-match quote-result-card">
      <div class="quote-result-head">
        ${img}
        <div class="quote-result-meta">
          <p class="source-result-title">${esc(c.title || "USA product")}</p>
          <p class="source-result-price">${PKR.format(lastSourceEstimate.estimated_pkr)}</p>
          <p class="quote-result-sub">Estimated total · includes sourcing, international shipping &amp; door-to-door delivery.</p>
        </div>
      </div>
      <ul class="quote-includes" aria-label="What's included">
        <li>USA sourcing</li>
        <li>International shipping</li>
        <li>Delivery to your door</li>
      </ul>
      <small class="source-result-note">${esc(payload.notes || "Working estimate — final PKR price shown at checkout. We share the shipment batch on WhatsApp within 15 min.")}</small>
      <div class="source-modal-actions">
        <button class="button primary" type="button" data-action="add-sourcing-to-cart">Add to cart for team review</button>
        <a class="button ghost" href="https://wa.me/13362556023?text=${encodeURIComponent(`Hi Global Bestie, can you confirm this quote?\n${url}\nVariant: ${variantInput?.value || ""}\nPKR estimate shown: ${PKR.format(lastSourceEstimate.estimated_pkr)}`)}" target="_blank" rel="noopener noreferrer">Confirm on WhatsApp</a>
      </div>
    </div>
  `;
}

// Disables the submit button on a form, swaps its text for a busy state,
// and returns a restore() callback the caller invokes in finally so the
// button is always restored even if the request throws.
function withSubmitState(form, busyText = "Saving…") {
  const btn = form?.querySelector("button[type='submit']");
  if (!btn) return () => {};
  const original = btn.textContent;
  btn.disabled = true;
  btn.dataset.busy = "1";
  btn.textContent = busyText;
  return () => {
    btn.disabled = false;
    btn.removeAttribute("data-busy");
    btn.textContent = original;
  };
}

async function saveSettings(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const settings = Object.fromEntries(new FormData(form).entries());
  settings.markup_rate = Number(settings.markup_rate);
  if (settings.markup_rate > 1) settings.markup_rate = settings.markup_rate / 100;
  settings.fx_rate = Number(settings.fx_rate);
  settings.preorder_weeks = Number(settings.preorder_weeks);
  settings.response_sla_minutes = Number(settings.response_sla_minutes || 15);
  settings.monthly_revenue_target = Number(settings.monthly_revenue_target || 0);
  // (Ads guardrails moved to the standalone ads.html — saved there, not here.)
  const restore = withSubmitState(form, "Saving settings…");
  try {
    const saved = await apiFetch("/api/admin/settings", { method: "POST", body: JSON.stringify(settings) }, { settings });
    state.settings = { ...state.settings, ...(saved.settings || settings) };
    renderAll();
    fillSettingsForm();
    toast("Settings saved.");
  } catch {
    toast("Settings could not be saved. Check the portal key and try again.");
  } finally {
    restore();
  }
}

async function acceptOrder(orderId) {
  const order = state.orders.find((item) => item.id === orderId);
  if (!order) return;
  const payment = orderPaymentSummary(order);

  // Margin guard — if projected profit margin is under 20%, force the team
  // to confirm so we don't silently accept loss-making orders. Margin is
  // (PKR sale − USD cost × FX) / PKR sale.
  const fx = Number(state.settings?.fx_rate || 282);
  const usdCost = orderUsdExpected(order);
  const projectedProfit = payment.total - usdCost * fx;
  const marginPct = payment.total > 0 ? (projectedProfit / payment.total) * 100 : 0;
  if (marginPct < 20) {
    const msg = projectedProfit < 0
      ? `⚠️ This order projects a LOSS of ${PKR.format(Math.abs(projectedProfit))} (${marginPct.toFixed(1)}% margin).`
      : `⚠️ Margin on this order is only ${marginPct.toFixed(1)}% (profit ${PKR.format(projectedProfit)}).`;
    const ok = window.confirm(`${msg}\n\nSale: ${PKR.format(payment.total)}\nUSD cost × FX: ${PKR.format(usdCost * fx)}\n\nAccept anyway?`);
    if (!ok) {
      toast("Accept cancelled — review USD cost or pricing first.");
      return;
    }
  }
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

// ── Inline stage / payment commits ───────────────────────────────────────────
// One shared path for the Advance button, the row's "Save edits", and the →
// shortcut. It optimistically repaints just the affected <tr> for instant
// feedback, persists, reconciles the rest of the dashboard without bouncing the
// operator's scroll, and offers a one-tap Undo. The revert is exact because we
// snapshot the prior state BEFORE mutating (the old code snapshotted it after,
// so its "revert" silently did nothing).
async function commitOrderStage(orderId, status, paymentStatus, { undoLabel } = {}) {
  const order = state.orders.find((o) => o.id === orderId);
  if (!order || !status) return;
  // Cancelling routes through the refund-capture modal so money owed back is
  // never lost. (The modal + undo set status directly, bypassing this guard.)
  if (status === "cancelled" && order.status !== "cancelled") {
    openCancelOrderModal(orderId);
    renderAdminOrders(); // resync the status dropdown — cancel commits via the modal
    return;
  }
  const prior = { status: order.status, payment_status: order.payment_status };
  const nextPayment = paymentStatus || activePaymentStatusForOrder(order, status);
  if (prior.status === status && prior.payment_status === nextPayment) return;
  // In list view we patch the one row and refresh everything EXCEPT the orders
  // table, so the focused <tr> is never destroyed — that's what lets →/j chain.
  // Board view has no rows, so it takes the normal full re-render (kanban).
  const listView = state.ordersView !== "board";
  const rowHadFocus = document.activeElement?.closest?.("tr.order-row")?.dataset?.orderId === orderId;

  order.status = status;
  order.payment_status = nextPayment;
  order.events = [
    ...(order.events || []),
    { status, note: `Team moved order to ${status.replaceAll("_", " ")} with payment marked ${paymentLabel(order.payment_status)}.`, created_at: new Date().toISOString() },
  ];
  patchOrderRow(order); // instant: update just this row, in place

  try {
    const result = await apiFetch(`/api/admin/orders/${orderId}`, {
      method: "PATCH",
      body: JSON.stringify({ status, payment_status: order.payment_status }),
    }, { order });
    const index = state.orders.findIndex((o) => o.id === orderId);
    if (index >= 0 && result.order) state.orders[index] = { ...state.orders[index], ...result.order };
    // In-stock items leave/return to stock as the order crosses "delivered".
    applyOrderStockEffects(state.orders.find((o) => o.id === orderId) || order, status);
    if (listView) {
      patchOrderRow(state.orders[index] || order);
      renderAdmin({ skipOrdersSurfaces: true });
      pruneFilteredOutRow(orderId, rowHadFocus);
    } else {
      renderAdmin();
    }
    syncOpenOrderDrawer(orderId);
    if (undoLabel) showUndoToast(undoLabel, () => commitOrderStage(orderId, prior.status, prior.payment_status, {}));
    else toast("Order updated.");
  } catch (err) {
    // Illegal transition / payment gate — revert to the exact prior state.
    order.status = prior.status;
    order.payment_status = prior.payment_status;
    if (listView) { patchOrderRow(order); renderAdmin({ skipOrdersSurfaces: true }); }
    else renderAdmin();
    syncOpenOrderDrawer(orderId);
    toast(parseApiError(err) || "Couldn't update the order. It was left unchanged.");
  }
}

// Update an order's <tr> in place. We rewrite the EXISTING row's innerHTML +
// className rather than replacing the element (outerHTML), because re-creating
// a focused <tr> drops keyboard focus to <body> — fatal for →/j chaining.
function patchOrderRow(order) {
  // Scope to the orders table — the ledger tab also renders tr.order-row with
  // the same data-order-id, and an unscoped query can hit that read-only row.
  const tr = qs(`[data-admin-orders] tr.order-row[data-order-id="${CSS.escape(order.id)}"]`);
  if (!tr) return;
  const scratch = document.createElement("tbody");
  scratch.innerHTML = orderRowHTML(order).trim();
  const fresh = scratch.firstElementChild;
  if (!fresh) return;
  tr.className = fresh.className;
  tr.innerHTML = fresh.innerHTML;
}

// After an in-place advance, drop the row if the active status filter no longer
// includes it, moving focus to a neighbour so keyboard nav keeps going. Also
// keeps the "X of Y" count chip honest since we skipped the table re-render.
function pruneFilteredOutRow(orderId, rowHadFocus) {
  const filter = qs("[data-admin-order-filter]")?.value || "all";
  const order = state.orders.find((o) => o.id === orderId);
  const tr = qs(`[data-admin-orders] tr.order-row[data-order-id="${CSS.escape(orderId)}"]`);
  if (tr && order && filter !== "all" && order.status !== filter) {
    const after = tr.nextElementSibling?.classList.contains("order-row") ? tr.nextElementSibling : null;
    const before = tr.previousElementSibling?.classList.contains("order-row") ? tr.previousElementSibling : null;
    const neighbour = after || before;
    tr.remove();
    if (rowHadFocus && neighbour) neighbour.focus();
  }
  const chip = qs("[data-orders-count-chip]");
  if (chip) chip.textContent = `${qsa("[data-admin-orders] tr.order-row").length} of ${state.orders.length}`;
}

// If the fullscreen order drawer is open on this order, re-render it so its
// stage tracker and actions reflect the change.
function syncOpenOrderDrawer(orderId) {
  const panel = qs('[data-admin-panel="order-detail"]');
  if (panel?.classList.contains("active")) showOrderDetails(orderId);
}

// One-click forward motion — used by the row Advance button, the drawer's
// primary action, the mobile card, and the → keyboard shortcut.
function advanceOrderStage(orderId) {
  const order = state.orders.find((o) => o.id === orderId);
  if (!order) return;
  const next = nextOrderStage(order.status);
  if (!next) { toast("This order is already at the final stage."); return; }
  const nextShort = ORDER_STAGE_SHORT[next] || next;
  commitOrderStage(orderId, next, activePaymentStatusForOrder(order, next), {
    undoLabel: `Moved ${orderId} to ${nextShort}`,
  });
}

// The row's "Save edits" button — commits whatever the two dropdowns now show.
async function saveOrderStatus(orderId) {
  const status = qs(`[data-order-status="${orderId}"]`)?.value;
  const paymentStatus = qs(`[data-order-payment="${orderId}"]`)?.value;
  await commitOrderStage(orderId, status, paymentStatus, {});
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

// ─────────────────────────── Cancellations & refunds ───────────────────────
// Cancelling isn't just a status flip: if the customer already transferred an
// advance (or balance), that money has to go back and be accounted for. This
// flow captures a reason, computes the refund owed, and drives it through a
// mark-as-sent step mirroring the payment-proof pattern — so refunds land in
// the ledger + cashflow instead of silently leaking out of the cash position.
const CANCEL_REASONS = [
  ["customer_changed_mind", "Customer changed their mind"],
  ["item_unavailable", "Item unavailable at source"],
  ["price_changed", "Source price changed / too high"],
  ["payment_failed", "Payment never completed"],
  ["duplicate", "Duplicate order"],
  ["undeliverable", "Address undeliverable"],
  ["other", "Other"],
];

function cancelReasonLabel(key) {
  return (CANCEL_REASONS.find(([k]) => k === key) || [])[1] || (key ? key.replaceAll("_", " ") : "Not given");
}

function openCancelOrderModal(orderId) {
  const order = state.orders.find((o) => o.id === orderId);
  if (!order) return;
  const collected = orderCollectedPkr(order);
  openModal(`
    <form class="cancel-order-modal" data-cancel-order-form data-order-id="${attr(orderId)}" onsubmit="return false">
      <p class="kicker">Cancel order</p>
      <h2>${esc(orderId)} · ${esc(order.customer_name || "")}</h2>
      <p class="cancel-modal-note">Moves the order to <strong>Cancelled</strong> and logs it on the timeline.</p>
      <label>Reason
        <select data-cancel-reason>
          ${CANCEL_REASONS.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join("")}
        </select>
      </label>
      <label>Note (optional)
        <input type="text" data-cancel-note placeholder="Anything the team should know" />
      </label>
      <div class="cancel-refund-summary ${collected > 0 ? "has-refund" : ""}">
        ${collected > 0
          ? `<div class="cancel-refund-line"><span>Collected so far</span><strong>${PKR.format(collected)}</strong></div>
             <label class="cancel-refund-toggle"><input type="checkbox" data-cancel-refund checked /> Log a refund of <strong>${PKR.format(collected)}</strong> as owed</label>`
          : `<span class="cancel-refund-none">No money collected yet — nothing to refund.</span>`}
      </div>
      <div class="modal-actions">
        <button class="button ghost" type="button" data-action="close-modal">Keep order</button>
        <button class="button danger" type="button" data-action="submit-cancel-order" data-order-id="${attr(orderId)}">Cancel order</button>
      </div>
    </form>
  `);
}

async function submitCancelOrder(orderId) {
  const order = state.orders.find((o) => o.id === orderId);
  if (!order) return;
  const reason = qs("[data-cancel-reason]")?.value || "other";
  const note = (qs("[data-cancel-note]")?.value || "").trim();
  const refundWanted = qs("[data-cancel-refund]") ? qs("[data-cancel-refund]").checked : false;
  const collected = orderCollectedPkr(order);
  const refundDue = refundWanted ? collected : 0;
  const prior = {
    status: order.status, payment_status: order.payment_status, next_action: order.next_action,
    refund_status: order.refund_status, refund_due_pkr: order.refund_due_pkr,
    cancel_reason: order.cancel_reason, cancelled_at: order.cancelled_at,
  };
  const now = new Date().toISOString();
  order.status = "cancelled";
  order.cancel_reason = reason;
  order.cancelled_at = now;
  order.refund_due_pkr = refundDue;
  order.refund_paid_pkr = Number(order.refund_paid_pkr || 0);
  order.refund_status = refundDue > 0 ? "due" : "none";
  order.next_action = refundDue > 0
    ? `Refund ${PKR.format(refundDue)} to the customer, then mark it sent.`
    : "Cancelled. No refund owed.";
  order.events = [
    ...(order.events || []),
    { status: "cancelled", note: `Order cancelled — ${cancelReasonLabel(reason)}${note ? ` · ${note}` : ""}${refundDue > 0 ? ` · refund ${PKR.format(refundDue)} owed` : ""}.`, created_at: now },
  ];
  closeModal();
  try {
    const result = await apiFetch(`/api/admin/orders/${orderId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "cancelled", cancel_reason: reason, refund_due_pkr: refundDue, order, note: `Cancelled — ${cancelReasonLabel(reason)}` }),
    }, { order });
    const idx = state.orders.findIndex((o) => o.id === orderId);
    if (idx >= 0 && result.order) state.orders[idx] = { ...state.orders[idx], ...result.order };
    // Return any already-deducted in-stock units (no-op unless the order had
    // reached "delivered" and decremented stock).
    applyOrderStockEffects(state.orders.find((o) => o.id === orderId) || order, "cancelled");
    renderAll();
    syncOpenOrderDrawer(orderId);
    showUndoToast(`${orderId} cancelled${refundDue > 0 ? ` · ${PKR.format(refundDue)} refund logged` : ""}`, () => {
      Object.assign(order, prior);
      order.events = (order.events || []).slice(0, -1);
      renderAll();
      syncOpenOrderDrawer(orderId);
    });
  } catch (err) {
    Object.assign(order, prior);
    order.events = (order.events || []).slice(0, -1);
    renderAll();
    syncOpenOrderDrawer(orderId);
    toast(parseApiError(err) || "Couldn't cancel the order. It was left unchanged.");
  }
}

async function markOrderRefunded(orderId) {
  const order = state.orders.find((o) => o.id === orderId);
  if (!order) return;
  const due = orderRefundOutstanding(order);
  if (due <= 0) { toast("No refund outstanding on this order."); return; }
  const reference = (qs(`[data-refund-reference="${orderId}"]`)?.value || "").trim();
  const prior = {
    refund_paid_pkr: order.refund_paid_pkr, refund_status: order.refund_status,
    refunded_at: order.refunded_at, refund_reference: order.refund_reference, next_action: order.next_action,
  };
  const now = new Date().toISOString();
  order.refund_paid_pkr = Number(order.refund_paid_pkr || 0) + due;
  order.refund_status = "refunded";
  order.refunded_at = now;
  order.refund_reference = reference || order.refund_reference || "";
  order.next_action = "Refund sent. Order closed.";
  order.events = [
    ...(order.events || []),
    { status: "cancelled", note: `Refund of ${PKR.format(due)} sent${reference ? ` · ref ${reference}` : ""}.`, created_at: now },
  ];
  try {
    const result = await apiFetch(`/api/admin/orders/${orderId}`, {
      method: "PATCH",
      body: JSON.stringify({ refund_action: "mark_refunded", refund_reference: reference, order, note: `Refund sent: ${PKR.format(due)}` }),
    }, { order });
    const idx = state.orders.findIndex((o) => o.id === orderId);
    if (idx >= 0 && result.order) state.orders[idx] = { ...state.orders[idx], ...result.order };
    renderAll();
    showOrderDetails(orderId);
    toast(`Refund of ${PKR.format(due)} marked sent.`);
  } catch (err) {
    Object.assign(order, prior);
    order.events = (order.events || []).slice(0, -1);
    renderAll();
    showOrderDetails(orderId);
    toast(parseApiError(err) || "Couldn't record the refund.");
  }
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
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());
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
  const restore = withSubmitState(form, "Creating batch…");
  try {
    const saved = await apiFetch("/api/admin/shipments", { method: "POST", body: JSON.stringify(batch) }, { shipmentBatch: batch });
    const finalBatch = saved.shipmentBatch || batch;
    const existingIdx = state.shipmentBatches.findIndex((b) => b.id === finalBatch.id);
    if (existingIdx >= 0) state.shipmentBatches[existingIdx] = finalBatch;
    else state.shipmentBatches.unshift(finalBatch);
    state.settings.next_shipment_date = batch.eta_date;
    state.settings.shipment_notice = batch.note;
    form.reset();
    renderAll();
    toast("Shipment batch created and set as the current ETA.");
  } catch {
    toast("Couldn't create batch. Check the portal key and try again.");
  } finally {
    restore();
  }
}

// Delete a shipment batch. Destructive + rare, so it's gated by a confirm that
// spells out the assigned-order count, and backed by a 10s Undo toast — the
// same revertible pattern as the Kanban stage moves. Orders are NEVER deleted:
// the batch link lives only in batch.order_ids, so removing the batch unassigns
// them. We reset their ETA copy so it doesn't reference a batch that's gone.
async function deleteShipmentBatch(batchId) {
  const index = state.shipmentBatches.findIndex((b) => b.id === batchId);
  if (index < 0) return;
  const batch = state.shipmentBatches[index];
  const assigned = state.orders.filter((order) => (batch.order_ids || []).includes(order.id));
  const orderLine = assigned.length
    ? `\n\n${assigned.length} assigned order${assigned.length === 1 ? "" : "s"} will be unassigned (the order${assigned.length === 1 ? "" : "s"} stay — only the batch link is removed).`
    : "";
  if (!window.confirm(`Delete shipment batch “${batch.name}”?${orderLine}`)) return;

  // Snapshot everything needed to fully restore on Undo: the batch object, its
  // position in the list, and each affected order's ETA / next-action / events.
  const snapshot = {
    batch: JSON.parse(JSON.stringify(batch)),
    index,
    orders: assigned.map((o) => ({
      id: o.id,
      eta: o.eta,
      next_action: o.next_action,
      events: (o.events || []).slice(),
    })),
  };

  // Optimistic removal + unassign.
  state.shipmentBatches.splice(index, 1);
  assigned.forEach((order) => {
    order.eta = "Shipment ETA to be reconfirmed";
    order.next_action = "Reassign to a shipment batch.";
    order.events = [
      ...(order.events || []),
      { status: order.status, note: `Removed from shipment batch ${batch.name} (batch deleted).`, created_at: new Date().toISOString() },
    ];
  });

  // If the deleted batch was driving the storefront ETA, fall back to the next
  // open batch so the public notice doesn't point at a batch that's gone.
  const nextOpen = state.shipmentBatches.find((b) => ["collecting", "sourcing", "shipped", "arriving"].includes(b.status));
  if (nextOpen && state.settings) {
    state.settings.next_shipment_date = nextOpen.eta_date;
    if (nextOpen.note) state.settings.shipment_notice = nextOpen.note;
  }

  renderAll();

  try {
    await apiFetch("/api/admin/shipments", {
      method: "DELETE",
      body: JSON.stringify({ id: batchId }),
    }, { ok: true });
  } catch {
    // API failure — roll the optimistic delete back so the UI doesn't diverge
    // from the server, and tell the user it didn't stick.
    restoreShipmentBatch(snapshot, { silent: true });
    toast("Couldn't delete batch. Check the portal key and try again.");
    return;
  }

  showUndoToast(`Deleted ${batch.name}`, () => restoreShipmentBatch(snapshot));
}

function restoreShipmentBatch(snapshot, { silent = false } = {}) {
  if (!snapshot) return;
  // Re-insert at the original position (clamped — the list may have changed).
  if (!state.shipmentBatches.some((b) => b.id === snapshot.batch.id)) {
    const at = Math.min(snapshot.index, state.shipmentBatches.length);
    state.shipmentBatches.splice(at, 0, snapshot.batch);
  }
  // Restore each affected order's ETA / next-action / events to pre-delete.
  snapshot.orders.forEach((s) => {
    const order = state.orders.find((o) => o.id === s.id);
    if (order) {
      order.eta = s.eta;
      order.next_action = s.next_action;
      order.events = s.events;
    }
  });
  renderAll();
  // Re-persist (upsert) so an Undo after a successful delete also restores it
  // server-side. No-op fallback when Supabase isn't wired locally.
  apiFetch("/api/admin/shipments", { method: "POST", body: JSON.stringify(snapshot.batch) }, { shipmentBatch: snapshot.batch });
  if (!silent) toast(`Restored ${snapshot.batch.name}`);
}

async function runScraper() {
  const batchId = `batch-${new Date().toISOString().slice(0, 10)}`;
  const status = qs("[data-trends-run-status]");
  if (status) {
    status.className = "bulk-run-status is-loading";
    status.textContent = "Uploading 10 review products with title, brand, category, source, image, price, shipping, variants, and authenticity notes…";
  }
  const result = await apiFetch("/api/scraper", {
    method: "POST",
    body: JSON.stringify({ target_count: 10, batch_id: batchId }),
  }, { trends: sampleTrends.slice(0, 10), batch: { id: batchId, target_count: 10, fetched_count: Math.min(10, sampleTrends.length) } });
  state.trends = result.trends || state.trends;
  renderTrends();
  const count = result.batch?.fetched_count || Math.min(10, state.trends.length);
  if (status) {
    status.className = "bulk-run-status is-ready";
    status.textContent = `${count} review products added as pending. Check images, copy, and source before saving drafts or publishing.`;
  }
  toast(`${count} review products uploaded for review.`);
}

async function queueCreative(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
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
  const restore = withSubmitState(form, "Adding…");
  try {
    const saved = await apiFetch("/api/admin/marketing", {
      method: "POST",
      body: JSON.stringify({ type: "creative_job", payload: job }),
    }, { creativeJob: job });
    const finalJob = saved.creativeJob || job;
    const existingJobIdx = state.creativeJobs.findIndex((j) => j.id === finalJob.id);
    if (existingJobIdx >= 0) state.creativeJobs[existingJobIdx] = finalJob;
    else state.creativeJobs.unshift(finalJob);
    form.reset();
    renderMarketing();
    toast("Content added to the library.");
  } catch {
    toast("Couldn't add content. Try again.");
  } finally {
    restore();
  }
}

async function createCampaign(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());
  const campaign = {
    id: `camp-${Date.now()}`,
    name: data.name,
    channel: data.channel,
    status: "draft",
    budget_pkr: Number(data.budget_pkr || 0),
    leads: 0,
    revenue_pkr: 0,
  };
  const restore = withSubmitState(form, "Creating…");
  try {
    const saved = await apiFetch("/api/admin/marketing", {
      method: "POST",
      body: JSON.stringify({ type: "campaign", payload: campaign }),
    }, { campaign });
    const finalCampaign = saved.campaign || campaign;
    const existingCampIdx = state.campaigns.findIndex((c) => c.id === finalCampaign.id);
    if (existingCampIdx >= 0) state.campaigns[existingCampIdx] = finalCampaign;
    else state.campaigns.unshift(finalCampaign);
    form.reset();
    renderMarketing();
    toast("Campaign created in draft.");
  } catch {
    toast("Couldn't create campaign. Try again.");
  } finally {
    restore();
  }
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
  const firstName = String(lead.name || "bestie").split(" ")[0] || "bestie";
  const suggested = `Hi ${firstName}, yes bestie. Please share your city, WhatsApp number, and exact ${product?.category === "makeup" ? "shade" : "size/color"} so we can confirm the right ${product?.category === "makeup" ? "shade" : "size"} and get your order moving.`;
  openModal(`
    <div class="lead-reply-modal">
      <p class="kicker">${esc(lead.source || "")} · ${esc(lead.sla || "SLA pending")}</p>
      <h2>${esc(lead.name || "Lead")}</h2>
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
        <label>Marketing badge (optional)<input name="marketing_badge" placeholder="Frequently requested · New drop" /></label>

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

  document.addEventListener("click", async (event) => {
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
    // Meta Ads panel actions
    if (action === "ads-refresh") return void loadAdsAdmin();
    if (action === "ads-archive-creative") return void adsArchiveCreative(target.dataset.creativeId);
    if (action === "ads-launch") return void adsCampaignAction("launch", target.dataset.adsId);
    if (action === "ads-undo") return void adsCampaignAction("undo", target.dataset.adsId);
    if (action === "ads-resume") return void adsCampaignAction("resume", target.dataset.adsId);
    if (action === "ads-reject") return void adsCampaignAction("reject", target.dataset.adsId);
    if (action === "ads-set-budget") return void adsSetBudget(target.dataset.adsId);
    if (action === "ads-optimize-preview") return void adsOptimizePreview();
    if (action === "ads-audience-refresh") return void adsAudienceRefresh();
    if (action === "close-modal") return closeModal();
    if (action === "toggle-wa-card") {
      const bubble = qs("[data-wa-bubble]");
      const fab = bubble?.querySelector(".whatsapp-fab");
      if (!bubble) return;
      const open = bubble.dataset.open === "true";
      bubble.dataset.open = open ? "false" : "true";
      if (fab) fab.setAttribute("aria-expanded", open ? "false" : "true");
      return;
    }
    if (action === "close-wa-card") {
      const bubble = qs("[data-wa-bubble]");
      const fab = bubble?.querySelector(".whatsapp-fab");
      if (!bubble) return;
      bubble.dataset.open = "false";
      if (fab) fab.setAttribute("aria-expanded", "false");
      return;
    }
    if (action === "dismiss-batch-reveal") {
      hideBatchReveal();
      return;
    }
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
    // Bulk WhatsApp — open template-picker modal for the current selection.
    if (action === "bulk-whatsapp") {
      event.preventDefault();
      return openBulkWhatsappModal();
    }
    if (action === "bulk-wa-send") {
      event.preventDefault();
      return sendBulkWhatsapp();
    }
    // Customer batch view — opens a modal showing every order from
    // this customer's phone.
    if (action === "view-customer-orders") {
      event.preventDefault();
      return openCustomerOrdersModal(target.dataset.customerPhone, target.dataset.customerName);
    }
    // Print packing slip / receipt for an order.
    if (action === "print-order") {
      event.preventDefault();
      return printOrderPackingSlip(target.dataset.orderId);
    }
    // Browser desktop notification toggle (portal Settings panel).
    if (action === "toggle-desktop-notif") {
      event.preventDefault();
      if (desktopNotifPreferred()) {
        disableDesktopNotifications();
      } else {
        await enableDesktopNotifications();
      }
      renderOperatorAlertsPanel();
      return;
    }
    // SLA-breach sound toggle.
    if (action === "toggle-sla-sound") {
      event.preventDefault();
      const next = !slaSoundPreferred();
      try { localStorage.setItem(SLA_SOUND_KEY, next ? "on" : "off"); } catch {}
      toast(next ? "SLA sound alerts on." : "SLA sound alerts off.");
      renderOperatorAlertsPanel();
      return;
    }
    // Reset the PKR price input back to the URL-autofill suggestion that's
    // stashed in dataset.suggested. Lets the admin try an edit and roll back.
    if (action === "reset-customer-price") {
      event.preventDefault();
      const input = qs("[data-customer-price]");
      const suggested = input?.dataset?.suggested;
      if (input && suggested) {
        input.value = suggested;
        updatePricePreview?.();
        toast(`Reset to suggested ${PKR.format(Number(suggested))}.`);
      } else {
        toast("No autofill suggestion to reset to. Paste a retailer URL first.");
      }
      return;
    }
    // Sourcing tray (admin bulk URL importer)
    if (action === "suggest-ten") {
      event.preventDefault();
      return suggestTenProducts();
    }
    if (action === "suggest-set-hero") {
      event.preventDefault();
      const idx = Number(target.dataset.row);
      const imgIdx = Number(target.dataset.imgIdx);
      const row = sourcingState.queue[idx];
      if (!row || !row.candidate) return;
      row.candidate._heroIdx = imgIdx;
      row.candidate.image_url = row.candidate.gallery_urls?.[imgIdx] || row.candidate.image_url;
      renderSourcingTrayQueue();
      return;
    }
    if (action === "sourcing-fetch") {
      event.preventDefault();
      return sourcingFetchAll();
    }
    if (action === "sourcing-clear" || action === "sourcing-discard") {
      event.preventDefault();
      return sourcingClear();
    }
    if (action === "sourcing-save") {
      event.preventDefault();
      return sourcingSaveSelected();
    }
    if (action === "sourcing-edit") {
      event.preventDefault();
      return sourcingEditRow(Number(target.dataset.row));
    }
    if (action === "sourcing-remove") {
      event.preventDefault();
      return sourcingRemoveRow(Number(target.dataset.row));
    }
    if (action === "sourcing-open-existing") {
      event.preventDefault();
      const id = target.dataset.productId;
      if (id) showProductDetails(id);
      return;
    }
    if (action === "open-source-modal") {
      event.preventDefault();
      return openSourceRequestModal();
    }
    if (action === "source-quote") {
      event.preventDefault();
      return submitSourceRequest();
    }
    if (action === "quote-from-url") {
      // Inline /quote-page URL paste path. Same backend as the modal,
      // different target DOM.
      event.preventDefault();
      return submitQuoteFromUrl();
    }
    if (action === "add-sourcing-to-cart") {
      event.preventDefault();
      return addSourcingRequestToCart();
    }
    if (action === "source-open-existing") {
      event.preventDefault();
      const id = target.dataset.productId;
      closeModal();
      if (id) navigateTo("product", { id });
      return;
    }
    if (action === "open-cart") return setCartDrawerOpen(true);
    if (action === "close-cart") return setCartDrawerOpen(false);
    if (action === "add-quote-estimate") return addQuoteEstimateToCart();
    // Note: action="checkout" guard is handled in the anchor click handler
    // above, which fires before this one and short-circuits navigation when
    // the cart is empty.
    if (action === "add-cart") return addToCart(productId);
    if (action === "quick-add-cart") return addToCart(productId, { fromCard: true });
    if (action === "toggle-wishlist") return toggleWishlist(productId);
    if (action === "restock-notify") return openRestockNotifyModal(productId);
    if (action === "restock-notify-submit") return submitRestockNotify(productId);
    if (action === "open-recent-product") {
      const id = target.dataset.productId;
      if (id) showProductDetails(id);
      return;
    }
    if (action === "open-account") {
      if (state.me) openAccountModal();
      else openLoginModal();
      return;
    }
    if (action === "request-otp-submit") {
      requestOtpSubmit();
      return;
    }
    if (action === "verify-otp-submit") {
      verifyOtpSubmit();
      return;
    }
    if (action === "logout") {
      logoutAccount();
      return;
    }
    if (action === "track-recent-order") {
      const id = target.dataset.orderId;
      const o = (state.orders || []).find((x) => x.id === id);
      if (o) renderTracking(o);
      return;
    }
    if (action === "open-filter-drawer") {
      qs("[data-filter-panel]")?.classList.add("is-open");
      document.body.classList.add("filter-drawer-open");
      return;
    }
    if (action === "close-filter-drawer") {
      qs("[data-filter-panel]")?.classList.remove("is-open");
      document.body.classList.remove("filter-drawer-open");
      return;
    }
    if (action === "add-checkout") return addToCart(productId, { checkout: true });
    if (action === "decrement-cart") return decrementCart(productId);
    if (action === "remove-cart") return removeFromCart(productId);
    if (action === "view-product") return showProductDetails(productId);
    if (action === "toggle-description") {
      // Expand the public PDP description in place — no modal reflow.
      const wrap = event.target.closest(".product-description");
      if (!wrap) return;
      const expanded = wrap.classList.toggle("is-expanded");
      wrap.querySelector("[data-desc-short]")?.toggleAttribute("hidden", expanded);
      wrap.querySelector("[data-desc-full]")?.toggleAttribute("hidden", !expanded);
      event.target.textContent = expanded ? "Read less" : "Read more";
      event.target.setAttribute("aria-expanded", String(expanded));
      return;
    }
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
    if (action === "advance-order") return advanceOrderStage(orderId);
    if (action === "cancel-order") return openCancelOrderModal(orderId);
    if (action === "submit-cancel-order") return submitCancelOrder(orderId);
    if (action === "mark-order-refunded") return markOrderRefunded(orderId);
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
    if (action === "copy-text") {
      const text = target.dataset.copy || "";
      const label = target.dataset.copyLabel || "value";
      if (!text) return;
      const flash = () => {
        const original = target.innerHTML;
        target.innerHTML = "<span>Copied ✓</span>";
        target.classList.add("copied");
        setTimeout(() => {
          target.innerHTML = original;
          target.classList.remove("copied");
        }, 1400);
      };
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(flash).catch(() => {
          toast(`${label}: ${text}`);
        });
      } else {
        toast(`${label}: ${text}`);
      }
      return;
    }
    if (action === "open-cmd-palette") {
      openCommandPalette();
      return;
    }
    if (action === "export-orders-csv") {
      exportOrdersCsv();
      return;
    }
    if (action === "export-customers-csv") {
      exportCustomersCsv();
      return;
    }
    if (action === "filter-risk-only") {
      state.customerFilters = state.customerFilters || {};
      state.customerFilters.riskOnly = true;
      renderCustomersTab();
      return;
    }
    if (action === "filter-clear-risk") {
      state.customerFilters = state.customerFilters || {};
      state.customerFilters.riskOnly = false;
      renderCustomersTab();
      return;
    }
    if (action === "clear-risk-flag") {
      const phone = target.dataset.customerPhone;
      if (!phone) return;
      patchCustomer(phone, { risk_flag: false, risk_reason: "" });
      toast("Risk flag cleared.");
      // Re-render the modal so the badge disappears immediately
      setTimeout(() => showCustomerDetails(phone), 80);
      return;
    }
    if (action === "bulk-orders-action") {
      bulkOrdersAction(target.dataset.bulkOp);
      return;
    }
    if (action === "toggle-all-orders") {
      const checked = target.checked;
      state.selectedOrders = checked ? new Set((state._ordersExport || []).map((o) => o.id)) : new Set();
      qsa("[data-order-select]").forEach((cb) => { cb.checked = checked; });
      renderBulkActionBar();
      return;
    }
    if (action === "open-dispatch") {
      openDispatchModal();
      return;
    }
    if (action === "dispatch-submit") {
      submitDispatch();
      return;
    }
    if (action === "open-segment-save") {
      openSegmentSaveModal();
      return;
    }
    if (action === "set-action-filter") {
      state._cashflowActionFilter = target.dataset.actionFilterKey || "all";
      qsa("[data-action='set-action-filter']").forEach((b) => b.classList.toggle("active", b.dataset.actionFilterKey === state._cashflowActionFilter));
      renderActionItems();
      return;
    }
    if (action === "apply-churn-segment") {
      state.customerFilters = state.customerFilters || {};
      // Filter to "≥3 orders, last seen >90d ago" by sorting by dormant
      state.customerFilters.sort = "dormant";
      const sel = qs("[data-customer-sort]"); if (sel) sel.value = "dormant";
      renderCustomersTab();
      toast("Sorted by dormant first — top of the list is your win-back priority.");
      return;
    }
    if (action === "open-customer-columns") {
      openCustomerColumnsModal();
      return;
    }
    if (action === "toggle-customer-col") {
      const key = target.dataset.colKey;
      if (!key) return;
      state.customerColumns = { ...(state.customerColumns || {}), [key]: target.checked };
      localStorage.setItem("gb_customer_columns", JSON.stringify(state.customerColumns));
      applyCustomerColumns();
      renderCustomersTab();
      return;
    }
    if (action === "open-order-view-save") {
      openOrderViewSaveModal();
      return;
    }
    if (action === "order-view-save-submit") {
      saveCurrentOrderView();
      return;
    }
    if (action === "apply-order-view") {
      const id = target.dataset.viewId;
      const v = (state.orderViews || []).find((x) => x.id === id);
      if (v) applyOrderView(v);
      return;
    }
    if (action === "delete-order-view") {
      const id = target.dataset.viewId;
      if (id && window.confirm("Delete this saved view?")) deleteOrderView(id);
      return;
    }
    if (action === "filter-by-risk-city") {
      const city = target.dataset.city;
      if (!city) return;
      state.customerFilters = state.customerFilters || {};
      state.customerFilters.riskOnly = true;
      state.customerFilters.city = city;
      // Mirror into the visible select
      const sel = qs("[data-customer-city]");
      if (sel) sel.value = city;
      renderCustomersTab();
      return;
    }
    if (action === "dispatch-batch") {
      const batchId = target.dataset.batchId;
      openDispatchModal({ batchId });
      return;
    }
    if (action === "delete-batch") {
      return deleteShipmentBatch(target.dataset.batchId);
    }
    if (action === "inv-inc") return adjustInventory(target.dataset.productId, 1);
    if (action === "inv-dec") return adjustInventory(target.dataset.productId, -1);
    if (action === "export-inventory-csv") return exportInventoryCsv();
    if (action === "toggle-product-status") return toggleProductStatus(target.dataset.productId);
    if (action === "toggle-product-featured") return toggleProductFeatured(target.dataset.productId);
    if (action === "remove-one-product") return removeOneProduct(target.dataset.productId);
    if (action === "bulk-publish-products") return bulkSetProductStatus("active");
    if (action === "bulk-draft-products") return bulkSetProductStatus("draft");
    if (action === "bulk-feature-products") return bulkSetFeatured(true);
    if (action === "bulk-unfeature-products") return bulkSetFeatured(false);
    if (action === "segment-save-submit") {
      saveCurrentSegment();
      return;
    }
    if (action === "apply-segment") {
      const id = target.dataset.segmentId;
      const seg = (state.smartSegments || []).find((s) => s.id === id);
      if (seg) applySegment(seg);
      return;
    }
    if (action === "delete-segment") {
      const id = target.dataset.segmentId;
      if (id && window.confirm("Delete this segment?")) deleteSegment(id);
      return;
    }
    // Besties (UGC) admin actions
    if (action === "ugc-approve") return setUgcStatus(target.dataset.ugcId, "approved");
    if (action === "ugc-unapprove") return setUgcStatus(target.dataset.ugcId, "pending");
    if (action === "ugc-edit") return startUgcEdit(target.dataset.ugcId);
    if (action === "ugc-cancel-edit") return cancelUgcEdit();
    if (action === "ugc-delete") {
      const id = target.dataset.ugcId;
      if (id && window.confirm("Remove this post from the rail?")) deleteUgcPost(id);
      return;
    }
    if (action === "jump-tab") {
      // Action filter may be "<tab>" or "<tab>:<filter>". For Orders, the
      // second segment can be a status ("pending_review") OR a synthetic
      // meta filter ("unassigned", "stuck") that lives on state, not in
      // the <select>. Empty = "All".
      const raw = target.dataset.actionFilter || "";
      const [tab, segment] = raw.split(":");
      if (tab) qs(`[data-admin-tab="${tab}"]`)?.click();
      if (segment && tab === "orders") {
        const META = new Set(["unassigned", "stuck"]);
        state.adminFilters = state.adminFilters || {};
        if (META.has(segment)) {
          // Synthetic meta filter — clear status select back to All so the
          // two filter mechanisms don't compound unexpectedly.
          state.adminFilters.metaFilter = segment;
          setTimeout(() => {
            const sel = qs("[data-admin-order-filter]");
            if (sel) { sel.value = "all"; sel.dispatchEvent(new Event("change", { bubbles: true })); }
            qsa("[data-order-filter-chip]").forEach((c) => c.classList.remove("active"));
          }, 30);
        } else {
          // Real status filter — clear any meta filter, set the select.
          state.adminFilters.metaFilter = null;
          setTimeout(() => {
            const sel = qs("[data-admin-order-filter]");
            if (sel) { sel.value = segment; sel.dispatchEvent(new Event("change", { bubbles: true })); }
            qsa("[data-order-filter-chip]").forEach((c) => {
              c.classList.toggle("active", c.dataset.orderFilterChip === segment);
            });
          }, 30);
        }
      } else if (tab === "orders") {
        // Plain "orders" jump with no filter — clear meta so the operator
        // sees everything.
        if (state.adminFilters) state.adminFilters.metaFilter = null;
      }
      return;
    }
    // Clear the meta filter when the operator hits "Show all" on the banner.
    if (action === "clear-meta-filter") {
      if (state.adminFilters) state.adminFilters.metaFilter = null;
      renderAdminOrders();
      return;
    }
    if (action === "broadcast-from-filter") {
      toast("Broadcast tooling has been removed from the portal.");
      return;
    }
    if (action === "cancel-scheduled") {
      const id = target.dataset.broadcastId;
      if (!id) return;
      if (!window.confirm("Cancel this scheduled broadcast?")) return;
      apiFetch(`/api/admin/broadcast/cancel?id=${encodeURIComponent(id)}`, { method: "POST" }, { ok: true })
        .then(() => {
          const item = (state.scheduledBroadcasts || []).find((b) => b.id === id);
          if (item) item.status = "cancelled";
          renderScheduledBroadcastsList();
          toast("Scheduled broadcast cancelled.");
        })
        .catch(() => toast("Couldn't cancel — try again."));
      return;
    }
    if (action === "toggle-sla-filter") {
      state.adminFilters = state.adminFilters || {};
      state.adminFilters.slaOnly = !state.adminFilters.slaOnly;
      renderAdminOrders();
      return;
    }
    if (action === "reorder-from-past") {
      const id = target.dataset.orderId;
      const past = (state.orders || []).find((x) => x.id === id);
      if (past) reorderFromPast(past);
      return;
    }
    if (action === "new-wa-template") {
      openTemplateEditor(null);
      return;
    }
    if (action === "edit-wa-template") {
      const id = target.dataset.templateId;
      const t = (state.waTemplates || []).find((x) => x.id === id);
      openTemplateEditor(t);
      return;
    }
    if (action === "delete-wa-template") {
      const id = target.dataset.templateId;
      if (id && window.confirm("Delete this template?")) deleteTemplate(id);
      return;
    }
    if (action === "template-save-submit") {
      saveTemplateFromModal();
      return;
    }
    if (action === "broadcast-preview") {
      previewBroadcastCount();
      return;
    }
    if (action === "open-manual-order") {
      openManualOrderModal();
      return;
    }
    if (action === "manual-order-add-line") {
      manualOrderAddLine();
      return;
    }
    if (action === "manual-order-remove-line") {
      manualOrderRemoveLine(target.dataset.lineIndex);
      return;
    }
    if (action === "manual-order-submit") {
      submitManualOrder();
      return;
    }
    if (action === "kanban-expand-col") {
      state._kanbanExpanded = state._kanbanExpanded || new Set();
      state._kanbanExpanded.add(target.dataset.colKey);
      renderAdminOrders();
      return;
    }
    if (action === "set-orders-view") {
      const view = target.dataset.ordersView || "list";
      state.ordersView = view;
      localStorage.setItem("gb_orders_view", view);
      qsa("[data-action='set-orders-view']").forEach((b) => b.classList.toggle("active", b.dataset.ordersView === view));
      qs("[data-orders-list-wrap]")?.classList.toggle("hidden", view !== "list");
      qs("[data-orders-board]")?.classList.toggle("hidden", view !== "board");
      renderAdminOrders();
      return;
    }
    if (action === "back-from-order") {
      backFromOrderFullscreen();
      return;
    }
    if (action === "watch-order") {
      toggleWatchOrder(state._currentOrderId);
      return;
    }
    if (action === "open-wa-templates-current") {
      const id = state._currentOrderId;
      const o = (state.orders || []).find((x) => x.id === id);
      if (o) showWhatsappTemplateModal(o);
      return;
    }
    if (action === "open-customer") {
      const ph = target.dataset.customerPhone || "";
      if (ph) showCustomerDetails(ph);
      return;
    }
    if (action === "open-wa-templates") {
      const id = target.dataset.orderId;
      const o = (state.orders || []).find((x) => x.id === id);
      if (o) showWhatsappTemplateModal(o);
      return;
    }
    if (action === "open-tracking-order") {
      const id = target.dataset.orderId;
      const o = (state.orders || []).find((x) => x.id === id);
      if (o) renderTracking(o);
      return;
    }
    if (action === "track-this-order") {
      const id = target.dataset.orderId;
      const o = (state.orders || []).find((x) => x.id === id);
      closeModal();
      navigateTo("track").then(() => {
        if (o) renderTracking(o);
      });
      return;
    }
    if (action === "ask-about-product") {
      const id = target.dataset.productId;
      const product = state.products.find((p) => p.id === id);
      if (product) {
        const msg = `Hi Global Bestie, I'd like to ask about: ${product.title}${product.brand ? ` (${product.brand})` : ""}.`;
        const href = supportWhatsAppHref(msg);
        if (href) window.open(href, "_blank", "noopener");
      }
      return;
    }
  });

  // Kanban drag-and-drop — move an order between columns to change its
  // status. Confirms before any status with financial implications
  // (delivered, cancelled) to prevent fat-finger mistakes.
  let dragOrderId = null;
  document.addEventListener("dragstart", (event) => {
    const card = event.target.closest("[data-kanban-drag]");
    if (!card) return;
    dragOrderId = card.dataset.kanbanDrag;
    card.classList.add("kanban-card-dragging");
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", dragOrderId);
    }
  });
  document.addEventListener("dragend", (event) => {
    const card = event.target.closest("[data-kanban-drag]");
    if (card) card.classList.remove("kanban-card-dragging");
    qsa("[data-kanban-drop].is-over").forEach((c) => c.classList.remove("is-over"));
    dragOrderId = null;
  });
  document.addEventListener("dragover", (event) => {
    const drop = event.target.closest("[data-kanban-drop]");
    if (!drop) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    qsa("[data-kanban-drop]").forEach((c) => c.classList.toggle("is-over", c === drop));
  });
  document.addEventListener("drop", async (event) => {
    const drop = event.target.closest("[data-kanban-drop]");
    if (!drop || !dragOrderId) return;
    event.preventDefault();
    qsa("[data-kanban-drop]").forEach((c) => c.classList.remove("is-over"));
    const newStatus = drop.dataset.kanbanDrop;
    const order = (state.orders || []).find((o) => o.id === dragOrderId);
    dragOrderId = null;
    if (!order || order.status === newStatus) return;
    // Confirm when the move has financial implications
    const balance = Math.max(0, Number(order.balance_due_pkr || 0) - Number(order.balance_paid_pkr || 0));
    if (newStatus === "delivered" && balance > 0) {
      if (!window.confirm(`This order still has ${PKR.format(balance)} balance due. Mark it delivered anyway?`)) return;
    }
    if (newStatus === "cancelled") {
      if (!window.confirm(`Cancel order ${order.id}?`)) return;
    }
    // Optimistic update + PATCH. The optimistic insert flips state
    // immediately so the card looks moved; we then PATCH; on success a
    // 10-second "Undo" toast offers a one-tap revert. On failure we
    // restore silently.
    const previousStatus = order.status;
    order.status = newStatus;
    renderAdminOrders();
    // Visual pulse on the card while the network is in flight
    const movedCard = qs(`[data-kanban-drag="${order.id}"]`);
    if (movedCard) movedCard.classList.add("kanban-card-saving");
    try {
      await apiFetch(`/api/admin/orders/${encodeURIComponent(order.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus, note: `Status changed to ${newStatus} via kanban drag.` }),
      }, { ok: true });
      if (movedCard) movedCard.classList.remove("kanban-card-saving");
      showUndoToast(`Moved ${order.id} → ${newStatus.replaceAll("_", " ")}`, async () => {
        const card = qs(`[data-kanban-drag="${order.id}"]`);
        if (card) card.classList.add("kanban-card-saving");
        order.status = previousStatus;
        renderAdminOrders();
        try {
          await apiFetch(`/api/admin/orders/${encodeURIComponent(order.id)}`, {
            method: "PATCH",
            body: JSON.stringify({ status: previousStatus, note: `Undid kanban move (restored to ${previousStatus}).` }),
          }, { ok: true });
          toast(`Restored ${order.id} → ${previousStatus.replaceAll("_", " ")}`);
        } catch {
          toast("Couldn't undo — try again from the order page.");
        }
      });
    } catch (err) {
      order.status = previousStatus;
      renderAdminOrders();
      if (movedCard) movedCard.classList.remove("kanban-card-saving");
      toast(parseApiError(err) || "Couldn't update — restored.");
    }
  });

  // Keyboard shortcuts for the Orders tab — work on both Kanban (cards)
  // and List (rows) views.
  //   j / ↓        →  next item
  //   k / ↑        →  prev item
  //   Enter        →  open focused order
  //   Shift+?      →  help toast
  // Only active when no input/select/textarea is focused.
  document.addEventListener("keydown", (event) => {
    if (document.body.dataset.page !== "portal") return;
    const tag = (event.target?.tagName || "").toLowerCase();
    if (["input", "textarea", "select"].includes(tag)) return;
    if (event.target?.isContentEditable) return;

    const isBoard = state.ordersView === "board";
    const items = isBoard
      ? qsa("[data-kanban-drag]")
      : qsa("[data-admin-orders] tr.order-row");
    if (!items.length) return;

    const currentIdx = items.findIndex((c) => c === document.activeElement || c.contains(document.activeElement));
    const move = (delta) => {
      event.preventDefault();
      const baseIdx = currentIdx === -1 ? 0 : currentIdx;
      const next = items[Math.max(0, Math.min(items.length - 1, baseIdx + delta))];
      if (next) {
        next.focus();
        // List rows aren't position:absolute — scroll them into view manually.
        next.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    };
    if (event.key === "j" || event.key === "ArrowDown") return move(1);
    if (event.key === "k" || event.key === "ArrowUp")   return move(-1);
    if (event.key === "ArrowRight" && currentIdx >= 0) {
      // → advances the focused order one stage (works in list + board).
      event.preventDefault();
      const el = items[currentIdx];
      const id = el?.dataset?.orderId || el?.closest?.("[data-order-id]")?.dataset?.orderId;
      if (id) advanceOrderStage(id);
      return;
    }
    if (event.key === "Enter" && currentIdx >= 0) {
      event.preventDefault();
      items[currentIdx].click();
      return;
    }
    if (event.key === "?" && event.shiftKey) {
      event.preventDefault();
      toast("Shortcuts: j/k or ↑/↓ navigate · → advance a stage · Enter open · drag (board) to move");
      return;
    }
  });

  // PDP gallery: touch swipe → previous/next image. The thumbnail buttons
  // remain as the source of truth (we just simulate a click on them).
  let touchStartX = null;
  let touchStartTarget = null;
  document.addEventListener("touchstart", (event) => {
    const wrap = event.target.closest("[data-zoom]");
    if (!wrap) return;
    touchStartX = event.touches[0]?.clientX;
    touchStartTarget = wrap;
  }, { passive: true });
  document.addEventListener("touchend", (event) => {
    if (touchStartX == null || !touchStartTarget) return;
    const endX = event.changedTouches[0]?.clientX;
    if (endX == null) { touchStartX = null; touchStartTarget = null; return; }
    const dx = endX - touchStartX;
    touchStartX = null;
    touchStartTarget = null;
    if (Math.abs(dx) < 50) return; // ignore taps/short drags
    const thumbs = qsa(".gallery-thumb");
    if (thumbs.length <= 1) return;
    const activeIdx = thumbs.findIndex((t) => t.classList.contains("active"));
    const nextIdx = dx < 0
      ? Math.min(thumbs.length - 1, activeIdx + 1) // swiped left → next
      : Math.max(0, activeIdx - 1);                // swiped right → previous
    if (nextIdx !== activeIdx) thumbs[nextIdx]?.click();
  });

  // PDP gallery zoom — track cursor position relative to the wrap, set CSS
  // custom props so transform-origin follows the cursor (proper lens zoom).
  document.addEventListener("mousemove", (event) => {
    const wrap = event.target.closest("[data-zoom]");
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    wrap.style.setProperty("--zoom-x", `${x}%`);
    wrap.style.setProperty("--zoom-y", `${y}%`);
  });

  // Variant edits on cart lines persist back to the cart.
  document.addEventListener("input", (event) => {
    const cartVariant = event.target.closest("[data-cart-variant]");
    if (cartVariant) {
      const id = cartVariant.dataset.productId;
      const line = state.cart.find((l) => l.product_id === id);
      if (line) {
        line.variant = cartVariant.value.trim();
        saveCart();
      }
    }
  });

  // Bulk WhatsApp template-picker — refresh preview on change.
  document.addEventListener("change", (event) => {
    if (event.target.matches("[data-bulk-wa-template]")) refreshBulkWhatsappPreview();
  });
  // Order-row multi-select — toggle membership in state.selectedOrders,
  // update the bulk action bar, and add/remove the highlighted row class.
  document.addEventListener("change", (event) => {
    const orderSelect = event.target.dataset.orderSelect;
    if (orderSelect) {
      state.selectedOrders = state.selectedOrders || new Set();
      if (event.target.checked) state.selectedOrders.add(orderSelect);
      else state.selectedOrders.delete(orderSelect);
      event.target.closest("tr")?.classList.toggle("is-selected", event.target.checked);
      renderBulkActionBar();
      return;
    }
    // Bulk batch-assign trigger
    if (event.target.matches("[data-bulk-batch-select]") && event.target.value) {
      bulkOrdersAction("assign-batch");
      event.target.value = "";
      return;
    }
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
    // cmd/ctrl + K → open portal command palette
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      if (document.body.dataset.page === "portal") {
        event.preventDefault();
        openCommandPalette();
        return;
      }
    }
    if (event.key === "Escape") {
      closeModal();
      // Also dismiss the cart drawer if it's open. Customers expect ESC
      // to close ANY currently-visible overlay, not just modals.
      const drawer = qs("[data-cart-drawer]");
      if (drawer?.classList.contains("open")) setCartDrawerOpen(false);
    }
    if (event.key === "Enter" && event.target.matches("[data-action='view-order']")) {
      showOrderDetails(event.target.dataset.orderId);
    }
    if (event.key === "Enter" && event.target.matches("[data-action='view-product']")) {
      showProductDetails(event.target.dataset.productId);
    }
  });

  // FAQ items are now native <details>/<summary>, so the browser handles open
  // state and keyboard interactions for free. No JS wiring needed.

  const handleShopFilterChange = () => {
    state.filters = shopFiltersFromControls();
    updateShopFilterBadge();
    syncShopFilterUrl();
    renderProducts();
  };
  qsa("[data-filter-search], [data-filter-category], [data-filter-stock], [data-filter-sort]").forEach((control) => {
    control.addEventListener("input", handleShopFilterChange);
    control.addEventListener("change", handleShopFilterChange);
  });

  // Wishlist filter chip — toggles a "saved items only" view of the shop.
  // Hidden when the wishlist is empty; populated on every renderProducts().
  qs("[data-wishlist-toggle]")?.addEventListener("click", () => {
    state.filters.wishlistOnly = !state.filters.wishlistOnly;
    renderProducts();
    renderWishlistChip();
  });
  renderWishlistChip();

  qsa("[data-admin-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      qsa("[data-admin-tab]").forEach((item) => item.classList.toggle("active", item === tab));
      qsa("[data-admin-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.adminPanel === tab.dataset.adminTab));
      // Lazy-load the Besties (UGC) feed the first time its tab is opened,
      // and refresh it on subsequent opens so approvals stay current.
      if (tab.dataset.adminTab === "besties") loadUgcAdmin();
      // Render the inventory board on open (full render; later stock edits do
      // targeted DOM updates instead, to preserve stepper focus).
      if (tab.dataset.adminTab === "inventory") renderInventory();
    });
  });

  // Inventory board controls — search / filter chips / sort. These live in
  // static HTML (outside the board container) so re-rendering the rows never
  // drops their focus or value. The +/- steppers and the typed quantity input
  // are handled by the global delegated handlers further down.
  let _invSearchTimer;
  qs("[data-inventory-search]")?.addEventListener("input", (e) => {
    clearTimeout(_invSearchTimer);
    const value = e.target.value;
    _invSearchTimer = setTimeout(() => {
      state._inventory = state._inventory || { search: "", filter: "all", sort: "attention" };
      state._inventory.search = value;
      renderInventory();
    }, 160);
  });
  qsa("[data-inventory-filter]").forEach((chip) => {
    chip.addEventListener("click", () => {
      state._inventory = state._inventory || { search: "", filter: "all", sort: "attention" };
      state._inventory.filter = chip.dataset.inventoryFilter;
      renderInventory();
    });
  });
  qs("[data-inventory-sort]")?.addEventListener("change", (e) => {
    state._inventory = state._inventory || { search: "", filter: "all", sort: "attention" };
    state._inventory.sort = e.target.value;
    renderInventory();
  });
  // Typed quantity commits on change (blur / Enter), not per keystroke. The
  // board container is static, so this delegated listener survives re-renders.
  qs("[data-inventory-board]")?.addEventListener("change", (e) => {
    const input = e.target.closest("[data-inv-input]");
    if (input) setInventory(input.dataset.invInput, input.value);
  });

  // Products management table — search / filter chips / mode / sort (static
  // controls) + delegated commit for the inline price and stock inputs.
  let _padminSearchTimer;
  qs("[data-padmin-search]")?.addEventListener("input", (e) => {
    clearTimeout(_padminSearchTimer);
    const value = e.target.value;
    _padminSearchTimer = setTimeout(() => { productAdminFilters().search = value; renderAdminProductsTable(); }, 160);
  });
  qsa("[data-padmin-filter]").forEach((chip) => {
    chip.addEventListener("click", () => { productAdminFilters().status = chip.dataset.padminFilter; renderAdminProductsTable(); });
  });
  qs("[data-padmin-mode]")?.addEventListener("change", (e) => { productAdminFilters().mode = e.target.value; renderAdminProductsTable(); });
  qs("[data-padmin-sort]")?.addEventListener("change", (e) => { productAdminFilters().sort = e.target.value; renderAdminProductsTable(); });
  qs("[data-admin-products]")?.addEventListener("change", (e) => {
    const price = e.target.closest("[data-prod-price]");
    if (price) { setProductPrice(price.dataset.prodPrice, price.value); return; }
    const stock = e.target.closest("[data-inv-input]");
    if (stock) setInventory(stock.dataset.invInput, stock.value);
  });

  qs("[data-ugc-form]")?.addEventListener("submit", handleUgcSubmit);

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
  // Trigger the default (Inbox) so we don't render every Growth Studio
  // panel on first load.
  qs("[data-growth-tab].active")?.click();

  qsa("[data-order-filter-chip]").forEach((chip) => {
    chip.addEventListener("click", () => {
      const select = qs("[data-admin-order-filter]");
      if (select) select.value = chip.dataset.orderFilterChip;
      qsa("[data-order-filter-chip]").forEach((item) => item.classList.toggle("active", item === chip));
      persistOrderFilters();
      renderAdminOrders();
    });
  });

  // FAQ filter — every typed word must appear somewhere in the answer, so
  // searches like "shoes box" still find "Do shoes come with the original box?"
  qs("[data-faq-search]")?.addEventListener("input", (event) => {
    const q = event.target.value.trim().toLowerCase();
    const terms = q.split(/\s+/).filter(Boolean);
    const items = qsa(".faq-item");
    let visible = 0;
    items.forEach((item) => {
      const text = item.textContent.toLowerCase();
      const match = terms.length === 0 || terms.every((term) => text.includes(term));
      item.style.display = match ? "" : "none";
      if (match) visible += 1;
      if (q && match) item.setAttribute("open", "");
    });
    qs("[data-faq-empty]")?.classList.toggle("hidden", visible > 0);
  });

  // Concierge handbook search — inline highlight model.
  //   - Each Q + A pair gets [data-match="true"] when ALL typed terms appear.
  //   - <mark> wraps every term match inside matched paragraphs, so the
  //     reader's eye lands on the relevant sentence without losing context.
  //   - Non-matching items dim to 35% via [data-search-active] on the shell.
  //   - Empty-state message appears only when zero items match.
  const handbookInput = qs("[data-handbook-search]");
  if (handbookInput) {
    const shell = qs("[data-handbook]");
    const hint = qs("[data-handbook-search-hint]");
    const emptyMsg = qs("[data-handbook-empty]");
    const items = qsa("[data-handbook-q]", shell).map((q) => ({
      q,
      a: q.nextElementSibling,
      qText: q.textContent,
      aText: q.nextElementSibling ? q.nextElementSibling.textContent : "",
    }));

    const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const escapeHTML = (s) =>
      String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    const highlight = (el, originalText, terms) => {
      if (!el) return;
      if (!terms.length) {
        // Reset: re-render the original text safely (preserves any anchors
        // that were in the markup by re-rendering the original HTML).
        el.innerHTML = el.dataset.originalHtml || escapeHTML(originalText);
        return;
      }
      if (!el.dataset.originalHtml) el.dataset.originalHtml = el.innerHTML;
      // Wrap a regex over the live (possibly-anchored) original HTML so links
      // survive the highlight pass.
      const pattern = new RegExp(`(${terms.map(escapeRegex).join("|")})`, "gi");
      const safeBase = el.dataset.originalHtml;
      // Apply the highlight only to text nodes, not inside tags.
      el.innerHTML = safeBase.replace(/(>)([^<]+)(<|$)/g, (_, pre, text, post) => {
        return pre + text.replace(pattern, "<mark>$1</mark>") + post;
      });
    };

    const refresh = () => {
      const raw = handbookInput.value.trim();
      const terms = raw.toLowerCase().split(/\s+/).filter(Boolean);
      const active = terms.length > 0;
      if (shell) shell.dataset.searchActive = active ? "true" : "false";
      let matched = 0;
      items.forEach((item) => {
        const haystack = `${item.qText} ${item.aText}`.toLowerCase();
        const isMatch = !active || terms.every((t) => haystack.includes(t));
        item.q.toggleAttribute("data-match", isMatch);
        if (item.a) item.a.toggleAttribute("data-match", isMatch);
        highlight(item.q, item.qText, isMatch && active ? terms : []);
        highlight(item.a, item.aText, isMatch && active ? terms : []);
        if (isMatch) matched += 1;
      });
      if (emptyMsg) emptyMsg.classList.toggle("hidden", matched > 0 || !active);
      if (hint) {
        if (!active) {
          hint.hidden = true;
        } else {
          hint.hidden = false;
          hint.textContent = matched === 0
            ? "No answers matched."
            : `${matched} answer${matched === 1 ? "" : "s"} matched.`;
        }
      }
    };

    handbookInput.addEventListener("input", refresh);
    refresh();
  }

  qs("[data-quote-form]")?.addEventListener("input", (event) => {
    updateQuoteEstimator({ resetShipping: event.target?.name === "category" });
  });
  qs("[data-quote-form]")?.addEventListener("change", (event) => {
    updateQuoteEstimator({ resetShipping: event.target?.name === "category" });
  });

  // Enter key in the URL input submits the quote — saves the customer
  // a click on /quote, and matches the muscle memory of every other
  // "paste URL → go" interaction on the web.
  qs("[data-quote-url]")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submitQuoteFromUrl();
    }
  });

  qs("[data-checkout-form]")?.addEventListener("submit", handleCheckout);

  // Transfer-screenshot hint: validates type + size on pick and previews
  // what we'll compress it to before the customer hits Place Order.
  const transferInput = qs("[data-checkout-form] [data-transfer-file]");
  const transferHint = qs("[data-checkout-form] [data-transfer-hint]");
  if (transferInput && transferHint) {
    const defaultHint = "JPG / PNG / HEIC / PDF · we'll compress images automatically";
    transferInput.addEventListener("change", async () => {
      const file = transferInput.files?.[0];
      if (!file) {
        transferHint.textContent = defaultHint;
        transferHint.className = "upload-hint";
        return;
      }
      if (file.size > TRANSFER_PROOF_MAX_BYTES) {
        transferHint.textContent = `${(file.size / 1024 / 1024).toFixed(1)} MB is too large — please upload under 5 MB.`;
        transferHint.className = "upload-hint warn";
        transferInput.value = "";
        return;
      }
      const allowed = /^(image\/(jpeg|png|heic|heif|webp)|application\/pdf)$/i;
      if (!allowed.test(file.type)) {
        transferHint.textContent = "Only JPG, PNG, HEIC, WebP, or PDF files are accepted.";
        transferHint.className = "upload-hint warn";
        transferInput.value = "";
        return;
      }
      transferHint.textContent = `${file.name} (${(file.size / 1024).toFixed(0)} KB) — ready ✓`;
      transferHint.className = "upload-hint ok";
    });
  }

  // Inline phone validation hint + canonical form preview. Fires on input
  // for live feedback ("becomes +92 300 1234567 ✓") and on blur for the
  // heavier lead-capture POST.
  const phoneInput = qs("[data-checkout-form] input[name='customer_phone']");
  if (phoneInput) {
    let hint = phoneInput.parentElement.querySelector("[data-phone-hint]");
    if (!hint) {
      hint = document.createElement("small");
      hint.dataset.phoneHint = "";
      hint.className = "phone-hint";
      phoneInput.parentElement.appendChild(hint);
    }
    const refresh = () => {
      const raw = phoneInput.value;
      if (!raw.trim()) { hint.textContent = ""; hint.className = "phone-hint"; return; }
      const canon = canonPhone(raw);
      if (isValidPkMobile(canon)) {
        hint.textContent = `${formatPkDisplay(canon)} ✓`;
        hint.className = "phone-hint ok";
      } else {
        hint.textContent = "Pakistani mobile, e.g. 0300 1234567";
        hint.className = "phone-hint warn";
      }
    };
    phoneInput.addEventListener("input", refresh);
    // Prefill the phone field on mount if we remember a previous one.
    // This lets the existing blur-recall flow auto-populate the rest of
    // the form on first visit to /checkout for a returning customer.
    try {
      const last = localStorage.getItem("gb_last_phone");
      if (last && isValidPkMobile(last) && !phoneInput.value) {
        phoneInput.value = formatPkDisplay(last);
        refresh();
        // Trigger blur logic synchronously so name/email/city/address
        // get filled before the customer's eyes even reach the field.
        phoneInput.dispatchEvent(new Event("blur"));
      }
    } catch {}
    phoneInput.addEventListener("blur", async () => {
      refresh();
      const canon = canonPhone(phoneInput.value);
      if (!isValidPkMobile(canon)) return;

      // Phone recall — autofill name/email/city/address from local profile.
      const profile = recallCustomerProfile(canon);
      const form = phoneInput.form;
      if (profile) {
        const fields = ["customer_name", "customer_email", "city", "address"];
        let filled = 0;
        fields.forEach((name) => {
          const input = form.elements[name];
          if (input && !input.value && profile[name]) {
            input.value = profile[name];
            filled += 1;
          }
        });
        // Hint the saved bank-account name into the placeholder so they
        // can re-use it with one keystroke (we don't overwrite an
        // in-progress value).
        const refInput = form.elements.transfer_reference;
        if (refInput && !refInput.value && profile.transfer_reference) {
          refInput.placeholder = `Last time: ${profile.transfer_reference}`;
        }
        if (filled) toast(`Welcome back ${profile.customer_name ? profile.customer_name.split(" ")[0] : ""} — autofilled ${filled} field${filled > 1 ? "s" : ""}.`);
      }

      // Phone-blur abandoned-cart lead capture. Fire-and-forget; the response
      // doesn't gate the UI. We send what we have at this moment so the team
      // can follow up from the customer list even if checkout is abandoned.
      const cartSummary = (state.cart || []).map((l) => {
        const p = state.products.find((x) => x.id === l.product_id) || l.product;
        return `${p?.title || l.product_id} × ${l.quantity}`;
      }).join("; ");
      try {
        await apiFetch("/api/leads", {
          method: "POST",
          body: JSON.stringify({
            customer_phone: canon,
            customer_name: form.elements.customer_name?.value || "",
            customer_email: form.elements.customer_email?.value || "",
            city: form.elements.city?.value || "",
            address: form.elements.address?.value || "",
            source: "checkout",
            intent: "abandoned_checkout",
            cart_summary: cartSummary,
          }),
        }, { ok: true });
      } catch {
        // Lead capture is best-effort; never block checkout on it.
      }
    });
  }

  // Bank-reference soft validator. Highest-anxiety input on the site, so we
  // give it the most reassurance: as soon as the customer types something
  // that looks like a credible transfer reference, the parent label gets
  // [data-valid="true"] which fires the pink ✓ pop animation from the CSS
  // polish block. This is intentionally LENIENT — the team still verifies
  // every transfer manually before accepting; the customer just sees a
  // micro-confirmation that "this looks like what we expect."
  const refInput = qs("[data-checkout-form] input[name='transfer_reference']");
  if (refInput) {
    const label = refInput.closest("label");
    const looksLikeReference = (raw) => {
      const value = (raw || "").trim();
      if (value.length < 6) return false;
      // At least 4 alphanumeric chars total — filters out "------" or "      ".
      const alnum = value.replace(/[^a-zA-Z0-9]/g, "");
      if (alnum.length < 4) return false;
      // Reject obvious placeholders / scribbles
      if (/^(?:test|none|n\/?a|asdf|qwerty|placeholder)$/i.test(value)) return false;
      // Accept anything with the common Pakistani patterns OR a generic
      // transaction-id shape (>= 6 chars, mixes letters/digits).
      return /[a-zA-Z0-9]/.test(value);
    };
    const refresh = () => {
      if (!label) return;
      label.toggleAttribute("data-valid", looksLikeReference(refInput.value));
    };
    refInput.addEventListener("input", refresh);
    refInput.addEventListener("change", refresh);
    refresh();
  }

  qs("[data-track-form]")?.addEventListener("submit", handleTrack);
  document.addEventListener("submit", (event) => {
    if (event.target.matches("[data-tracking-proof-form]")) return handleTrackingProof(event);
    if (event.target.matches("[data-lead-reply-form]")) return handleLeadReply(event);
  });
  qs("[data-admin-login]")?.addEventListener("submit", handleAdminLogin);
  qs("[data-product-editor]")?.addEventListener("submit", saveProduct);
  qs("[data-product-editor]")?.addEventListener("change", (e) => {
    if (e.target.name === "pricing_mode") {
      applyPricingModeVisibility(e.currentTarget, e.target.value);
      // Mirror pricing_mode -> stock_mode default so the cards/PDP show
      // the right delivery copy without an extra click.
      const stockSelect = e.currentTarget.elements.stock_mode;
      if (stockSelect) stockSelect.value = e.target.value;
      updatePricePreview();
    }
  });
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
  // Sourcing Tray — per-row checkbox + select-all + inline card edits
  qs("[data-sourcing-tray]")?.addEventListener("change", (event) => {
    const target = event.target;
    if (target.matches("[data-sourcing-select-all]")) {
      return sourcingToggleSelectAll(target.checked);
    }
    if (target.matches("[data-sourcing-check]")) {
      const row = target.closest("[data-sourcing-tray-row]");
      const idx = Number(row?.dataset.sourcingTrayRow);
      if (!Number.isNaN(idx) && sourcingState.queue[idx]) {
        sourcingState.queue[idx].selected = target.checked;
        // Update the card's visual selected state without a full re-render.
        const card = target.closest(".suggest-card");
        if (card) card.classList.toggle("is-selected", target.checked);
        updateSourcingSelectedCount();
      }
      return;
    }
    // Inline edit of the suggest-card fields. Writes directly into the
    // queue state so the bulk-save flow picks the latest values.
    if (target.matches("[data-suggest-edit]")) {
      const idx = Number(target.dataset.row);
      const field = target.dataset.field;
      const row = sourcingState.queue[idx];
      if (!row || !row.candidate || !field) return;
      const val = target.type === "number" ? Number(target.value) : target.value;
      row.candidate[field] = val;
      // If the customer-PKR field changes, that's the value the bulk save
      // sends as `customer_price_pkr` — no re-render needed.
    }
  });
  // Also catch live edits (text fields) so the queue stays in sync as
  // the admin types, without forcing a blur first.
  qs("[data-sourcing-tray]")?.addEventListener("input", (event) => {
    const target = event.target;
    if (!target.matches("[data-suggest-edit]")) return;
    const idx = Number(target.dataset.row);
    const field = target.dataset.field;
    const row = sourcingState.queue[idx];
    if (!row || !row.candidate || !field) return;
    row.candidate[field] = target.type === "number" ? Number(target.value) : target.value;
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
  qs("[data-broadcast-form]")?.addEventListener("submit", sendBroadcast);
  qs("[data-broadcast-form]")?.addEventListener("change", (e) => {
    if (e.target.matches("[data-broadcast-template]")) refreshBroadcastPreview();
  });

  // Orders-tab filter inputs — change-driven, debounced search.
  // Every change also writes the current filter snapshot to localStorage
  // so the operator's view survives reload + tab close.
  ["[data-admin-order-filter]", "[data-orders-batch]", "[data-orders-date]", "[data-orders-start]", "[data-orders-end]"].forEach((sel) => {
    qs(sel)?.addEventListener("change", () => {
      persistOrderFilters();
      renderAdminOrders();
    });
  });

  // Restore persisted filter state on portal init. Runs after the DOM
  // has the controls; values are written into the form elements + the
  // chip row so the visual state matches what renderAdminOrders will use.
  restoreOrderFilters();
  const ordersSearchEl = qs("[data-orders-search]");
  if (ordersSearchEl) {
    let timer = null;
    ordersSearchEl.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        persistOrderFilters();
        renderAdminOrders();
      }, 180);
    });
  }

  // Customers-tab filter inputs — debounced search, instant select changes
  const customerSearchEl = qs("[data-customer-search]");
  if (customerSearchEl) {
    let searchTimer = null;
    customerSearchEl.addEventListener("input", (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.customerFilters = state.customerFilters || {};
        state.customerFilters.search = e.target.value || "";
        renderCustomersTab();
      }, 180);
    });
  }
  qs("[data-customer-city]")?.addEventListener("change", (e) => {
    state.customerFilters = state.customerFilters || {};
    state.customerFilters.city = e.target.value || "all";
    renderCustomersTab();
  });
  qs("[data-customer-sort]")?.addEventListener("change", (e) => {
    state.customerFilters = state.customerFilters || {};
    state.customerFilters.sort = e.target.value || "revenue";
    renderCustomersTab();
  });

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

  // WA concierge card — close on Escape (anywhere) and on outside-click.
  // Outside-click is bound at the document level; we check that the click
  // landed outside both the FAB and the card panel before closing.
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const bubble = qs("[data-wa-bubble]");
    if (bubble && bubble.dataset.open === "true") {
      bubble.dataset.open = "false";
      const fab = bubble.querySelector(".whatsapp-fab");
      if (fab) fab.setAttribute("aria-expanded", "false");
    }
  });
  document.addEventListener("click", (event) => {
    const bubble = qs("[data-wa-bubble]");
    if (!bubble || bubble.dataset.open !== "true") return;
    if (event.target.closest("[data-wa-bubble]")) return;
    bubble.dataset.open = "false";
    const fab = bubble.querySelector(".whatsapp-fab");
    if (fab) fab.setAttribute("aria-expanded", "false");
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
      // Count-up any proof metrics inside the revealed section (e.g. the
      // "500+ orders delivered" social-proof stat). Runs once.
      entry.target.querySelectorAll("[data-count-to]").forEach((node) => {
        if (node.dataset.counted) return;
        node.dataset.counted = "1";
        const to = Number(node.dataset.countTo) || 0;
        const suffix = /\+$/.test(node.textContent.trim()) ? "+" : "";
        if (to > 0 && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
          animateCountUp(node, 0, to, 1100, (n) => `${Math.round(n)}${suffix}`);
        }
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
  // Each word lives inside an overflow-clip span; a ::before pseudo
  // (driven by [data-word]) is what actually rises from below. Splitting
  // by word — not character — keeps screen-reader output natural.
  h1.innerHTML = text.split(/\s+/).map((word, i) => {
    const safe = word.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    return `<span class="hero-word-mask"><span class="hero-word" style="--wi:${i}">${safe}</span></span>`;
  }).join(" ");
}

// Cinematic landing — kick the hero cards in once paint is settled so the
// mask-reveal headline lands first, then the editorial cards stagger in.
function startCinematicEntrance() {
  const cards = qsa(".hero-card");
  if (!cards.length) return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      cards.forEach((card) => card.classList.add("is-visible"));
    });
  });
}

// Cursor-following spotlight on the hero stage. Falls back gracefully on
// touch (no pointermove fires) — the CSS default centers the halo.
function wireHeroSpotlight() {
  const stage = qs(".hero-stage");
  if (!stage || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  let raf = 0;
  stage.addEventListener("pointermove", (e) => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      const rect = stage.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      stage.style.setProperty("--mx", `${x}%`);
      stage.style.setProperty("--my", `${y}%`);
      raf = 0;
    });
  }, { passive: true });
  stage.addEventListener("pointerleave", () => {
    stage.style.setProperty("--mx", "50%");
    stage.style.setProperty("--my", "40%");
  });
}

// Hero parallax — drives a CSS variable --parallax (0..1) as the hero
// scrolls out, which each hero card consumes at its own translate rate.
function wireHeroParallax() {
  const shell = qs(".hero-shell");
  if (!shell || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  let ticking = false;
  const update = () => {
    const rect = shell.getBoundingClientRect();
    // 0 when hero is in view at top of viewport, 1 when fully scrolled past.
    const total = rect.height + window.innerHeight * 0.2;
    const progress = Math.min(1, Math.max(0, -rect.top / total));
    shell.style.setProperty("--parallax", progress.toFixed(3));
    ticking = false;
  };
  update();
  window.addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }, { passive: true });
  window.addEventListener("resize", update, { passive: true });
}

// ═══════════════════════════════════════════════════════════════════════
// PORTAL TABLE TOOLS — spreadsheet-grade density, sortable columns,
// sticky first column, keyboard nav. Operators managing 200+ orders
// need to see 20-30 rows at once, not 5-6 — same density as Shopify
// Orders / Linnworks. Default is Compact; toggle in admin headings.
// ═══════════════════════════════════════════════════════════════════════

// Density — toggle a body class. CSS does the heavy lifting (smaller
// padding, hidden secondary <small> lines, row-flex action columns,
// sticky first column). Persisted to localStorage.
function getDensity() {
  try { return localStorage.getItem("gb_density") || "compact"; } catch { return "compact"; }
}
function setDensity(value) {
  const v = value === "comfortable" ? "comfortable" : "compact";
  document.body.classList.toggle("density-compact", v === "compact");
  document.body.classList.toggle("density-comfortable", v === "comfortable");
  try { localStorage.setItem("gb_density", v); } catch {}
  // Update every toggle button's pressed state + label.
  qsa("[data-density-toggle]").forEach((btn) => {
    btn.dataset.densityValue = v;
    btn.setAttribute("aria-pressed", String(v === "compact"));
    btn.textContent = v === "compact" ? "Comfortable" : "Compact";
    btn.title = v === "compact" ? "Switch to comfortable rows" : "Switch to compact spreadsheet rows";
  });
}
function applyInitialDensity() { setDensity(getDensity()); }

// Sortable column headers. Tables opt in by adding data-sortable on the
// <table> and data-sort-key on each sortable <th>. We do the sort in
// pure DOM by reading the column index's text/numeric value — works for
// any table without per-table JS. Direction persists per table in
// localStorage so a reopened tab remembers the operator's preference.
function tableSortKey(table) {
  return "gb_sort_" + (table.dataset.tableId || (table.className || "").split(" ")[0] || "table");
}
function readSortState(table) {
  try { return JSON.parse(localStorage.getItem(tableSortKey(table)) || "null"); } catch { return null; }
}
function writeSortState(table, state) {
  try { localStorage.setItem(tableSortKey(table), JSON.stringify(state)); } catch {}
}
function compareCells(a, b, kind) {
  if (kind === "num") {
    // Extract the first signed number anywhere in the cell text.
    const na = parseFloat(String(a).replace(/[^\d.\-]/g, "")) || 0;
    const nb = parseFloat(String(b).replace(/[^\d.\-]/g, "")) || 0;
    return na - nb;
  }
  if (kind === "date") {
    const ta = Date.parse(a) || 0;
    const tb = Date.parse(b) || 0;
    return ta - tb;
  }
  return String(a).toLowerCase().localeCompare(String(b).toLowerCase());
}
function applyTableSort(table) {
  const state = readSortState(table);
  if (!state) return;
  const tbody = table.tBodies[0];
  if (!tbody) return;
  const headers = Array.from(table.tHead?.rows[0]?.cells || []);
  const colIdx = headers.findIndex((th) => th.dataset.sortKey === state.key);
  if (colIdx < 0) return;
  const kind = headers[colIdx].dataset.sortKind || "text";
  const rows = Array.from(tbody.rows);
  rows.sort((r1, r2) => {
    const v1 = r1.cells[colIdx]?.textContent.trim() || "";
    const v2 = r2.cells[colIdx]?.textContent.trim() || "";
    const cmp = compareCells(v1, v2, kind);
    return state.dir === "desc" ? -cmp : cmp;
  });
  rows.forEach((r) => tbody.appendChild(r));
  // Mark headers visually.
  headers.forEach((th, i) => {
    th.classList.toggle("is-sorted", i === colIdx);
    th.classList.toggle("is-sorted-desc", i === colIdx && state.dir === "desc");
    th.setAttribute("aria-sort", i === colIdx ? (state.dir === "desc" ? "descending" : "ascending") : "none");
  });
}
function wireTableSort(table) {
  if (!table || table.dataset.sortWired) return;
  table.dataset.sortWired = "1";
  const headers = Array.from(table.tHead?.rows[0]?.cells || []);
  headers.forEach((th) => {
    if (!th.dataset.sortKey) return;
    th.classList.add("is-sortable");
    th.setAttribute("role", "button");
    th.setAttribute("tabindex", "0");
    const trigger = () => {
      const cur = readSortState(table);
      const next = (cur && cur.key === th.dataset.sortKey && cur.dir === "asc") ? "desc" : "asc";
      writeSortState(table, { key: th.dataset.sortKey, dir: next });
      applyTableSort(table);
    };
    th.addEventListener("click", trigger);
    th.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); trigger(); }
    });
  });
  // Re-apply sort whenever the tbody contents change (renderAdminOrders
  // etc. replace innerHTML). MutationObserver is cheap on a single tbody.
  const tbody = table.tBodies[0];
  if (tbody) {
    const mo = new MutationObserver(() => applyTableSort(table));
    mo.observe(tbody, { childList: true });
  }
  applyTableSort(table);
}

// Keyboard nav: ↑/↓ moves the focused row; Enter triggers data-action
// (already wired on rows); Space toggles the row's checkbox.
function wireTableKeyboard(wrap) {
  if (!wrap || wrap.dataset.kbWired) return;
  wrap.dataset.kbWired = "1";
  wrap.addEventListener("keydown", (e) => {
    const row = e.target.closest("tr[tabindex]");
    if (!row) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = row.nextElementSibling;
      if (next && next.tagName === "TR") next.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = row.previousElementSibling;
      if (prev && prev.tagName === "TR") prev.focus();
    } else if (e.key === " ") {
      const cb = row.querySelector("input[type='checkbox']");
      if (cb) { e.preventDefault(); cb.click(); }
    }
  });
}

function initTableTools() {
  applyInitialDensity();
  qsa("[data-density-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setDensity(getDensity() === "compact" ? "comfortable" : "compact");
    });
  });
  qsa("table[data-sortable]").forEach(wireTableSort);
  qsa("[data-keyboard-table], .admin-table-wrap").forEach(wireTableKeyboard);
}

// Spring-tracked hero glow. The pink radial in .hero-glow lags the cursor
// with critically-damped spring physics — feels alive without being twitchy.
// Hand-rolled (no library): each rAF tick nudges current position toward the
// cursor target, scaled by stiffness, minus velocity * damping.
//
// Gated three ways:
//   1. CSS hides the element on touch + reduced-motion (display:none)
//   2. We bail early if matchMedia confirms reduced motion / no hover
//   3. The CSS opacity stays 0 until JS sets data-active="true"
function wireHeroGlow() {
  const shell = qs("[data-hero-shell]");
  const glow = qs("[data-hero-glow]");
  if (!shell || !glow) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (!matchMedia("(hover: hover) and (pointer: fine)").matches) return;

  // Glow box is 380px square (per CSS). Translate to center it on the
  // target point.
  const offset = 190;
  // Targets are in shell-local coordinates
  let targetX = 0, targetY = 0;
  let posX = 0, posY = 0;
  let velX = 0, velY = 0;
  const stiffness = 0.08;
  const damping = 0.78;
  let active = false;
  let rafId = null;

  const tick = () => {
    // Spring: a = (target - pos) * stiffness; v = (v + a) * damping
    const ax = (targetX - posX) * stiffness;
    const ay = (targetY - posY) * stiffness;
    velX = (velX + ax) * damping;
    velY = (velY + ay) * damping;
    posX += velX;
    posY += velY;
    glow.style.transform = `translate3d(${posX - offset}px, ${posY - offset}px, 0)`;
    const settled = Math.abs(velX) < 0.05 && Math.abs(velY) < 0.05 &&
                    Math.abs(targetX - posX) < 0.5 && Math.abs(targetY - posY) < 0.5;
    if (settled && !active) {
      rafId = null;
      return;
    }
    rafId = requestAnimationFrame(tick);
  };
  const ensureLoop = () => {
    if (rafId == null) rafId = requestAnimationFrame(tick);
  };

  shell.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "mouse" && event.pointerType !== undefined && event.pointerType !== "pen") return;
    const rect = shell.getBoundingClientRect();
    targetX = event.clientX - rect.left;
    targetY = event.clientY - rect.top;
    if (!active) {
      // First entry: snap the spring origin to the cursor so we don't see it
      // race in from -9999 / -9999.
      posX = targetX;
      posY = targetY;
      active = true;
      glow.dataset.active = "true";
    }
    ensureLoop();
  });

  shell.addEventListener("pointerleave", () => {
    active = false;
    glow.dataset.active = "false";
  });
}

// Standalone Meta Ads page (ads.html). Deliberately isolated from the
// storefront/portal boot — it only needs the catalog (for the product picker
// + guardrails) and the ads surfaces. wireEvents() is null-safe, so it binds
// just the global delegated click handler + whatever ads controls exist.
function initAdsPage() {
  wireEvents();
  qs("[data-ads-settings-form]")?.addEventListener("submit", saveAdsSettings);
  qs("[data-ads-creative-form]")?.addEventListener("submit", (e) => { e.preventDefault(); adsUploadMedia(); });
  qs("[data-ads-create-form]")?.addEventListener("submit", (e) => { e.preventDefault(); adsBuildCampaign(); });
  qs("[data-ad-media-file]")?.addEventListener("change", previewAdMedia);
  // Section nav — swap the visible panel so each part of the workflow has its
  // own page-like view.
  qsa("[data-ads-nav]").forEach((btn) =>
    btn.addEventListener("click", () => switchAdsSection(btn.dataset.adsNav)));
  // Reporting window — refetch the report for the chosen range.
  qs("[data-ads-range]")?.addEventListener("change", (e) => adsSetReportRange(Number(e.target.value) || 7));
  // Creative search — debounced client-side filter.
  let _adsSearchTimer;
  qs("[data-ads-creative-search]")?.addEventListener("input", (e) => {
    clearTimeout(_adsSearchTimer);
    const v = e.target.value;
    _adsSearchTimer = setTimeout(() => { state._adsCreativeSearch = v; renderAdsCreatives(state._adsCreatives); }, 160);
  });
  // Approval-queue filter chips.
  qsa("[data-ads-queue-filters] [data-queue-filter]").forEach((chip) =>
    chip.addEventListener("click", () => {
      state._adsQueueFilter = chip.dataset.queueFilter;
      qsa("[data-ads-queue-filters] [data-queue-filter]").forEach((c) => c.classList.toggle("active", c === chip));
      renderAdsQueue(state._adsQueue);
    }));
  if (state.adminToken) {
    qs("[data-admin-login]")?.classList.add("hidden");
    qs("[data-admin-content]")?.classList.remove("hidden");
    loadAdsPageData();
  }
}

function switchAdsSection(id) {
  qsa("[data-ads-nav]").forEach((b) => b.classList.toggle("active", b.dataset.adsNav === id));
  qsa("[data-ads-section]").forEach((s) => s.classList.toggle("active", s.dataset.adsSection === id));
}

// Live thumbnail preview when the operator picks an image to upload.
function previewAdMedia(event) {
  const file = event.target.files?.[0];
  const host = qs("[data-ad-media-preview]");
  if (!host) return;
  if (!file) { host.hidden = true; host.innerHTML = ""; return; }
  host.hidden = false;
  host.innerHTML = `<img src="${URL.createObjectURL(file)}" alt="Selected media preview" />`;
}

// Fetch the catalog (products power the campaign picker; settings power the
// guardrails), then paint the ads surfaces. Shares /api/catalog with everyone.
async function loadAdsPageData() {
  const catalog = await apiFetch("/api/catalog", {}, { products: sampleProducts, settings: sampleSettings });
  state.products = catalog.products?.length ? catalog.products : sampleProducts;
  state.settings = { ...sampleSettings, ...(catalog.settings || {}) };
  populateAdsProductSelect();
  fillAdsSettingsForm();
  loadAdsAdmin();
}

// Prefill the guardrails form from store_settings (ads_* fields only).
function fillAdsSettingsForm() {
  const form = qs("[data-ads-settings-form]");
  if (!form) return;
  ["ads_autopilot", "ads_max_daily_budget_pkr", "ads_scale_step_pct", "ads_target_roas", "ads_max_cpa_pkr", "ads_learn_spend_pkr"]
    .forEach((k) => {
      if (!form.elements[k]) return;
      const v = state.settings?.[k];
      form.elements[k].value = k === "ads_autopilot" ? String(Boolean(v)) : (v ?? "");
    });
}

// Save just the ads guardrails — a focused POST so it can't clobber the
// site-affecting store settings (which live in the portal, not here).
async function saveAdsSettings(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const raw = Object.fromEntries(new FormData(form).entries());
  const settings = {
    ads_autopilot: raw.ads_autopilot === "true",
    ads_max_daily_budget_pkr: Number(raw.ads_max_daily_budget_pkr || 0),
    ads_scale_step_pct: Number(raw.ads_scale_step_pct || 0),
    ads_target_roas: Number(raw.ads_target_roas || 0),
    ads_max_cpa_pkr: Number(raw.ads_max_cpa_pkr || 0),
    ads_learn_spend_pkr: Number(raw.ads_learn_spend_pkr || 0),
  };
  const restore = withSubmitState(form, "Saving guardrails…");
  try {
    const saved = await apiFetch("/api/admin/settings", { method: "POST", body: JSON.stringify(settings) }, { settings });
    state.settings = { ...state.settings, ...(saved.settings || settings) };
    toast("Guardrails saved.");
  } catch {
    toast("Couldn't save guardrails. Check the portal key and try again.");
  } finally {
    restore();
  }
}

function init() {
  // Ads automation lives on its own page — give it an isolated boot.
  if (document.body.dataset.page === "ads") { initAdsPage(); return; }
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
  startCinematicEntrance();
  wireHeroSpotlight();
  wireHeroParallax();
  wireHeroGlow();
  initReveal();
  pruneLocalStorage();
  registerServiceWorker();
  loadRemoteData();
  checkSession();
  // Portal: table tools (density, sortable headers, keyboard nav) +
  // 30s background refresh that pauses when the tab is hidden. The
  // freshness ticker is intentionally NOT started — it updated the
  // today-ribbon's "Updated Xs ago" badge, which has been removed for
  // a minimal portal chrome.
  if (document.body.dataset.page === "portal") {
    initTableTools();
    startAutoRefresh();
  }
}

// ═════════════════════ CUSTOMER ACCOUNT (storefront) ═════════════════════
// Phone-OTP auth: customer enters phone → server sends a 6-digit code via
// WhatsApp → customer enters code → session cookie. state.me is populated
// from /api/auth/me on every page load.

async function checkSession() {
  try {
    const res = await fetch("/api/auth/me", { credentials: "include" });
    if (!res.ok) return;
    const data = await res.json();
    state.me = data.customer || data.team || null;
    state._meDisplayPhone = data.display_phone || "";
    renderAccountChip();
    // Detect a fresh batch transition on the customer's most-recent order
    // and surface the one-shot reveal. Skips silently when /me doesn't
    // include orders, or when no order is in a celebration-worthy stage.
    const orders = data.orders || data.customer?.orders || [];
    const celebration = orders.find((o) => o.status === "in_transit" || o.status === "pakistan_processing");
    if (celebration) {
      const stageLabel = celebration.status === "in_transit"
        ? "Your batch just shipped 🤍"
        : "Your batch landed in Pakistan ✨";
      const stageSub = celebration.status === "in_transit"
        ? `${celebration.batch_name || "Your batch"} is in international transit. We'll message you on WhatsApp when it arrives.`
        : `${celebration.batch_name || "Your batch"} is at our PK hub. We'll dispatch your parcel within 24–48 hours.`;
      maybeShowBatchReveal({
        orderId: celebration.id,
        stage: celebration.status,
        headline: stageLabel,
        sub: stageSub,
        eta: celebration.eta || celebration.batch_eta || "Soon",
      });
    }
  } catch {
    /* offline / dev — leave state.me as null */
  }
}

function renderAccountChip() {
  const label = qs("[data-account-label]");
  if (!label) return;
  if (state.me?.name) {
    label.textContent = state.me.name.split(" ")[0];
  } else if (state.me?.phone) {
    label.textContent = "Account";
  } else {
    label.textContent = "Sign in";
  }
}

function openLoginModal(prefilledPhone = "") {
  state._otpPhone = prefilledPhone || "";
  openModal(`
    <div class="auth-modal">
      <p class="kicker">Sign in</p>
      <h2>One-tap login via WhatsApp</h2>
      <p class="confirmation-sub">Enter your phone number and we'll send a 6-digit code to your WhatsApp. No password needed.</p>
      <label class="auth-label">
        <span>Phone (Pakistani mobile)</span>
        <input type="tel" data-otp-phone value="${attr(prefilledPhone)}" placeholder="0300 1234567" autocomplete="tel" autofocus />
      </label>
      <div class="confirmation-actions">
        <button class="button primary wide" type="button" data-action="request-otp-submit">Send code on WhatsApp</button>
        <button class="button secondary" type="button" data-action="close-modal">Cancel</button>
      </div>
    </div>
  `);
}

async function requestOtpSubmit() {
  const phoneInput = qs("[data-otp-phone]");
  const phone = phoneInput?.value || "";
  const canon = canonPhone(phone);
  if (!isValidPkMobile(canon)) {
    toast("Please enter a valid Pakistani mobile number.");
    return;
  }
  const btn = qs("[data-action='request-otp-submit']");
  if (btn) { btn.disabled = true; btn.dataset.busy = "1"; btn.textContent = "Sending…"; }
  try {
    const res = await fetch("/api/auth/request-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: canon }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast(data.error || "Couldn't send code.");
      return;
    }
    state._otpPhone = canon;
    openOtpVerifyModal(data.dev_code);
  } catch {
    toast("Couldn't reach the server. Try again.");
  } finally {
    if (btn) { btn.disabled = false; btn.removeAttribute("data-busy"); btn.textContent = "Send code on WhatsApp"; }
  }
}

function openOtpVerifyModal(devCode) {
  openModal(`
    <div class="auth-modal">
      <p class="kicker">Check WhatsApp</p>
      <h2>Enter the 6-digit code</h2>
      <p class="confirmation-sub">We sent a code to <strong>${esc(formatPkDisplay(state._otpPhone))}</strong>. Valid for 5 minutes.</p>
      ${devCode ? `<p class="auth-dev-code">Dev mode: <code>${esc(devCode)}</code></p>` : ""}
      <label class="auth-label">
        <span>Code</span>
        <input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6" data-otp-code placeholder="123456" autocomplete="one-time-code" autofocus />
      </label>
      <div class="confirmation-actions">
        <button class="button primary wide" type="button" data-action="verify-otp-submit">Verify &amp; sign in</button>
        <button class="button secondary" type="button" data-action="request-otp-submit">Resend code</button>
        <button class="button secondary" type="button" data-action="close-modal">Cancel</button>
      </div>
    </div>
  `);
}

async function verifyOtpSubmit() {
  const code = qs("[data-otp-code]")?.value?.trim() || "";
  if (!/^\d{6}$/.test(code)) {
    toast("Enter the 6-digit code.");
    return;
  }
  const btn = qs("[data-action='verify-otp-submit']");
  if (btn) { btn.disabled = true; btn.dataset.busy = "1"; btn.textContent = "Verifying…"; }
  try {
    const res = await fetch("/api/auth/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: state._otpPhone, code }),
      credentials: "include",
    });
    const data = await res.json();
    if (!res.ok) {
      toast(data.error || "Couldn't verify.");
      return;
    }
    state.me = data.customer || data.team || null;
    state._meDisplayPhone = formatPkDisplay(state.me?.phone || "");
    renderAccountChip();
    closeModal();
    toast(`Signed in as ${formatPkDisplay(state.me?.phone || "")}.`);
    // Open My Account so they see their orders right away
    setTimeout(() => openAccountModal(), 200);
  } catch {
    toast("Couldn't reach the server. Try again.");
  } finally {
    if (btn) { btn.disabled = false; btn.removeAttribute("data-busy"); btn.textContent = "Verify & sign in"; }
  }
}

async function openAccountModal() {
  if (!state.me) return openLoginModal();
  openModal(`
    <div class="auth-modal account-modal">
      <p class="kicker">My account</p>
      <h2>${esc(state.me.name || formatPkDisplay(state.me.phone))}</h2>
      <p class="confirmation-sub">${esc(formatPkDisplay(state.me.phone))}${state.me.city ? ` · ${esc(state.me.city)}` : ""}</p>
      <div class="account-orders" data-account-orders><p class="cashflow-empty">Loading your orders…</p></div>
      <div class="confirmation-actions">
        <button class="button secondary" type="button" data-action="logout">Sign out</button>
        <button class="button secondary" type="button" data-action="close-modal">Close</button>
      </div>
    </div>
  `);
  try {
    const res = await fetch("/api/me/orders", { credentials: "include" });
    if (!res.ok) {
      qs("[data-account-orders]").innerHTML = `<p class="cashflow-empty">Couldn't load orders. Try again.</p>`;
      return;
    }
    const data = await res.json();
    const orders = data.orders || [];
    const slot = qs("[data-account-orders]");
    if (!slot) return;
    if (!orders.length) {
      slot.innerHTML = `<p class="cashflow-empty">No orders yet. <a href="/shop" data-route="shop">Start shopping →</a></p>`;
      return;
    }
    slot.innerHTML = `
      <h3>Your orders</h3>
      <ul class="account-order-list">
        ${orders.map((o) => {
          const stage = (o.status || "").replaceAll("_", " ");
          const balance = Math.max(0, Number(o.balance_due_pkr || 0) - Number(o.balance_paid_pkr || 0));
          return `
            <li>
              <button type="button" data-action="track-recent-order" data-order-id="${attr(o.id)}">
                <strong>${esc(o.id)}</strong>
                <small>${esc(stage)} · ${esc(o.eta || "")}</small>
                <span class="account-order-amount">${PKR.format(Number(o.total_pkr || 0))}${balance > 0 ? ` · ${PKR.format(balance)} due` : ""}</span>
              </button>
            </li>
          `;
        }).join("")}
      </ul>
    `;
  } catch {
    qs("[data-account-orders]").innerHTML = `<p class="cashflow-empty">Couldn't load orders. Try again.</p>`;
  }
}

async function logoutAccount() {
  try {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  } catch {}
  state.me = null;
  renderAccountChip();
  closeModal();
  toast("Signed out.");
}

// Registers the storefront service worker for offline-first product
// browsing + stale-while-revalidate on the catalog. Skipped on the
// portal page (admin shouldn't run from cache) and on localhost
// (avoids dev-time confusion).
function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (document.body.dataset.page === "portal") return;
  if (["localhost", "127.0.0.1"].includes(location.hostname)) return;
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

// One-time cleanup of stale localStorage entries on boot. Prunes customer
// profiles + watched orders older than 90 days so the browser store
// doesn't keep growing forever.
function pruneLocalStorage() {
  const cutoff = Date.now() - 90 * 86_400_000;
  try {
    const profiles = JSON.parse(localStorage.getItem(CUSTOMER_PROFILE_KEY) || "{}");
    let changed = false;
    for (const [phone, p] of Object.entries(profiles)) {
      const saved = p?.saved_at ? new Date(p.saved_at).getTime() : 0;
      if (saved && saved < cutoff) {
        delete profiles[phone];
        changed = true;
      }
    }
    if (changed) localStorage.setItem(CUSTOMER_PROFILE_KEY, JSON.stringify(profiles));
  } catch {}
  // Recently viewed: cap at the limit (already enforced on write, but
  // belt-and-braces in case an old client wrote longer lists).
  try {
    const recent = JSON.parse(localStorage.getItem(RECENT_VIEWED_KEY) || "[]");
    if (recent.length > RECENT_VIEWED_LIMIT) {
      localStorage.setItem(RECENT_VIEWED_KEY, JSON.stringify(recent.slice(0, RECENT_VIEWED_LIMIT)));
    }
  } catch {}
}

init();
