import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/account';
import { clientIpOf, omsEnabled, portalSignOut } from '@/lib/oms';

export const dynamic = 'force-dynamic';

/**
 * POST /api/account/sign-out.
 *
 * The cookie goes whatever happens: a customer who taps "sign out" on a shared phone
 * must end up signed out here even if the order system cannot be reached to retire the
 * session upstream.
 */
export async function POST(req) {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;

  if (token && omsEnabled) {
    try {
      await portalSignOut(token, clientIpOf(req));
    } catch {
      // Ignored on purpose — see above.
    }
  }

  jar.set(SESSION_COOKIE, '', { ...sessionCookieOptions(), maxAge: 0 });
  return NextResponse.json({ ok: true });
}
