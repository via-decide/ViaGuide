/* ViaDecide PWA Service Worker
   - Network-first for navigation (so HTML updates appear)
   - Stale-while-revalidate for static assets
   - Offline fallback to cached index.html
*/

const VERSION = "v1.0.0";
const CACHE_STATIC = `viadecide-static-${VERSION}`;
const CACHE_RUNTIME = `viadecide-runtime-${VERSION}`;

// Add files you want available offline.
// Keep this list minimal & accurate.
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

// Install: pre-cache core assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_STATIC).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (key !== CACHE_STATIC && key !== CACHE_RUNTIME) {
            return caches.delete(key);
          }
        })
      );
      await self.clients.claim();
    })()
  );
});

// Helpers
function isNavigationRequest(req) {
  return req.mode === "navigate" || (req.method === "GET" && req.headers.get("accept")?.includes("text/html"));
}

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isAssetRequest(req) {
  const url = new URL(req.url);
  // cache same-origin static assets
  return (
    isSameOrigin(url) &&
    (url.pathname.endsWith(".css") ||
      url.pathname.endsWith(".js") ||
      url.pathname.endsWith(".png") ||
      url.pathname.endsWith(".jpg") ||
      url.pathname.endsWith(".jpeg") ||
      url.pathname.endsWith(".svg") ||
      url.pathname.endsWith(".webp") ||
      url.pathname.endsWith(".ico") ||
      url.pathname.endsWith(".json") ||
      url.pathname.endsWith(".html") ||
      url.pathname.endsWith(".woff2"))
  );
}

// Fetch strategies
async function networkFirst(request) {
  const cache = await caches.open(CACHE_RUNTIME);
  try {
    const fresh = await fetch(request);
    // Only cache successful responses
    if (fresh && fresh.status === 200) cache.put(request, fresh.clone());
    return fresh;
  } catch (e) {
    const cached = await cache.match(request);
    if (cached) return cached;

    // Offline fallback for navigation
    if (isNavigationRequest(request)) {
      const staticCache = await caches.open(CACHE_STATIC);
      return staticCache.match("./index.html");
    }
    throw e;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_RUNTIME);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((fresh) => {
      if (fresh && fresh.status === 200) cache.put(request, fresh.clone());
      return fresh;
    })
    .catch(() => null);

  return cached || (await fetchPromise) || cached;
}

// Main fetch handler
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle GET
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Let cross-origin (CDNs) pass through (don’t break fonts/libs)
  if (!isSameOrigin(url)) return;

  // Navigation: network-first (so updates load)
  if (isNavigationRequest(request)) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Assets: stale-while-revalidate
  if (isAssetRequest(request)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // Default: try network then cache
  event.respondWith(networkFirst(request));
});
