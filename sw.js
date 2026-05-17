// Storefront service worker.
//
// Stale-while-revalidate for the catalog + next-batch endpoints so flaky
// connections still get a render. Network-first for everything else.
//
// Bump CACHE_VERSION when index.html / assets change shape so users get
// the new shell.

const CACHE_VERSION = "gb-v3";
const SHELL_URLS = [
  "/",
  "/index.html",
  "/assets/app.js",
  "/assets/styles.css",
];
const SWR_PATHS = [
  "/api/catalog",
  "/api/public/next-batch",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL_URLS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Skip cross-origin (CDN images, Google Fonts) — let browser cache them.
  if (url.origin !== self.location.origin) return;

  const isSwr = SWR_PATHS.some((p) => url.pathname === p || url.pathname.startsWith(p + "?"));
  if (isSwr) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // Shell HTML: network-first, fall back to cache.
  if (url.pathname === "/" || url.pathname.endsWith(".html")) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Assets (immutable hashes already from netlify cache headers): cache-first.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(req));
    return;
  }
});

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(req);
  const networkPromise = fetch(req).then((res) => {
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => cached);
  return cached || networkPromise;
}

async function networkFirst(req) {
  try {
    const res = await fetch(req);
    if (res && res.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(req, res.clone());
    }
    return res;
  } catch {
    const cache = await caches.open(CACHE_VERSION);
    return (await cache.match(req)) || new Response("Offline", { status: 503 });
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res && res.ok) cache.put(req, res.clone());
  return res;
}
