// UBBJ Tienda – Service Worker v7 (solo caching, FCM en firebase-messaging-sw.js)
const CACHE_NAME = "ubbj-tienda-v7";
const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/vender.html",
  "/perfil.html",
  "/perfilvendedor.html",
  "/ubbjotito.html",
  "/admin.html",
  "/style.css",
  "/app.js",
  "/manifest.json",
  "/favicon.ico",
  "/Logoubbj.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

// Firebase SDKs versionados — seguros de cachear
const CDN_CACHE_NAME = "ubbj-cdn-v1";
const CDN_URLS = [
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js",
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js",
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage-compat.js",
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js"
];

// Install – pre-cache shell assets + Firebase SDKs
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME).then((cache) => {
        return cache.addAll(PRECACHE_URLS).catch((err) => {
          console.warn("SW: algunos assets no se pudieron cachear", err);
        });
      }),
      caches.open(CDN_CACHE_NAME).then((cache) => {
        return cache.addAll(CDN_URLS).catch((err) => {
          console.warn("SW: algunos CDN assets no se pudieron cachear", err);
        });
      })
    ])
  );
});

// Activate – clean up old caches
self.addEventListener("activate", (event) => {
  const keepCaches = [CACHE_NAME, CDN_CACHE_NAME];
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !keepCaches.includes(k)).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch – Network-first, fallback to cache (skip Firebase/API requests)
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // No cachear requests de Firebase APIs dinámicas
  if (
    request.method !== "GET" ||
    request.url.includes("firestore.googleapis.com") ||
    request.url.includes("firebasestorage.googleapis.com") ||
    request.url.includes("googleapis.com")
  ) {
    return;
  }

  // Cache-first para CDN versionados (Firebase SDKs, jsdelivr)
  if (request.url.includes("gstatic.com/firebasejs/") || request.url.includes("cdn.jsdelivr.net")) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CDN_CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => {
        return caches.match(request).then((cached) => {
          if (cached) return cached;
          // Para navegación, intentar servir la misma página sin query params
          if (request.mode === "navigate") {
            const url = new URL(request.url);
            url.search = "";
            return caches.match(url.href).then((c) => c || caches.match("/index.html"));
          }
        });
      })
  );
});
