// The signed-in customer's session, as this site stores it.
//
// The token itself comes from the order system. It lives in an httpOnly cookie on this
// domain: the browser sends it back to our own API routes, which pass it upstream, so
// page JavaScript never sees it and nothing about signing in leaves globalbestiepk.com.
export const SESSION_COOKIE = 'gb-my';

export const sessionCookieOptions = (expires) => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  ...(expires ? { expires } : {}),
});
