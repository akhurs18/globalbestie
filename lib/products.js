// Store settings. Update these as the business runs (see BUSINESS_MODEL.md).
export const settings = {
  fxRate: 282, // USD → PKR, update twice weekly
  markup: 0.25,
  preorderWeeks: 4,
  // The batch currently taking orders (drives the countdown).
  currentBatch: { number: 12, closesAt: '2026-09-18T23:59:00+05:00' },
  // The batch on its way to Pakistan (drives the live tracker). stage: 0 collecting … 4 arrived
  transitBatch: {
    number: 11,
    stage: 2,
    dates: ['closed 28 Aug', 'bought 04 Sep', 'in the air', '~22 Sep', '~26 Sep'],
  },
};

// Rough shipping bands (PKR) used only for "Request anything" estimates.
export const shippingEstimates = {
  bags: [2500, 4500],
  shoes: [3000, 5000],
  beauty: [800, 1800],
  fragrance: [2000, 3500],
  accessories: [900, 2000],
};

export const categories = [
  { slug: 'bags', name: 'Bags' },
  { slug: 'shoes', name: 'Shoes' },
  { slug: 'beauty', name: 'Beauty' },
  { slug: 'fragrance', name: 'Fragrance' },
  { slug: 'accessories', name: 'Accessories' },
];

// Placeholder catalogue — replace with real listings, brands and photos.
export const products = [
  {
    slug: 'mini-shoulder-bag', name: 'Mini Shoulder Bag', brand: 'Brand', category: 'bags',
    usd: 98, shippingPkr: 3500, stock: 'preorder', art: 'holo', inDrop: true,
    colours: ['Blush', 'Ink', 'Cream', 'Lilac'], options: { label: 'Strap', values: ['Chain', 'Leather'] },
    description: 'A compact everyday shoulder bag that fits your phone, keys and a lip. Real photos and full details coming soon.',
  },
  {
    slug: 'platform-sneaker', name: 'Platform Sneaker', brand: 'Brand', category: 'shoes',
    usd: 115, shippingPkr: 4200, stock: 'in_stock', art: 'pink', inDrop: true,
    colours: ['White', 'Blush'], options: { label: 'Size (US)', values: ['6', '7', '8', '9'] },
    description: 'Chunky, comfy and made for all-day plans. Real photos and full details coming soon.',
  },
  {
    slug: 'lip-oil-trio', name: 'Lip Oil Trio', brand: 'Brand', category: 'beauty',
    usd: 32, shippingPkr: 1200, stock: 'preorder', art: 'chrome', inDrop: true,
    description: 'Three glossy, non-sticky lip oils in everyday shades. Real photos and full details coming soon.',
  },
  {
    slug: 'eau-de-parfum-50ml', name: 'Eau de Parfum 50ml', brand: 'Brand', category: 'fragrance',
    usd: 95, shippingPkr: 3200, stock: 'preorder', art: 'lilac', inDrop: true,
    description: 'A soft, skin-close scent for day into night. Real photos and full details coming soon.',
  },
  {
    slug: 'card-case', name: 'Card Case', brand: 'Brand', category: 'accessories',
    usd: 55, shippingPkr: 1500, stock: 'in_stock', art: 'rose', inDrop: true,
    colours: ['Blush', 'Ink'],
    description: 'Slim card case with a pocket for cash. Real photos and full details coming soon.',
  },
  {
    slug: 'mini-crossbody', name: 'Mini Crossbody', brand: 'Brand', category: 'bags',
    usd: 148, shippingPkr: 3800, stock: 'preorder', art: 'pink',
    colours: ['Cream', 'Ink'],
    description: 'Hands-free and just big enough. Real photos and full details coming soon.',
  },
  {
    slug: 'glow-serum', name: 'Glow Serum', brand: 'Brand', category: 'beauty',
    usd: 42, shippingPkr: 1100, stock: 'preorder', art: 'holo',
    description: 'A lightweight serum for that lit-from-within look. Real photos and full details coming soon.',
  },
  {
    slug: 'silk-hair-scarf', name: 'Silk Hair Scarf', brand: 'Brand', category: 'accessories',
    usd: 28, shippingPkr: 900, stock: 'in_stock', art: 'lilac',
    colours: ['Blush', 'Lilac', 'Cream'],
    description: 'Tie it in your hair, on your bag or around your neck. Real photos and full details coming soon.',
  },
];

// Each product's SKU in the order system (OMS). Must match the SKU created there.
for (const p of products) p.sku ??= `GB-${p.slug.toUpperCase()}`;

export function getProduct(slug) {
  return products.find((p) => p.slug === slug);
}

// customer_price_pkr = (usa_price_usd × fx_rate) × (1 + markup) + shipping_pkr
export function priceBreakdown(p, s = settings) {
  // Live products (lib/live.js) carry the order system's price; that one wins.
  if (p.b) return p.b;
  const inPkr = Math.round(p.usd * s.fxRate);
  const markup = Math.round(inPkr * s.markup);
  const total = inPkr + markup + p.shippingPkr;
  const advance = Math.ceil(total / 2);
  return {
    usd: p.usd, fx: s.fxRate, markupRate: s.markup, inPkr, markup,
    shipping: p.shippingPkr, total, advance, balance: total - advance,
  };
}

export const pkr = (n) => `PKR ${Math.round(n).toLocaleString('en-US')}`;
