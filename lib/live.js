// Live catalogue: our product pages merged with the order system's price, stock and batches.
// Server-only (it imports lib/oms.js). When the OMS is off or unreachable, everything falls
// back to lib/products.js so the site still renders.

import { categories, getProduct, priceBreakdown, products, settings } from './products';
import { getBatches, getCatalogue, omsEnabled } from './oms';

const fmt = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'Asia/Karachi' }) : '';

const slugify = (s) =>
  s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function liveBreakdown(item) {
  const total = item.priceMinor;
  const advance = Math.ceil(total / 2);
  const base = { total, advance, balance: total - advance };
  const b = item.breakdown;
  if (!b) return { ...base, usd: null };
  return {
    ...base,
    usd: b.usdMinor / 100,
    fx: b.fxRate,
    markupRate: b.markupBp / 10000,
    inPkr: b.inLocalMinor,
    markup: b.markupMinor,
    shipping: b.shippingMinor,
  };
}

function merge(p, live) {
  if (!live) return { ...p, b: priceBreakdown(p), orderable: true, live: false };
  const item = live[p.sku];
  // Listed on the site but not (yet) in the OMS: show it, but it cannot be ordered.
  if (!item) return { ...p, b: priceBreakdown(p), orderable: false, missing: true, live: true };

  const stock = item.stock === 'in_stock' ? 'in_stock' : 'preorder';
  return {
    ...p,
    stock,
    b: liveBreakdown(item),
    // Pre-orders are requests the team confirms and buys after customers commit, so they
    // stay orderable before any purchase order exists. In-stock pieces need real stock.
    orderable: stock === 'preorder' ? true : item.sellable,
    earliestDelivery: item.earliestDelivery ?? null,
    live: true,
  };
}

/**
 * Products the OMS sells that this site has no page of its own for (in-stock arrivals,
 * mostly). One OMS product becomes one product here; its variants become shades, each
 * ordered by its own SKU.
 */
function omsOnly(live) {
  const ours = new Set(products.map((p) => p.sku));
  const groups = new Map();
  for (const item of Object.values(live)) {
    if (ours.has(item.sku)) continue;
    const key = item.productId ?? item.productName;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  return [...groups.values()].map((items) => {
    const first = items.find((i) => i.sellable) ?? items[0];
    const stock = first.stock === 'in_stock' ? 'in_stock' : 'preorder';
    const cat = categories.find((c) => c.name.toLowerCase() === (first.category ?? '').toLowerCase());
    const sellable = (i) => stock === 'preorder' || i.sellable;
    return {
      slug: slugify(first.productName),
      sku: first.sku,
      name: first.productName,
      brand: null,
      category: cat?.slug ?? 'beauty',
      stock,
      art: 'pink',
      description: first.description ?? null,
      images: first.images ?? [],
      shades: items
        .filter((i) => i.variantName)
        .map((i) => ({ sku: i.sku, name: i.variantName, sellable: sellable(i), image: i.images?.[0]?.url ?? null })),
      b: liveBreakdown(first),
      orderable: items.some(sellable),
      earliestDelivery: first.earliestDelivery ?? null,
      live: true,
      oms: true,
    };
  });
}

/** Our own pages, merged with the OMS. The homepage's drop and hero use these. */
export async function getLiveProducts() {
  const live = await getCatalogue();
  return products.map((p) => merge(p, live));
}

/**
 * Everything a shopper can browse: what the OMS sells, plus our own pages that the OMS
 * knows about. Pages the OMS has never heard of ("coming soon") are left out.
 */
export async function getShopProducts() {
  const live = await getCatalogue();
  const ours = products.map((p) => merge(p, live)).filter((p) => !p.missing);
  return live ? [...omsOnly(live), ...ours] : ours;
}

export async function getLiveProduct(slug) {
  const live = await getCatalogue();
  const p = getProduct(slug);
  if (p) return merge(p, live);
  return live ? (omsOnly(live).find((x) => x.slug === slug) ?? null) : null;
}

/** Exchange rate + markup for estimates on the Request page. */
export async function getPricing() {
  const live = await getCatalogue();
  const b = live && Object.values(live).find((i) => i.breakdown)?.breakdown;
  return b ? { fxRate: b.fxRate, markup: b.markupBp / 10000 } : { fxRate: settings.fxRate, markup: settings.markup };
}

/**
 * { open: { number, closesAt } | null, current: { number, stage, dates[5] } | null }
 * `open` drives the countdown; `current` drives the tracker. Nulls hide those sections.
 */
export async function getBatchInfo() {
  if (!omsEnabled) {
    return {
      open: settings.currentBatch,
      current: { number: settings.transitBatch.number, stage: settings.transitBatch.stage, dates: settings.transitBatch.dates },
    };
  }
  const data = await getBatches();
  if (!data) return { open: null, current: null };

  const open = data.open ? { number: data.open.number, closesAt: data.open.closesAt } : null;
  const c = data.current;
  const current = c
    ? {
        number: c.number,
        stage: c.stageIndex,
        dates: [
          c.closedAt ? `closed ${fmt(c.closedAt)}` : '',
          c.closedAt ? (c.shippedAt ? 'done' : 'in progress') : '',
          c.shippedAt ? `shipped ${fmt(c.shippedAt)}` : '',
          c.expectedAt && !c.arrivedAt ? `~${fmt(c.expectedAt)}` : '',
          c.arrivedAt ? fmt(c.arrivedAt) : '',
        ],
      }
    : null;
  return { open, current };
}
