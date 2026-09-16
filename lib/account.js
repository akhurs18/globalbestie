// The signed-in customer's session, as this site stores it.
//
// The token itself comes from the order system. It lives in an httpOnly cookie on this
// domain: the browser sends it back to our own API routes, which pass it upstream, so
// page JavaScript never sees it and nothing about signing in leaves globalbestiepk.com.
export const SESSION_COOKIE = 'gb-my';

// A customer signs in with the address their code is sent to. This only rejects what
// cannot be an address; whether it exists is answered by whether a code arrives.
export const isEmail = (v) => typeof v === 'string' && /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(v.trim());

export const sessionCookieOptions = (expires) => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  ...(expires ? { expires } : {}),
});
