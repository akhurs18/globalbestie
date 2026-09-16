// Server-side client for the order management system (OMS).
// Never import this from a 'use client' component: it reads the site token from the environment.

const OMS_URL = (process.env.OMS_URL || '').replace(/\/+$/, '');
const TOKEN = process.env.OMS_SITE_TOKEN || '';

export const omsEnabled = Boolean(OMS_URL && TOKEN);

async function call(path, { method = 'GET', body, headers = {}, revalidate, customerIp, timeout = 8000 } = {}) {
  const res = await fetch(`${OMS_URL}${path}`, {
    method,
    headers: {
      'X-OMS-Site-Token': TOKEN,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      // The OMS rate-limits per client IP. Without this every shopper would share the
      // website server's single bucket.
      ...(customerIp ? { 'X-Forwarded-For': customerIp } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    ...(revalidate !== undefined ? { next: { revalidate } } : { cache: 'no-store' }),
    signal: AbortSignal.timeout(timeout),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, ok: res.ok && Boolean(json?.ok), json };
}

/** Live price + availability for every SKU, keyed by SKU. Null when the OMS is off or unreachable. */
export async function getCatalogue() {
  if (!omsEnabled) return null;
  try {
    // The OMS pages its catalogue; read every page so a growing range is never cut short.
    const items = [];
    let cursor = null;
    for (let page = 0; page < 20; page++) {
      const q = `?limit=500${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const r = await call(`/api/public/availability${q}`, { revalidate: 300 });
      if (!r.ok) return null;
      items.push(...r.json.data.items);
      cursor = r.json.data.nextCursor;
      if (!cursor) break;
    }
    return Object.fromEntries(items.map((i) => [i.sku, i]));
  } catch {
    return null;
  }
}

/** { open, current } import batches. Null when the OMS is off or unreachable. */
export async function getBatches() {
  if (!omsEnabled) return null;
  try {
    const r = await call('/api/public/batches', { revalidate: 60 });
    return r.ok ? r.json.data : null;
  } catch {
    return null;
  }
}

export function placeOrder(payload, idempotencyKey, customerIp) {
  return call('/api/public/orders', {
    method: 'POST',
    body: payload,
    headers: { 'Idempotency-Key': idempotencyKey },
    customerIp,
    timeout: 20000,
  });
}

export function trackOrder(orderNo, phone, customerIp) {
  return call(`/api/public/orders/${encodeURIComponent(orderNo)}`, {
    headers: { 'X-Customer-Phone': phone },
    customerIp,
  });
}

export function clientIpOf(req) {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || undefined;
}
