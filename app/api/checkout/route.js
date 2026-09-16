import { NextResponse } from 'next/server';
import { clientIpOf, omsEnabled, placeOrder } from '@/lib/oms';
import { getShopProducts } from '@/lib/live';

export const dynamic = 'force-dynamic';

const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const fail = (status, error) => NextResponse.json({ ok: false, error }, { status });

/**
 * Turn the bag into an order request in the OMS.
 *
 * The order is rebuilt here from our own catalogue — only SKUs we list and sane
 * quantities go through — and the OMS prices it from its catalogue, never from us.
 * The Idempotency-Key comes from the browser, one per checkout attempt, so a double
 * tap or a retry after a timeout returns the same order instead of a second one.
 */
export async function POST(req) {
  if (!omsEnabled) return fail(503, 'checkout_offline');

  const key = req.headers.get('idempotency-key');
  if (!key || key.length > 100) return fail(400, 'missing_key');

  let body;
  try {
    body = await req.json();
  } catch {
    return fail(400, 'invalid_request');
  }

  const c = body?.customer ?? {};
  const name = text(c.name, 200);
  const phone = text(c.phone, 50);
  const city = text(c.city, 100);
  const address = text(c.address, 500);
  const email = text(c.email, 200);
  if (!name || !phone || !city || !address) return fail(422, 'missing_details');
  if (phone.replace(/\D/g, '').length < 10) return fail(422, 'invalid_phone');
  // Required: the order system sends sign-in codes for "Your orders" by email.
  if (!EMAIL.test(email)) return fail(422, 'invalid_email');

  const catalogue = Object.fromEntries((await getShopProducts()).map((p) => [p.slug, p]));
  const requested = (Array.isArray(body?.lines) ? body.lines : [])
    .slice(0, 30)
    .map((l) => {
      const product = catalogue[l?.slug];
      const options = text(l?.options, 120);
      // A shade is its own SKU in the OMS; anything else ordered is the product's SKU.
      const shade = product?.shades?.length ? product.shades.find((s) => options.includes(`Shade: ${s.name}`)) : null;
      return {
        product,
        shade,
        sku: product?.shades?.length ? shade?.sku : product?.sku,
        qty: Number(l?.qty),
        options: options.replace(/Shade: [^,]*(, )?/, '').trim(),
      };
    })
    .filter((l) => Number.isInteger(l.qty) && l.qty > 0 && l.qty <= 20);
  if (requested.length === 0) return fail(422, 'empty_bag');

  // Refuse the whole bag rather than silently dropping a piece the shopper expects.
  const unavailable = requested.some(
    (l) => !l.product || !l.sku || l.product.orderable === false || (l.shade && !l.shade.sellable)
  );
  if (unavailable) return fail(409, 'item_unavailable');
  const lines = requested;

  // Other options chosen travel in the note, and the team confirms them when they review.
  const options = lines.filter((l) => l.options).map((l) => `${l.product.name}: ${l.options}`);
  const note = [text(body?.note, 600), options.length ? `Options: ${options.join('; ')}` : '']
    .filter(Boolean)
    .join(' · ');

  const payload = {
    customer: {
      name,
      phone,
      city,
      address,
      email,
    },
    lines: lines.map((l) => ({ sku: l.sku, qty: l.qty })),
    ...(note ? { note } : {}),
  };

  try {
    const r = await placeOrder(payload, key, clientIpOf(req));
    if (r.ok) return NextResponse.json({ ok: true, data: r.json.data });
    if (r.status === 404) return fail(409, 'item_unavailable');
    if (r.status === 409) return fail(409, 'retry');
    if (r.status === 429) return fail(429, 'rate_limited');
    console.error('[checkout] OMS refused', r.status, r.json);
    return fail(502, 'order_failed');
  } catch (e) {
    console.error('[checkout] OMS unreachable', e);
    return fail(502, 'oms_unreachable');
  }
}
