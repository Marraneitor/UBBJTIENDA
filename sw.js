// UBBJ Tienda – Service Worker v1
const CACHE_NAME = "ubbj-tienda-v1";
const PRECACHE_URLS = [
  "/index.html",
  "/style.css",
  "/app.js",
  "/manifest.json"
];

// Install – pre-cache shell assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// Activate – clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch – Network-first strategy (always try network, fall back to cache)
self.addEventListener("fetch", (event) => {
  // Only cache same-origin GET requests
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clone and cache the fresh response
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, clone);
        });
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
