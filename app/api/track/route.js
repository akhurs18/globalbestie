import { NextResponse } from 'next/server';
import { clientIpOf, omsEnabled, trackOrder } from '@/lib/oms';

export const dynamic = 'force-dynamic';

const fail = (status, error) => NextResponse.json({ ok: false, error }, { status });

/**
 * Look up an order for the Track page. POST, so the phone number never ends up in a URL,
 * a browser history or an access log.
 */
export async function POST(req) {
  if (!omsEnabled) return fail(503, 'tracking_offline');

  let body;
  try {
    body = await req.json();
  } catch {
    return fail(400, 'invalid_request');
  }
  const orderNo = typeof body?.orderNo === 'string' ? body.orderNo.trim().toUpperCase().slice(0, 30) : '';
  const phone = typeof body?.phone === 'string' ? body.phone.trim().slice(0, 30) : '';
  if (!orderNo || phone.replace(/\D/g, '').length < 10) return fail(422, 'missing_details');

  try {
    const r = await trackOrder(orderNo, phone, clientIpOf(req));
    if (r.ok) return NextResponse.json({ ok: true, data: r.json.data });
    if (r.status === 404) return fail(404, 'not_found');
    if (r.status === 429) return fail(429, 'rate_limited');
    return fail(502, 'lookup_failed');
  } catch {
    return fail(502, 'oms_unreachable');
  }
}
