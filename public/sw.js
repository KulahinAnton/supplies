/**
 * Feature 31, stage 0 — the app opens without a connection.
 *
 * Hand-written rather than generated. The usual plugin (`@serwist/next`, the
 * successor to `next-pwa`) injects through a webpack plugin, and this app
 * builds with Turbopack; a build-time dependency that may or may not run is a
 * worse foundation than sixty lines that plainly do.
 *
 * Scope of this stage: opening the app offline and seeing the last thing it
 * knew. NOT offline writes — those are stages 2 and 3, and they need an
 * outbox, not a cache.
 *
 * Bump CACHE_VERSION whenever the rules below change. `activate` deletes every
 * cache that is not the current one, so a stale strategy cannot outlive its
 * deploy in someone's browser — the same lesson as the reply keyboard: what is
 * installed on a device does not change because the code changed.
 */

const CACHE_VERSION = "v1";
const SHELL = `supplies-shell-${CACHE_VERSION}`;
const PAGES = `supplies-pages-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  // The offline page is the one thing that must exist before the first
  // failure, because it is what gets shown when nothing else is cached.
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll([OFFLINE_URL, "/icon.svg"])),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name !== SHELL && name !== PAGES)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

/**
 * Signing out must empty the caches. Pages here are one household's private
 * data rendered on the server, and leaving them readable to whoever signs in
 * next would be a real leak, not an inconvenience.
 */
self.addEventListener("message", (event) => {
  if (event.data === "clear-caches") {
    event.waitUntil(
      caches.keys().then((names) => Promise.all(names.map((n) => caches.delete(n)))),
    );
  }
});

/**
 * Next serves TWO different responses for the same URL: the HTML document, and
 * the RSC payload a client-side navigation asks for with an `RSC` header.
 * Caching them under one key hands a navigation the wrong one and breaks the
 * router in a way that looks nothing like a caching bug — so the key carries
 * the distinction.
 */
function cacheKeyFor(request) {
  if (request.headers.get("RSC") !== "1") return request;
  const url = new URL(request.url);
  url.searchParams.set("__rsc", "1");
  return new Request(url.href, { headers: request.headers });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Writes are POSTs — server actions among them. A cache must never answer
  // one, and replaying one would be worse still.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Auth and the bot webhook are never cacheable, and a stale /login would be
  // actively harmful.
  if (url.pathname.startsWith("/api/") || url.pathname === "/login") return;

  // Hashed build assets: the name changes when the content does, so the cache
  // can be trusted outright and the network never consulted.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, SHELL));
    return;
  }

  if (request.mode === "navigate" || request.headers.get("RSC") === "1") {
    event.respondWith(networkFirst(request));
    return;
  }
});

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }
  return response;
}

/**
 * Network first, so a connected phone is never shown yesterday's stock — the
 * whole app is a claim about what is in the house right now, and a fast wrong
 * answer is worse than a slow right one.
 */
async function networkFirst(request) {
  const key = cacheKeyFor(request);

  try {
    const response = await fetch(request);
    // Only 200s. A redirect to /login is what an expired session looks like,
    // and caching it would lock the user out of their own app until the cache
    // was cleared.
    if (response.ok && response.type === "basic") {
      const cache = await caches.open(PAGES);
      cache.put(key, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(key);
    if (cached) return cached;

    // A page never visited while online. An RSC request cannot be answered
    // with an HTML fallback — the router would choke on it — so it is left to
    // fail and the browser falls back to a full navigation.
    if (request.mode === "navigate") {
      const offline = await caches.match(OFFLINE_URL);
      if (offline) return offline;
    }
    throw new Error("offline and not cached");
  }
}
