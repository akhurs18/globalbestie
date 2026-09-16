import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/account';
import { clientIpOf, omsEnabled, portalOrders } from '@/lib/oms';

export const dynamic = 'force-dynamic';

const fail = (status, error) => NextResponse.json({ ok: false, error }, { status });

/** GET /api/account/orders — every order of the signed-in customer. */
export async function GET(req) {
  if (!omsEnabled) return fail(503, 'account_offline');

  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return fail(401, 'signed_out');

  try {
    const r = await portalOrders(token, clientIpOf(req));
    if (r.ok) return NextResponse.json({ ok: true, data: r.json.data });
    if (r.status === 401) {
      // Expired or signed out elsewhere: drop our cookie so the page asks again.
      jar.set(SESSION_COOKIE, '', { ...sessionCookieOptions(), maxAge: 0 });
      return fail(401, 'signed_out');
    }
    if (r.status === 429) return fail(429, 'rate_limited');
    return fail(502, 'lookup_failed');
  } catch {
    return fail(502, 'oms_unreachable');
  }
}
