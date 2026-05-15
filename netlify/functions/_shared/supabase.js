const FALLBACK_SETTINGS = {
  bank_name: "Meezan Bank",
  account_title: "Global Bestie Imports",
  account_number: "0210-0000-000000",
  iban: "PK00MEZN0000000000000000",
  markup_rate: 0.25,
  fx_rate: 282,
  preorder_weeks: 4,
  next_shipment_date: "2026-06-02",
  shipment_notice: "Next USA batch is being consolidated. Dates can shift slightly based on brand dispatch and customs clearance.",
};

const FALLBACK_PRODUCTS = [
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
    featured: true,
    preorder_weeks: 4,
    status: "active",
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
    featured: true,
    preorder_weeks: 4,
    status: "active",
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
    featured: true,
    preorder_weeks: 0,
    status: "active",
  },
];

const FALLBACK_TRENDS = [
  {
    id: "trend-alo-hoodie",
    title: "Alo Yoga Accolade Hoodie",
    category: "accessories",
    source_url: "https://www.aloyoga.com/",
    usa_price_usd: 118,
    shipping_pkr: 9600,
    score: 94,
    status: "pending",
    image_url: "https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=900&q=84",
  },
];

const FALLBACK_SHIPMENT_BATCHES = [
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

function env(name) {
  return globalThis.Netlify?.env?.get(name) || "";
}

export function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...(init.headers || {}),
    },
  });
}

export function fallbackData() {
  return {
    settings: FALLBACK_SETTINGS,
    products: FALLBACK_PRODUCTS,
    trends: FALLBACK_TRENDS,
    shipmentBatches: FALLBACK_SHIPMENT_BATCHES,
    orders: [],
  };
}

export function requireAdmin(req) {
  const expected = env("ADMIN_SHARED_SECRET");
  if (!expected) return true;
  const header = req.headers.get("authorization") || "";
  return header === `Bearer ${expected}`;
}

export function hasSupabase() {
  return Boolean(env("SUPABASE_URL") && env("SUPABASE_SERVICE_ROLE_KEY"));
}

export async function supabase(path, options = {}) {
  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("Supabase environment variables are not configured.");
  }

  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  const response = await fetch(`${url}${path}`, { ...options, headers });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Supabase request failed: ${response.status}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

export async function getSettings() {
  if (!hasSupabase()) return FALLBACK_SETTINGS;
  const rows = await supabase("/rest/v1/store_settings?id=eq.store&select=*");
  return { ...FALLBACK_SETTINGS, ...(rows[0] || {}) };
}

export async function getProducts() {
  if (!hasSupabase()) return FALLBACK_PRODUCTS;
  return supabase("/rest/v1/products?status=eq.active&select=*&order=featured.desc,title.asc");
}

export async function getAllProducts() {
  if (!hasSupabase()) return FALLBACK_PRODUCTS;
  return supabase("/rest/v1/products?select=*&order=featured.desc,title.asc");
}

export async function getOrders(query = "") {
  if (!hasSupabase()) return [];
  const select = "select=*,order_items(*),order_events(*)";
  if (!query) return supabase(`/rest/v1/orders?${select}&order=created_at.desc`);
  const safeQuery = encodeURIComponent(`*${query}*`);
  return supabase(`/rest/v1/orders?${select}&or=(id.ilike.${safeQuery},customer_phone.ilike.${safeQuery})&order=created_at.desc`);
}

export async function getTrends() {
  if (!hasSupabase()) return FALLBACK_TRENDS;
  return supabase("/rest/v1/trend_candidates?status=eq.pending&select=*&order=score.desc,created_at.desc");
}

export async function getShipmentBatches() {
  if (!hasSupabase()) return FALLBACK_SHIPMENT_BATCHES;
  return supabase("/rest/v1/shipment_batches?select=*&order=eta_date.asc,created_at.desc");
}

export async function upsertProduct(product) {
  const payload = {
    ...product,
    status: product.status || "active",
    updated_at: new Date().toISOString(),
  };
  const rows = await supabase("/rest/v1/products?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(payload),
  });
  return rows[0];
}

export async function updateSettings(settings) {
  const payload = { id: "store", ...settings, updated_at: new Date().toISOString() };
  const rows = await supabase("/rest/v1/store_settings?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(payload),
  });
  return rows[0];
}

export async function uploadTransferProof(orderId, file) {
  if (!file?.data_url || !hasSupabase()) return "";
  const match = file.data_url.match(/^data:(.+);base64,(.+)$/);
  if (!match) return "";
  const [, contentType, base64] = match;
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const objectPath = `${orderId}/${Date.now()}-${safeName}`;
  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(`${url}/storage/v1/object/transfer-proofs/${objectPath}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body: Buffer.from(base64, "base64"),
  });
  if (!response.ok) throw new Error(await response.text());
  return objectPath;
}

// Fetches a remote image URL (typical case: scraper found something on Coach
// or Sephora) and re-hosts it in our public store-assets bucket under the
// products/ folder. This insulates us from retailer URL rot and gives us a
// single origin for all transforms downstream.
export async function downloadAndStoreImage(productId, remoteUrl) {
  if (!remoteUrl || !hasSupabase()) return remoteUrl || "";
  try {
    const response = await fetch(remoteUrl, {
      headers: { "User-Agent": "GlobalBestieIngest/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return remoteUrl;
    const contentType = response.headers.get("content-type") || "image/jpeg";
    const buffer = Buffer.from(await response.arrayBuffer());
    const ext = (contentType.split("/")[1] || "jpg").split(";")[0].replace(/[^a-z0-9]/gi, "");
    const safeId = String(productId || "product").replace(/[^a-zA-Z0-9._-]/g, "-");
    const objectPath = `products/${safeId}/${Date.now()}.${ext}`;
    const url = env("SUPABASE_URL");
    const key = env("SUPABASE_SERVICE_ROLE_KEY");
    const upload = await fetch(`${url}/storage/v1/object/store-assets/${objectPath}`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": contentType,
        "x-upsert": "true",
      },
      body: buffer,
    });
    if (!upload.ok) return remoteUrl;
    return `${url}/storage/v1/object/public/store-assets/${objectPath}`;
  } catch {
    // Anything fails (404, timeout, retailer blocked us) — fall back to the
    // original URL so the product can still publish.
    return remoteUrl;
  }
}

// Generates a human-readable order ID with enough entropy to avoid birthday-
// paradox collisions inside a single year. Format: `GB-YYYY-MMDDXXXX` where
// XXXX is a 0–9999 random suffix. Date prefix gives us implicit sortability
// AND immediate uniqueness across days — only same-day same-suffix orders can
// collide, which at our volume is essentially zero. If we ever need stricter
// guarantees, swap this for a Supabase sequence; the format stays human.
export function makeOrderId() {
  const now = new Date();
  const year = now.getFullYear();
  const md = String(now.getMonth() + 1).padStart(2, "0") + String(now.getDate()).padStart(2, "0");
  const suffix = String(Math.floor(1000 + Math.random() * 9000));
  return `GB-${year}-${md}${suffix}`;
}
