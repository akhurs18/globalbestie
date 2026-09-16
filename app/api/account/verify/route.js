import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/account';
import { clientIpOf, omsEnabled, verifyPortalCode } from '@/lib/oms';

export const dynamic = 'force-dynamic';

const fail = (status, error) => NextResponse.json({ ok: false, error }, { status });

/** POST /api/account/verify — exchange the code for a session, kept in our own cookie. */
export async function POST(req) {
  if (!omsEnabled) return fail(503, 'account_offline');

  let body;
  try {
    body = await req.json();
  } catch {
    return fail(400, 'invalid_request');
  }

  const phone = typeof body?.phone === 'string' ? body.phone.trim().slice(0, 30) : '';
  const code = typeof body?.code === 'string' ? body.code.replace(/\D/g, '').slice(0, 6) : '';
  if (!phone || code.length !== 6) return fail(422, 'wrong_code');

  try {
    const r = await verifyPortalCode(phone, code, clientIpOf(req));
    if (r.ok) {
      const { token, expiresAt, firstName } = r.json.data;
      (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(new Date(expiresAt)));
      return NextResponse.json({ ok: true, data: { firstName } });
    }
    if (r.status === 429) return fail(429, 'rate_limited');
    // "locked" earns its own message: another code is needed, not another guess.
    if (r.status === 401) return fail(401, r.json?.error === 'locked' ? 'locked' : 'wrong_code');
    return fail(502, 'verify_failed');
  } catch {
    return fail(502, 'oms_unreachable');
  }
}
