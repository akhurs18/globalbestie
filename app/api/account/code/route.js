import { NextResponse } from 'next/server';
import { isEmail } from '@/lib/account';
import { clientIpOf, omsEnabled, requestPortalCode } from '@/lib/oms';

export const dynamic = 'force-dynamic';

const fail = (status, error) => NextResponse.json({ ok: false, error }, { status });

/**
 * POST /api/account/code — "email me a code".
 *
 * The reply is the same whether or not the address has orders here, because the order
 * system answers that way too. Anything else would let a stranger ask who shops here.
 */
export async function POST(req) {
  if (!omsEnabled) return fail(503, 'account_offline');

  let body;
  try {
    body = await req.json();
  } catch {
    return fail(400, 'invalid_request');
  }

  const email = typeof body?.email === 'string' ? body.email.trim().slice(0, 254) : '';
  if (!isEmail(email)) return fail(422, 'invalid_email');

  try {
    const r = await requestPortalCode(email, clientIpOf(req));
    if (r.ok) return NextResponse.json({ ok: true });
    if (r.status === 429) return fail(429, 'rate_limited');
    return fail(502, 'send_failed');
  } catch {
    return fail(502, 'oms_unreachable');
  }
}
